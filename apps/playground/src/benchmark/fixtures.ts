export function range(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index);
}

export function buildSeries(pointCount: number, offset: number): number[] {
  return range(pointCount).map((index) => computeSeriesValue(index + offset));
}

export function advanceSeries(previous: readonly number[], offset: number): number[] {
  if (previous.length === 0) {
    return [];
  }

  const next = previous.slice(1);
  next.push(computeSeriesValue(previous.length + offset));
  return next;
}

export function formatCompact(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }

  return String(value);
}

export function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

export function seriesToPolylinePoints(series: readonly number[]): string {
  if (series.length === 0) {
    return "";
  }

  const max = Math.max(...series);
  const min = Math.min(...series);
  const span = Math.max(1, max - min);

  return series
    .map((value, index) => {
      const x = (index / Math.max(1, series.length - 1)) * 240;
      const y = 72 - ((value - min) / span) * 64;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export function computeSeriesValue(step: number): number {
  const wave = Math.sin(step / 4.6) * 18;
  const secondary = Math.cos(step / 7.2) * 11;
  return Math.round(54 + wave + secondary + (step % 9));
}

export function nextTask(): Promise<void> {
  return Promise.resolve();
}

export function teamName(index: number): string {
  const teams = [
    "Atlas",
    "Northwind",
    "Cascade",
    "Helio",
    "Meridian",
    "Octane",
    "Pulse",
    "Vector",
  ];
  return teams[index % teams.length]!;
}

export function pipelineTitle(index: number): string {
  const titles = [
    "Acquisition",
    "Activation",
    "Expansion",
    "Rescue",
    "Retention",
    "Launch",
    "Migration",
    "Partner",
  ];
  return `${titles[index % titles.length]!} ${index + 1}`;
}

export function eventLabel(index: number): string {
  const labels = [
    "Query cache refreshed",
    "SLA drift detected",
    "Graph threshold updated",
    "Segment recomputed",
    "Webhook retried",
    "Snapshot archived",
  ];
  return labels[index % labels.length]!;
}
