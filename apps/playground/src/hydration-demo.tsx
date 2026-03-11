import { batch, hydrate, memo, signal, type Child, type Signal } from "@filament/core";
import { createTemplateInstance } from "@filament/core/internal";
import type { DOMBinding, DOMTemplateIR } from "@filament/core";
import type { SSRBinding, SSRTemplateIR } from "@filament/server/internal";

interface HandoffLane {
  id: string;
  label: string;
  owner: string;
  hot: boolean;
  score: number;
}

interface HydrationDemoModel {
  releaseCount: Signal<number>;
  liveMode: Signal<boolean>;
  noteExpanded: Signal<boolean>;
  lanes: Signal<HandoffLane[]>;
  lastAction: Signal<string>;
  hotLanes: () => number;
  totalScore: () => number;
  advanceRelease: () => void;
  toggleLiveMode: () => void;
  toggleNotes: () => void;
  promoteLane: (id: string) => void;
  reshuffleLanes: () => void;
}

type SharedBinding =
  | {
      kind: "insert";
      ref: string;
      evaluate: () => unknown;
    }
  | {
      kind: "attribute";
      ref: string;
      name: string;
      evaluate: () => unknown;
    }
  | {
      kind: "event";
      ref: string;
      name: string;
      handler: (event: unknown) => unknown;
    };

type TemplateFactory<Result> = (ir: DOMTemplateIR, bindings: SharedBinding[]) => Result;

export interface HydrationDemoController {
  html: string;
  hydrate: () => void;
  dispose: () => void;
}

function createInitialLanes(): HandoffLane[] {
  return [
    { id: "ingest", label: "Ingest", owner: "Mara", hot: true, score: 72 },
    { id: "ledger", label: "Ledger", owner: "Noe", hot: false, score: 55 },
    { id: "search", label: "Search", owner: "Iris", hot: true, score: 64 },
  ];
}

function createHydrationDemoModel(): HydrationDemoModel {
  const releaseCount = signal(3);
  const liveMode = signal(false);
  const noteExpanded = signal(true);
  const lanes = signal(createInitialLanes());
  const lastAction = signal("Snapshot ready");

  const hotLanes = memo(() => lanes().filter((lane) => lane.hot).length);
  const totalScore = memo(() => lanes().reduce((sum, lane) => sum + lane.score, 0));

  function advanceRelease(): void {
    batch(() => {
      releaseCount.set(releaseCount() + 1);
      lastAction.set(`Release ${releaseCount()} scheduled`);
    });
  }

  function toggleLiveMode(): void {
    liveMode.set(!liveMode());
    lastAction.set(liveMode() ? "Live mode enabled" : "Live mode paused");
  }

  function toggleNotes(): void {
    noteExpanded.set(!noteExpanded());
    lastAction.set(noteExpanded() ? "Notes expanded" : "Notes collapsed");
  }

  function promoteLane(id: string): void {
    lanes.set(
      lanes().map((lane) =>
        lane.id === id
          ? {
              ...lane,
              hot: true,
              score: lane.score + 9,
            }
          : lane,
      ),
    );
    lastAction.set(`Lane ${id} promoted`);
  }

  function reshuffleLanes(): void {
    const current = lanes();

    if (current.length === 0) {
      return;
    }

    lanes.set([...current.slice(1), current[0]!]);
    lastAction.set("Lane order reshuffled");
  }

  return {
    releaseCount,
    liveMode,
    noteExpanded,
    lanes,
    lastAction,
    hotLanes,
    totalScore,
    advanceRelease,
    toggleLiveMode,
    toggleNotes,
    promoteLane,
    reshuffleLanes,
  };
}

function createDOMChunk(ir: DOMTemplateIR, bindings: SharedBinding[]): Node {
  return createTemplateInstance(ir, bindings as unknown as DOMBinding[]);
}

