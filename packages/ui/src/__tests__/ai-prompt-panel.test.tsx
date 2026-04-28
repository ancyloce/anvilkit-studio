import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
	AiPromptPanel,
	type AiPromptPanelSelection,
} from "../ai-prompt-panel";

afterEach(() => {
	cleanup();
});

function setup(props?: Partial<Parameters<typeof AiPromptPanel>[0]>) {
	const defaults: Parameters<typeof AiPromptPanel>[0] = {
		prompt: "",
		onPromptChange: vi.fn(),
		onGenerate: vi.fn(),
		onRegenerate: vi.fn(),
	};
	const merged = { ...defaults, ...props };
	const utils = render(<AiPromptPanel {...merged} />);
	return { ...utils, props: merged };
}

const heroSelection: AiPromptPanelSelection = {
	zoneId: "root-zone",
	nodeIds: ["hero-1"],
	nodeLabels: ["Hero"],
};

describe("<AiPromptPanel>", () => {
	describe("page mode (no selection)", () => {
		it("renders the page heading and submit label", () => {
			setup();
			expect(screen.getByTestId("ai-prompt-panel-heading")).toHaveTextContent(
				"Generate page",
			);
			expect(screen.getByTestId("ai-prompt-panel-eyebrow")).toHaveTextContent(
				"Page flow",
			);
			expect(screen.getByTestId("ai-prompt-panel-submit")).toHaveTextContent(
				"Generate",
			);
		});

		it("treats empty nodeIds the same as null selection", () => {
			setup({ selection: { zoneId: "root-zone", nodeIds: [] } });
			expect(screen.getByTestId("ai-prompt-panel-heading")).toHaveTextContent(
				"Generate page",
			);
		});

		it("calls onGenerate with the trimmed prompt on submit", () => {
			const onGenerate = vi.fn();
			setup({ prompt: "  rewrite hero  ", onGenerate });
			fireEvent.click(screen.getByTestId("ai-prompt-panel-submit"));
			expect(onGenerate).toHaveBeenCalledTimes(1);
			expect(onGenerate).toHaveBeenCalledWith("rewrite hero");
		});

		it("does not call onRegenerate in page mode", () => {
			const onRegenerate = vi.fn();
			setup({ prompt: "build", onRegenerate });
			fireEvent.click(screen.getByTestId("ai-prompt-panel-submit"));
			expect(onRegenerate).not.toHaveBeenCalled();
		});
	});

	describe("section mode (1+ selection)", () => {
		it("renders the section heading and submit label", () => {
			setup({ selection: heroSelection });
			expect(screen.getByTestId("ai-prompt-panel-heading")).toHaveTextContent(
				"Regenerate selection",
			);
			expect(screen.getByTestId("ai-prompt-panel-eyebrow")).toHaveTextContent(
				"Section flow",
			);
			expect(screen.getByTestId("ai-prompt-panel-submit")).toHaveTextContent(
				"Regenerate selection",
			);
		});

		it("summarizes the selection in the description", () => {
			setup({ selection: heroSelection });
			expect(
				screen.getByTestId("ai-prompt-panel-description"),
			).toHaveTextContent(/Replacing 1 node \(Hero\) in root-zone\./);
		});

		it("falls back to nodeIds when nodeLabels are absent", () => {
			setup({
				selection: { zoneId: "Z", nodeIds: ["a", "b", "c", "d"] },
			});
			expect(
				screen.getByTestId("ai-prompt-panel-description"),
			).toHaveTextContent(/Replacing 4 nodes \(a, b, c, \+1 more\)/);
		});

		it("calls onRegenerate with prompt + selection on submit", () => {
			const onRegenerate = vi.fn();
			setup({
				prompt: "rewrite",
				selection: heroSelection,
				onRegenerate,
			});
			fireEvent.click(screen.getByTestId("ai-prompt-panel-submit"));
			expect(onRegenerate).toHaveBeenCalledTimes(1);
			expect(onRegenerate).toHaveBeenCalledWith("rewrite", heroSelection);
		});

		it("does not call onGenerate in section mode", () => {
			const onGenerate = vi.fn();
			setup({ prompt: "x", selection: heroSelection, onGenerate });
			fireEvent.click(screen.getByTestId("ai-prompt-panel-submit"));
			expect(onGenerate).not.toHaveBeenCalled();
		});

		it("disables submit and shows guidance when onRegenerate is missing", () => {
			setup({
				prompt: "x",
				selection: heroSelection,
				onRegenerate: undefined,
			});
			expect(screen.getByTestId("ai-prompt-panel-submit")).toBeDisabled();
			expect(screen.getByTestId("ai-prompt-panel-diagnostics")).toHaveTextContent(
				/no section regenerator|configure/i,
			);
		});

		it("uses the custom sectionDescription when provided", () => {
			setup({
				selection: heroSelection,
				sectionDescription: "Just the hero will be replaced.",
			});
			expect(
				screen.getByTestId("ai-prompt-panel-description"),
			).toHaveTextContent("Just the hero will be replaced.");
		});
	});

	describe("status + diagnostics", () => {
		it("disables submit and shows pending label while pending", () => {
			setup({ prompt: "x", status: "pending" });
			const submit = screen.getByTestId("ai-prompt-panel-submit");
			expect(submit).toBeDisabled();
			expect(submit).toHaveTextContent("Generating…");
		});

		it("shows section pending label in section mode", () => {
			setup({ prompt: "x", status: "pending", selection: heroSelection });
			expect(screen.getByTestId("ai-prompt-panel-submit")).toHaveTextContent(
				"Regenerating…",
			);
		});

		it("disables submit when prompt is empty or whitespace-only", () => {
			setup({ prompt: "   " });
			expect(screen.getByTestId("ai-prompt-panel-submit")).toBeDisabled();
		});

		it("renders an inline error message", () => {
			setup({ error: "Network failure" });
			expect(screen.getByTestId("ai-prompt-panel-error")).toHaveTextContent(
				"Network failure",
			);
		});

		it("renders error issues in a structured list", () => {
			setup({
				issues: [
					{
						path: "replacement.0.props.title",
						message: "[INVALID_NODE] expected string",
						severity: "error",
					},
				],
			});
			const list = screen.getByTestId("ai-prompt-panel-error-issues");
			expect(list).toHaveTextContent("replacement.0.props.title");
			expect(list).toHaveTextContent("[INVALID_NODE] expected string");
		});

		it("renders warning issues separately from errors", () => {
			setup({
				issues: [
					{
						path: "props.extra",
						message: "Extra prop ignored.",
						severity: "warn",
					},
				],
			});
			expect(screen.queryByTestId("ai-prompt-panel-error-issues")).toBeNull();
			expect(
				screen.getByTestId("ai-prompt-panel-warn-issues"),
			).toHaveTextContent("Extra prop ignored.");
		});

		it("hides the diagnostics block when nothing to show", () => {
			setup();
			expect(screen.queryByTestId("ai-prompt-panel-diagnostics")).toBeNull();
		});
	});

	describe("controlled prompt", () => {
		it("forwards textarea changes through onPromptChange", () => {
			const onPromptChange = vi.fn();
			setup({ onPromptChange });
			fireEvent.change(screen.getByTestId("ai-prompt-panel-input"), {
				target: { value: "new prompt" },
			});
			expect(onPromptChange).toHaveBeenCalledWith("new prompt");
		});
	});
});
