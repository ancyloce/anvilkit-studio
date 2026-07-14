"use client";

// JSX for the `?e2e=asset-manager` route flag's resolver/export coverage
// harness. Extracted out of `page.tsx` (react-doctor `no-giant-component`);
// state/handlers live in `./use-asset-manager-e2e`. Style constants are
// duplicated (not imported) from `page.tsx` to avoid a page.tsx ⇄ panel
// circular import that `pnpm madge` would flag.
import type { ChangeEvent } from "react";
import type { UseAssetManagerE2EResult } from "./use-asset-manager-e2e";

const snapshot =
	"mt-4 p-4 rounded-[1.5rem] border [border-color:var(--demo-panel-border)] [background:var(--demo-panel-bg)]";
const snapshotHeader = "mb-[0.85rem]";
const snapshotHeaderH2 = "mb-[0.3rem] text-[1.2rem]";
const snapshotHeaderP = "[color:var(--demo-soft-text)]";
const codeBlock =
	"overflow-x-auto p-4 rounded-[1rem] [background:var(--demo-inverse-bg)] [color:var(--demo-inverse-text)] font-mono text-[0.84rem] leading-[1.55]";
const secondaryAction =
	"inline-flex items-center justify-center min-h-[2.9rem] py-3 px-[1.1rem] rounded-full border [border-color:var(--demo-panel-border-strong)] [background:var(--demo-secondary-bg)] transition-[transform,box-shadow,background-color] duration-[140ms] ease-[ease] hover-fine:-translate-y-px hover-fine:[background:var(--demo-secondary-hover)] hover-fine:shadow-[0_0.75rem_1.6rem_rgba(16,32,51,0.08)]";

export type AssetManagerE2EPanelProps = Pick<
	UseAssetManagerE2EResult,
	| "assetManagerUploadMode"
	| "setAssetManagerUploadMode"
	| "handleAssetManagerFileChange"
	| "assetManagerStatus"
	| "handleAssetManagerHtmlExport"
	| "handleAssetManagerReactExport"
	| "assetManagerHtmlOutput"
	| "assetManagerHtmlWarnings"
	| "assetManagerReactOutput"
	| "assetManagerReactWarnings"
>;

export function AssetManagerE2EPanel({
	assetManagerUploadMode,
	setAssetManagerUploadMode,
	handleAssetManagerFileChange,
	assetManagerStatus,
	handleAssetManagerHtmlExport,
	handleAssetManagerReactExport,
	assetManagerHtmlOutput,
	assetManagerHtmlWarnings,
	assetManagerReactOutput,
	assetManagerReactWarnings,
}: AssetManagerE2EPanelProps) {
	return (
		<section className={snapshot} data-testid="asset-manager-e2e">
			<div className={snapshotHeader}>
				<h2 className={snapshotHeaderH2}>Asset manager export harness</h2>
				<p className={snapshotHeaderP}>
					Test-only route wiring for resolver/export end-to-end coverage.
				</p>
			</div>
			<div className="grid gap-3 mb-4">
				<div className="flex gap-3 flex-wrap">
					<button
						type="button"
						className={secondaryAction}
						aria-pressed={assetManagerUploadMode === "safe"}
						onClick={() => setAssetManagerUploadMode("safe")}
					>
						Use safe uploader
					</button>
					<button
						type="button"
						className={secondaryAction}
						aria-pressed={assetManagerUploadMode === "rogue"}
						onClick={() => setAssetManagerUploadMode("rogue")}
					>
						Simulate rogue uploader
					</button>
				</div>
				<label className="grid gap-2">
					<span>Upload fixture image</span>
					<input
						data-testid="asset-manager-file-input"
						type="file"
						accept="image/*"
						onChange={(event: ChangeEvent<HTMLInputElement>) => {
							void handleAssetManagerFileChange(event);
						}}
					/>
				</label>
				<p data-testid="asset-manager-status">{assetManagerStatus}</p>
				<div className="flex gap-3 flex-wrap">
					<button
						type="button"
						className={secondaryAction}
						onClick={() => {
							void handleAssetManagerHtmlExport();
						}}
					>
						Run HTML asset export
					</button>
					<button
						type="button"
						className={secondaryAction}
						onClick={() => {
							void handleAssetManagerReactExport();
						}}
					>
						Run React asset export
					</button>
				</div>
			</div>
			<h3>HTML output</h3>
			<pre className={codeBlock} data-testid="asset-manager-html-output">
				{assetManagerHtmlOutput}
			</pre>
			<h3>HTML warnings</h3>
			<pre className={codeBlock} data-testid="asset-manager-html-warnings">
				{assetManagerHtmlWarnings}
			</pre>
			<h3>React output</h3>
			<pre className={codeBlock} data-testid="asset-manager-react-output">
				{assetManagerReactOutput}
			</pre>
			<h3>React warnings</h3>
			<pre className={codeBlock} data-testid="asset-manager-react-warnings">
				{assetManagerReactWarnings}
			</pre>
		</section>
	);
}
