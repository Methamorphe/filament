// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { createHydrationDemoController } from "./hydration-demo";

describe("createHydrationDemoController", () => {
  it("renders a hydratable snapshot and restores interactivity on the same DOM", async () => {
    const container = document.createElement("div");
    const controller = await createHydrationDemoController(container);
    const releaseButton = () =>
      container.querySelector('[data-demo-action="release"]') as HTMLButtonElement | null;
    const modeValue = () => container.querySelector('[data-demo="mode"]');
    const notes = () => container.querySelector('[data-demo="notes"]');

    expect(controller.html).toContain("data-f-node");
    expect(container.innerHTML).toContain("filament-start:");
    expect(modeValue()?.textContent).toBe("Snapshot");

    releaseButton()?.dispatchEvent(new Event("click"));
    expect(notes()?.textContent).not.toContain("Release 4 scheduled");

    controller.hydrate();

    expect(container.innerHTML).not.toContain("filament-start:");
    releaseButton()?.dispatchEvent(new Event("click"));

    expect(notes()?.textContent).toContain("Release 4 scheduled");

    const liveButton = container.querySelector(
      '[data-demo-action="live"]',
    ) as HTMLButtonElement | null;

    liveButton?.dispatchEvent(new Event("click"));
    expect(modeValue()?.textContent).toBe("Live");

    controller.dispose();
    expect(container.innerHTML).toBe("");
  });
});