function createMetricChunk<Result>(
  createTemplate: TemplateFactory<Result>,
  label: string,
  value: () => string,
  tone: string,
): Result {
  return createTemplate(
    {
      html:
        '<article data-f-node="metric-n0" class="handoff-metric"><span class="handoff-metric-label">' +
        `${label}</span><strong class="handoff-metric-value"><!--filament-anchor:metric-a0--></strong></article>`,
      nodeRefs: ["metric-n0"],
      anchorRefs: ["metric-a0"],
    },
    [
      {
        kind: "attribute",
        ref: "metric-n0",
        name: "className",
        evaluate: () => tone,
      },
      {
        kind: "insert",
        ref: "metric-a0",
        evaluate: value,
      },
    ],
  );
}

function createNotePillChunk<Result>(
  createTemplate: TemplateFactory<Result>,
  value: () => string,
): Result {
  return createTemplate(
    {
      html: '<span data-f-node="note-n0" class="handoff-note-pill"><!--filament-anchor:note-a0--></span>',
      nodeRefs: ["note-n0"],
      anchorRefs: ["note-a0"],
    },
    [
      {
        kind: "insert",
        ref: "note-a0",
        evaluate: value,
      },
    ],
  );
}

function createLaneChunk<Result>(
  createTemplate: TemplateFactory<Result>,
  lane: HandoffLane,
  index: number,
  onPromote: (id: string) => void,
): Result {
  return createTemplate(
    {
      html:
        '<button data-f-node="lane-n0" type="button" class="handoff-lane">' +
        '<span class="handoff-lane-main">' +
        '<span class="handoff-lane-index"><!--filament-anchor:lane-a0--></span>' +
        '<span><strong><!--filament-anchor:lane-a1--></strong><span class="handoff-lane-owner"><!--filament-anchor:lane-a2--></span></span>' +
        '</span>' +
        '<span class="handoff-lane-score"><!--filament-anchor:lane-a3--></span>' +
        '<span data-f-node="lane-n1" class="handoff-chip"><!--filament-anchor:lane-a4--></span>' +
        "</button>",
      nodeRefs: ["lane-n0", "lane-n1"],
      anchorRefs: ["lane-a0", "lane-a1", "lane-a2", "lane-a3", "lane-a4"],
    },
    [
      {
        kind: "attribute",
        ref: "lane-n0",
        name: "className",
        evaluate: () => (lane.hot ? "handoff-lane is-hot" : "handoff-lane"),
      },
      {
        kind: "attribute",
        ref: "lane-n1",
        name: "className",
        evaluate: () => (lane.hot ? "handoff-chip is-hot" : "handoff-chip"),
      },
      {
        kind: "event",
        ref: "lane-n0",
        name: "click",
        handler: () => onPromote(lane.id),
      },
      {
        kind: "insert",
        ref: "lane-a0",
        evaluate: () => `${index + 1}`,
      },
      {
        kind: "insert",
        ref: "lane-a1",
        evaluate: () => lane.label,
      },
      {
        kind: "insert",
        ref: "lane-a2",
        evaluate: () => lane.owner,
      },
      {
        kind: "insert",
        ref: "lane-a3",
        evaluate: () => `${lane.score}`,
      },
      {
        kind: "insert",
        ref: "lane-a4",
        evaluate: () => (lane.hot ? "hot path" : "steady"),
      },
    ],
  );
}

