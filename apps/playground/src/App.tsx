import { For, Show, batch, effect, memo, onCleanup, signal } from "@filament/core";

export function App() {
  const count = signal(0);
  const step = signal(1);
  const label = signal("ready");
  const doubled = memo(() => count() * 2);
  const parity = memo(() => (count() % 2 === 0 ? "even" : "odd"));

  effect(() => {
    label.set(`count:${count()} step:${step()}`);
    document.title = `Filament ${count()}`;

    onCleanup(() => {
      document.title = "Filament Playground";
    });
  });

  return (
    <main class="shell">
      <section class="panel">
        <div class="eyebrow">Experimental compiler-first framework</div>
        <h1>Filament Playground</h1>
        <p class="intro">
          TSX compiles to static DOM templates plus binding effects. Signals drive direct updates with no
          Virtual DOM diff.
        </p>

        <div class="metrics">
          <p class="metric">
            Count: {count()}
          </p>
          <p class="metric" data-double={doubled()}>
            Doubled: {doubled()}
          </p>
          <p class="metric" aria-label={parity()}>
            Parity: {parity()}
          </p>
          <p class="metric" data-label={label()}>
            Status: {label()}
          </p>
        </div>

        <div class="actions">
          <button onClick={() => count.set(count() - step())}>-{step()}</button>
          <button onClick={() => count.set(count() + step())}>+{step()}</button>
          <button
            onClick={() =>
              batch(() => {
                count.set(0);
                step.set(1);
              })
            }
          >
            Reset
          </button>
          <button onClick={() => step.set(step() === 1 ? 2 : 1)}>
            Toggle step ({step()})
          </button>
        </div>

        <Show
          when={() => count() > 0}
          fallback={<p class="hint">The counter is currently zero or negative.</p>}
        >
          <p class="hint">The counter is positive.</p>
        </Show>

        <section class="snapshots">
          <h2>Reactive snapshots</h2>
          <ul>
            <For each={() => [count(), doubled(), step()]}>
              {(value, index) => (
                <li data-index={index()}>
                  Snapshot {index() + 1}: {value}
                </li>
              )}
            </For>
          </ul>
        </section>
      </section>
    </main>
  );
}

