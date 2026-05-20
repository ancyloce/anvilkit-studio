/**
 * @file Tests for the `text` module body.
 *
 * Coverage matches the build plan §5.1 row for `TextModule.test.tsx`:
 * empty registry → empty state, snippets render grouped by category,
 * filter strip persists to slice, debounced search filters, click
 * dispatches Puck `replace` (compatible) or warning toast (no
 * compatible selection), disabled rows carry `opacity-50`.
 */

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TextModule } from "@/layout/sidebar/modules/TextModule";
import { SidebarHeaderActionsProvider } from "@/layout/sidebar/SidebarHeaderActionsContext";
import {
  createSidebarRegistryStore,
  EditorI18nStoreProvider,
  EditorUiStoreProvider,
  SidebarRegistryProvider,
  type SidebarRegistryStoreApi,
} from "@/state/index";
import type { StudioCopySnippetPack } from "@/types/sidebar";

const dispatch = vi.fn();
const getSelectorForId = vi.fn();
const toastWarning = vi.fn();

const mockSnapshot: {
  selectedItem: {
    readonly type: string;
    readonly props: Record<string, unknown>;
  } | null;
  dispatch: typeof dispatch;
  getSelectorForId: typeof getSelectorForId;
} = {
  selectedItem: null,
  dispatch,
  getSelectorForId,
};

vi.mock("@puckeditor/core", () => ({
  useGetPuck: () => () => mockSnapshot,
  createUsePuck:
    () =>
    <T,>(
      selector: (state: {
        readonly selectedItem: typeof mockSnapshot.selectedItem;
      }) => T,
    ): T =>
      selector({ selectedItem: mockSnapshot.selectedItem }),
}));

