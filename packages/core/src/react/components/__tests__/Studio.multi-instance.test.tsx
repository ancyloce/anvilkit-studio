/**
 * @file Regression test for review finding H3: two `<Studio>`
 * instances on one page must have fully independent Core-owned stores
 * (theme/export/ai), per-instance persistence keys, a per-instance
 * fallback `storeId` when the host omits the prop, and iframe DOM
 * queries scoped to each editor's own root subtree.
 */

import { cleanup, render, renderHook, waitFor } from "@testing-library/react";
import { type ReactNode, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let pendingThemeStore: ThemeStoreApi | null = null;
let pendingExportStore: ExportStoreApi | null = null;

function StoreProbe(): ReactNode {
  pendingThemeStore = useThemeStoreApi();
  pendingExportStore = useExportStoreApi();
  return null;
}

vi.mock("@puckeditor/core", () => ({
  Puck: () => (
    <div data-testid="puck-mock">
      <StoreProbe />
    </div>
  ),
  useGetPuck: () => () => ({
    appState: { data: null },
    dispatch: () => undefined,
  }),
  createUsePuck: () => () => undefined,
}));

import { Studio } from "@/components/Studio";
import {
  resolveQueryRoot,
  StudioRootProvider,
  useStudioRootRef,
} from "@/state/index";
import type { ExportStoreApi, ThemeStoreApi } from "@/stores/index";
import { useExportStoreApi, useThemeStoreApi } from "@/stores/index";

beforeEach(() => {
  localStorage.clear();
  pendingThemeStore = null;
  pendingExportStore = null;
});

afterEach(cleanup);

async function mountStudio(props: {
  storeId?: string;
}): Promise<{ theme: ThemeStoreApi; exportStore: ExportStoreApi }> {
  pendingThemeStore = null;
  pendingExportStore = null;
  const { container } = render(
    <Studio puckConfig={{ components: {} }} plugins={[]} {...props} />,
  );
  await waitFor(() => {
    expect(container.querySelector("[data-testid=puck-mock]")).not.toBeNull();
  });
  if (pendingThemeStore === null || pendingExportStore === null) {
    throw new Error("store probe did not capture instances");
  }
  return { theme: pendingThemeStore, exportStore: pendingExportStore };
}

describe("<Studio> — multi-instance store isolation (H3)", () => {
  it("keeps theme/export state independent across two instances", async () => {
    const a = await mountStudio({ storeId: "A" });
    const b = await mountStudio({ storeId: "B" });

    expect(a.theme).not.toBe(b.theme);
    expect(a.exportStore).not.toBe(b.exportStore);

    a.theme.getState().setMode("dark");
    a.exportStore.getState().setCurrentFormat("html");

    // Instance B is untouched.
    expect(b.theme.getState().mode).toBe("system");
    expect(b.exportStore.getState().currentFormat).toBeNull();
  });

  it("namespaces persistence keys per storeId and never writes the bare key", async () => {
    const a = await mountStudio({ storeId: "A" });
    const b = await mountStudio({ storeId: "B" });
    a.theme.getState().setMode("dark");
    b.theme.getState().setMode("light");

    expect(localStorage.getItem("anvilkit-core-theme-A")).not.toBeNull();
    expect(localStorage.getItem("anvilkit-core-theme-B")).not.toBeNull();
    expect(localStorage.getItem("anvilkit-core-theme")).toBeNull();
  });

  it("derives a distinct per-instance fallback key when storeId is omitted", async () => {
    const a = await mountStudio({});
    const b = await mountStudio({});
    expect(a.theme).not.toBe(b.theme);
    a.theme.getState().setMode("dark");
    b.theme.getState().setMode("light");

    const keys = Object.keys(localStorage).filter((k) =>
      k.startsWith("anvilkit-core-theme-"),
    );
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
    expect(localStorage.getItem("anvilkit-core-theme")).toBeNull();
  });
});

describe("StudioRootProvider — iframe query scoping (H3)", () => {
  it("resolves each editor's own iframe instead of the first global match", () => {
    // Two subtrees, each with a duplicate-id Puck iframe.
    const rootA = document.createElement("div");
    const iframeA = document.createElement("iframe");
    iframeA.id = "preview-frame";
    rootA.appendChild(iframeA);
    const rootB = document.createElement("div");
    const iframeB = document.createElement("iframe");
    iframeB.id = "preview-frame";
    rootB.appendChild(iframeB);

    function Probe({ root }: { root: HTMLElement }): ReactNode {
      const ref = useRef<HTMLElement | null>(root);
      return (
        <StudioRootProvider rootRef={ref}>
          <Consumer />
        </StudioRootProvider>
      );
    }
    let foundA: Element | null = null;
    let foundB: Element | null = null;
    function Consumer(): ReactNode {
      const ref = useStudioRootRef();
      const found = resolveQueryRoot(ref).querySelector("iframe#preview-frame");
      if (found === iframeA) foundA = found;
      if (found === iframeB) foundB = found;
      return null;
    }

    renderHook(() => null); // ensure react runtime ready
    render(<Probe root={rootA} />);
    render(<Probe root={rootB} />);

    expect(foundA).toBe(iframeA);
    expect(foundB).toBe(iframeB);
  });
});
