import {
	Navbar,
	type NavbarAction,
	type NavbarMenuItem,
} from "@anvilkit/navbar";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@anvilkit/ui/card";
import type { MouseEvent, ReactNode } from "react";
import type { LogoMode } from "../playground";

export function NavbarPlaygroundLivePreview({
	active,
	items,
	logoHref,
	logoImageUrl,
	logoMode,
	logoNode,
	logoText,
	preventPreviewNavigation,
	previewActions,
}: {
	active: string;
	items: NavbarMenuItem[];
	logoHref: string;
	logoImageUrl: string;
	logoMode: LogoMode;
	logoNode?: ReactNode;
	logoText: string;
	preventPreviewNavigation: (event: MouseEvent<HTMLDivElement>) => void;
	previewActions: NavbarAction[];
}) {
	return (
		<>
			<Card className="border-border/70 bg-card/92 shadow-sm">
				<CardHeader className="border-b border-border/70">
					<CardTitle>Live Preview</CardTitle>
					<CardDescription>
						This preview reflects your current control values.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-5 pt-5">
					<div
						className="rounded-[2rem] border border-border/70 p-3 shadow-sm"
						onClickCapture={preventPreviewNavigation}
					>
						<Navbar
							actions={previewActions}
							active={active || undefined}
							items={items}
							logo={{
								alt: logoText || "Brand",
								href: logoHref,
								imageUrl: logoImageUrl,
								text: logoText,
								type: logoMode === "image" ? "image" : "text",
							}}
							logoNode={logoNode}
						/>
					</div>

					<div className="grid gap-3 md:grid-cols-3">
						<div className="rounded-2xl border border-border/70 bg-muted/35 p-4">
							<p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
								Logo mode
							</p>
							<p className="mt-2 text-sm font-medium capitalize text-foreground">
								{logoMode}
							</p>
						</div>
						<div className="rounded-2xl border border-border/70 bg-muted/35 p-4">
							<p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
								Items
							</p>
							<p className="mt-2 text-sm font-medium text-foreground">
								{items.length} configured
							</p>
						</div>
						<div className="rounded-2xl border border-border/70 bg-muted/35 p-4">
							<p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
								Actions
							</p>
							<p className="mt-2 text-sm font-medium text-foreground">
								{previewActions.length} configured
							</p>
						</div>
					</div>
				</CardContent>
			</Card>

			<Card className="border-border/70 shadow-sm">
				<CardHeader className="border-b border-border/70">
					<CardTitle>Preview tips</CardTitle>
					<CardDescription>
						Useful behaviors to validate while you experiment.
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-3 pt-4 text-sm text-muted-foreground">
					<p>
						1. Increase the number of items to confirm the center section still
						wraps cleanly on smaller widths.
					</p>
					<p>
						2. Swap between image and custom logo modes to verify the left slot
						stays vertically aligned.
					</p>
					<p>
						3. Mix button variants and disabled states to see how the right
						action cluster balances visually.
					</p>
				</CardContent>
			</Card>
		</>
	);
}
