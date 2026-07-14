export type PlaygroundHeaderProps = {
	onExportHtml: () => void;
	onResetDraft: () => void;
};

export function PlaygroundHeader({
	onExportHtml,
	onResetDraft,
}: PlaygroundHeaderProps) {
	return (
		<header className="anvilkit-playground__header">
			<div>
				<p className="anvilkit-playground__eyebrow">Interactive playground</p>
				<h1 className="anvilkit-playground__title">
					Try AnvilKit without cloning the repo
				</h1>
				<p className="anvilkit-playground__lede">
					Drag any of the 11 <code>@anvilkit/*</code> components into the
					canvas, then explore the full plugin surface live in the editor:
					HTML/React export, the mock AI copilot, the asset manager, design
					system, version history, and Canvas Studio. Add <code>?collab=1</code>{" "}
					to the URL to collaborate live — running locally (<code>dev</code>/
					<code>preview</code>) it connects to an auto-started WebSocket relay
					for real multi-tab editing; elsewhere it falls back to an in-memory
					single-tab session. Your draft is kept in <code>localStorage</code>.
				</p>
			</div>
			<div className="anvilkit-playground__actions">
				<button
					type="button"
					className="anvilkit-playground__button anvilkit-playground__button--primary"
					onClick={onExportHtml}
					data-testid="playground-export-html"
				>
					Export HTML
				</button>
				<button
					type="button"
					className="anvilkit-playground__button"
					onClick={onResetDraft}
					data-testid="playground-reset"
				>
					Reset draft
				</button>
			</div>
		</header>
	);
}
