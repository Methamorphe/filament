import { createElement, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
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
import {
  createSSRBenchmarkState,
  mutateSSRFullRefresh,
  mutateSSRHotPath,
  type SSRBenchmarkState,
  type SSRFeedItemState,
  type SSRMetricState,
  type SSRRowState,
} from "./ssr-fixtures";
import type {
  BenchmarkAdapter,
  BenchmarkController,
  BenchmarkSuiteDefinition,
} from "./types";

type Listener = () => void;

interface Atom<T> {
  getSnapshot(): T;
  subscribe(listener: Listener): () => void;
  set(next: T): void;
}

interface DashboardMetricAtom {
  label: string;
  value: Atom<number>;
  delta: Atom<number>;
}

interface BoardCardAtom {
  title: string;
  done: Atom<number>;
  total: Atom<number>;
  risk: Atom<number>;
}

interface DashboardRowAtom {
  team: string;
  score: Atom<number>;
  trend: Atom<number>;
}

interface FeedItemAtom {
  title: Atom<string>;
  age: Atom<string>;
}

interface AsyncSummaryAtom {
  label: string;
  value: Atom<number>;
}

interface ResultRowAtom {
  id: number;
  score: Atom<number>;
  latency: Atom<number>;
  state: Atom<string>;
}

interface LaneAtom {
  label: string;
  progress: Atom<number>;
  state: Atom<string>;
}

const h = createElement;

function createAtom<T>(initial: T): Atom<T> {
  let value = initial;
  const listeners = new Set<Listener>();

  return {
    getSnapshot() {
      return value;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set(next) {
      if (Object.is(value, next)) {
        return;
      }

      value = next;

      for (const listener of Array.from(listeners)) {
        listener();
      }
    },
  };
}

function useAtom<T>(atom: Atom<T>): T {
  return useSyncExternalStore(atom.subscribe, atom.getSnapshot, atom.getSnapshot);
}

function getNumber(suite: BenchmarkSuiteDefinition, key: string): number {
  const value = suite.config[key];

  if (typeof value !== "number") {
    throw new Error(`Suite "${suite.id}" is missing numeric config "${key}".`);
  }

  return value;
}

function ReactGridScreen(props: { rows: readonly Atom<number>[] }) {
  return h(
    "div",
    { className: "bench-grid" },
    props.rows.map((row, index) => h(ReactGridRow, { key: index, index, row })),
  );
}

function ReactGridRow(props: { index: number; row: Atom<number> }) {
  const value = useAtom(props.row);
  const doubled = value * 2;
  const parity = value % 2 === 0 ? "even" : "odd";

  return h(
    "article",
    {
      className: "bench-row",
      "data-index": props.index,
      "data-parity": parity,
    },
    h("span", { className: "bench-label" }, `Row ${props.index}`),
    h("span", { className: "bench-number" }, String(value)),
    h("span", { className: "bench-number" }, String(doubled)),
    h("span", { className: "bench-number" }, parity),
  );
}

function ReactDashboardScreen(props: {
  selectedTeam: Atom<string>;
  rangeDays: Atom<number>;
  alertCount: Atom<number>;
  metrics: readonly DashboardMetricAtom[];
  boardCards: readonly BoardCardAtom[];
  teamRows: readonly DashboardRowAtom[];
  feedItems: readonly FeedItemAtom[];
  series: Atom<number[]>;
}) {
  const selectedTeam = useAtom(props.selectedTeam);
  const rangeDays = useAtom(props.rangeDays);
  const alertCount = useAtom(props.alertCount);
  const series = useAtom(props.series);

  return h(
    "section",
    { className: "bench-screen" },
    h(
      "header",
      { className: "bench-screen-head" },
      h(
        "div",
        null,
        h("span", { className: "bench-kicker" }, "Nested Dashboard"),
        h("h3", { className: "bench-title" }, `${selectedTeam} control plane`),
        h("p", { className: "bench-copy" }, `Range ${rangeDays}d · ${alertCount} active alerts`),
      ),
      h(
        "div",
        { className: "bench-pill-row" },
        h("span", { className: "bench-pill" }, `Selected ${selectedTeam}`),
        h("span", { className: "bench-pill" }, `SLA ${alertCount}`),
        h("span", { className: "bench-pill" }, `Window ${rangeDays}d`),
      ),
    ),
    h(
      "section",
      { className: "bench-kpi-grid" },
      props.metrics.map((metric, index) =>
        h(ReactMetricCard, {
          key: index,
          metric,
          selectedTeam: props.selectedTeam,
        }),
      ),
    ),
    h(
      "section",
      { className: "bench-two-col" },
      h(
        "article",
        { className: "bench-card" },
        h(
          "div",
          { className: "bench-subhead" },
          h("span", null, "Demand curve"),
          h("span", null, `${selectedTeam} / ${rangeDays}d`),
        ),
        h(
          "svg",
          { viewBox: "0 0 240 80", className: "bench-svg", "aria-hidden": true },
          h("polyline", {
            fill: "none",
            stroke: "currentColor",
            strokeWidth: 2,
            points: seriesToPolylinePoints(series),
          }),
        ),
      ),
      h(
        "article",
        { className: "bench-card" },
        h(
          "div",
          { className: "bench-subhead" },
          h("span", null, "Pipeline board"),
          h("span", null, `${props.boardCards.length} cards`),
        ),
        h(
          "div",
          { className: "bench-stack" },
          props.boardCards.map((card, index) => h(ReactBoardCard, { key: index, card })),
        ),
      ),
    ),
    h(
      "section",
      { className: "bench-two-col" },
      h(
        "article",
        { className: "bench-card" },
        h(
          "div",
          { className: "bench-subhead" },
          h("span", null, "Team table"),
          h("span", null, `${selectedTeam} highlighted`),
        ),
        h(
          "div",
          { className: "bench-stack" },
          props.teamRows.map((row, index) =>
            h(ReactTeamRow, {
              key: index,
              row,
              selectedTeam: props.selectedTeam,
            }),
          ),
        ),
      ),
      h(
        "article",
        { className: "bench-card" },
        h(
          "div",
          { className: "bench-subhead" },
          h("span", null, "Activity feed"),
          h("span", null, selectedTeam),
        ),
        h(
          "div",
          { className: "bench-stack" },
          props.feedItems.map((item, index) =>
            h(ReactFeedItem, {
              key: index,
              item,
              scope: teamName(index),
            }),
          ),
        ),
      ),
    ),
  );
}

function ReactMetricCard(props: {
  metric: DashboardMetricAtom;
  selectedTeam: Atom<string>;
}) {
  const selectedTeam = useAtom(props.selectedTeam);
  const value = useAtom(props.metric.value);
  const delta = useAtom(props.metric.delta);

  return h(
    "article",
    { className: "bench-card" },
    h("span", { className: "bench-kicker" }, props.metric.label),
    h("strong", { className: "bench-stat" }, formatCompact(value)),
    h("span", { className: "bench-copy" }, `Delta ${formatSigned(delta)}% · ${selectedTeam}`),
  );
}

function ReactBoardCard(props: { card: BoardCardAtom }) {
  const done = useAtom(props.card.done);
  const total = useAtom(props.card.total);
  const risk = useAtom(props.card.risk);

  return h(
    "div",
    { className: "bench-inline-card" },
    h("span", null, props.card.title),
    h("span", null, `${done}/${total} · risk ${risk}%`),
  );
}

function ReactTeamRow(props: { row: DashboardRowAtom; selectedTeam: Atom<string> }) {
  const selectedTeam = useAtom(props.selectedTeam);
  const score = useAtom(props.row.score);
  const trend = useAtom(props.row.trend);

  return h(
    "div",
    {
      className:
        selectedTeam === props.row.team
          ? "bench-inline-card bench-inline-card-active"
          : "bench-inline-card",
    },
    h("span", null, props.row.team),
    h("span", null, `score ${score} · trend ${formatSigned(trend)}`),
  );
}

function ReactFeedItem(props: { item: FeedItemAtom; scope: string }) {
  const title = useAtom(props.item.title);
  const age = useAtom(props.item.age);

  return h(
    "div",
    { className: "bench-inline-card" },
    h("span", null, title),
    h("span", null, `${age} · scope ${props.scope}`),
  );
}

function ReactAsyncScreen(props: {
  loading: Atom<boolean>;
  phase: Atom<string>;
  requestId: Atom<number>;
  latency: Atom<number>;
  summaries: readonly AsyncSummaryAtom[];
  rows: readonly ResultRowAtom[];
  feedItems: readonly FeedItemAtom[];
  series: Atom<number[]>;
}) {
  const loading = useAtom(props.loading);
  const phase = useAtom(props.phase);
  const requestId = useAtom(props.requestId);
  const latency = useAtom(props.latency);
  const series = useAtom(props.series);

  return h(
    "section",
    { className: "bench-screen" },
    h(
      "header",
      { className: "bench-screen-head" },
      h(
        "div",
        null,
        h("span", { className: "bench-kicker" }, "Async API"),
        h("h3", { className: "bench-title" }, `Request ${requestId}`),
        h("p", { className: "bench-copy" }, `${loading ? "Loading" : "Settled"} · ${phase}`),
      ),
      h(
        "div",
        { className: "bench-pill-row" },
        h("span", { className: "bench-pill" }, loading ? "In flight" : "Idle"),
        h("span", { className: "bench-pill" }, `Latency ${latency} ms`),
      ),
    ),
    h(
      "section",
      { className: "bench-kpi-grid" },
      props.summaries.map((summary, index) => h(ReactAsyncSummaryCard, { key: index, summary })),
    ),
    h(
      "section",
      { className: "bench-two-col" },
      h(
        "article",
        { className: "bench-card" },
        h(
          "div",
          { className: "bench-subhead" },
          h("span", null, "Network curve"),
          h("span", null, phase),
        ),
        h(
          "svg",
          { viewBox: "0 0 240 80", className: "bench-svg", "aria-hidden": true },
          h("polyline", {
            fill: "none",
            stroke: "currentColor",
            strokeWidth: 2,
            points: seriesToPolylinePoints(series),
          }),
        ),
      ),
      h(
        "article",
        { className: "bench-card" },
        h(
          "div",
          { className: "bench-subhead" },
          h("span", null, "Results"),
          h("span", null, `${props.rows.length} rows`),
        ),
        h(
          "div",
          { className: "bench-stack" },
          props.rows.map((row, index) => h(ReactResultRow, { key: index, row })),
        ),
      ),
    ),
    h(
      "article",
      { className: "bench-card" },
      h(
        "div",
        { className: "bench-subhead" },
        h("span", null, "Request log"),
        h("span", null, `${props.feedItems.length} events`),
      ),
      h(
        "div",
        { className: "bench-stack" },
        props.feedItems.map((item, index) => h(ReactLogItem, { key: index, item })),
      ),
    ),
  );
}

function ReactAsyncSummaryCard(props: { summary: AsyncSummaryAtom }) {
  const value = useAtom(props.summary.value);
  return h(
    "article",
    { className: "bench-card" },
    h("span", { className: "bench-kicker" }, props.summary.label),
    h("strong", { className: "bench-stat" }, formatCompact(value)),
  );
}

function ReactResultRow(props: { row: ResultRowAtom }) {
  const score = useAtom(props.row.score);
  const latency = useAtom(props.row.latency);
  const state = useAtom(props.row.state);

  return h(
    "div",
    { className: "bench-inline-card" },
    h("span", null, `Row ${props.row.id}`),
    h("span", null, `score ${score} · ${latency} ms · ${state}`),
  );
}

function ReactLogItem(props: { item: FeedItemAtom }) {
  const title = useAtom(props.item.title);
  const age = useAtom(props.item.age);

  return h(
    "div",
    { className: "bench-inline-card" },
    h("span", null, title),
    h("span", null, age),
  );
}

function ReactGraphScreen(props: {
  tick: Atom<number>;
  primary: Atom<number[]>;
  secondary: Atom<number[]>;
  bars: readonly Atom<number>[];
  lanes: readonly LaneAtom[];
  peak: Atom<number>;
}) {
  const tick = useAtom(props.tick);
  const primary = useAtom(props.primary);
  const secondary = useAtom(props.secondary);
  const peak = useAtom(props.peak);

  return h(
    "section",
    { className: "bench-screen" },
    h(
      "header",
      { className: "bench-screen-head" },
      h(
        "div",
        null,
        h("span", { className: "bench-kicker" }, "Graphs And Motion"),
        h("h3", { className: "bench-title" }, `Frame ${tick}`),
        h("p", { className: "bench-copy" }, `Peak ${peak} · dual stream graph`),
      ),
      h(
        "div",
        { className: "bench-pill-row" },
        h("span", { className: "bench-pill" }, `Bars ${props.bars.length}`),
        h("span", { className: "bench-pill" }, `Lanes ${props.lanes.length}`),
      ),
    ),
    h(
      "section",
      { className: "bench-two-col" },
      h(
        "article",
        { className: "bench-card" },
        h(
          "div",
          { className: "bench-subhead" },
          h("span", null, "Primary stream"),
          h("span", null, `${tick} ticks`),
        ),
        h(
          "svg",
          { viewBox: "0 0 240 80", className: "bench-svg", "aria-hidden": true },
          h("polyline", {
            fill: "none",
            stroke: "currentColor",
            strokeWidth: 2,
            points: seriesToPolylinePoints(primary),
          }),
          h("polyline", {
            fill: "none",
            stroke: "currentColor",
            strokeOpacity: 0.35,
            strokeWidth: 1.5,
            points: seriesToPolylinePoints(secondary),
          }),
        ),
      ),
      h(
        "article",
        { className: "bench-card" },
        h(
          "div",
          { className: "bench-subhead" },
          h("span", null, "Bar strip"),
          h("span", null, "Live compression"),
        ),
        h(
          "div",
          { className: "bench-bars" },
          props.bars.map((bar, index) => h(ReactBar, { key: index, bar })),
        ),
      ),
    ),
    h(
      "article",
      { className: "bench-card" },
      h(
        "div",
        { className: "bench-subhead" },
        h("span", null, "Animation lanes"),
        h("span", null, `${tick} logical frames`),
      ),
      h(
        "div",
        { className: "bench-stack" },
        props.lanes.map((lane, index) => h(ReactLane, { key: index, lane })),
      ),
    ),
  );
}

function ReactBar(props: { bar: Atom<number> }) {
  const value = useAtom(props.bar);
  return h("span", { className: "bench-bar", style: { height: `${Math.max(8, value)}px` } });
}

function ReactLane(props: { lane: LaneAtom }) {
  const progress = useAtom(props.lane.progress);
  const state = useAtom(props.lane.state);

  return h(
    "div",
    { className: "bench-inline-card" },
    h("span", null, props.lane.label),
    h("span", null, `${state} · ${progress}%`),
  );
}

function ReactSSRMetricCard(props: { metric: SSRMetricState }) {
  return h(
    "article",
    { className: "bench-card" },
    h("span", { className: "bench-kicker" }, props.metric.label),
    h("strong", { className: "bench-stat" }, formatCompact(props.metric.value)),
    h("span", { className: "bench-copy" }, `Delta ${formatSigned(props.metric.delta)}%`),
  );
}

function ReactSSRRow(props: { row: SSRRowState; region: string }) {
  return h(
    "div",
    {
      className:
        props.row.team === props.region
          ? "bench-inline-card bench-inline-card-active"
          : "bench-inline-card",
    },
    h("span", null, props.row.team),
    h("span", null, `score ${props.row.score} · ${props.row.latency} ms · ${props.row.status}`),
  );
}

function ReactSSRFeedItem(props: { item: SSRFeedItemState }) {
  return h(
    "div",
    { className: "bench-inline-card" },
    h("span", null, props.item.title),
    h("span", null, props.item.age),
  );
}

function ReactSSRScreen(props: { state: SSRBenchmarkState }) {
  const { state } = props;

  return h(
    "section",
    { className: "bench-screen" },
    h(
      "header",
      { className: "bench-screen-head" },
      h(
        "div",
        null,
        h("span", { className: "bench-kicker" }, "SSR Render"),
        h("h3", { className: "bench-title" }, `${state.region} render batch ${state.renderBatch}`),
        h("p", { className: "bench-copy" }, `Range ${state.rangeDays}d · ${state.alertCount} active alerts`),
      ),
      h(
        "div",
        { className: "bench-pill-row" },
        h("span", { className: "bench-pill" }, `Region ${state.region}`),
        h("span", { className: "bench-pill" }, `Rows ${state.rows.length}`),
        h("span", { className: "bench-pill" }, `Feed ${state.feedItems.length}`),
      ),
    ),
    h(
      "section",
      { className: "bench-kpi-grid" },
      state.metrics.map((metric, index) => h(ReactSSRMetricCard, { key: index, metric })),
    ),
    h(
      "section",
      { className: "bench-two-col" },
      h(
        "article",
        { className: "bench-card" },
        h(
          "div",
          { className: "bench-subhead" },
          h("span", null, "Service rows"),
          h("span", null, `${state.rows.length} rows`),
        ),
        h(
          "div",
          { className: "bench-stack" },
          state.rows.map((row, index) => h(ReactSSRRow, { key: index, row, region: state.region })),
        ),
      ),
      h(
        "article",
        { className: "bench-card" },
        h(
          "div",
          { className: "bench-subhead" },
          h("span", null, "Activity feed"),
          h("span", null, `${state.feedItems.length} events`),
        ),
        h(
          "div",
          { className: "bench-stack" },
          state.feedItems.map((item, index) => h(ReactSSRFeedItem, { key: index, item })),
        ),
      ),
    ),
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
  const rows = Array.from({ length: rowCount }, (_, index) => createAtom(index));
  const root = createRoot(container);

  flushSync(() => {
    root.render(h(ReactGridScreen, { rows }));
  });

  return {
    perform(actionId) {
      const hotIndex = Math.floor(rowCount / 2);

      switch (actionId) {
        case "warm-hot-row":
          for (let step = 0; step < warmupUpdates; step += 1) {
            flushSync(() => {
              rows[hotIndex]!.set(rowCount + step);
            });
          }
          return;
        case "run-hot-row":
          for (let step = 0; step < hotRowUpdates; step += 1) {
            flushSync(() => {
              rows[hotIndex]!.set(rowCount * 10 + step);
            });
          }
          return;
        case "warm-sweep-grid":
          for (let index = 0; index < Math.min(rowCount, 64); index += 1) {
            flushSync(() => {
              rows[index]!.set(rowCount * 20 + index);
            });
          }
          return;
        case "run-sweep-grid":
          for (let pass = 0; pass < sweepPasses; pass += 1) {
            const base = rowCount * 100 + pass * rowCount;

            for (let index = 0; index < rowCount; index += 1) {
              flushSync(() => {
                rows[index]!.set(base + index);
              });
            }
          }
          return;
        default:
          throw new Error(`Unknown grid action "${actionId}".`);
      }
    },
    destroy() {
      flushSync(() => {
        root.unmount();
      });
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

  const selectedTeam = createAtom(teamName(0));
  const rangeDays = createAtom(14);
  const alertCount = createAtom(3);
  const series = createAtom(buildSeries(seriesPoints, 0));
  const metrics = Array.from({ length: metricCount }, (_, index) => ({
    label: `Metric ${index + 1}`,
    value: createAtom(1_200 + index * 130),
    delta: createAtom(index % 2 === 0 ? 6 + index : -3 - index),
  }));
  const boardCards = Array.from({ length: boardCardsCount }, (_, index) => ({
    title: pipelineTitle(index),
    done: createAtom(6 + (index % 5)),
    total: createAtom(12 + (index % 7)),
    risk: createAtom(14 + (index % 6) * 5),
  }));
  const teamRows = Array.from({ length: tableRowsCount }, (_, index) => ({
    team: teamName(index),
    score: createAtom(72 + (index % 11)),
    trend: createAtom((index % 9) - 4),
  }));
  const feedItems = Array.from({ length: feedItemsCount }, (_, index) => ({
    title: createAtom(`${eventLabel(index)} for ${teamName(index)}`),
    age: createAtom(`${index + 1}m ago`),
  }));
  const root = createRoot(container);

  flushSync(() => {
    root.render(
      h(ReactDashboardScreen, {
        selectedTeam,
        rangeDays,
        alertCount,
        metrics,
        boardCards,
        teamRows,
        feedItems,
        series,
      }),
    );
  });

  function runTeamCascade(iterations: number): void {
    for (let step = 0; step < iterations; step += 1) {
      flushSync(() => {
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
      flushSync(() => {
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
      flushSync(() => {
        root.unmount();
      });
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

  const loading = createAtom(false);
  const phase = createAtom("idle");
  const requestId = createAtom(0);
  const latency = createAtom(0);
  const series = createAtom(buildSeries(seriesPoints, 4));
  const summaries = Array.from({ length: summaryCount }, (_, index) => ({
    label: `Summary ${index + 1}`,
    value: createAtom(900 + index * 120),
  }));
  const rows = Array.from({ length: resultRowsCount }, (_, index) => ({
    id: index,
    score: createAtom(70 + (index % 17)),
    latency: createAtom(28 + (index % 13)),
    state: createAtom(index % 3 === 0 ? "warm" : "ready"),
  }));
  const feedItems = Array.from({ length: feedItemsCount }, (_, index) => ({
    title: createAtom(`${eventLabel(index)} / chunk ${index % chunkCount}`),
    age: createAtom(`${index + 1}s`),
  }));
  const root = createRoot(container);

  flushSync(() => {
    root.render(
      h(ReactAsyncScreen, {
        loading,
        phase,
        requestId,
        latency,
        summaries,
        rows,
        feedItems,
        series,
      }),
    );
  });

  async function runStaggeredApi(cycles: number): Promise<void> {
    for (let cycle = 0; cycle < cycles; cycle += 1) {
      flushSync(() => {
        loading.set(true);
        requestId.set(cycle + 1);
        phase.set(`request ${cycle + 1} / chunk 1`);
      });

      for (let chunk = 0; chunk < chunkCount; chunk += 1) {
        await nextTask();

        flushSync(() => {
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

      flushSync(() => {
        loading.set(false);
        phase.set(`request ${cycle + 1} settled`);
      });
    }
  }

  async function runPaginatedApi(cycles: number): Promise<void> {
    for (let cycle = 0; cycle < cycles; cycle += 1) {
      flushSync(() => {
        loading.set(true);
        requestId.set(100 + cycle);
        phase.set(`page 1/${pageCount}`);
      });

      for (let page = 0; page < pageCount; page += 1) {
        await nextTask();

        flushSync(() => {
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

      flushSync(() => {
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
      flushSync(() => {
        root.unmount();
      });
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

  const tick = createAtom(0);
  const primary = createAtom(buildSeries(seriesPoints, 0));
  const secondary = createAtom(buildSeries(seriesPoints, 8));
  const peak = createAtom(98);
  const bars = Array.from({ length: barCount }, (_, index) => createAtom(24 + (index % 10) * 5));
  const lanes = Array.from({ length: laneCount }, (_, index) => ({
    label: `Lane ${index + 1}`,
    progress: createAtom(14 + index * 5),
    state: createAtom(index % 2 === 0 ? "stable" : "warming"),
  }));
  const root = createRoot(container);

  flushSync(() => {
    root.render(
      h(ReactGraphScreen, {
        tick,
        primary,
        secondary,
        bars,
        lanes,
        peak,
      }),
    );
  });

  function runStream(iterations: number): void {
    for (let step = 0; step < iterations; step += 1) {
      flushSync(() => {
        tick.set(step + 1);
        primary.set(advanceSeries(primary.getSnapshot(), step));
        secondary.set(advanceSeries(secondary.getSnapshot(), step + 7));
        peak.set(80 + ((step + 5) % 24));
        bars[step % bars.length]!.set(18 + ((step * 7) % 70));
      });
    }
  }

  function runAnimation(iterations: number): void {
    for (let frame = 0; frame < iterations; frame += 1) {
      flushSync(() => {
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
      flushSync(() => {
        root.unmount();
      });
    },
  };
}

async function createSSRController(
  suite: BenchmarkSuiteDefinition,
  _container: HTMLElement,
): Promise<BenchmarkController> {
  const metricCount = getNumber(suite, "metricCount");
  const rowCount = getNumber(suite, "tableRows");
  const feedItemsCount = getNumber(suite, "feedItems");
  const hotRenders = getNumber(suite, "hotRenders");
  const refreshPasses = getNumber(suite, "refreshPasses");
  const state = createSSRBenchmarkState(metricCount, rowCount, feedItemsCount);
  const { renderToString: renderReactToString } = await import("react-dom/server.browser");
  let lastHtml = "";

  function renderSnapshot(): void {
    lastHtml = renderReactToString(h(ReactSSRScreen, { state }));

    if (lastHtml.length === 0) {
      throw new Error("SSR benchmark produced an empty React render.");
    }
  }

  function runHotRenders(iterations: number): void {
    for (let step = 0; step < iterations; step += 1) {
      mutateSSRHotPath(state, step);
      renderSnapshot();
    }
  }

  function runRefreshRenders(passes: number): void {
    for (let pass = 0; pass < passes; pass += 1) {
      mutateSSRFullRefresh(state, pass);
      renderSnapshot();
    }
  }

  renderSnapshot();

  return {
    perform(actionId) {
      switch (actionId) {
        case "warm-hot-ssr-rerender":
          runHotRenders(18);
          return;
        case "run-hot-ssr-rerender":
          runHotRenders(hotRenders);
          return;
        case "warm-refresh-ssr-rerender":
          runRefreshRenders(2);
          return;
        case "run-refresh-ssr-rerender":
          runRefreshRenders(refreshPasses);
          return;
        default:
          throw new Error(`Unknown SSR action "${actionId}".`);
      }
    },
    destroy() {
      lastHtml = "";
    },
  };
}

export const reactBenchmarkAdapter: BenchmarkAdapter = {
  id: "react",
  label: "React (VDOM)",
  model: "virtual-dom",
  mount(suite, container) {
    switch (suite.id) {
      case "grid-core":
        return createGridController(suite, container);
      case "dashboard-nested":
        return createDashboardController(suite, container);
      case "ssr-render":
        return createSSRController(suite, container);
      case "async-api":
        return createAsyncController(suite, container);
      case "graph-motion":
        return createGraphController(suite, container);
      default:
        throw new Error(`Unsupported React suite "${suite.id}".`);
    }
  },
};
