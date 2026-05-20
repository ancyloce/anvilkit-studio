/**
 * @file Tests for `useExportStore` (task `core-013`).
 *
 * Coverage targets:
 *
 * - Initial state matches the documented defaults.
 * - Each setter produces the expected next state.
 * - `recordExport` stamps a timestamp and builds a valid
 *   {@link LastExportRecord}.
 * - `reset()` returns to initial state.
 * - `persist`'s `partialize` persists **only** `currentFormat` —
 *   never the ephemeral `isExporting`, `availableFormats`, or
 *   `lastExport` fields.
 * - Rehydrating from a blob containing only `currentFormat` leaves
 *   ephemeral fields at their initial values.
 *
 * Isolation between cases is enforced by `beforeEach`, which clears
 * localStorage and resets the store to its initial state. The
 * vitest-config preset already sets `clearMocks: true` and
 * `restoreMocks: true` — those cover mocks, not store state, so the
 * reset hook is still required.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { createExportStore, type ExportStoreApi } from "@/stores/export-store";

type PersistableStore = { persist: { rehydrate(): Promise<void> } };
function persistOf(store: ExportStoreApi): PersistableStore {
  return store as unknown as PersistableStore;
}

const STORE_ID = "test";
const STORAGE_KEY = `anvilkit-core-export-${STORE_ID}`;
let store: ExportStoreApi;

beforeEach(() => {
  // Clear the persisted blob first so a stale write from a prior
  // case cannot leak into the next setState/rehydrate cycle.
  localStorage.clear();
  store = createExportStore({ storeId: STORE_ID });
});

describe("useExportStore — initial state", () => {
  it("starts with empty availableFormats", () => {
    expect(store.getState().availableFormats).toEqual([]);
  });

  it("starts with null currentFormat", () => {
    expect(store.getState().currentFormat).toBeNull();
  });

  it("starts with isExporting === false", () => {
    expect(store.getState().isExporting).toBe(false);
  });

  it("starts with null lastExport", () => {
    expect(store.getState().lastExport).toBeNull();
  });
});

describe("useExportStore — setters", () => {
  it("setAvailableFormats replaces the list", () => {
    store.getState().setAvailableFormats(["html", "react", "json"]);
    expect(store.getState().availableFormats).toEqual([
      "html",
      "react",
      "json",
    ]);
  });

  it("setCurrentFormat stores the id", () => {
    store.getState().setCurrentFormat("html");
    expect(store.getState().currentFormat).toBe("html");
  });

  it("setCurrentFormat(null) clears the selection", () => {
    store.getState().setCurrentFormat("html");
    store.getState().setCurrentFormat(null);
    expect(store.getState().currentFormat).toBeNull();
  });

  it("setIsExporting flips the flag", () => {
    store.getState().setIsExporting(true);
    expect(store.getState().isExporting).toBe(true);
    store.getState().setIsExporting(false);
    expect(store.getState().isExporting).toBe(false);
  });

  it("recordExport builds a LastExportRecord with a timestamp", () => {
    const before = Date.now();
    store.getState().recordExport("html", true);
    const after = Date.now();

    const record = store.getState().lastExport;
    expect(record).not.toBeNull();
    expect(record?.formatId).toBe("html");
    expect(record?.ok).toBe(true);
    // Timestamp is bracketed by the wall clock reads above — a
    // loose check that works with real Date.now() and avoids any
    // assumption about the exact value.
    expect(record?.at).toBeGreaterThanOrEqual(before);
    expect(record?.at).toBeLessThanOrEqual(after);
  });

  it("recordExport(false) records a failed run", () => {
    store.getState().recordExport("pdf", false);
    expect(store.getState().lastExport?.ok).toBe(false);
  });

  it("recordExport overwrites the previous record", () => {
    store.getState().recordExport("html", true);
    store.getState().recordExport("react", false);
    expect(store.getState().lastExport?.formatId).toBe("react");
    expect(store.getState().lastExport?.ok).toBe(false);
  });
});

describe("useExportStore — reset()", () => {
  it("returns every field to initial state", () => {
    const actions = store.getState();
    actions.setAvailableFormats(["html"]);
    actions.setCurrentFormat("html");
    actions.setIsExporting(true);
    actions.recordExport("html", true);

    store.getState().reset();

    const after = store.getState();
    expect(after.availableFormats).toEqual([]);
    expect(after.currentFormat).toBeNull();
    expect(after.isExporting).toBe(false);
    expect(after.lastExport).toBeNull();
  });

  it("leaves the action functions intact so subsequent setters still work", () => {
    store.getState().setCurrentFormat("html");
    store.getState().reset();
    // If reset had clobbered the actions, this next call would
    // throw — it's the sanity check that `set({ ...INITIAL_STATE })`
    // uses a shallow merge that preserves the setters.
    store.getState().setCurrentFormat("react");
    expect(store.getState().currentFormat).toBe("react");
  });
});

describe("useExportStore — persist / partialize", () => {
  it("writes only `currentFormat` to localStorage", () => {
    const actions = store.getState();
    actions.setAvailableFormats(["html", "react"]);
    actions.setCurrentFormat("html");
    actions.setIsExporting(true);
    actions.recordExport("html", true);

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string) as {
      state: Record<string, unknown>;
      version: number;
    };
    // Exactly one key in the persisted state slice.
    expect(Object.keys(parsed.state)).toEqual(["currentFormat"]);
    expect(parsed.state.currentFormat).toBe("html");
    // Sanity: the ephemeral fields are nowhere in the blob.
    expect(parsed.state).not.toHaveProperty("availableFormats");
    expect(parsed.state).not.toHaveProperty("isExporting");
    expect(parsed.state).not.toHaveProperty("lastExport");
  });

  it("uses the `anvilkit-core-export` storage key", () => {
    store.getState().setCurrentFormat("html");
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it("rehydrating from a partial blob does not clobber ephemeral defaults", async () => {
    // Place a blob that looks like a prior persist write — only
    // `currentFormat` survives `partialize`, which matches the
    // contract this test pins.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { currentFormat: "pdf" }, version: 0 }),
    );

    await persistOf(store).persist.rehydrate();

    const state = store.getState();
    expect(state.currentFormat).toBe("pdf");
    // Ephemeral fields stayed at their initial values — the
    // rehydrate merge only touches the keys that were in the
    // persisted blob.
    expect(state.isExporting).toBe(false);
    expect(state.availableFormats).toEqual([]);
    expect(state.lastExport).toBeNull();
  });

  it("exposes the initial state via getInitialState()", () => {
    // Zustand v5 surfaces `getInitialState` on the store hook
    // itself. Pinning it here protects the `beforeEach` reset
    // path against an accidental regression.
    const initial = store.getInitialState();
    expect(initial.currentFormat).toBeNull();
    expect(initial.isExporting).toBe(false);
    expect(initial.availableFormats).toEqual([]);
  });
});
