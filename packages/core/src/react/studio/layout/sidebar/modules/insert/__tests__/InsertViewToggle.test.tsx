/**
 * @file Tests for `InsertViewToggle` — flips the persisted
 * `componentViewMode` slice between `grid` and `list` (PRD §5.4).
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { InsertViewToggle } from "@/layout/sidebar/modules/insert/InsertViewToggle";
import {
  EditorI18nStoreProvider,
  EditorUiStoreProvider,
  useEditorUiStore,
} from "@/state/index";

afterEach(cleanup);

function Probe({
  onMode,
}: {
  readonly onMode: (m: "grid" | "list") => void;
}): null {
  const mode = useEditorUiStore((s) => s.componentViewMode);
  onMode(mode);
  return null;
}

function Setup({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <EditorI18nStoreProvider>
      <EditorUiStoreProvider
        storeId={`view-${Math.random().toString(36).slice(2)}`}
      >
        {children}
      </EditorUiStoreProvider>
    </EditorI18nStoreProvider>
  );
}

describe("InsertViewToggle", () => {
  it("renders both grid and list options with i18n-resolved labels", () => {
    render(
      <Setup>
        <InsertViewToggle />
      </Setup>,
    );
    expect(screen.getByRole("button", { name: "Grid view" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "List view" })).toBeTruthy();
  });

  it("clicking list switches the persisted mode to 'list'", () => {
    let mode: "grid" | "list" = "grid";
    render(
      <Setup>
        <Probe onMode={(m) => (mode = m)} />
        <InsertViewToggle />
      </Setup>,
    );
    expect(mode).toBe("grid");
    fireEvent.click(screen.getByRole("button", { name: "List view" }));
    expect(mode).toBe("list");
  });

  it("clicking grid after list flips back", () => {
    let mode: "grid" | "list" = "grid";
    render(
      <Setup>
        <Probe onMode={(m) => (mode = m)} />
        <InsertViewToggle />
      </Setup>,
    );
    fireEvent.click(screen.getByRole("button", { name: "List view" }));
    expect(mode).toBe("list");
    fireEvent.click(screen.getByRole("button", { name: "Grid view" }));
    expect(mode).toBe("grid");
  });
});
