import { transformSync, type NodePath, type PluginObj } from "@babel/core";
import transformTypeScript from "@babel/plugin-transform-typescript";
import * as t from "@babel/types";
import type { TransformResult } from "vite";
import type { TransformOptions } from "./ir.js";

const ELEMENT_REF_ATTRIBUTE = "data-f-node";
const ANCHOR_PREFIX = "filament-anchor:";
const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

interface TemplateContext {
  templateId: number;
  nodeRefs: string[];
  anchorRefs: string[];
  bindings: t.ObjectExpression[];
  nextNodeRef: number;
  nextAnchorRef: number;
}

interface PluginState {
  options: TransformOptions;
  helperId?: t.Identifier;
  nextTemplateId?: number;
  programPath?: NodePath<t.Program>;
}

export function transformFilamentModule(
  code: string,
  id: string,
  options: TransformOptions,
): TransformResult {
  const result = transformSync(code, {
    filename: id,
    sourceMaps: true,
    ast: false,
    babelrc: false,
    configFile: false,
    plugins: [
      createFilamentPlugin(options),
      [
        transformTypeScript,
        {
          isTSX: true,
          allExtensions: true,
          allowDeclareFields: true,
        },
      ],
    ],
  });

  return {
    code: result?.code ?? code,
    map: (result?.map as TransformResult["map"]) ?? null,
  };
}

function createFilamentPlugin(options: TransformOptions): PluginObj<PluginState> {
  return {
    name: "filament-jsx-transform",
    visitor: {
      Program(path: NodePath<t.Program>, state: PluginState) {
        state.options = options;
        state.programPath = path;
        state.nextTemplateId = 0;
      },
      JSXElement(path: NodePath<t.JSXElement>, state: PluginState) {
        if (path.findParent((parent: NodePath) => parent.isJSXElement() || parent.isJSXFragment())) {
          return;
        }

        path.replaceWith(compileJsxExpression(path.node, state));
      },
      JSXFragment(path: NodePath<t.JSXFragment>, state: PluginState) {
        if (path.findParent((parent: NodePath) => parent.isJSXElement() || parent.isJSXFragment())) {
          return;
        }

        path.replaceWith(compileFragmentExpression(path.node, state));
      },
    },
  };
}

function compileJsxExpression(
  node: t.JSXElement | t.JSXFragment,
  state: PluginState,
): t.Expression {
  if (t.isJSXFragment(node)) {
    return compileFragmentExpression(node, state);
  }

  return isNativeElement(node.openingElement.name)
    ? compileNativeElement(node, state)
    : compileComponentElement(node, state);
}

function compileFragmentExpression(node: t.JSXFragment, state: PluginState): t.Expression {
  const children = node.children
    .map((child) => compileChildValue(child, state))
    .filter((value): value is t.Expression => value !== null);

  if (children.length === 0) {
    return t.nullLiteral();
  }

  if (children.length === 1) {
    return children[0];
  }

  return t.arrayExpression(children);
}

function compileNativeElement(node: t.JSXElement, state: PluginState): t.Expression {
  const ctx: TemplateContext = {
    templateId: createTemplateId(state),
    nodeRefs: [],
    anchorRefs: [],
    bindings: [],
    nextNodeRef: 0,
    nextAnchorRef: 0,
  };

  const helperId = ensureHelper(state);
  const html = compileNativeElementHtml(node, ctx, state);

  return t.callExpression(helperId, [
    t.objectExpression([
      t.objectProperty(t.identifier("html"), t.stringLiteral(html)),
      t.objectProperty(
        t.identifier("nodeRefs"),
        t.arrayExpression(ctx.nodeRefs.map((ref) => t.stringLiteral(ref))),
      ),
      t.objectProperty(
        t.identifier("anchorRefs"),
        t.arrayExpression(ctx.anchorRefs.map((ref) => t.stringLiteral(ref))),
      ),
    ]),
    t.arrayExpression(ctx.bindings),
  ]);
}

