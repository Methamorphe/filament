import type {
  BenchmarkReport,
  BenchmarkResult,
  SampleSummary,
  ScenarioMatrixEntry,
  ScenarioMatrixRow,
} from "./types";

export function summarizeSamples(samples: readonly number[]): SampleSummary {
  if (samples.length === 0) {
    throw new Error("Cannot summarize an empty benchmark sample set.");
  }

  const sorted = [...samples].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[middle - 1]! + sorted[middle]!) / 2
      : sorted[middle]!;
  const total = samples.reduce((sum, sample) => sum + sample, 0);

  return {
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    mean: total / samples.length,
    median,
  };
}

export function buildScenarioMatrix(report: BenchmarkReport): ScenarioMatrixRow[] {
  return report.suite.scenarios.map((scenario) => {
    const entries = report.adapters.map((adapter) => {
      const result = findResult(report.results, adapter.id, scenario.id);
      return {
        adapter,
        result,
        relativeToBest: 1,
      } satisfies ScenarioMatrixEntry;
    });

    const bestMedian = Math.min(...entries.map((entry) => entry.result.summary.median));

    return {
      scenario,
      bestMedian,
      entries: entries.map((entry) => ({
        ...entry,
        relativeToBest: bestMedian === 0 ? 1 : entry.result.summary.median / bestMedian,
      })),
    };
  });
}

export function compareMedians(
  report: BenchmarkReport,
  scenarioId: string,
  baseAdapterId: string,
  comparisonAdapterId: string,
): number | null {
  const base = report.results.find(
    (result) => result.scenarioId === scenarioId && result.adapterId === baseAdapterId,
  );
  const comparison = report.results.find(
    (result) => result.scenarioId === scenarioId && result.adapterId === comparisonAdapterId,
  );

  if (base === undefined || comparison === undefined) {
    return null;
  }

  return comparison.summary.median / base.summary.median;
}

function findResult(
  results: readonly BenchmarkResult[],
  adapterId: string,
  scenarioId: string,
): BenchmarkResult {
  const result = results.find(
    (candidate) => candidate.adapterId === adapterId && candidate.scenarioId === scenarioId,
  );

  if (result === undefined) {
    throw new Error(`Missing benchmark result for adapter "${adapterId}" and scenario "${scenarioId}".`);
  }

  return result;
}
