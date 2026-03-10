import { batch, memo, render, signal, type Child, type Signal } from "@filament/core";
import {
  advanceSeries,
  buildSeries,
  eventLabel,
  formatCompact,
  formatSigned,
  nextTask,
  pipelineTitle,
  seriesToPolylinePoints,
  teamName,
} from "./fixtures";
import type {
  BenchmarkAdapter,
  BenchmarkController,
  BenchmarkSuiteDefinition,
} from "./types";

interface RowState {
  value: Signal<number>;
}

interface DashboardMetricState {
  label: string;
  value: Signal<number>;
  delta: Signal<number>;
}

interface BoardCardState {
  title: string;
  done: Signal<number>;
  total: Signal<number>;
  risk: Signal<number>;
}

interface DashboardRowState {
  team: string;
  score: Signal<number>;
  trend: Signal<number>;
}

interface FeedItemState {
  title: Signal<string>;
  age: Signal<string>;
}

interface AsyncSummaryState {
  label: string;
  value: Signal<number>;
}

interface ResultRowState {
  id: number;
  score: Signal<number>;
  latency: Signal<number>;
  state: Signal<string>;
}

interface LaneState {
  label: string;
  progress: Signal<number>;
  state: Signal<string>;
}

function getNumber(suite: BenchmarkSuiteDefinition, key: string): number {
  const value = suite.config[key];

  if (typeof value !== "number") {
    throw new Error(`Suite "${suite.id}" is missing numeric config "${key}".`);
  }

  return value;
}

function FilamentGridBenchmark(props: { rows: readonly RowState[] }) {
  return (
    <div className="bench-grid">
      {props.rows.map((row, index) => (
        <FilamentGridRow index={index} state={row} />
      ))}
    </div>
  );
}

function FilamentGridRow(props: { index: number; state: RowState }) {
  const doubled = memo(() => props.state.value() * 2);
  const parity = memo(() => (props.state.value() % 2 === 0 ? "even" : "odd"));

  return (
    <article className="bench-row" data-index={props.index} data-parity={parity()}>
      <span className="bench-label">Row {props.index}</span>
      <span className="bench-number">{props.state.value()}</span>
      <span className="bench-number">{doubled()}</span>
      <span className="bench-number">{parity()}</span>
    </article>
  );
}

