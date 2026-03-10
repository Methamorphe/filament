import { batch, effect, memo, onCleanup, signal } from "@filament/core";
import {
  BENCHMARK_SANDBOX_ID,
  BENCHMARK_SUITES,
  getBenchmarkSuite,
  runBenchmarkSuite,
} from "./benchmark/runner";
import { buildScenarioMatrix, compareMedians } from "./benchmark/stats";
import type { SampleSummary } from "./benchmark/types";

type BenchmarkRunState = "idle" | "running" | "ready" | "error";

function formatDuration(value: number): string {
  if (value >= 100) {
    return `${value.toFixed(0)} ms`;
  }

  if (value >= 10) {
    return `${value.toFixed(1)} ms`;
  }

  return `${value.toFixed(2)} ms`;
}

function formatRelativeFactor(value: number): string {
  if (value <= 1.02) {
    return "Best";
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)}x slower`;
}

function formatRange(summary: SampleSummary): string {
  return `${formatDuration(summary.min)} to ${formatDuration(summary.max)} · avg ${formatDuration(summary.mean)}`;
}

function describeRelativeSpeed(baseLabel: string, comparisonLabel: string, ratio: number): string {
  if (ratio >= 1) {
    return `${baseLabel} is ${ratio.toFixed(ratio >= 10 ? 0 : 1)}x faster than ${comparisonLabel}`;
  }

  return `${comparisonLabel} is ${(1 / ratio).toFixed(1)}x faster than ${baseLabel}`;
}

export function App() {
  const count = signal(0);
  const step = signal(1);
  const doubled = memo(() => count() * 2);
  const parity = memo(() => (count() % 2 === 0 ? "even" : "odd"));

  const benchmarkRunState = signal<BenchmarkRunState>("idle");
  const benchmarkError = signal<string | null>(null);
  const selectedSuiteId = signal(BENCHMARK_SUITES[0]?.id ?? "grid-core");
  const reportsBySuite = signal<Record<string, Awaited<ReturnType<typeof runBenchmarkSuite>>>>({});

  const activeSuite = memo(() => getBenchmarkSuite(selectedSuiteId()));
  const benchmarkReport = memo(() => reportsBySuite()[selectedSuiteId()] ?? null);
  const resultMatrix = memo(() => {
    const report = benchmarkReport();
    return report === null ? [] : buildScenarioMatrix(report);
  });
  const adapterColumns = memo(() => benchmarkReport()?.adapters ?? []);

  const headline = memo(() => {
    const suite = activeSuite();
    const report = benchmarkReport();

    if (report === null) {
      return suite.description;
    }

    const comparisons = suite.scenarios
      .filter((scenario) => scenario.measure !== "mount")
      .map((scenario) => {
        const ratio = compareMedians(report, scenario.id, "filament", "react");
        return ratio === null ? null : `${describeRelativeSpeed("Filament", "React", ratio)} on ${scenario.label.toLowerCase()}.`;
      })
      .filter((value): value is string => value !== null);

    return comparisons.length > 0 ? comparisons.join(" ") : suite.description;
  });

  const benchmarkStatus = memo(() => {
    if (benchmarkRunState() === "running") {
      return `Running ${activeSuite().label} in an offscreen sandbox. Keep the tab focused for cleaner numbers.`;
    }

    const error = benchmarkError();

    if (error !== null) {
      return error;
    }

    const report = benchmarkReport();

    if (report === null) {
      return `No run yet for ${activeSuite().label}. Lower is better. The async suite uses staged simulated API boundaries rather than real network latency.`;
    }

    return `Last run at ${new Date(report.generatedAt).toLocaleTimeString()}. Median of ${report.suite.config.samples} samples.`;
  });

  effect(() => {
    document.title =
      benchmarkRunState() === "running" ? "Filament benchmark running" : "Filament benchmark POC";

    onCleanup(() => {
      document.title = "Filament Playground";
    });
  });

  async function runBenchmarks() {
    if (benchmarkRunState() === "running") {
      return;
    }

    const sandbox = document.getElementById(BENCHMARK_SANDBOX_ID);

    if (!(sandbox instanceof HTMLElement)) {
      benchmarkRunState.set("error");
      benchmarkError.set("Missing benchmark sandbox container.");
      return;
    }

    const suite = activeSuite();

    benchmarkRunState.set("running");
    benchmarkError.set(null);

    try {
      const report = await runBenchmarkSuite(suite, sandbox);
      batch(() => {
        reportsBySuite.set({
          ...reportsBySuite(),
          [suite.id]: report,
        });
        benchmarkRunState.set("ready");
      });
    } catch (error) {
      benchmarkRunState.set("error");
      benchmarkError.set(error instanceof Error ? error.message : "Benchmark failed.");
    }
  }

  return (
    <main className="lab-shell">
      <section className="hero panel">
        <div>
          <div className="eyebrow">Architecture POC</div>
          <h1>Push the idea with multiple benchmark variants before growing the framework.</h1>
          <p className="intro">
            The playground now ships several benchmark suites: core grid updates, a nested
            multi-component dashboard, staged async API refreshes, and graph-heavy motion screens.
          </p>

          <div className="badges">
            <span className="badge">Fine-grained updates</span>
            <span className="badge">Nested component fan-out</span>
            <span className="badge">Async staged commits</span>
            <span className="badge">SVG graphs and animation ticks</span>
          </div>
        </div>

        <aside className="callout">
          <p className="callout-title">POC scope</p>
          <p className="callout-copy">
            These suites are meant to validate viability quickly. They stress realistic screen
            shapes and update patterns, not full product ergonomics or real-network throughput.
          </p>
        </aside>
      </section>

      <section className="panel suite-panel">
        <div className="section-head">
          <div>
            <h2>Benchmark Suites</h2>
            <p className="section-copy">
              Pick a suite depending on what you want to validate: raw reactive cost, nested
              component propagation, staged async work, or graph-heavy frame updates.
            </p>
          </div>
        </div>

        <div className="suite-selector">
          {BENCHMARK_SUITES.map((suite) => (
            <button
              type="button"
              className={selectedSuiteId() === suite.id ? "suite-tile is-active" : "suite-tile"}
              onClick={() => selectedSuiteId.set(suite.id)}
            >
              <span className="suite-tile-title">{suite.label}</span>
              <span className="suite-tile-copy">{suite.description}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="lab-grid">
        <section className="panel runtime-panel">
          <div className="section-head">
            <div>
              <h2>Runtime Smoke</h2>
              <p className="section-copy">
                The live card remains here to confirm the core signal path still behaves correctly.
              </p>
            </div>
          </div>

          <div className="metrics">
            <p className="metric">
              <span className="metric-label">Count</span>
              <strong>{count()}</strong>
            </p>
            <p className="metric">
              <span className="metric-label">Doubled</span>
              <strong>{doubled()}</strong>
            </p>
            <p className="metric">
              <span className="metric-label">Parity</span>
              <strong>{parity()}</strong>
            </p>
            <p className="metric">
              <span className="metric-label">Step</span>
              <strong>{step()}</strong>
            </p>
          </div>

          <div className="actions">
            <button type="button" onClick={() => count.set(count() - step())}>
              -{step()}
            </button>
            <button type="button" onClick={() => count.set(count() + step())}>
              +{step()}
            </button>
            <button
              type="button"
              onClick={() =>
                batch(() => {
                  count.set(0);
                  step.set(1);
                })
              }
            >
              Reset
            </button>
            <button type="button" onClick={() => step.set(step() === 1 ? 2 : 1)}>
              Toggle step ({step()})
            </button>
          </div>

          <p className="scope-note">
            This is still the sanity check: a state write only updates the text and attributes that
            depend on it.
          </p>
        </section>

        <section className="panel benchmark-panel">
          <div className="section-head">
            <div>
              <h2>{activeSuite().label}</h2>
              <p className="section-copy">{headline()}</p>
            </div>
          </div>

          <div className="config-grid">
            {activeSuite().facts.map((fact) => (
              <div className="config-card">
                <span className="config-label">{fact.label}</span>
                <strong className="config-value">{fact.value}</strong>
              </div>
            ))}
          </div>

          <div className="actions">
            <button
              type="button"
              disabled={benchmarkRunState() === "running"}
              aria-busy={benchmarkRunState() === "running"}
              onClick={runBenchmarks}
            >
              {benchmarkRunState() === "running"
                ? `Running ${activeSuite().label}...`
                : `Run ${activeSuite().label}`}
            </button>
          </div>

          {benchmarkError() !== null ? <p className="error-banner">{benchmarkError()}</p> : null}

          <p className="status-line">{benchmarkStatus()}</p>
          <p className="scope-note">
            For meaningful numbers, run the playground from a production build with
            <code> pnpm --filter playground build</code> then
            <code> pnpm --filter playground preview</code>.
          </p>
        </section>
      </section>

      <section className="panel results-panel">
        <div className="results-head">
          <div>
            <h2>Results</h2>
            <p className="section-copy">
              Timings for the currently selected suite. Each implementation receives the same screen
              structure and the same logical action stream.
            </p>
          </div>
        </div>

        {resultMatrix().length === 0 ? (
          <p className="empty-state">
            No benchmark run yet for {activeSuite().label}. Select a suite above, then launch its
            comparison run.
          </p>
        ) : (
          <div className="results-table-wrap">
            <table className="results-table">
              <thead>
                <tr>
                  <th className="results-scenario">Scenario</th>
                  {adapterColumns().map((adapter) => (
                    <th>{adapter.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {resultMatrix().map((row) => (
                  <tr>
                    <th className="results-scenario">
                      <span className="scenario-title">{row.scenario.label}</span>
                      <span className="scenario-description">{row.scenario.description}</span>
                    </th>

                    {row.entries.map((entry) => (
                      <td>
                        <div
                          className={entry.relativeToBest <= 1.02 ? "result-card is-best" : "result-card"}
                        >
                          <span className="result-time">{formatDuration(entry.result.summary.median)}</span>
                          <span className="result-delta">{formatRelativeFactor(entry.relativeToBest)}</span>
                          <span className="result-range">{formatRange(entry.result.summary)}</span>
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div id={BENCHMARK_SANDBOX_ID} className="benchmark-sandbox" aria-hidden="true" />
    </main>
  );
}