function compileNativeElementHtml(
  node: t.JSXElement,
  ctx: TemplateContext,
  state: PluginState,
  forcedElementRef: string | null = null,
): string {
  const tagName = jsxNameToString(node.openingElement.name);
  const staticAttributes: string[] = [];
  let elementRef: string | null = forcedElementRef;

  for (const attribute of node.openingElement.attributes) {
    if (t.isJSXSpreadAttribute(attribute)) {
      throw new Error("Filament v0 does not support spread attributes on native elements.");
    }

    const attributeName = jsxAttributeName(attribute.name);
    const normalizedAttributeName = normalizeAttributeName(attributeName);

    if (attribute.value === null) {
      staticAttributes.push(normalizedAttributeName);
      continue;
    }

    if (t.isStringLiteral(attribute.value)) {
      staticAttributes.push(
        `${normalizedAttributeName}="${escapeHtmlAttribute(attribute.value.value)}"`,
      );
      continue;
    }

    if (!t.isJSXExpressionContainer(attribute.value) || t.isJSXEmptyExpression(attribute.value.expression)) {
      continue;
    }

    const expression = attribute.value.expression;

    if (isEventAttribute(attributeName)) {
      elementRef ??= createNodeRef(ctx);
      ctx.bindings.push(
        bindingObject([
          property("kind", t.stringLiteral("event")),
          property("ref", t.stringLiteral(elementRef)),
          property("name", t.stringLiteral(toEventName(attributeName))),
          property("handler", expression),
        ]),
      );
      continue;
    }

    if (isStaticExpression(expression)) {
      const literal = staticExpressionValue(expression);

      if (literal === false || literal === null || literal === undefined) {
        continue;
      }

      if (literal === true) {
        staticAttributes.push(normalizedAttributeName);
        continue;
      }

      staticAttributes.push(
        `${normalizedAttributeName}="${escapeHtmlAttribute(String(literal))}"`,
      );
      continue;
    }

    elementRef ??= createNodeRef(ctx);
    ctx.bindings.push(
      bindingObject([
        property("kind", t.stringLiteral("attribute")),
        property("ref", t.stringLiteral(elementRef)),
        property("name", t.stringLiteral(normalizedAttributeName)),
        property("evaluate", t.arrowFunctionExpression([], expression)),
      ]),
    );
  }

  const attributes = [...staticAttributes];

  if (elementRef !== null) {
    attributes.unshift(`${ELEMENT_REF_ATTRIBUTE}="${elementRef}"`);
  }

  const openTag = `<${tagName}${attributes.length > 0 ? ` ${attributes.join(" ")}` : ""}>`;

  if (VOID_ELEMENTS.has(tagName)) {
    return openTag;
  }

  let html = openTag;

  for (const child of node.children) {
    html += compileNativeChild(child, ctx, state);
  }

  html += `</${tagName}>`;
  return html;
}

function compileNativeChild(
  child: t.JSXText | t.JSXExpressionContainer | t.JSXSpreadChild | t.JSXElement | t.JSXFragment,
  ctx: TemplateContext,
  state: PluginState,
): string {
  if (t.isJSXText(child)) {
    const normalized = normalizeJsxText(child.value);
    return normalized === "" ? "" : escapeHtmlText(normalized);
  }

  if (t.isJSXSpreadChild(child)) {
    throw new Error("Filament v0 does not support JSX spread children.");
  }

  if (t.isJSXFragment(child)) {
    return child.children.map((nested) => compileNativeChild(nested, ctx, state)).join("");
  }

  if (t.isJSXElement(child) && isNativeElement(child.openingElement.name)) {
    return compileNativeElementHtml(child, ctx, state);
  }

  const expression = t.isJSXExpressionContainer(child) ? child.expression : child;

  if (t.isJSXEmptyExpression(expression)) {
    return "";
  }

  if (isStaticExpression(expression)) {
    const literal = staticExpressionValue(expression);
    return literal === null || literal === undefined || literal === false || literal === true
      ? ""
      : escapeHtmlText(String(literal));
  }

  const anchorRef = createAnchorRef(ctx);
  const value = compileEmbeddedValue(expression, state);
  ctx.bindings.push(
    bindingObject([
      property("kind", t.stringLiteral("insert")),
      property("ref", t.stringLiteral(anchorRef)),
      property("evaluate", t.arrowFunctionExpression([], value)),
    ]),
  );

  return `<!--${ANCHOR_PREFIX}${anchorRef}-->`;
}

function compileEmbeddedValue(expression: t.Expression, state: PluginState): t.Expression {
  if (t.isJSXElement(expression) || t.isJSXFragment(expression)) {
    return compileJsxExpression(expression, state);
  }

  return expression;
}

