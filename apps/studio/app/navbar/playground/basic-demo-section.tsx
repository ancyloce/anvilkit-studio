import {
	Navbar,
	type NavbarAction,
	defaultProps as navbarDefaultProps,
} from "@anvilkit/navbar";
import { Card, CardContent } from "@anvilkit/ui/card";
import type { MouseEvent } from "react";

export function NavbarPlaygroundBasicDemo({
	defaultPreviewActions,
	preventPreviewNavigation,
}: {
	defaultPreviewActions: NavbarAction[];
	preventPreviewNavigation: (event: MouseEvent<HTMLDivElement>) => void;
}) {
	return (
		<section className="space-y-4">
			<div className="space-y-2">
				<h2 className="text-2xl font-semibold tracking-tight text-foreground">
					Basic Demo
				</h2>
				<p className="text-sm text-muted-foreground">
					The default package state with a sample brand, centered links, and a
					single right-side signup action.
				</p>
			</div>

			<Card className="border-border/70 bg-card/92 shadow-sm">
				<CardContent className="space-y-5 pt-6">
					<div
						className="rounded-[2rem] border border-border/70 p-3 shadow-sm"
						onClickCapture={preventPreviewNavigation}
					>
						<Navbar
							actions={defaultPreviewActions}
							active={navbarDefaultProps.active}
							items={navbarDefaultProps.items}
							logo={navbarDefaultProps.logo}
						/>
					</div>

					<div className="grid gap-3 md:grid-cols-3">
						<div className="rounded-2xl border border-border/70 bg-muted/35 p-4">
							<p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
								Left
							</p>
							<p className="mt-2 font-medium text-foreground">Logo section</p>
							<p className="mt-1 text-sm text-muted-foreground">
								Accepts text or image props today, plus a React node override
								when the consumer wants a custom lockup.
							</p>
						</div>
						<div className="rounded-2xl border border-border/70 bg-muted/35 p-4">
							<p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
								Center
							</p>
							<p className="mt-2 font-medium text-foreground">
								Navigation menu
							</p>
							<p className="mt-1 text-sm text-muted-foreground">
								Uses a concise <code>items</code> prop made of{" "}
								<code>{`{ label, href }`}</code> objects and an optional{" "}
								<code>active</code> match.
							</p>
						</div>
						<div className="rounded-2xl border border-border/70 bg-muted/35 p-4">
							<p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
								Right
							</p>
							<p className="mt-2 font-medium text-foreground">Action buttons</p>
							<p className="mt-1 text-sm text-muted-foreground">
								Multiple CTAs are supported with button variant, size, href, and
								disabled state baked into the array shape.
							</p>
						</div>
					</div>
				</CardContent>
			</Card>
		</section>
	);
}
