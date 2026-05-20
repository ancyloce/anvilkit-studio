/**
 * @file Regression tests for two compile-lifecycle findings of the
 * 2026-05-17 review:
 *
 * - **P2 — recompile fingerprint** (`fingerprintPlugins`): a host that
 *   recreates a plugin object with identical `meta` but a different
 *   `register` closure must trigger recompilation, not silently keep
 *   the previous registration active.
 * - **P2 — stale runtime** (compile effect generation id): when a
 *   recompile rejects, the previously compiled runtime must be torn
 *   down (fail closed) rather than left mounted under a plugin set the
 *   host has already replaced.
 *
 * Both exercise the real `compilePlugins()` through `<Studio>`; only
 * `@puckeditor/core` is mocked.
 */

import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Studio } from "@/components/Studio";
import type { StudioPlugin, StudioPluginMeta } from "@/types/plugin";

vi.mock("@puckeditor/core", () => ({
  Puck: () => <div data-testid="puck-mock" />,
  useGetPuck: () => () => ({
    appState: { data: null },
    dispatch: () => undefined,
  }),
  createUsePuck: () => () => undefined,
}));

afterEach(() => {
  vi.restoreAllMocks();
});

function meta(id: string): StudioPluginMeta {
  return { id, name: id, version: "1.0.0", coreVersion: "^0.1.0" };
}

describe("<Studio> — plugin recompilation on same-meta object replacement", () => {
  it("recompiles when a plugin object with identical meta but a new register closure is supplied", async () => {
    const registerV1 = vi.fn(() => ({ meta: meta("com.test.same") }));
    const pluginV1: StudioPlugin = {
      meta: meta("com.test.same"),
      register: registerV1,
    };

    const { container, rerender } = render(
      <Studio puckConfig={{ components: {} }} plugins={[pluginV1]} />,
    );
    await waitFor(() => {
      expect(container.querySelector("[data-testid=puck-mock]")).not.toBeNull();
    });
    expect(registerV1).toHaveBeenCalledTimes(1);

    // A brand-new plugin object, SAME meta, but a different register
    // closure. Pre-fix this kept the V1 registration active because
    // the fingerprint only hashed meta.
    const registerV2 = vi.fn(() => ({ meta: meta("com.test.same") }));
    const pluginV2: StudioPlugin = {
      meta: meta("com.test.same"),
      register: registerV2,
    };
    rerender(<Studio puckConfig={{ components: {} }} plugins={[pluginV2]} />);

    await waitFor(() => {
      expect(registerV2).toHaveBeenCalledTimes(1);
    });
    // V1 must not have run again — the new object fully supersedes it.
    expect(registerV1).toHaveBeenCalledTimes(1);
  });

  it("does NOT recompile when the same plugin object instance is passed across renders", async () => {
    const register = vi.fn(() => ({ meta: meta("com.test.stable") }));
    const plugin: StudioPlugin = {
      meta: meta("com.test.stable"),
      register,
    };
    const { container, rerender } = render(
      <Studio puckConfig={{ components: {} }} plugins={[plugin]} />,
    );
    await waitFor(() => {
      expect(container.querySelector("[data-testid=puck-mock]")).not.toBeNull();
    });
    // New array reference, SAME plugin object — fingerprint stable.
    rerender(<Studio puckConfig={{ components: {} }} plugins={[plugin]} />);
    await new Promise((r) => setTimeout(r, 30));
    expect(register).toHaveBeenCalledTimes(1);
  });
});

describe("<Studio> — stale runtime is cleared when a recompile fails", () => {
  it("unmounts the previously compiled runtime instead of leaving it active when the new plugin set fails to compile", async () => {
    const goodPlugin: StudioPlugin = {
      meta: meta("com.test.good"),
      register: () => ({ meta: meta("com.test.good") }),
    };

    const { container, rerender } = render(
      <Studio puckConfig={{ components: {} }} plugins={[goodPlugin]} />,
    );
    await waitFor(() => {
      expect(container.querySelector("[data-testid=puck-mock]")).not.toBeNull();
    });

    // Replace with a plugin whose register throws → compilePlugins
    // rejects. Pre-fix, the good runtime stayed mounted; post-fix the
    // editor fails closed (renders the null loading state).
    const failingPlugin: StudioPlugin = {
      meta: meta("com.test.bad"),
      register: () => {
        throw new Error("boom");
      },
    };
    rerender(
      <Studio
        puckConfig={{ components: {} }}
        plugins={[failingPlugin]}
        logger={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector("[data-testid=puck-mock]")).toBeNull();
    });
  });
});
