/**
 * Tiny change-notification bus. Mutations call `notifyDataChanged()`, and
 * every mounted query re-runs. Simple and predictable for a local-only app.
 */
type Listener = () => void;
const listeners = new Set<Listener>();
let version = 0;

export function notifyDataChanged(): void {
  version++;
  for (const l of listeners) l();
}

export function subscribeDataChanged(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function dataVersion(): number {
  return version;
}