function compileComponentElement(node: t.JSXElement, state: PluginState): t.Expression {
  const callee = jsxComponentToExpression(node.openingElement.name);
  const isShowComponent = isNamedComponent(node.openingElement.name, "Show");
  const isForComponent = isNamedComponent(node.openingElement.name, "For");
  const props: Array<t.ObjectProperty | t.SpreadElement> = [];

  for (const attribute of node.openingElement.attributes) {
    if (t.isJSXSpreadAttribute(attribute)) {
      props.push(t.spreadElement(attribute.argument));
      continue;
    }

    const attributeName = jsxAttributeName(attribute.name);
    const key = propKey(attributeName);
    const value = compileComponentAttributeValue(attribute.value, state);
    props.push(t.objectProperty(key, value));

    if ((isShowComponent || isForComponent) && attributeName === "fallback") {
      const lazyValue = wrapLazyControlFlowExpression(value);
      props[props.length - 1] = t.objectProperty(key, lazyValue);
    }
  }

  const children = node.children
    .map((child) => compileChildValue(child, state))
    .filter((value): value is t.Expression => value !== null);

  if (children.length === 1) {
    props.push(
      t.objectProperty(
        propKey("children"),
        isShowComponent ? wrapShowChildExpression(children[0]) : children[0],
      ),
    );
  } else if (children.length > 1) {
    const value = t.arrayExpression(children);
    props.push(
      t.objectProperty(propKey("children"), isShowComponent ? wrapLazyControlFlowExpression(value) : value),
    );
  }

  return t.callExpression(callee, [t.objectExpression(props)]);
}

function compileComponentAttributeValue(
  value: t.JSXAttribute["value"],
  state: PluginState,
): t.Expression {
  if (value === null) {
    return t.booleanLiteral(true);
  }

  if (t.isStringLiteral(value)) {
    return value;
  }

  if (t.isJSXExpressionContainer(value)) {
    if (t.isJSXEmptyExpression(value.expression)) {
      return t.identifier("undefined");
    }

    return compileEmbeddedValue(value.expression, state);
  }

  throw new Error("Unsupported component attribute value.");
}

function compileChildValue(
  child: t.JSXText | t.JSXExpressionContainer | t.JSXSpreadChild | t.JSXElement | t.JSXFragment,
  state: PluginState,
): t.Expression | null {
  if (t.isJSXText(child)) {
    const normalized = normalizeJsxText(child.value);
    return normalized === "" ? null : t.stringLiteral(normalized);
  }

  if (t.isJSXSpreadChild(child)) {
    throw new Error("Filament v0 does not support JSX spread children.");
  }

  if (t.isJSXElement(child) || t.isJSXFragment(child)) {
    return compileJsxExpression(child, state);
  }

  if (t.isJSXEmptyExpression(child.expression)) {
    return null;
  }

  return compileEmbeddedValue(child.expression, state);
}

function ensureHelper(state: PluginState): t.Identifier {
  if (state.helperId !== undefined) {
    return state.helperId;
  }

  if (state.programPath === undefined) {
    throw new Error("Filament transform expected a program path.");
  }

  const importedName = state.options.ssr ? "createSSRTemplate" : "createTemplateInstance";
  const source = state.options.ssr ? "@filament/server/internal" : "@filament/core/internal";
  const local = state.programPath.scope.generateUidIdentifier(
    state.options.ssr ? "filamentSSRTemplate" : "filamentDOMTemplate",
  );

  state.programPath.unshiftContainer(
    "body",
    t.importDeclaration([t.importSpecifier(local, t.identifier(importedName))], t.stringLiteral(source)),
  );

  state.helperId = local;
  return local;
}

function bindingObject(properties: t.ObjectProperty[]): t.ObjectExpression {
  return t.objectExpression(properties);
}

function property(name: string, value: t.Expression): t.ObjectProperty {
  return t.objectProperty(t.identifier(name), value);
}

function propKey(name: string): t.Identifier | t.StringLiteral {
  return isIdentifierName(name) ? t.identifier(name) : t.stringLiteral(name);
}

function wrapLazyControlFlowExpression(value: t.Expression): t.Expression {
  return isCallableExpression(value) ? value : t.arrowFunctionExpression([], value);
}

function wrapShowChildExpression(value: t.Expression): t.Expression {
  if (!isCallableExpression(value)) {
    return t.arrowFunctionExpression([], value);
  }

  if ((t.isArrowFunctionExpression(value) || t.isFunctionExpression(value)) && value.params.length > 0) {
    return value;
  }

  return value;
}

