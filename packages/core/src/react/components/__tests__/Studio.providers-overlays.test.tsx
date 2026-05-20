/**
 * @file Tests for the plugin contract additions of task_011:
 *
 * 1. **`composePluginProviders`** — sorted providers fold into a single
 *    wrapped subtree, outermost-first.
 * 2. **`splitOverlaysByPlacement`** — partition by placement, preserve
 *    input order within each bucket.
 * 3. **`resolveCollaboratorsSlot`** — host prop wins over plugin slot
 *    contribution; falls through to plugin contribution when host is
 *    absent.
 * 4. **End-to-end through `<Studio>`** — a plugin contributing all
 *    three kinds (provider, overlays, slot) renders correctly in the
 *    AnvilKit chrome branch.
 *
 * The end-to-end tests use a Puck mock that renders a small
 * `CollaboratorsSlotProbe` instead of the real `puck` override slot.
 * The probe reads `useChromeProps()` so we can observe what
 * `<Studio>` resolves the slot to without having to mount the full
 * `<StudioLayout>` (which would pull in sidebar modules that need
 * additional providers we don't care about here).
 */

import { cleanup, render } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  composePluginProviders,
  resolveCollaboratorsSlot,
  splitOverlaysByPlacement,
  Studio,
} from "@/components/Studio";
import {
  type CollaboratorsSlotValue,
  useChromeProps,
} from "@/context/chrome-props";
import type {
  StudioPlugin,
  StudioPluginMeta,
  StudioPluginOverlay,
  StudioPluginProvider,
  StudioPluginSlotContribution,
} from "@/types/plugin";

// ---------------------------------------------------------------------------
// Puck mock — minimal stand-in that surfaces ChromePropsContext.
//
// `<Studio>`'s AnvilKit branch renders `<Puck>` *inside* its
// `<ChromePropsProvider>` stack. So any child rendered by our mock
// inherits the chrome context — that's all we need to assert what the
// resolved `collaboratorsSlot` is.
//
// We deliberately do NOT invoke `props.overrides?.puck` (which would
// mount the full chrome via `<StudioLayout>` and pull in sidebar
// modules that need additional providers).
// ---------------------------------------------------------------------------

// Renders the resolved `collaboratorsSlot` value from chrome context.
// Defined at module scope so `vi.mock`'s factory closure can reach it
// (function declarations are hoisted, so referencing it in the factory
// is safe).
function CollaboratorsSlotProbe(): ReactNode {
  const { collaboratorsSlot } = useChromeProps();
  if (collaboratorsSlot === undefined) {
    return <span data-testid="slot-empty" />;
  }
  if (typeof collaboratorsSlot === "function") {
    const Component = collaboratorsSlot;
    return <Component />;
  }
  return collaboratorsSlot;
}

vi.mock("@puckeditor/core", () => ({
  Puck: () => (
    <div data-testid="puck-mock">
      <CollaboratorsSlotProbe />
    </div>
  ),
  useGetPuck: () => () => ({
    appState: { data: null },
    dispatch: () => undefined,
  }),
  createUsePuck: () => () => undefined,
}));

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Helper-level tests (pure functions).
// ---------------------------------------------------------------------------

describe("composePluginProviders", () => {
  function makeWrap(id: string) {
    return ({ children }: { children: ReactNode }) => (
      <div data-testid={`wrap-${id}`}>{children}</div>
    );
  }

  it("returns children verbatim when no providers are contributed", () => {
    const result = composePluginProviders([], <span data-testid="leaf" />);
    const { container } = render(<>{result}</>);
    expect(container.querySelector("[data-testid=leaf]")).not.toBeNull();
  });

  it("composes providers outermost-first per array order", () => {
    const providers: StudioPluginProvider[] = [
      { id: "outer", component: makeWrap("outer") },
      { id: "mid", component: makeWrap("mid") },
      { id: "inner", component: makeWrap("inner") },
    ];
    const tree = composePluginProviders(providers, <span data-testid="leaf" />);
    const { container } = render(<>{tree}</>);
    const outer = container.querySelector("[data-testid=wrap-outer]");
    const mid = container.querySelector("[data-testid=wrap-mid]");
    const inner = container.querySelector("[data-testid=wrap-inner]");
    const leaf = container.querySelector("[data-testid=leaf]");
    expect(outer).not.toBeNull();
    expect(outer?.contains(mid)).toBe(true);
    expect(mid?.contains(inner)).toBe(true);
    expect(inner?.contains(leaf)).toBe(true);
  });
});

