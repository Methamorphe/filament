import { eventLabel, teamName } from "./fixtures";

export interface SSRMetricState {
  label: string;
  value: number;
  delta: number;
}

export interface SSRRowState {
  team: string;
  score: number;
  latency: number;
  status: string;
}

export interface SSRFeedItemState {
  title: string;
  age: string;
}

export interface SSRBenchmarkState {
  region: string;
  rangeDays: number;
  alertCount: number;
  renderBatch: number;
  metrics: SSRMetricState[];
  rows: SSRRowState[];
  feedItems: SSRFeedItemState[];
}

export function createSSRBenchmarkState(
  metricCount: number,
  rowCount: number,
  feedItemsCount: number,
): SSRBenchmarkState {
  return {
    region: teamName(0),
    rangeDays: 14,
    alertCount: 3,
    renderBatch: 1,
    metrics: Array.from({ length: metricCount }, (_, index) => ({
      label: `Metric ${index + 1}`,
      value: 1_400 + index * 150,
      delta: index % 2 === 0 ? 6 + index : -4 - index,
    })),
    rows: Array.from({ length: rowCount }, (_, index) => ({
      team: teamName(index),
      score: 72 + (index % 15),
      latency: 22 + (index % 17),
      status: index % 3 === 0 ? "stable" : index % 3 === 1 ? "warming" : "risk",
    })),
    feedItems: Array.from({ length: feedItemsCount }, (_, index) => ({
      title: `${eventLabel(index)} for ${teamName(index)}`,
      age: `${index + 1}m ago`,
    })),
  };
}

export function mutateSSRHotPath(state: SSRBenchmarkState, step: number): void {
  state.region = teamName(step + 1);
  state.rangeDays = step % 3 === 0 ? 7 : step % 3 === 1 ? 14 : 30;
  state.alertCount = 2 + (step % 7);
  state.renderBatch = step + 2;

  for (let index = 0; index < Math.min(3, state.metrics.length); index += 1) {
    const metric = state.metrics[index]!;
    metric.value = 1_500 + step * 9 + index * 120;
    metric.delta = ((step + index) % 15) - 7;
  }

  const row = state.rows[step % state.rows.length]!;
  row.score = 68 + (step % 24);
  row.latency = 18 + ((step * 3) % 21);
  row.status = step % 2 === 0 ? "stable" : "risk";

  const feed = state.feedItems[step % state.feedItems.length]!;
  feed.title = `${eventLabel(step)} for ${teamName(step + 2)}`;
  feed.age = `${(step % 18) + 1}m ago`;
}

export function mutateSSRFullRefresh(state: SSRBenchmarkState, pass: number): void {
  state.region = teamName(pass + 3);
  state.rangeDays = pass % 2 === 0 ? 21 : 30;
  state.alertCount = 4 + (pass % 6);
  state.renderBatch = pass + 50;

  state.metrics.forEach((metric, index) => {
    metric.value = 1_650 + pass * 24 + index * 115;
    metric.delta = ((pass * 2 + index) % 17) - 8;
  });

  state.rows.forEach((row, index) => {
    row.score = 70 + ((pass * 5 + index) % 26);
    row.latency = 20 + ((pass + index * 2) % 25);
    row.status =
      (pass + index) % 3 === 0 ? "stable" : (pass + index) % 3 === 1 ? "warming" : "risk";
  });

  state.feedItems.forEach((feed, index) => {
    feed.title = `${eventLabel(pass + index)} for ${teamName(pass + index + 1)}`;
    feed.age = `${(pass + index) % 24 + 1}m ago`;
  });
}
