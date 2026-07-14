import { buttonVariants } from "@anvilkit/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@anvilkit/ui/card";
import { cn } from "@anvilkit/ui/lib/utils";
import Link from "next/link";

export function NavbarPlaygroundIntro() {
	return (
		<>
			<div className="space-y-4">
				<span className="inline-flex w-fit items-center rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground shadow-sm">
					Navbar Playground
				</span>
				<div className="space-y-3">
					<h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
						Showcase, tweak, and document the new <code>@anvilkit/navbar</code>{" "}
						component from a real demo app surface.
					</h1>
					<p className="max-w-3xl text-base text-muted-foreground sm:text-lg">
						This route pairs a default demo, a live configuration panel, and
						copy-ready code examples. Preview links are intercepted here so you
						can experiment safely without leaving the page.
					</p>
				</div>
				<div className="flex flex-wrap gap-3">
					<Link
						className={cn(buttonVariants({ size: "lg", variant: "default" }))}
						href="/puck/editor"
					>
						Open Puck editor
					</Link>
					<Link
						className={cn(buttonVariants({ size: "lg", variant: "outline" }))}
						href="/puck/render"
					>
						View server render
					</Link>
					<Link
						className={cn(buttonVariants({ size: "lg", variant: "ghost" }))}
						href="/"
					>
						Back to demo hub
					</Link>
				</div>
			</div>

			<Card className="border-border/70 shadow-sm">
				<CardHeader className="border-b border-border/70">
					<CardTitle>How to use this page</CardTitle>
					<CardDescription>
						Start with the default navbar, then adjust props live in the panel.
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-4 pt-4 text-sm text-muted-foreground">
					<div className="rounded-2xl border border-border/70 bg-muted/40 p-4">
						<p className="font-medium text-foreground">Included controls</p>
						<p className="mt-1">
							Swap between text, image, and custom logo modes, add or remove
							menu items, and tune CTA variants, size, and state.
						</p>
					</div>
					<div className="rounded-2xl border border-border/70 bg-muted/40 p-4">
						<p className="font-medium text-foreground">Code section</p>
						<p className="mt-1">
							The live snippet tracks your current configuration, while the
							static examples cover minimal, composed, and responsive usage.
						</p>
					</div>
					<div className="rounded-2xl border border-border/70 bg-muted/40 p-4">
						<p className="font-medium text-foreground">Current API</p>
						<p className="mt-1">
							The navbar ships flat navigation links and action buttons. If you
							need dropdown-heavy navigation, compose it alongside the navbar
							rather than pushing that complexity into its base props.
						</p>
					</div>
				</CardContent>
			</Card>
		</>
	);
}