function createNodeRef(ctx: TemplateContext): string {
  const ref = `t${ctx.templateId}-n${ctx.nextNodeRef++}`;
  ctx.nodeRefs.push(ref);
  return ref;
}

function createAnchorRef(ctx: TemplateContext): string {
  const ref = `t${ctx.templateId}-a${ctx.nextAnchorRef++}`;
  ctx.anchorRefs.push(ref);
  return ref;
}

function createTemplateId(state: PluginState): number {
  const templateId = state.nextTemplateId ?? 0;
  state.nextTemplateId = templateId + 1;
  return templateId;
}

function isNativeElement(name: t.JSXIdentifier | t.JSXMemberExpression | t.JSXNamespacedName): boolean {
  return t.isJSXIdentifier(name) && /^[a-z]/.test(name.name);
}

function isNamedComponent(
  name: t.JSXIdentifier | t.JSXMemberExpression | t.JSXNamespacedName,
  expected: string,
): boolean {
  return t.isJSXIdentifier(name) && name.name === expected;
}

function jsxNameToString(name: t.JSXIdentifier | t.JSXMemberExpression | t.JSXNamespacedName): string {
  if (t.isJSXIdentifier(name)) {
    return name.name;
  }

  if (t.isJSXMemberExpression(name)) {
    return `${jsxNameToString(name.object)}.${jsxNameToString(name.property)}`;
  }

  return `${jsxNameToString(name.namespace)}:${jsxNameToString(name.name)}`;
}

function jsxComponentToExpression(
  name: t.JSXIdentifier | t.JSXMemberExpression | t.JSXNamespacedName,
): t.Expression {
  if (t.isJSXIdentifier(name)) {
    return t.identifier(name.name);
  }

  if (t.isJSXMemberExpression(name)) {
    return t.memberExpression(
      jsxComponentToExpression(name.object),
      jsxComponentToExpression(name.property),
    );
  }

  throw new Error("Namespaced JSX component tags are not supported.");
}

function jsxAttributeName(name: t.JSXAttribute["name"]): string {
  if (t.isJSXIdentifier(name)) {
    return name.name;
  }

  return `${name.namespace.name}:${name.name.name}`;
}

function isEventAttribute(name: string): boolean {
  return /^on[A-Z]/.test(name);
}

function toEventName(name: string): string {
  return name.slice(2).toLowerCase();
}

function normalizeAttributeName(name: string): string {
  return name === "className" ? "class" : name;
}

function normalizeJsxText(value: string): string {
  if (!/[\n\r]/.test(value)) {
    return value;
  }

  return value
    .split(/\r?\n/)
    .map((line, index, lines) => {
      let normalized = line.replace(/\t/g, " ");

      if (index > 0) {
        normalized = normalized.trimStart();
      }

      if (index < lines.length - 1) {
        normalized = normalized.trimEnd();
      }

      return normalized;
    })
    .join(" ")
    .replace(/ {2,}/g, " ")
    .trim();
}

function escapeHtmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtmlText(value).replaceAll('"', "&quot;");
}

function isStaticExpression(expression: t.Expression): boolean {
  return (
    t.isStringLiteral(expression) ||
    t.isNumericLiteral(expression) ||
    t.isBooleanLiteral(expression) ||
    t.isNullLiteral(expression) ||
    (t.isTemplateLiteral(expression) && expression.expressions.length === 0) ||
    t.isBigIntLiteral(expression)
  );
}

function staticExpressionValue(expression: t.Expression): string | number | boolean | bigint | null | undefined {
  if (t.isStringLiteral(expression)) {
    return expression.value;
  }

  if (t.isNumericLiteral(expression)) {
    return expression.value;
  }

  if (t.isBooleanLiteral(expression)) {
    return expression.value;
  }

  if (t.isNullLiteral(expression)) {
    return null;
  }

  if (t.isBigIntLiteral(expression)) {
    return BigInt(expression.value);
  }

  if (t.isTemplateLiteral(expression) && expression.expressions.length === 0) {
    return expression.quasis[0]?.value.cooked ?? "";
  }

  return undefined;
}

function isIdentifierName(value: string): boolean {
  return /^[$A-Z_][0-9A-Z_$]*$/i.test(value);
}

function isCallableExpression(
  value: t.Expression,
): value is t.ArrowFunctionExpression | t.FunctionExpression {
  return t.isArrowFunctionExpression(value) || t.isFunctionExpression(value);
}
