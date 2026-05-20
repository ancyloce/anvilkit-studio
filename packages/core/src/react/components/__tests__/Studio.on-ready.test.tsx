/**
 * @file Stage 0 / review finding C3: the post-mount `onReady`
 * lifecycle hook must fire exactly once, strictly after `onInit`,
 * and at a point where `ctx.getPuckApi()` is safe to call — whereas
 * `getPuckApi()` during `onInit` still throws because Puck's
 * effect-time binder has not captured the API yet.
 */

import { cleanup, render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Faithful-enough Puck mock: unlike the minimal mock used elsewhere,
// this one renders the composed `puck` override so <PuckApiBinder>
// actually mounts and its effect runs (that is what makes
// getPuckApi() callable and triggers onReady).
vi.mock("@puckeditor/core", () => ({
  Puck: ({ overrides }: { overrides?: { puck?: PuckSlot } }) => {
    const PuckSlot = overrides?.puck ?? (({ children }) => <>{children}</>);
    return (
      <div data-testid="puck-mock">
        <PuckSlot>
          <div data-testid="puck-inner" />
        </PuckSlot>
      </div>
    );
  },
  useGetPuck: () => () => ({
    appState: { data: { root: { props: {} }, content: [], zones: {} } },
    dispatch: vi.fn(),
  }),
  createUsePuck: () => () => undefined,
}));

type PuckSlot = (props: { children: ReactNode }) => ReactNode;

import { Studio } from "@/components/Studio";
import type { StudioPlugin } from "@/types/plugin";

afterEach(cleanup);

describe("<Studio> — onReady lifecycle hook (C3)", () => {
  it("fires onReady once, after onInit, with a working getPuckApi()", async () => {
    const events: string[] = [];
    let onReadyGetPuckApiOk = false;

    const plugin: StudioPlugin = {
      meta: {
        id: "test/on-ready",
        name: "on-ready probe",
        version: "1.0.0",
        coreVersion: "^0.1.0",
      },
      register() {
        return {
          meta: {
            id: "test/on-ready",
            name: "on-ready probe",
            version: "1.0.0",
            coreVersion: "^0.1.0",
          },
          hooks: {
            onInit() {
              events.push("onInit");
            },
            onReady(ctx) {
              events.push("onReady");
              const api = ctx.getPuckApi();
              onReadyGetPuckApiOk = typeof api.dispatch === "function";
            },
          },
        };
      },
    };

    render(
      <Studio
        chrome="puck"
        puckConfig={{ components: {} }}
        plugins={[plugin]}
      />,
    );

    await waitFor(() => {
      expect(events).toContain("onReady");
    });
    // Settle any trailing re-renders / StrictMode double-invoke.
    await new Promise((r) => setTimeout(r, 20));

    expect(onReadyGetPuckApiOk).toBe(true);
    expect(events.filter((e) => e === "onReady")).toHaveLength(1);
    expect(events.indexOf("onInit")).toBeLessThan(events.indexOf("onReady"));
  });
});
