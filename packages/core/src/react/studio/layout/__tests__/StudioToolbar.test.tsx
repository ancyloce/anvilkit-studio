/**
 * @file Tests for StudioToolbar source error handling.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioPagesSourceProvider } from "@/context/pages-source";
import { StudioToolbar } from "@/layout/StudioToolbar";
import { EditorI18nStoreProvider, EditorUiStoreProvider } from "@/state/index";
import type { StudioPagesSource } from "@/types/pages";

const { toastError } = vi.hoisted(() => ({
  toastError: vi.fn(),
}));

vi.mock("@puckeditor/core", () => ({
  useGetPuck: () => () => ({
    history: {
      back: vi.fn(),
      forward: vi.fn(),
    },
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: toastError,
  },
}));

afterEach(() => {
  cleanup();
  toastError.mockReset();
});

function Setup({
  children,
  pages,
}: {
  readonly children: ReactNode;
  readonly pages?: StudioPagesSource;
}): ReactElement {
  return (
    <EditorI18nStoreProvider>
      <EditorUiStoreProvider
        storeId={`toolbar-${Math.random().toString(36).slice(2)}`}
      >
        <StudioPagesSourceProvider value={pages}>
          {children}
        </StudioPagesSourceProvider>
      </EditorUiStoreProvider>
    </EditorI18nStoreProvider>
  );
}

describe("StudioToolbar", () => {
  it("reports home navigation list failures without an unhandled rejection", async () => {
    const pages: StudioPagesSource = {
      list: vi.fn().mockRejectedValue(new Error("offline")),
    };
    render(
      <Setup pages={pages}>
        <StudioToolbar />
      </Setup>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Home" }));

    await vi.waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Could not load pages.");
    });
  });
});
