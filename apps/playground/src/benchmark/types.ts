export interface BenchmarkConfig {
  samples: number;
  [key: string]: number;
}

export interface BenchmarkFact {
  label: string;
  value: string;
}

export interface BenchmarkAdapterDefinition {
  id: string;
  label: string;
  model: "direct-dom" | "virtual-dom";
}

export interface BenchmarkController {
  perform(actionId: string): void | Promise<void>;
  destroy(): void | Promise<void>;
}

export interface BenchmarkSuiteDefinition {
  id: string;
  label: string;
  description: string;
  config: BenchmarkConfig;
  facts: BenchmarkFact[];
  scenarios: BenchmarkScenarioDefinition[];
}

export interface BenchmarkAdapter extends BenchmarkAdapterDefinition {
  mount(
    suite: BenchmarkSuiteDefinition,
    container: HTMLElement,
  ): BenchmarkController | Promise<BenchmarkController>;
}

export interface BenchmarkScenarioDefinition {
  id: string;
  label: string;
  description: string;
  measure: "mount" | "update" | "async";
  warmupActionId?: string;
  actionId?: string;
}

export interface SampleSummary {
  min: number;
  max: number;
  mean: number;
  median: number;
}

export interface BenchmarkResult {
  adapterId: string;
  scenarioId: string;
  samples: number[];
  summary: SampleSummary;
}

export interface BenchmarkReport {
  generatedAt: string;
  suite: BenchmarkSuiteDefinition;
  adapters: BenchmarkAdapterDefinition[];
  results: BenchmarkResult[];
}

export interface ScenarioMatrixEntry {
  adapter: BenchmarkAdapterDefinition;
  result: BenchmarkResult;
  relativeToBest: number;
}

export interface ScenarioMatrixRow {
  scenario: BenchmarkScenarioDefinition;
  bestMedian: number;
  entries: ScenarioMatrixEntry[];
}
