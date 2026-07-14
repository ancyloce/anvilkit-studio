import { cn } from "@anvilkit/ui/lib/utils";
import * as marketing from "./marketing-styles";

/**
 * Pure-CSS mock of the AnvilKit editor chrome (sidebar · canvas · inspector),
 * used as the hero's "product screenshot frame" (DESIGN.md treats the product
 * UI as the hero asset). No component stylesheets are imported here, so the
 * marketing pages stay light — the real editor lives at `/puck/editor`.
 */
export function EditorMockup() {
	return (
		<div
			className={marketing.productFrame}
			aria-hidden="true"
			data-anim="product-frame"
		>
			<div className={marketing.mockBar}>
				<span className={marketing.mockDot} />
				<span className={marketing.mockDot} />
				<span className={marketing.mockDot} />
				<span className={marketing.mockUrl}>anvilkit · /puck/editor</span>
			</div>
			<div className={marketing.mockBody}>
				<div className={marketing.mockSidebar}>
					<span
						className={cn(
							marketing.mockSidebarLine,
							marketing.mockSidebarLineFirst,
						)}
					/>
					<span className={marketing.mockSidebarLine} />
					<span className={marketing.mockSidebarLine} />
					<span className={marketing.mockSidebarLine} />
					<span className={marketing.mockSidebarLine} />
				</div>
				<div className={marketing.mockCanvas}>
					<div className={marketing.mockBlock}>
						<span className={cn(marketing.mockLine, marketing.mockLineWide)} />
						<span className={marketing.mockLine} />
						<span className={marketing.mockPill} />
					</div>
					<div className={cn(marketing.mockBlock, marketing.mockBlockActive)}>
						<span className={cn(marketing.mockLine, marketing.mockLineWide)} />
						<span className={marketing.mockLine} />
						<span className={marketing.mockLine} />
					</div>
					<div className={marketing.mockBlock}>
						<span className={marketing.mockLine} />
						<span className={marketing.mockLine} />
					</div>
				</div>
				<div className={marketing.mockInspector}>
					<span className={marketing.mockField} />
					<span className={marketing.mockField} />
					<span className={marketing.mockField} />
					<span className={marketing.mockField} />
				</div>
			</div>
		</div>
	);
}