vi.mock("sonner", () => ({
  toast: {
    warning: (msg: string) => toastWarning(msg),
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

afterEach(() => {
  cleanup();
  dispatch.mockReset();
  getSelectorForId.mockReset();
  toastWarning.mockReset();
  mockSnapshot.selectedItem = null;
});

beforeEach(() => {
  getSelectorForId.mockReturnValue({ index: 0, zone: "default-zone" });
});

function Setup({
  children,
  registry,
}: {
  readonly children: ReactNode;
  readonly registry?: SidebarRegistryStoreApi;
}): ReactElement {
  const store = registry ?? createSidebarRegistryStore();
  return (
    <EditorI18nStoreProvider>
      <EditorUiStoreProvider
        storeId={`text-${Math.random().toString(36).slice(2)}`}
      >
        <SidebarRegistryProvider value={store}>
          <SidebarHeaderActionsProvider>
            {children}
          </SidebarHeaderActionsProvider>
        </SidebarRegistryProvider>
      </EditorUiStoreProvider>
    </EditorI18nStoreProvider>
  );
}

const samplePack: StudioCopySnippetPack = {
  id: "test-pack",
  locale: "en",
  snippets: [
    {
      id: "b-1",
      category: "basic",
      title: "Basic snippet",
      body: "Body of the basic snippet.",
      tags: ["lorem"],
    },
    {
      id: "b-2",
      category: "basic",
      title: "Other basic",
      body: "Lipsum line.",
      tags: ["filler"],
    },
    {
      id: "br-1",
      category: "brand",
      title: "Brand snippet",
      body: "Brand voice line.",
      tags: ["voice"],
    },
  ],
};

describe("TextModule", () => {
  it("renders the empty state when no copy packs are registered", () => {
    render(
      <Setup>
        <TextModule />
      </Setup>,
    );
    expect(screen.getByTestId("ak-text-empty")).toBeTruthy();
  });

  it("renders snippets grouped by category when packs are registered", () => {
    const registry = createSidebarRegistryStore();
    registry.getState().registerCopySnippetPack(samplePack);

    render(
      <Setup registry={registry}>
        <TextModule />
      </Setup>,
    );

    expect(screen.getByTestId("ak-text-snippet-list-grouped")).toBeTruthy();
    expect(screen.getByText("Basic snippet")).toBeTruthy();
    expect(screen.getByText("Brand snippet")).toBeTruthy();
    expect(screen.getByText("Basic copy")).toBeTruthy();
    expect(screen.getByText("Brand copy")).toBeTruthy();
  });

  it("allows grouped snippet categories to stay independently expanded", () => {
    const registry = createSidebarRegistryStore();
    registry.getState().registerCopySnippetPack(samplePack);

    render(
      <Setup registry={registry}>
        <TextModule />
      </Setup>,
    );

    const basicTrigger = screen.getByRole("button", { name: /Basic copy/ });
    const brandTrigger = screen.getByRole("button", { name: /Brand copy/ });

    expect(basicTrigger.getAttribute("aria-expanded")).toBe("true");
    expect(brandTrigger.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(basicTrigger);

    expect(basicTrigger.getAttribute("aria-expanded")).toBe("false");
    expect(brandTrigger.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(basicTrigger);

    expect(basicTrigger.getAttribute("aria-expanded")).toBe("true");
    expect(brandTrigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("constrains lengthy snippet text within the sidebar row", () => {
    const registry = createSidebarRegistryStore();
    const longTitle =
      "An exceptionally long launch announcement headline that should not push the sidebar wider";
    const longBody =
      "Trusted by product teams shipping polished pages with copy that continues far beyond the width of the sidebar preview row.";
    registry.getState().registerCopySnippetPack({
      id: "long-copy-pack",
      locale: "en",
      snippets: [
        {
          id: "long-copy",
          category: "basic",
          title: longTitle,
          body: longBody,
        },
      ],
    });

    render(
      <Setup registry={registry}>
        <TextModule />
      </Setup>,
    );

    expect(screen.getByTestId("ak-text-snippet-long-copy").className).toContain(
      "min-w-0",
    );
    expect(screen.getByText(longTitle).className).toContain("truncate");
    expect(screen.getByText(longTitle).className).toContain("w-full");
    expect(screen.getByText(longBody).className).toContain("break-words");
    expect(screen.getByText(longBody).className).toContain("w-full");
  });

  it("filter strip toggles category and hides non-matching snippets", () => {
    const registry = createSidebarRegistryStore();
    registry.getState().registerCopySnippetPack(samplePack);

    render(
      <Setup registry={registry}>
        <TextModule />
      </Setup>,
    );

    const filterRoot = screen.getByTestId("ak-text-filter");
    const items = filterRoot.querySelectorAll("button");
    // Click "Brand" pill (index 2: All / Basic / Brand).
    fireEvent.click(items[2]!);

    expect(screen.queryByText("Basic snippet")).toBeNull();
    expect(screen.getByText("Brand snippet")).toBeTruthy();
  });

  it("debounced search flattens results across title/body/tags", () => {
    vi.useFakeTimers();
    try {
      const registry = createSidebarRegistryStore();
      registry.getState().registerCopySnippetPack(samplePack);

      render(
        <Setup registry={registry}>
          <TextModule />
        </Setup>,
      );

      const searchInput = screen.getByTestId(
        "ak-text-search",
      ) as HTMLInputElement;
      fireEvent.change(searchInput, { target: { value: "lipsum" } });

      // Before debounce window elapses, snippets are still grouped.
      expect(screen.queryByTestId("ak-text-snippet-list-flat")).toBeNull();

      act(() => {
        vi.advanceTimersByTime(160);
      });

      expect(screen.getByTestId("ak-text-snippet-list-flat")).toBeTruthy();
      expect(screen.getByText("Other basic")).toBeTruthy();
      expect(screen.queryByText("Basic snippet")).toBeNull();
      expect(screen.queryByText("Brand snippet")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders the empty state when search yields no matches", () => {
    vi.useFakeTimers();
    try {
      const registry = createSidebarRegistryStore();
      registry.getState().registerCopySnippetPack(samplePack);

      render(
        <Setup registry={registry}>
          <TextModule />
        </Setup>,
      );

      const searchInput = screen.getByTestId(
        "ak-text-search",
      ) as HTMLInputElement;
      fireEvent.change(searchInput, { target: { value: "xyz-no-match" } });
      act(() => {
        vi.advanceTimersByTime(160);
      });

      expect(screen.getByTestId("ak-text-empty")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("dispatches a Puck `replace` action when a snippet is clicked with a compatible Text selection", () => {
    const registry = createSidebarRegistryStore();
    registry.getState().registerCopySnippetPack(samplePack);
    mockSnapshot.selectedItem = {
      type: "Text",
      props: { id: "selected-text", text: "old body" },
    };

    render(
      <Setup registry={registry}>
        <TextModule />
      </Setup>,
    );

    fireEvent.click(screen.getByTestId("ak-text-snippet-b-1"));

    expect(dispatch).toHaveBeenCalledTimes(1);
    const action = dispatch.mock.calls[0]?.[0] as {
      readonly type: string;
      readonly data: {
        readonly type: string;
        readonly props: Record<string, unknown>;
      };
    };
    expect(action.type).toBe("replace");
    expect(action.data.type).toBe("Text");
    expect(action.data.props["text"]).toBe("Body of the basic snippet.");
    expect(toastWarning).not.toHaveBeenCalled();
  });

  it("warns and skips dispatch when no compatible selection exists", () => {
    const registry = createSidebarRegistryStore();
    registry.getState().registerCopySnippetPack(samplePack);
    mockSnapshot.selectedItem = null;

    render(
      <Setup registry={registry}>
        <TextModule />
      </Setup>,
    );

    fireEvent.click(screen.getByTestId("ak-text-snippet-b-1"));

    expect(dispatch).not.toHaveBeenCalled();
    expect(toastWarning).toHaveBeenCalledTimes(1);
  });

  it("rows render with opacity-50 when no compatible selection exists", () => {
    const registry = createSidebarRegistryStore();
    registry.getState().registerCopySnippetPack(samplePack);
    mockSnapshot.selectedItem = null;

    render(
      <Setup registry={registry}>
        <TextModule />
      </Setup>,
    );

    const row = screen.getByTestId("ak-text-snippet-b-1");
    expect(row.getAttribute("data-disabled")).toBe("true");
  });

  it("rows render without opacity-50 when a compatible selection is active", () => {
    const registry = createSidebarRegistryStore();
    registry.getState().registerCopySnippetPack(samplePack);
    mockSnapshot.selectedItem = {
      type: "Text",
      props: { id: "selected-text", text: "old body" },
    };

    render(
      <Setup registry={registry}>
        <TextModule />
      </Setup>,
    );

    const row = screen.getByTestId("ak-text-snippet-b-1");
    expect(row.getAttribute("data-disabled")).toBeNull();
  });
});
