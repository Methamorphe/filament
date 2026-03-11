import { describe, expect, it } from "vitest";
import { batch, createRoot, effect, memo, onCleanup, signal } from "./signal.js";

describe("reactivity primitives", () => {
  it("tracks dynamic dependencies and unsubscribes from stale sources", () => {
    const left = signal(1);
    const right = signal(10);
    const useLeft = signal(true);
    const seen: number[] = [];

    effect(() => {
      seen.push(useLeft() ? left() : right());
    });

    expect(seen).toEqual([1]);

    right.set(11);
    expect(seen).toEqual([1]);

    useLeft.set(false);
    expect(seen).toEqual([1, 11]);

    left.set(2);
    expect(seen).toEqual([1, 11]);

    right.set(12);
    expect(seen).toEqual([1, 11, 12]);
  });

  it("batches multiple writes into a single effect rerun", () => {
    const first = signal(1);
    const second = signal(2);
    const seen: number[] = [];

    effect(() => {
      seen.push(first() + second());
    });

    batch(() => {
      first.set(3);
      second.set(4);
    });

    expect(seen).toEqual([3, 7]);
  });

  it("runs cleanups before reruns and when the owner is disposed", () => {
    const value = signal(0);
    const steps: string[] = [];

    const dispose = createRoot((disposeRoot) => {
      effect(() => {
        const current = value();
        steps.push(`run:${current}`);

        onCleanup(() => {
          steps.push(`cleanup:${current}`);
        });
      });

      return disposeRoot;
    });

    value.set(1);
    dispose();

    expect(steps).toEqual(["run:0", "cleanup:0", "run:1", "cleanup:1"]);
  });

  it("memo recomputes lazily through tracked consumers", () => {
    const count = signal(2);
    const runs: number[] = [];
    const doubled = memo(() => {
      const value = count() * 2;
      runs.push(value);
      return value;
    });
    const seen: number[] = [];

    effect(() => {
      seen.push(doubled());
    });

    count.set(3);

    expect(runs).toEqual([4, 6]);
    expect(seen).toEqual([4, 6]);
  });

  it("stops rerunning disposed computations", () => {
    const count = signal(0);
    const seen: number[] = [];
    const dispose = effect(() => {
      seen.push(count());
    });

    expect(seen).toEqual([0]);

    dispose();
    count.set(1);

    expect(seen).toEqual([0]);
  });
});