function FilamentDashboardScreen(props: {
  selectedTeam: Signal<string>;
  rangeDays: Signal<number>;
  alertCount: Signal<number>;
  metrics: readonly DashboardMetricState[];
  boardCards: readonly BoardCardState[];
  teamRows: readonly DashboardRowState[];
  feedItems: readonly FeedItemState[];
  series: Signal<number[]>;
}) {
  return (
    <section className="bench-screen">
      <header className="bench-screen-head">
        <div>
          <span className="bench-kicker">Nested Dashboard</span>
          <h3 className="bench-title">{props.selectedTeam()} control plane</h3>
          <p className="bench-copy">Range {props.rangeDays()}d · {props.alertCount()} active alerts</p>
        </div>
        <div className="bench-pill-row">
          <span className="bench-pill">Selected {props.selectedTeam()}</span>
          <span className="bench-pill">SLA {props.alertCount()}</span>
          <span className="bench-pill">Window {props.rangeDays()}d</span>
        </div>
      </header>

      <section className="bench-kpi-grid">
        {props.metrics.map((metric) => (
          <article className="bench-card">
            <span className="bench-kicker">{metric.label}</span>
            <strong className="bench-stat">{formatCompact(metric.value())}</strong>
            <span className="bench-copy">Delta {formatSigned(metric.delta())}% · {props.selectedTeam()}</span>
          </article>
        ))}
      </section>

      <section className="bench-two-col">
        <article className="bench-card">
          <div className="bench-subhead">
            <span>Demand curve</span>
            <span>{props.selectedTeam()} / {props.rangeDays()}d</span>
          </div>
          <svg viewBox="0 0 240 80" className="bench-svg" aria-hidden="true">
            <polyline
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              points={seriesToPolylinePoints(props.series())}
            />
          </svg>
        </article>

        <article className="bench-card">
          <div className="bench-subhead">
            <span>Pipeline board</span>
            <span>{props.boardCards.length} cards</span>
          </div>
          <div className="bench-stack">
            {props.boardCards.map((card) => (
              <div className="bench-inline-card">
                <span>{card.title}</span>
                <span>
                  {card.done()}/{card.total()} · risk {card.risk()}%
                </span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="bench-two-col">
        <article className="bench-card">
          <div className="bench-subhead">
            <span>Team table</span>
            <span>{props.selectedTeam()} highlighted</span>
          </div>
          <div className="bench-stack">
            {props.teamRows.map((row) => (
              <div
                className={
                  props.selectedTeam() === row.team
                    ? "bench-inline-card bench-inline-card-active"
                    : "bench-inline-card"
                }
              >
                <span>{row.team}</span>
                <span>
                  score {row.score()} · trend {formatSigned(row.trend())}
                </span>
              </div>
            ))}
          </div>
        </article>

        <article className="bench-card">
          <div className="bench-subhead">
            <span>Activity feed</span>
            <span>{props.selectedTeam()}</span>
          </div>
          <div className="bench-stack">
            {props.feedItems.map((item, index) => (
              <div className="bench-inline-card">
                <span>{item.title()}</span>
                <span>
                  {item.age()} · scope {teamName(index)}
                </span>
              </div>
            ))}
          </div>
        </article>
      </section>
    </section>
  );
}

function FilamentAsyncScreen(props: {
  loading: Signal<boolean>;
  phase: Signal<string>;
  requestId: Signal<number>;
  latency: Signal<number>;
  summaries: readonly AsyncSummaryState[];
  rows: readonly ResultRowState[];
  feedItems: readonly FeedItemState[];
  series: Signal<number[]>;
}) {
  return (
    <section className="bench-screen">
      <header className="bench-screen-head">
        <div>
          <span className="bench-kicker">Async API</span>
          <h3 className="bench-title">Request {props.requestId()}</h3>
          <p className="bench-copy">{props.loading() ? "Loading" : "Settled"} · {props.phase()}</p>
        </div>
        <div className="bench-pill-row">
          <span className="bench-pill">{props.loading() ? "In flight" : "Idle"}</span>
          <span className="bench-pill">Latency {props.latency()} ms</span>
        </div>
      </header>

      <section className="bench-kpi-grid">
        {props.summaries.map((summary) => (
          <article className="bench-card">
            <span className="bench-kicker">{summary.label}</span>
            <strong className="bench-stat">{formatCompact(summary.value())}</strong>
          </article>
        ))}
      </section>

      <section className="bench-two-col">
        <article className="bench-card">
          <div className="bench-subhead">
            <span>Network curve</span>
            <span>{props.phase()}</span>
          </div>
          <svg viewBox="0 0 240 80" className="bench-svg" aria-hidden="true">
            <polyline
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              points={seriesToPolylinePoints(props.series())}
            />
          </svg>
        </article>

        <article className="bench-card">
          <div className="bench-subhead">
            <span>Results</span>
            <span>{props.rows.length} rows</span>
          </div>
          <div className="bench-stack">
            {props.rows.map((row) => (
              <div className="bench-inline-card">
                <span>Row {row.id}</span>
                <span>
                  score {row.score()} · {row.latency()} ms · {row.state()}
                </span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <article className="bench-card">
        <div className="bench-subhead">
          <span>Request log</span>
          <span>{props.feedItems.length} events</span>
        </div>
        <div className="bench-stack">
          {props.feedItems.map((item) => (
            <div className="bench-inline-card">
              <span>{item.title()}</span>
              <span>{item.age()}</span>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}

function FilamentGraphScreen(props: {
  tick: Signal<number>;
  primary: Signal<number[]>;
  secondary: Signal<number[]>;
  bars: readonly Signal<number>[];
  lanes: readonly LaneState[];
  peak: Signal<number>;
}) {
  return (
    <section className="bench-screen">
      <header className="bench-screen-head">
        <div>
          <span className="bench-kicker">Graphs And Motion</span>
          <h3 className="bench-title">Frame {props.tick()}</h3>
          <p className="bench-copy">Peak {props.peak()} · dual stream graph</p>
        </div>
        <div className="bench-pill-row">
          <span className="bench-pill">Bars {props.bars.length}</span>
          <span className="bench-pill">Lanes {props.lanes.length}</span>
        </div>
      </header>

      <section className="bench-two-col">
        <article className="bench-card">
          <div className="bench-subhead">
            <span>Primary stream</span>
            <span>{props.tick()} ticks</span>
          </div>
          <svg viewBox="0 0 240 80" className="bench-svg" aria-hidden="true">
            <polyline
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              points={seriesToPolylinePoints(props.primary())}
            />
            <polyline
              fill="none"
              stroke="currentColor"
              stroke-opacity="0.35"
              stroke-width="1.5"
              points={seriesToPolylinePoints(props.secondary())}
            />
          </svg>
        </article>

        <article className="bench-card">
          <div className="bench-subhead">
            <span>Bar strip</span>
            <span>Live compression</span>
          </div>
          <div className="bench-bars">
            {props.bars.map((bar) => (
              <span className="bench-bar" style={`height:${Math.max(8, bar())}px` as never} />
            ))}
          </div>
        </article>
      </section>

      <article className="bench-card">
        <div className="bench-subhead">
          <span>Animation lanes</span>
          <span>{props.tick()} logical frames</span>
        </div>
        <div className="bench-stack">
          {props.lanes.map((lane) => (
            <div className="bench-inline-card">
              <span>{lane.label}</span>
              <span>
                {lane.state()} · {lane.progress()}%
              </span>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}

function createGridController(
  suite: BenchmarkSuiteDefinition,
  container: HTMLElement,
): BenchmarkController {
  const rowCount = getNumber(suite, "rowCount");
  const warmupUpdates = getNumber(suite, "warmupUpdates");
  const hotRowUpdates = getNumber(suite, "hotRowUpdates");
  const sweepPasses = getNumber(suite, "sweepPasses");
  const rows = Array.from({ length: rowCount }, (_, index) => ({
    value: signal(index),
  }));
  const dispose = render(() => <FilamentGridBenchmark rows={rows} /> as unknown as Child, container);

  return {
    perform(actionId) {
      const hotIndex = Math.floor(rowCount / 2);

      switch (actionId) {
        case "warm-hot-row":
          for (let step = 0; step < warmupUpdates; step += 1) {
            rows[hotIndex]!.value.set(rowCount + step);
          }
          return;
        case "run-hot-row":
          for (let step = 0; step < hotRowUpdates; step += 1) {
            rows[hotIndex]!.value.set(rowCount * 10 + step);
          }
          return;
        case "warm-sweep-grid":
          for (let index = 0; index < Math.min(rowCount, 64); index += 1) {
            rows[index]!.value.set(rowCount * 20 + index);
          }
          return;
        case "run-sweep-grid":
          for (let pass = 0; pass < sweepPasses; pass += 1) {
            const base = rowCount * 100 + pass * rowCount;

            for (let index = 0; index < rowCount; index += 1) {
              rows[index]!.value.set(base + index);
            }
          }
          return;
        default:
          throw new Error(`Unknown grid action "${actionId}".`);
      }
    },
    destroy() {
      dispose();
    },
  };
}

function createDashboardController(
  suite: BenchmarkSuiteDefinition,
  container: HTMLElement,
): BenchmarkController {
  const metricCount = getNumber(suite, "metricCount");
  const boardCardsCount = getNumber(suite, "boardCards");
  const tableRowsCount = getNumber(suite, "tableRows");
  const feedItemsCount = getNumber(suite, "feedItems");
  const seriesPoints = getNumber(suite, "seriesPoints");
  const cascadeLoops = getNumber(suite, "cascadeLoops");
  const refreshPasses = getNumber(suite, "refreshPasses");

  const selectedTeam = signal(teamName(0));
  const rangeDays = signal(14);
  const alertCount = signal(3);
  const series = signal(buildSeries(seriesPoints, 0));

  const metrics = Array.from({ length: metricCount }, (_, index) => ({
    label: `Metric ${index + 1}`,
    value: signal(1_200 + index * 130),
    delta: signal(index % 2 === 0 ? 6 + index : -3 - index),
  }));
  const boardCards = Array.from({ length: boardCardsCount }, (_, index) => ({
    title: pipelineTitle(index),
    done: signal(6 + (index % 5)),
    total: signal(12 + (index % 7)),
    risk: signal(14 + (index % 6) * 5),
  }));
  const teamRows = Array.from({ length: tableRowsCount }, (_, index) => ({
    team: teamName(index),
    score: signal(72 + (index % 11)),
    trend: signal((index % 9) - 4),
  }));
  const feedItems = Array.from({ length: feedItemsCount }, (_, index) => ({
    title: signal(`${eventLabel(index)} for ${teamName(index)}`),
    age: signal(`${index + 1}m ago`),
  }));
  const dispose = render(
    () =>
      <FilamentDashboardScreen
        selectedTeam={selectedTeam}
        rangeDays={rangeDays}
        alertCount={alertCount}
        metrics={metrics}
        boardCards={boardCards}
        teamRows={teamRows}
        feedItems={feedItems}
        series={series}
      /> as unknown as Child,
    container,
  );

  function runTeamCascade(iterations: number): void {
    for (let step = 0; step < iterations; step += 1) {
      batch(() => {
        selectedTeam.set(teamName(step));
        rangeDays.set(step % 3 === 0 ? 7 : step % 3 === 1 ? 14 : 30);
        alertCount.set((step % 7) + 2);
        series.set(buildSeries(seriesPoints, step));

        for (let index = 0; index < Math.min(3, metrics.length); index += 1) {
          metrics[index]!.value.set(1_200 + step * 5 + index * 90);
          metrics[index]!.delta.set(((step + index) % 14) - 6);
        }

        const targetCard = boardCards[step % boardCards.length]!;
        targetCard.done.set(4 + (step % 9));
        targetCard.total.set(12 + ((step + 2) % 8));
        targetCard.risk.set(18 + ((step + 3) % 7) * 4);

        const targetRow = teamRows[step % teamRows.length]!;
        targetRow.score.set(68 + (step % 22));
        targetRow.trend.set(((step + 3) % 11) - 5);

        const targetFeed = feedItems[step % feedItems.length]!;
        targetFeed.title.set(`${eventLabel(step)} for ${teamName(step)}`);
        targetFeed.age.set(`${(step % 12) + 1}m ago`);
      });
    }
  }

  function runScreenRefresh(passes: number): void {
    for (let pass = 0; pass < passes; pass += 1) {
      batch(() => {
        selectedTeam.set(teamName(pass + 2));
        rangeDays.set(pass % 2 === 0 ? 21 : 30);
        alertCount.set(4 + pass);
        series.set(buildSeries(seriesPoints, pass * 11));

        metrics.forEach((metric, index) => {
          metric.value.set(1_400 + pass * 40 + index * 120);
          metric.delta.set(((pass * 3 + index) % 15) - 7);
        });

        boardCards.forEach((card, index) => {
          card.done.set(5 + ((pass + index) % 10));
          card.total.set(12 + ((pass + index) % 9));
          card.risk.set(12 + ((pass + index) % 8) * 6);
        });

        teamRows.forEach((row, index) => {
          row.score.set(70 + ((pass * 3 + index) % 24));
          row.trend.set(((pass + index) % 13) - 6);
        });

        feedItems.forEach((item, index) => {
          item.title.set(`${eventLabel(pass + index)} for ${teamName(pass + index)}`);
          item.age.set(`${(pass + index) % 20 + 1}m ago`);
        });
      });
    }
  }

  return {
    perform(actionId) {
      switch (actionId) {
        case "warm-team-cascade":
          runTeamCascade(48);
          return;
        case "run-team-cascade":
          runTeamCascade(cascadeLoops);
          return;
        case "warm-screen-refresh":
          runScreenRefresh(1);
          return;
        case "run-screen-refresh":
          runScreenRefresh(refreshPasses);
          return;
        default:
          throw new Error(`Unknown dashboard action "${actionId}".`);
      }
    },
    destroy() {
      dispose();
    },
  };
}

function createAsyncController(
  suite: BenchmarkSuiteDefinition,
  container: HTMLElement,
): BenchmarkController {
  const summaryCount = getNumber(suite, "summaryCount");
  const resultRowsCount = getNumber(suite, "resultRows");
  const feedItemsCount = getNumber(suite, "feedItems");
  const seriesPoints = getNumber(suite, "seriesPoints");
  const queryCycles = getNumber(suite, "queryCycles");
  const pageCount = getNumber(suite, "pageCount");
  const chunkCount = getNumber(suite, "chunkCount");

  const loading = signal(false);
  const phase = signal("idle");
  const requestId = signal(0);
  const latency = signal(0);
  const series = signal(buildSeries(seriesPoints, 4));
  const summaries = Array.from({ length: summaryCount }, (_, index) => ({
    label: `Summary ${index + 1}`,
    value: signal(900 + index * 120),
  }));
  const rows = Array.from({ length: resultRowsCount }, (_, index) => ({
    id: index,
    score: signal(70 + (index % 17)),
    latency: signal(28 + (index % 13)),
    state: signal(index % 3 === 0 ? "warm" : "ready"),
  }));
  const feedItems = Array.from({ length: feedItemsCount }, (_, index) => ({
    title: signal(`${eventLabel(index)} / chunk ${index % chunkCount}`),
    age: signal(`${index + 1}s`),
  }));
  const dispose = render(
    () =>
      <FilamentAsyncScreen
        loading={loading}
        phase={phase}
        requestId={requestId}
        latency={latency}
        summaries={summaries}
        rows={rows}
        feedItems={feedItems}
        series={series}
      /> as unknown as Child,
    container,
  );

  async function runStaggeredApi(cycles: number): Promise<void> {
    for (let cycle = 0; cycle < cycles; cycle += 1) {
      batch(() => {
        loading.set(true);
        requestId.set(cycle + 1);
        phase.set(`request ${cycle + 1} / chunk 1`);
      });

      for (let chunk = 0; chunk < chunkCount; chunk += 1) {
        await nextTask();

        batch(() => {
          phase.set(`request ${cycle + 1} / chunk ${chunk + 1}`);
          latency.set(24 + ((cycle + chunk) % 8) * 6);
          series.set(buildSeries(seriesPoints, cycle * 3 + chunk));

          summaries.forEach((summary, index) => {
            summary.value.set(1_000 + cycle * 25 + chunk * 15 + index * 70);
          });

          for (let index = 0; index < 20; index += 1) {
            const row = rows[(chunk * 20 + index) % rows.length]!;
            row.score.set(66 + ((cycle + chunk + index) % 28));
            row.latency.set(18 + ((cycle + chunk + index) % 16));
            row.state.set(chunk === chunkCount - 1 ? "settled" : "partial");
          }

          const feed = feedItems[(cycle + chunk) % feedItems.length]!;
          feed.title.set(`${eventLabel(cycle + chunk)} / chunk ${chunk + 1}`);
          feed.age.set(`${cycle + chunk + 1}s`);
        });
      }

      batch(() => {
        loading.set(false);
        phase.set(`request ${cycle + 1} settled`);
      });
    }
  }

  async function runPaginatedApi(cycles: number): Promise<void> {
    for (let cycle = 0; cycle < cycles; cycle += 1) {
      batch(() => {
        loading.set(true);
        requestId.set(100 + cycle);
        phase.set(`page 1/${pageCount}`);
      });

      for (let page = 0; page < pageCount; page += 1) {
        await nextTask();

        batch(() => {
          phase.set(`page ${page + 1}/${pageCount}`);
          latency.set(32 + ((cycle + page) % 6) * 7);
          series.set(buildSeries(seriesPoints, cycle * 5 + page * 2));

          const start = page * Math.floor(rows.length / pageCount);
          const end = Math.min(rows.length, start + Math.floor(rows.length / pageCount));

          for (let index = start; index < end; index += 1) {
            const row = rows[index]!;
            row.score.set(64 + ((cycle + page + index) % 31));
            row.latency.set(20 + ((cycle + index) % 14));
            row.state.set(page === pageCount - 1 ? "cached" : "page");
          }

          const feed = feedItems[(cycle + page) % feedItems.length]!;
          feed.title.set(`Page ${page + 1} merged · ${eventLabel(cycle + page)}`);
          feed.age.set(`${page + 1}.${cycle + 1}s`);

          summaries.forEach((summary, index) => {
            summary.value.set(980 + cycle * 18 + page * 24 + index * 90);
          });
        });
      }

      batch(() => {
        loading.set(false);
        phase.set(`request ${cycle + 1} cached`);
      });
    }
  }

  return {
    async perform(actionId) {
      switch (actionId) {
        case "warm-staggered-api":
          await runStaggeredApi(2);
          return;
        case "run-staggered-api":
          await runStaggeredApi(queryCycles);
          return;
        case "warm-paginated-api":
          await runPaginatedApi(1);
          return;
        case "run-paginated-api":
          await runPaginatedApi(Math.max(2, Math.floor(queryCycles / 2)));
          return;
        default:
          throw new Error(`Unknown async action "${actionId}".`);
      }
    },
    destroy() {
      dispose();
    },
  };
}

function createGraphController(
  suite: BenchmarkSuiteDefinition,
  container: HTMLElement,
): BenchmarkController {
  const seriesPoints = getNumber(suite, "seriesPoints");
  const barCount = getNumber(suite, "barCount");
  const laneCount = getNumber(suite, "laneCount");
  const streamTicks = getNumber(suite, "streamTicks");
  const animationFrames = getNumber(suite, "animationFrames");

  const tick = signal(0);
  const primary = signal(buildSeries(seriesPoints, 0));
  const secondary = signal(buildSeries(seriesPoints, 8));
  const peak = signal(98);
  const bars = Array.from({ length: barCount }, (_, index) => signal(24 + (index % 10) * 5));
  const lanes = Array.from({ length: laneCount }, (_, index) => ({
    label: `Lane ${index + 1}`,
    progress: signal(14 + index * 5),
    state: signal(index % 2 === 0 ? "stable" : "warming"),
  }));
  const dispose = render(
    () =>
      <FilamentGraphScreen
        tick={tick}
        primary={primary}
        secondary={secondary}
        bars={bars}
        lanes={lanes}
        peak={peak}
      /> as unknown as Child,
    container,
  );

  function runStream(iterations: number): void {
    for (let step = 0; step < iterations; step += 1) {
      batch(() => {
        tick.set(step + 1);
        primary.set(advanceSeries(primary.peek(), step));
        secondary.set(advanceSeries(secondary.peek(), step + 7));
        peak.set(80 + ((step + 5) % 24));
        bars[step % bars.length]!.set(18 + ((step * 7) % 70));
      });
    }
  }

  function runAnimation(iterations: number): void {
    for (let frame = 0; frame < iterations; frame += 1) {
      batch(() => {
        tick.set(frame + 1);

        bars.forEach((bar, index) => {
          bar.set(12 + ((frame * 5 + index * 7) % 72));
        });

        lanes.forEach((lane, index) => {
          lane.progress.set((frame * 7 + index * 13) % 100);
          lane.state.set((frame + index) % 3 === 0 ? "animating" : (frame + index) % 3 === 1 ? "stable" : "settling");
        });
      });
    }
  }

  return {
    perform(actionId) {
      switch (actionId) {
        case "warm-stream-graph":
          runStream(24);
          return;
        case "run-stream-graph":
          runStream(streamTicks);
          return;
        case "warm-animation-frames":
          runAnimation(20);
          return;
        case "run-animation-frames":
          runAnimation(animationFrames);
          return;
        default:
          throw new Error(`Unknown graph action "${actionId}".`);
      }
    },
    destroy() {
      dispose();
    },
  };
}

export const filamentBenchmarkAdapter: BenchmarkAdapter = {
  id: "filament",
  label: "Filament",
  model: "direct-dom",
  mount(suite, container) {
    switch (suite.id) {
      case "grid-core":
        return createGridController(suite, container);
      case "dashboard-nested":
        return createDashboardController(suite, container);
      case "async-api":
        return createAsyncController(suite, container);
      case "graph-motion":
        return createGraphController(suite, container);
      default:
        throw new Error(`Unsupported Filament suite "${suite.id}".`);
    }
  },
};
