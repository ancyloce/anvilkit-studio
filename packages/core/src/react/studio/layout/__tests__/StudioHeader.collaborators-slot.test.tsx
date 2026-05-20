/**
 * @file Tests for the `renderCollaboratorsSlot` discriminator in
 * `<StudioHeader>`. Confirms that:
 *
 * 1. `ReactNode` values pass through verbatim.
 * 2. `ComponentType` values are instantiated on each render, so the
 *    component's own hooks fire (verified via a state-bumping test
 *    component that mutates a counter inside `useEffect`).
 * 3. `undefined` / `null` falls back to the provided default node.
 *
 * Acceptance criteria for task_012.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { type ReactElement, useEffect, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { renderCollaboratorsSlot } from "@/layout/StudioHeader";

afterEach(cleanup);

describe("renderCollaboratorsSlot", () => {
  it("passes a ReactNode value through verbatim", () => {
    const node = <span data-testid="node-form">avatars</span>;
    render(<>{renderCollaboratorsSlot(node)}</>);
    expect(screen.getByTestId("node-form")).toHaveTextContent("avatars");
  });

  it("instantiates a ComponentType so its hooks run", () => {
    function PeerStack(): ReactElement {
      // `useState` + `useEffect` together prove the component is
      // instantiated (not just stored) — a ReactNode would never
      // fire either hook.
      const [count, setCount] = useState(0);
      useEffect(() => {
        setCount(1);
      }, []);
      return <span data-testid="component-form">peers: {count}</span>;
    }

    render(<>{renderCollaboratorsSlot(PeerStack)}</>);
    expect(screen.getByTestId("component-form")).toHaveTextContent("peers: 1");
  });

  it("renders the provided fallback when value is undefined", () => {
    const fallback = <span data-testid="fallback">placeholder</span>;
    render(<>{renderCollaboratorsSlot(undefined, fallback)}</>);
    expect(screen.getByTestId("fallback")).toHaveTextContent("placeholder");
  });

  it("renders the provided fallback when value is null", () => {
    const fallback = <span data-testid="fallback">placeholder</span>;
    render(<>{renderCollaboratorsSlot(null, fallback)}</>);
    expect(screen.getByTestId("fallback")).toHaveTextContent("placeholder");
  });

  it("does not double-instantiate a ComponentType on re-render", () => {
    // A function-type fixture that counts module-level invocations.
    // If `renderCollaboratorsSlot` mistakenly called the component
    // itself (instead of going through `createElement`), this would
    // fire twice per render.
    let calls = 0;
    function Probe(): ReactElement {
      calls += 1;
      return <span data-testid="probe">{calls}</span>;
    }

    const { rerender } = render(<>{renderCollaboratorsSlot(Probe)}</>);
    const firstCount = calls;
    rerender(<>{renderCollaboratorsSlot(Probe)}</>);
    // One additional call per re-render — not two, not zero.
    expect(calls).toBe(firstCount + 1);
  });
});
