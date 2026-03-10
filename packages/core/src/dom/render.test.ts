import { describe, expect, it } from "vitest";
import { setAttributeOrProperty } from "./render";

describe("setAttributeOrProperty", () => {
  it("writes SVG points as an attribute instead of a read-only property", () => {
    const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");

    expect(() => {
      setAttributeOrProperty(polyline, "points", "0,10 10,0 20,10");
    }).not.toThrow();

    expect(polyline.getAttribute("points")).toBe("0,10 10,0 20,10");
  });

  it("still uses DOM properties for HTML elements when appropriate", () => {
    const input = document.createElement("input");

    setAttributeOrProperty(input, "value", "hello");

    expect(input.value).toBe("hello");
    expect(input.getAttribute("value")).toBe(null);
  });
});
