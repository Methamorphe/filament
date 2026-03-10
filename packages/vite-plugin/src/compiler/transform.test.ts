import { describe, expect, it } from "vitest";
import { transformFilamentModule } from "./transform";

describe("transformFilamentModule", () => {
  it("normalizes static className attributes on native elements", () => {
    const source = `
      export function View() {
        return <section className="shell"><div className="panel">Hello</div></section>;
      }
    `;

    const result = transformFilamentModule(source, "/virtual/View.tsx", { ssr: false });

    expect(result.code).toContain('class="shell"');
    expect(result.code).toContain('class="panel"');
    expect(result.code).not.toContain('className="shell"');
  });
});
