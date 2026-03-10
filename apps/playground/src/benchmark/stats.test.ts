import { describe, expect, it } from "vitest";
import { buildScenarioMatrix, compareMedians, summarizeSamples } from "./stats";
import type { BenchmarkReport } from "./types";

describe("summarizeSamples", () => {
  it("computes stable summary statistics", () => {
    expect(summarizeSamples([12, 8, 10, 14])).toEqual({
      min: 8,
      max: 14,
      mean: 11,
      median: 11,
    });
  });
});

describe("buildScenarioMatrix", () => {
  const report: BenchmarkReport = {
    generatedAt: "2026-03-10T12:00:00.000Z",
    suite: {
      id: "grid-core",
      label: "Core Grid",
      description: "Baseline grid suite.",
      config: {
        rowCount: 800,
        samples: 5,
        warmupUpdates: 150,
        hotRowUpdates: 3000,
        sweepPasses: 2,
      },
      facts: [],
      scenarios: [
        {
          id: "hot-row",
          label: "Hot row",
          description: "Repeatedly updates one row.",
          measure: "update",
          actionId: "run-hot-row",
        },
      ],
    },
    adapters: [
      {
        id: "filament",
        label: "Filament",
        model: "direct-dom",
      },
      {
        id: "react",
        label: "React (VDOM)",
        model: "virtual-dom",
      },
    ],
    results: [
      {
        adapterId: "filament",
        scenarioId: "hot-row",
        samples: [4, 5, 6],
        summary: {
          min: 4,
          max: 6,
          mean: 5,
          median: 5,
        },
      },
      {
        adapterId: "react",
        scenarioId: "hot-row",
        samples: [9, 10, 11],
        summary: {
          min: 9,
          max: 11,
          mean: 10,
          median: 10,
        },
      },
    ],
  };

  it("annotates entries relative to the best median", () => {
    const [row] = buildScenarioMatrix(report);

    expect(row?.bestMedian).toBe(5);
    expect(row?.entries.map((entry) => entry.relativeToBest)).toEqual([1, 2]);
  });

  it("compares medians across adapters", () => {
    expect(compareMedians(report, "hot-row", "filament", "react")).toBe(2);
  });
});
