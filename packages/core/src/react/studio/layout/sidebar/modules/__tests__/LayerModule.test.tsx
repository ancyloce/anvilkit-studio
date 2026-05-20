/**
 * @file Tests for `LayerModule` and its `PagesPanel` sub-panel.
 *
 * Covers the integration between the pages source contract and the
 * UI: list rendering, route badge, active-row highlight, onSelect
 * callback, and the empty state when no source is registered.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioPagesSourceProvider } from "@/context/pages-source";
import { LayerModule } from "@/layout/sidebar/modules/LayerModule";
import {
  createSidebarRegistryStore,
  EditorI18nStoreProvider,
  EditorUiStoreProvider,
  SidebarRegistryProvider,
} from "@/state/index";
import type { StudioPagesSource } from "@/types/pages";

const layerSnapshot = {
  config: { components: { Layout: {}, Row: {}, Column: {}, Text: {} } },
  appState: {
    data: { content: [] as unknown[], zones: {} as Record<string, unknown[]> },
    ui: { itemSelector: null },
  },
  dispatch: () => undefined,
  selectedItem: null as { props?: { id?: string } } | null,
  getSelectorForId: () => undefined,
  getItemById: () => undefined,
};

vi.mock("@puckeditor/core", () => ({
  Puck: { Outline: () => <div data-testid="puck-outline-mock" /> },
  useGetPuck: () => () => layerSnapshot,
  createUsePuck:
    () =>
    <T,>(selector: (snapshot: typeof layerSnapshot) => T): T =>
      selector(layerSnapshot),
}));

afterEach(cleanup);

interface SetupOptions {
  readonly pages?: StudioPagesSource;
}

function Setup({
  children,
  pages,
}: { readonly children: ReactNode } & SetupOptions): ReactElement {
  const registry = createSidebarRegistryStore();
  return (
    <EditorI18nStoreProvider>
      <EditorUiStoreProvider
        storeId={`layer-${Math.random().toString(36).slice(2)}`}
      >
        <SidebarRegistryProvider value={registry}>
          <StudioPagesSourceProvider value={pages}>
            {children}
          </StudioPagesSourceProvider>
        </SidebarRegistryProvider>
      </EditorUiStoreProvider>
    </EditorI18nStoreProvider>
  );
}

describe("LayerModule", () => {
  it("renders both Pages and Layers empty states when no pages source is registered", () => {
    render(
      <Setup>
        <LayerModule />
      </Setup>,
    );
    expect(screen.getByTestId("ak-layer-pages-empty")).toBeTruthy();
    expect(screen.getByTestId("ak-layer-layers-empty")).toBeTruthy();
  });

  it("renders page and layer error states when the pages source rejects", async () => {
    const source: StudioPagesSource = {
      list: vi.fn().mockRejectedValue(new Error("offline")),
    };
    render(
      <Setup pages={source}>
        <LayerModule />
      </Setup>,
    );
    await vi.waitFor(() => {
      expect(screen.getByTestId("ak-layer-pages-error")).toBeTruthy();
      expect(screen.getByTestId("ak-layer-layers-error")).toBeTruthy();
    });
  });

  it("renders the page list from the source and surfaces the route badge", async () => {
    const pages = [
      { id: "home", title: "Home", active: true },
      { id: "list", title: "/list", path: "/list", route: true },
    ];
    const source: StudioPagesSource = {
      list: () => pages,
    };
    render(
      <Setup pages={source}>
        <LayerModule />
      </Setup>,
    );
    await vi.waitFor(() => {
      expect(screen.getByTestId("ak-layer-page-row-home")).toBeTruthy();
    });
    const homeRow = screen.getByTestId("ak-layer-page-row-home");
    expect(homeRow.getAttribute("aria-current")).toBe("page");
    expect(screen.getByTestId("ak-layer-page-row-list")).toBeTruthy();
    // Globe icon for the route page.
    expect(screen.getByLabelText("Route page")).toBeTruthy();
  });

  it("calls onSelect when a page row is clicked", async () => {
    const onSelect = vi.fn();
    const pages = [{ id: "home", title: "Home", active: true }];
    const source: StudioPagesSource = {
      list: () => pages,
      onSelect,
    };
    render(
      <Setup pages={source}>
        <LayerModule />
      </Setup>,
    );
    await vi.waitFor(() => {
      expect(screen.getByTestId("ak-layer-page-row-home")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("ak-layer-page-row-home"));
    expect(onSelect).toHaveBeenCalledWith("home");
  });

  it("re-fetches the list when the source emits via subscribe", async () => {
    const listeners = new Set<() => void>();
    let pages: { id: string; title: string; active?: boolean }[] = [
      { id: "home", title: "Home", active: true },
    ];
    const source: StudioPagesSource = {
      list: () => pages,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    };
    render(
      <Setup pages={source}>
        <LayerModule />
      </Setup>,
    );
    await vi.waitFor(() => {
      expect(screen.getByTestId("ak-layer-page-row-home")).toBeTruthy();
    });
    // Mutate and emit — the panel should pick the new entry up.
    pages = [...pages, { id: "added", title: "Added page" }];
    for (const listener of listeners) listener();
    await vi.waitFor(() => {
      expect(screen.getByTestId("ak-layer-page-row-added")).toBeTruthy();
    });
  });

  it("renders the draggable layer tree when an active page exists", async () => {
    const source: StudioPagesSource = {
      list: () => [{ id: "home", title: "Home", active: true }],
    };
    render(
      <Setup pages={source}>
        <LayerModule />
      </Setup>,
    );
    // Empty content → the tree renders its empty affordance.
    await vi.waitFor(() => {
      expect(screen.getByTestId("ak-layer-tree-empty")).toBeTruthy();
    });
  });

  it("opens the AddPageDialog when the + button is clicked", () => {
    render(
      <Setup>
        <LayerModule />
      </Setup>,
    );
    fireEvent.click(screen.getByTestId("ak-layer-pages-add"));
    expect(screen.getByTestId("ak-layer-add-page-dialog")).toBeTruthy();
  });
});
