import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Progress } from "../progress";

afterEach(() => {
  cleanup();
});

describe("Progress", () => {
  it("renders a determinate bar with aria values reflecting value", () => {
    render(<Progress aria-label="Upload progress" value={42} />);
    const bar = screen.getByRole("progressbar", { name: "Upload progress" });
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe("100");
    expect(bar.getAttribute("aria-valuenow")).toBe("42");
    expect(bar.getAttribute("data-state")).toBe("determinate");
  });

  it("clamps values above max to 100% and below 0 to 0%", () => {
    const { rerender } = render(
      <Progress aria-label="Upload progress" value={250} />,
    );
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
      "100",
    );
    rerender(<Progress aria-label="Upload progress" value={-10} />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
      "0",
    );
  });

  it("scales percent against custom max", () => {
    render(<Progress aria-label="Batch" max={5} value={2} />);
    const bar = screen.getByRole("progressbar", { name: "Batch" });
    expect(bar.getAttribute("aria-valuemax")).toBe("5");
    expect(bar.getAttribute("aria-valuenow")).toBe("40");
  });

  it("emits no aria-valuenow in indeterminate state", () => {
    render(<Progress aria-label="Loading" />);
    const bar = screen.getByRole("progressbar", { name: "Loading" });
    expect(bar.getAttribute("aria-valuenow")).toBeNull();
    expect(bar.getAttribute("data-state")).toBe("indeterminate");
  });
});
