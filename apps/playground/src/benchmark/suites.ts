import type { BenchmarkSuiteDefinition } from "./types";

export const BENCHMARK_SANDBOX_ID = "benchmark-sandbox";

export const BENCHMARK_SUITES: readonly BenchmarkSuiteDefinition[] = [
  {
    id: "grid-core",
    label: "Core Grid",
    description: "Baseline microbench for mount cost, one hot row, and full-grid sweeps.",
    config: {
      samples: 5,
      rowCount: 800,
      warmupUpdates: 150,
      hotRowUpdates: 3000,
      sweepPasses: 2,
    },
    facts: [
      { label: "Rows", value: "800" },
      { label: "Bindings/row", value: "4 live fields" },
      { label: "Hot updates", value: "3000 commits" },
      { label: "Sweeps", value: "2 full passes" },
    ],
    scenarios: [
      {
        id: "mount-grid",
        label: "Mount 800 reactive rows",
        description: "Initial render of a static grid with four live bindings per row.",
        measure: "mount",
      },
      {
        id: "hot-row",
        label: "Hot row x3000",
        description: "Synchronously commits 3000 updates to one subscribed row.",
        measure: "update",
        warmupActionId: "warm-hot-row",
        actionId: "run-hot-row",
      },
      {
        id: "sweep-grid",
        label: "Full sweep x2",
        description: "Commits one change per row across two full passes.",
        measure: "update",
        warmupActionId: "warm-sweep-grid",
        actionId: "run-sweep-grid",
      },
    ],
  },
  {
    id: "dashboard-nested",
    label: "Nested Dashboard",
    description: "Complex multi-component screen with KPIs, pipeline board, team table, feed, and a nested selection cascade.",
    config: {
      samples: 4,
      metricCount: 8,
      boardCards: 24,
      tableRows: 48,
      feedItems: 24,
      seriesPoints: 64,
      cascadeLoops: 900,
      refreshPasses: 2,
    },
    facts: [
      { label: "Panels", value: "6 nested widgets" },
      { label: "Board cards", value: "24" },
      { label: "Table rows", value: "48" },
      { label: "Cascade", value: "900 nested fan-outs" },
    ],
    scenarios: [
      {
        id: "mount-dashboard",
        label: "Mount complex dashboard",
        description: "Mounts a nested dashboard tree with chart, board, table, and activity feed.",
        measure: "mount",
      },
      {
        id: "team-cascade",
        label: "Nested selection cascade",
        description: "One selection change fans out through headers, chart, board, table highlights, and feed badges.",
        measure: "update",
        warmupActionId: "warm-team-cascade",
        actionId: "run-team-cascade",
      },
      {
        id: "full-dashboard-refresh",
        label: "Full dashboard refresh",
        description: "Simulates a full payload refresh across all widgets in two batched passes.",
        measure: "update",
        warmupActionId: "warm-screen-refresh",
        actionId: "run-screen-refresh",
      },
    ],
  },
  {
    id: "ssr-render",
    label: "SSR Render",
    description: "String-rendered dashboard snapshots that compare initial server render cost and repeated rerender passes.",
    config: {
      samples: 4,
      metricCount: 10,
      tableRows: 72,
      feedItems: 28,
      hotRenders: 220,
      refreshPasses: 32,
    },
    facts: [
      { label: "Metrics", value: "10" },
      { label: "Table rows", value: "72" },
      { label: "Feed items", value: "28" },
      { label: "SSR loops", value: "220 hot / 32 full" },
    ],
    scenarios: [
      {
        id: "mount-ssr-screen",
        label: "Initial SSR render",
        description: "Builds the server-side screen state and serializes the first HTML snapshot.",
        measure: "mount",
      },
      {
        id: "hot-ssr-rerender",
        label: "Focused SSR rerender",
        description: "Mutates a narrow hot path and serializes a fresh HTML snapshot 220 times.",
        measure: "update",
        warmupActionId: "warm-hot-ssr-rerender",
        actionId: "run-hot-ssr-rerender",
      },
      {
        id: "refresh-ssr-rerender",
        label: "Full SSR refresh",
        description: "Applies whole-screen payload refreshes and serializes a fresh HTML snapshot after each pass.",
        measure: "update",
        warmupActionId: "warm-refresh-ssr-rerender",
        actionId: "run-refresh-ssr-rerender",
      },
    ],
  },
  {
    id: "async-api",
    label: "Async API",
    description: "A staged async data screen with summary cards, result rows, feed logs, and chart updates.",
    config: {
      samples: 4,
      summaryCount: 4,
      resultRows: 60,
      feedItems: 18,
      seriesPoints: 56,
      queryCycles: 12,
      pageCount: 4,
      chunkCount: 3,
    },
    facts: [
      { label: "Summary cards", value: "4" },
      { label: "Result rows", value: "60" },
      { label: "Staged responses", value: "3 chunks" },
      { label: "Query cycles", value: "12" },
    ],
    scenarios: [
      {
        id: "mount-async-screen",
        label: "Mount async data screen",
        description: "Mounts the async dashboard before any request is in flight.",
        measure: "mount",
      },
      {
        id: "staggered-api-refresh",
        label: "Staggered API refresh",
        description: "Simulates staged API chunks landing at different times and partially updating the UI.",
        measure: "async",
        warmupActionId: "warm-staggered-api",
        actionId: "run-staggered-api",
      },
      {
        id: "paginated-api-refresh",
        label: "Paginated API refresh",
        description: "Simulates a paginated async refresh where multiple pages progressively land and settle.",
        measure: "async",
        warmupActionId: "warm-paginated-api",
        actionId: "run-paginated-api",
      },
    ],
  },
  {
    id: "graph-motion",
    label: "Graphs And Motion",
    description: "Live SVG graphs, animated stat lanes, and dense per-frame progress updates.",
    config: {
      samples: 4,
      seriesPoints: 120,
      barCount: 24,
      laneCount: 10,
      streamTicks: 180,
      animationFrames: 120,
    },
    facts: [
      { label: "SVG points", value: "120 per line" },
      { label: "Bars", value: "24" },
      { label: "Lanes", value: "10" },
      { label: "Animation", value: "120 frame batches" },
    ],
    scenarios: [
      {
        id: "mount-graph-screen",
        label: "Mount graph screen",
        description: "Mounts a graph-heavy screen with SVG lines, bars, and live lanes.",
        measure: "mount",
      },
      {
        id: "stream-graph",
        label: "Stream graph ticks",
        description: "Emulates live point streaming into two SVG lines over 180 logical ticks.",
        measure: "update",
        warmupActionId: "warm-stream-graph",
        actionId: "run-stream-graph",
      },
      {
        id: "animation-frames",
        label: "Animation frame batches",
        description: "Updates bars and progress lanes over 120 logical animation frames.",
        measure: "update",
        warmupActionId: "warm-animation-frames",
        actionId: "run-animation-frames",
      },
    ],
  },
];

export function getBenchmarkSuite(id: string): BenchmarkSuiteDefinition {
  const suite = BENCHMARK_SUITES.find((candidate) => candidate.id === id);

  if (suite === undefined) {
    throw new Error(`Unknown benchmark suite "${id}".`);
  }

  return suite;
}
