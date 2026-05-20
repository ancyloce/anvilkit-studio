/**
 * @file `single-occupancy-registry` — a typed registry for slots that
 * exactly one plugin may own (architecture §6 A4: fail-loud the
 * imperative contract conventions).
 *
 * Several compile-time surfaces are "single-occupancy": the first
 * plugin to claim an id owns it, and a later claim is either ignored
 * with a warning (slots) or rejected with an error (plugin ids, export
 * format ids). Today that intent is re-implemented imperatively at
 * each site (`compile-plugins.ts`), so the conflict policy is
 * discoverable only by reading the loop body — the exact "convention,
 * not a type" smell A4 calls out.
 *
 * This module makes the policy a value: a registry is constructed with
 * an explicit {@link SingleOccupancyConflict} policy, and every
 * rejected/overridden duplicate is surfaced through `onConflict` so the
 * caller still owns the user-facing message (warn text, or a typed
 * `StudioPluginError`). The slot site adopts it now; the
 * plugin-id/export-id throw-sites (`compile-plugins.ts:464`, `:510`)
 * are deliberate future adopters — they construct `StudioPluginError`
 * with bespoke messages, so they migrate with `conflict: "error"` and
 * an `onConflict` that throws.
 *
 * React-free: this lives in `src/runtime/` and imports nothing from
 * React/Puck, preserving the engine boundary (`check:react-free-runtime`).
 */

/**
 * What happens when a second owner claims an already-owned id:
 *
 * - `"first"` — keep the original; the late claim is dropped. The
 *   registry calls `onConflict` so the caller can warn.
 * - `"last"` — the late claim replaces the original; `onConflict`
 *   fires so the caller can warn about the override.
 * - `"error"` — the registry calls `onConflict` (where the caller
 *   throws its own typed error) and, as a safety net if `onConflict`
 *   does not throw, throws a generic {@link Error}.
 */
export type SingleOccupancyConflict = "first" | "last" | "error";

/** Details of a rejected or overriding duplicate claim. */
export interface SingleOccupancyConflictInfo {
  /** The contested id. */
  readonly id: string;
  /** Plugin id that already owns `id`. */
  readonly currentOwner: string;
  /** Plugin id whose duplicate claim triggered the conflict. */
  readonly incomingOwner: string;
}

export interface SingleOccupancyOptions {
  /** Conflict policy. Required — the whole point is to make it explicit. */
  readonly conflict: SingleOccupancyConflict;
  /**
   * Invoked for every duplicate claim, before the policy is applied
   * (so a `"first"` caller can warn, an `"error"` caller can throw a
   * typed error). Optional only because `"last"` callers may not care.
   */
  readonly onConflict?: (info: SingleOccupancyConflictInfo) => void;
}

export interface SingleOccupancyRegistry<T> {
  /**
   * Attempt to claim `id` for `owner`. Returns `true` if `value` is
   * now the stored entry for `id` (a fresh claim, or a `"last"`
   * override), `false` if the claim was dropped (`"first"` policy,
   * duplicate). For `"error"` policy a duplicate never returns — it
   * throws.
   */
  claim(id: string, owner: string, value: T): boolean;
  get(id: string): T | undefined;
  ownerOf(id: string): string | undefined;
  has(id: string): boolean;
  readonly size: number;
  entries(): IterableIterator<[string, T]>;
}

/**
 * Create a single-occupancy registry. Keeps insertion order (it is
 * backed by a `Map`), so iteration matches plugin registration order.
 */
export function createSingleOccupancyRegistry<T>(
  options: SingleOccupancyOptions,
): SingleOccupancyRegistry<T> {
  const values = new Map<string, T>();
  const owners = new Map<string, string>();
  const { conflict, onConflict } = options;

  return {
    claim(id, owner, value) {
      const currentOwner = owners.get(id);
      if (currentOwner === undefined) {
        values.set(id, value);
        owners.set(id, owner);
        return true;
      }

      const info: SingleOccupancyConflictInfo = {
        id,
        currentOwner,
        incomingOwner: owner,
      };
      onConflict?.(info);

      if (conflict === "error") {
        // Safety net: a well-behaved `"error"` caller throws a
        // typed error inside `onConflict`. If it did not, fail
        // loud here rather than silently dropping the claim.
        throw new Error(
          `single-occupancy id "${id}" claimed by "${owner}" but already owned by "${currentOwner}"`,
        );
      }

      if (conflict === "last") {
        values.set(id, value);
        owners.set(id, owner);
        return true;
      }

      // "first": keep the original, drop the late claim.
      return false;
    },
    get(id) {
      return values.get(id);
    },
    ownerOf(id) {
      return owners.get(id);
    },
    has(id) {
      return values.has(id);
    },
    get size() {
      return values.size;
    },
    entries() {
      return values.entries();
    },
  };
}
