export type PlaygroundAiPanelProps = {
	aiEnabled: boolean;
	onAiEnabledChange: (enabled: boolean) => void;
	prompt: string;
	onPromptChange: (prompt: string) => void;
	aiStatus: "idle" | "pending";
	onGenerate: () => void;
	aiError: string | null;
};

export function PlaygroundAiPanel({
	aiEnabled,
	onAiEnabledChange,
	prompt,
	onPromptChange,
	aiStatus,
	onGenerate,
	aiError,
}: PlaygroundAiPanelProps) {
	return (
		<section
			className="anvilkit-playground__panel"
			aria-labelledby="playground-ai-heading"
		>
			<label className="anvilkit-playground__toggle">
				<input
					type="checkbox"
					checked={aiEnabled}
					onChange={(event) => onAiEnabledChange(event.target.checked)}
					data-testid="playground-ai-toggle"
				/>
				<span>Try AI (mock)</span>
			</label>
			<h2
				id="playground-ai-heading"
				className="anvilkit-playground__panel-title"
			>
				Mock AI copilot
			</h2>
			<p className="anvilkit-playground__panel-lede">
				Uses the bundled fixture harness. Type a prompt matching a known fixture
				(e.g. &ldquo;a hero&rdquo;, &ldquo;pricing table&rdquo;, &ldquo;logo
				cloud&rdquo;) and press Generate.
			</p>
			{aiEnabled ? (
				<div className="anvilkit-playground__ai">
					<label
						htmlFor="playground-ai-prompt"
						className="anvilkit-playground__field"
					>
						<span className="anvilkit-playground__field-label">Prompt</span>
						<textarea
							id="playground-ai-prompt"
							name="playground-ai-prompt"
							value={prompt}
							onChange={(event) => onPromptChange(event.target.value)}
							rows={2}
							data-testid="playground-ai-prompt"
						/>
					</label>
					<button
						type="button"
						className="anvilkit-playground__button anvilkit-playground__button--primary"
						onClick={onGenerate}
						disabled={aiStatus === "pending"}
						data-testid="playground-ai-generate"
					>
						{aiStatus === "pending" ? "Generating…" : "Generate fixture"}
					</button>
				</div>
			) : null}
			{aiError !== null ? (
				<p
					role="alert"
					data-testid="playground-ai-error"
					className="anvilkit-playground__error"
				>
					{aiError}
				</p>
			) : null}
		</section>
	);
}
