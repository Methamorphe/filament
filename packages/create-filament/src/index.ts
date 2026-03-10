#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const projectName = process.argv[2] ?? "filament-app";
const targetDirectory = path.resolve(process.cwd(), projectName);

const files = new Map<string, string>([
  [
    "package.json",
    JSON.stringify(
      {
        name: projectName,
        private: true,
        type: "module",
        scripts: {
          dev: "vite",
          build: "vite build",
        },
        dependencies: {
          "@filament/core": "^0.0.1",
        },
        devDependencies: {
          "@filament/vite-plugin": "^0.0.1",
          typescript: "^5.9.2",
          vite: "^7.1.5",
        },
      },
      null,
      2,
    ),
  ],
  [
    "tsconfig.json",
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          jsx: "preserve",
          strict: true,
          skipLibCheck: true,
          lib: ["ES2022", "DOM", "DOM.Iterable"],
        },
        include: ["src"],
      },
      null,
      2,
    ),
  ],
  [
    "vite.config.ts",
    `import { defineConfig } from "vite";
import { filament } from "@filament/vite-plugin";

export default defineConfig({
  plugins: [filament()],
});
`,
  ],
  [
    "index.html",
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${projectName}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
  ],
  [
    "src/main.tsx",
    `import { render, signal } from "@filament/core";

function App() {
  const count = signal(0);

  return (
    <main>
      <h1>${projectName}</h1>
      <p>Count: {count()}</p>
      <button onClick={() => count.set(count() + 1)}>Increment</button>
    </main>
  );
}

render(() => <App />, document.getElementById("app")!);
`,
  ],
]);

async function main(): Promise<void> {
  await mkdir(targetDirectory, { recursive: true });

  for (const [relativePath, contents] of files) {
    const outputPath = path.join(targetDirectory, relativePath);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, contents, "utf8");
  }

  process.stdout.write(`Scaffolded ${projectName} at ${targetDirectory}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});