describe("splitOverlaysByPlacement", () => {
  const A = (() => null) as unknown as StudioPluginOverlay["component"];
  const B = (() => null) as unknown as StudioPluginOverlay["component"];
  const C = (() => null) as unknown as StudioPluginOverlay["component"];

  it("buckets each overlay into its declared placement", () => {
    const result = splitOverlaysByPlacement([
      { id: "banner", placement: "viewport", component: A },
      { id: "cursor", placement: "canvas", component: B },
      { id: "toast", placement: "notifications", component: C },
    ]);
    expect(result.viewport.map((o) => o.id)).toEqual(["banner"]);
    expect(result.canvas.map((o) => o.id)).toEqual(["cursor"]);
    expect(result.notifications.map((o) => o.id)).toEqual(["toast"]);
  });

  it("preserves the input order within each bucket", () => {
    const result = splitOverlaysByPlacement([
      { id: "c1", placement: "canvas", component: A },
      { id: "c2", placement: "canvas", component: B },
      { id: "c3", placement: "canvas", component: C },
    ]);
    expect(result.canvas.map((o) => o.id)).toEqual(["c1", "c2", "c3"]);
    expect(result.viewport).toEqual([]);
    expect(result.notifications).toEqual([]);
  });
});

describe("resolveCollaboratorsSlot", () => {
  const PluginPeers = (() => null) as unknown as Exclude<
    CollaboratorsSlotValue,
    ReactNode
  >;
  const slots = new Map<string, StudioPluginSlotContribution>([
    ["collaborators", { id: "collaborators", component: PluginPeers }],
  ]);

  it("returns the host value when defined", () => {
    const hostNode = <span data-testid="host" />;
    expect(resolveCollaboratorsSlot(hostNode, slots)).toBe(hostNode);
  });

  it("falls through to the plugin slot when host is undefined", () => {
    expect(resolveCollaboratorsSlot(undefined, slots)).toBe(PluginPeers);
  });

  it("returns undefined when neither host nor plugin contribute", () => {
    const empty = new Map<string, StudioPluginSlotContribution>();
    expect(resolveCollaboratorsSlot(undefined, empty)).toBeUndefined();
  });

  it("treats `null` host value as a deliberate render-empty signal", () => {
    // `null` is a valid ReactNode meaning "render nothing"; if a host
    // explicitly passes null, that's still a host decision and must
    // not fall back to the plugin slot.
    expect(resolveCollaboratorsSlot(null, slots)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// End-to-end through `<Studio>`.
//
// A plugin contributes a provider, several overlays, and a slot. We
// assert: the provider wraps the puck mock; viewport/canvas/notification
// overlays land in the right DOM positions around the mock; and the
// collaboratorsSlot precedence rules surface the right value at the
// chrome's `useChromeProps()` site.
// ---------------------------------------------------------------------------

function makeMeta(id: string): StudioPluginMeta {
  return {
    id,
    name: id,
    version: "1.0.0",
    coreVersion: "^0.1.0",
  };
}

function PluginPeerStack(): ReactElement {
  return <span data-testid="plugin-peer-stack">plugin-stack</span>;
}

function HostPeerStack(): ReactElement {
  return <span data-testid="host-peer-stack">host-stack</span>;
}

function makePluginContributing(opts: {
  provider?: StudioPluginProvider;
  overlays?: readonly StudioPluginOverlay[];
  slots?: readonly StudioPluginSlotContribution[];
}): StudioPlugin {
  const meta = makeMeta("com.test.collab");
  return {
    meta,
    register() {
      return {
        meta,
        ...(opts.provider ? { providers: [opts.provider] } : {}),
        ...(opts.overlays ? { overlays: opts.overlays } : {}),
        ...(opts.slots ? { slots: opts.slots } : {}),
      };
    },
  };
}

describe("<Studio> — plugin providers, overlays, and slots end-to-end", () => {
  it("wraps the puck element with a plugin-contributed provider", async () => {
    const plugin = makePluginContributing({
      provider: {
        id: "wrap",
        component: ({ children }) => (
          <div data-testid="plugin-wrap">{children}</div>
        ),
      },
    });
    const { container, findByTestId } = render(
      <Studio puckConfig={{ components: {} }} plugins={[plugin]} />,
    );
    const wrap = await findByTestId("plugin-wrap");
    const puck = container.querySelector("[data-testid=puck-mock]");
    expect(puck).not.toBeNull();
    expect(wrap.contains(puck)).toBe(true);
  });

  it("renders canvas and notification overlays after the puck mock in declared order", async () => {
    const plugin = makePluginContributing({
      overlays: [
        {
          id: "presence",
          placement: "canvas",
          component: () => <span data-testid="overlay-canvas" />,
        },
        {
          id: "toast",
          placement: "notifications",
          component: () => <span data-testid="overlay-toast" />,
        },
      ],
    });
    const { findByTestId, container } = render(
      <Studio puckConfig={{ components: {} }} plugins={[plugin]} />,
    );
    await findByTestId("puck-mock");

    const html = container.innerHTML;
    const puckIdx = html.indexOf('data-testid="puck-mock"');
    const canvasIdx = html.indexOf('data-testid="overlay-canvas"');
    const toastIdx = html.indexOf('data-testid="overlay-toast"');
    expect(puckIdx).toBeGreaterThanOrEqual(0);
    expect(canvasIdx).toBeGreaterThan(puckIdx);
    expect(toastIdx).toBeGreaterThan(canvasIdx);
  });

  it("renders viewport overlays before the puck mock", async () => {
    const plugin = makePluginContributing({
      overlays: [
        {
          id: "banner",
          placement: "viewport",
          component: () => <span data-testid="overlay-banner" />,
        },
      ],
    });
    const { findByTestId, container } = render(
      <Studio puckConfig={{ components: {} }} plugins={[plugin]} />,
    );
    await findByTestId("puck-mock");

    const html = container.innerHTML;
    const bannerIdx = html.indexOf('data-testid="overlay-banner"');
    const puckIdx = html.indexOf('data-testid="puck-mock"');
    expect(bannerIdx).toBeGreaterThanOrEqual(0);
    expect(bannerIdx).toBeLessThan(puckIdx);
  });

  it("uses the plugin-contributed slot when host omits collaboratorsSlot", async () => {
    const plugin = makePluginContributing({
      slots: [{ id: "collaborators", component: PluginPeerStack }],
    });
    const { findByTestId } = render(
      <Studio puckConfig={{ components: {} }} plugins={[plugin]} />,
    );
    await findByTestId("plugin-peer-stack");
  });

  it("host collaboratorsSlot prop wins over a plugin slot contribution", async () => {
    const plugin = makePluginContributing({
      slots: [{ id: "collaborators", component: PluginPeerStack }],
    });
    const { findByTestId, queryByTestId } = render(
      <Studio
        puckConfig={{ components: {} }}
        plugins={[plugin]}
        collaboratorsSlot={<HostPeerStack />}
      />,
    );
    await findByTestId("host-peer-stack");
    expect(queryByTestId("plugin-peer-stack")).toBeNull();
  });

  it("falls through to the chrome's empty signal when neither host nor plugin supplies a slot", async () => {
    const { findByTestId } = render(
      <Studio puckConfig={{ components: {} }} plugins={[]} />,
    );
    await findByTestId("slot-empty");
  });
});
