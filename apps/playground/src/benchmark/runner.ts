import { filamentBenchmarkAdapter } from "./filament-adapter";
import { reactBenchmarkAdapter } from "./react-adapter";
import { BENCHMARK_SUITES } from "./suites";
import { summarizeSamples } from "./stats";
import type {
  BenchmarkAdapter,
  BenchmarkAdapterDefinition,
  BenchmarkController,
  BenchmarkReport,
  BenchmarkResult,
  BenchmarkScenarioDefinition,
  BenchmarkSuiteDefinition,
} from "./types";

const BENCHMARK_ADAPTERS: readonly BenchmarkAdapter[] = [
  filamentBenchmarkAdapter,
  reactBenchmarkAdapter,
];

export { BENCHMARK_SUITES } from "./suites";
export { BENCHMARK_SANDBOX_ID, getBenchmarkSuite } from "./suites";

export async function runBenchmarkSuite(
  suite: BenchmarkSuiteDefinition,
  sandbox: HTMLElement,
): Promise<BenchmarkReport> {
  sandbox.replaceChildren();

  const results: BenchmarkResult[] = [];

  for (const adapter of BENCHMARK_ADAPTERS) {
    for (const scenario of suite.scenarios) {
      const samples: number[] = [];

      for (let sampleIndex = 0; sampleIndex < suite.config.samples; sampleIndex += 1) {
        const sample = await measureScenarioSample(sandbox, adapter, suite, scenario);
        samples.push(sample);
      }

      results.push({
        adapterId: adapter.id,
        scenarioId: scenario.id,
        samples,
        summary: summarizeSamples(samples),
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    suite,
    adapters: BENCHMARK_ADAPTERS.map(toAdapterDefinition),
    results,
  };
}

export function listBenchmarkSuites(): readonly BenchmarkSuiteDefinition[] {
  return BENCHMARK_SUITES;
}

async function measureScenarioSample(
  sandbox: HTMLElement,
  adapter: BenchmarkAdapter,
  suite: BenchmarkSuiteDefinition,
  scenario: BenchmarkScenarioDefinition,
): Promise<number> {
  await settleBrowser();

  const host = document.createElement("div");
  host.className = "benchmark-host";
  sandbox.append(host);

  let controller: BenchmarkController | null = null;

  try {
    const mountStartedAt = performance.now();
    controller = await adapter.mount(suite, host);

    if (scenario.measure === "mount") {
      return performance.now() - mountStartedAt;
    }

    if (scenario.warmupActionId !== undefined) {
      await controller.perform(scenario.warmupActionId);
      await settleBrowser();
    }

    if (scenario.actionId === undefined) {
      throw new Error(`Scenario "${scenario.id}" is missing an action.`);
    }

    const runStartedAt = performance.now();
    await controller.perform(scenario.actionId);
    return performance.now() - runStartedAt;
  } finally {
    await controller?.destroy();
    host.remove();
    await settleBrowser();
  }
}

function toAdapterDefinition(adapter: BenchmarkAdapter): BenchmarkAdapterDefinition {
  return {
    id: adapter.id,
    label: adapter.label,
    model: adapter.model,
  };
}

function settleBrowser(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}