function createHydrationDemoTree<Result>(
  createTemplate: TemplateFactory<Result>,
  model: HydrationDemoModel,
): Result {
  return createTemplate(
    {
      html:
        '<section data-f-node="root-n0" class="handoff-screen">' +
        '<header class="handoff-head">' +
        '<div>' +
        '<span class="handoff-kicker">SSR handoff</span>' +
        '<h3 class="handoff-title">Restore the same DOM instead of replaying a VDOM pass.</h3>' +
        '<p class="handoff-copy">This subtree is first emitted as HTML with markers, then hydrated in place so the existing buttons and inserts become live.</p>' +
        "</div>" +
        '<div data-f-node="root-n1" class="handoff-status">' +
        '<span class="handoff-status-label">Mode</span>' +
        '<strong data-demo="mode"><!--filament-anchor:root-a0--></strong>' +
        "</div>" +
        "</header>" +
        '<section class="handoff-metrics"><!--filament-anchor:root-a1--></section>' +
        '<section class="handoff-stack"><!--filament-anchor:root-a2--></section>' +
        '<footer class="handoff-foot">' +
        '<div class="handoff-notes" data-demo="notes"><!--filament-anchor:root-a3--></div>' +
        '<div class="handoff-actions">' +
        '<button data-f-node="root-n2" type="button" data-demo-action="release">Advance release</button>' +
        '<button data-f-node="root-n3" type="button" data-demo-action="live">Toggle live mode</button>' +
        '<button data-f-node="root-n4" type="button" data-demo-action="notes">Toggle notes</button>' +
        '<button data-f-node="root-n5" type="button" data-demo-action="shuffle">Reshuffle lanes</button>' +
        "</div>" +
        "</footer>" +
        "</section>",
      nodeRefs: ["root-n0", "root-n1", "root-n2", "root-n3", "root-n4", "root-n5"],
      anchorRefs: ["root-a0", "root-a1", "root-a2", "root-a3"],
    },
    [
      {
        kind: "attribute",
        ref: "root-n0",
        name: "data-live",
        evaluate: () => (model.liveMode() ? "on" : "off"),
      },
      {
        kind: "attribute",
        ref: "root-n1",
        name: "className",
        evaluate: () => (model.liveMode() ? "handoff-status is-live" : "handoff-status"),
      },
      {
        kind: "event",
        ref: "root-n2",
        name: "click",
        handler: model.advanceRelease,
      },
      {
        kind: "event",
        ref: "root-n3",
        name: "click",
        handler: model.toggleLiveMode,
      },
      {
        kind: "event",
        ref: "root-n4",
        name: "click",
        handler: model.toggleNotes,
      },
      {
        kind: "event",
        ref: "root-n5",
        name: "click",
        handler: model.reshuffleLanes,
      },
      {
        kind: "insert",
        ref: "root-a0",
        evaluate: () => (model.liveMode() ? "Live" : "Snapshot"),
      },
      {
        kind: "insert",
        ref: "root-a1",
        evaluate: () => [
          createMetricChunk(
            createTemplate,
            "Release",
            () => `${model.releaseCount()}`,
            model.liveMode() ? "handoff-metric is-warm" : "handoff-metric",
          ),
          createMetricChunk(
            createTemplate,
            "Hot lanes",
            () => `${model.hotLanes()}`,
            "handoff-metric is-warm",
          ),
          createMetricChunk(
            createTemplate,
            "Queued score",
            () => `${model.totalScore()}`,
            "handoff-metric",
          ),
        ],
      },
      {
        kind: "insert",
        ref: "root-a2",
        evaluate: () =>
          model.lanes().map((lane, index) => createLaneChunk(createTemplate, lane, index, model.promoteLane)),
      },
      {
        kind: "insert",
        ref: "root-a3",
        evaluate: () =>
          model.noteExpanded()
            ? [
                createNotePillChunk(createTemplate, model.lastAction),
                createNotePillChunk(createTemplate, () =>
                  model.liveMode() ? "Bindings restored" : "Waiting for hydrate()",
                ),
              ]
            : createNotePillChunk(createTemplate, model.lastAction),
      },
    ],
  );
}

export async function createHydrationDemoController(
  container: HTMLElement,
): Promise<HydrationDemoController> {
  const { createSSRTemplate, renderToString } = await import("@filament/server");
  const model = createHydrationDemoModel();
  const createSSRChunk = (ir: DOMTemplateIR, bindings: SharedBinding[]) =>
    createSSRTemplate(ir as SSRTemplateIR, bindings as unknown as SSRBinding[]);
  const html = renderToString(() => createHydrationDemoTree(createSSRChunk, model), {
    hydrate: true,
  });
  let disposeHydration: (() => void) | null = null;

  container.innerHTML = html;

  return {
    html,
    hydrate: () => {
      if (disposeHydration !== null) {
        return;
      }

      disposeHydration = hydrate(
        () => createHydrationDemoTree(createDOMChunk, model) as unknown as Child,
        container,
      );
    },
    dispose: () => {
      disposeHydration?.();
      disposeHydration = null;
      container.replaceChildren();
    },
  };
}
