"use client";

import type { PageRootProps } from "@anvilkit/schema";
// JSX for the `?e2e=demo-tools` route flag's auxiliary validation chrome
// (HTML/React export buttons + published-data snapshot). Extracted out of
// `page.tsx` (react-doctor `no-giant-component`); `onExportHtml`/
// `onExportReact` stay owned by `page.tsx` since they're shared with the
// Studio chrome's own `<PublishPanel>` via `onExport`. Style constants are
// duplicated (not imported) from `page.tsx` to avoid a page.tsx ⇄ panel
// circular import that `pnpm madge` would flag.
import { cn } from "@anvilkit/ui/lib/utils";
import type { Data } from "@puckeditor/core";
import type { DemoComponents } from "@/lib/puck-demo";

const snapshot =
	"mt-4 p-4 rounded-[1.5rem] border [border-color:var(--demo-panel-border)] [background:var(--demo-panel-bg)]";
const snapshotHeader = "mb-[0.85rem]";
const snapshotHeaderH2 = "mb-[0.3rem] text-[1.2rem]";
const snapshotHeaderP = "[color:var(--demo-soft-text)]";
const codeBlock =
	"overflow-x-auto p-4 rounded-[1rem] [background:var(--demo-inverse-bg)] [color:var(--demo-inverse-text)] font-mono text-[0.84rem] leading-[1.55]";
const actions = "flex flex-wrap gap-[0.85rem]";
const secondaryAction =
	"inline-flex items-center justify-center min-h-[2.9rem] py-3 px-[1.1rem] rounded-full border [border-color:var(--demo-panel-border-strong)] [background:var(--demo-secondary-bg)] transition-[transform,box-shadow,background-color] duration-[140ms] ease-[ease] hover-fine:-translate-y-px hover-fine:[background:var(--demo-secondary-hover)] hover-fine:shadow-[0_0.75rem_1.6rem_rgba(16,32,51,0.08)]";

export interface DemoToolsExportPanelProps {
	data: Data<DemoComponents, PageRootProps>;
	onExportHtml: () => void;
	onExportReact: () => void;
}

export function DemoToolsExportPanel({
	data,
	onExportHtml,
	onExportReact,
}: DemoToolsExportPanelProps) {
	return (
		<section className={snapshot} aria-labelledby="demo-exports-heading">
			<div className={snapshotHeader}>
				<h2 id="demo-exports-heading" className={snapshotHeaderH2}>
					Exports
				</h2>
				<p className={snapshotHeaderP}>
					Demo validation tools (rendered under ?e2e=demo-tools).
				</p>
			</div>
			<div className={actions}>
				<button
					type="button"
					className={secondaryAction}
					onClick={onExportHtml}
				>
					Download HTML
				</button>
				<button
					type="button"
					className={secondaryAction}
					onClick={onExportReact}
				>
					Export React
				</button>
			</div>
			<pre
				className={cn(codeBlock, "mt-4")}
				data-testid="ak-demo-data-snapshot"
			>
				{JSON.stringify(data, null, 2)}
			</pre>
		</section>
	);
}
