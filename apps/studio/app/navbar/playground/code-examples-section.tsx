import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@anvilkit/ui/card";
import { CodeCard } from "../playground";

export function NavbarPlaygroundCodeExamples({
	liveSnippet,
}: {
	liveSnippet: string;
}) {
	return (
		<section className="space-y-4">
			<div className="space-y-2">
				<h2 className="text-2xl font-semibold tracking-tight text-foreground">
					Code Examples
				</h2>
				<p className="max-w-3xl text-sm text-muted-foreground">
					Use the live snippet to mirror your current test case, then reference
					the examples below for minimal usage, composed dropdown patterns, and
					responsive page integration.
				</p>
			</div>

			<div className="grid gap-4 xl:grid-cols-2">
				<CodeCard
					code={liveSnippet}
					description="Mirrors the current state of the interactive controls."
					title="Live configuration"
				/>
				<CodeCard
					code={`import { Navbar } from "@anvilkit/navbar";

export function MinimalHeader() {
  return (
    <Navbar
      logo={{ type: "text", text: "Sandbox", href: "/" }}
      items={[]}
      actions={[]}
    />
  );
}`}
					description="A stripped-down brand bar when the page already carries its own local navigation."
					title="Logo only"
				/>
				<CodeCard
					code={`import { Navbar } from "@anvilkit/navbar";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarTrigger,
} from "@anvilkit/ui/menubar";

export function DocsNavigation() {
  return (
    <div className="space-y-3">
      <Navbar
        logo={{ type: "text", text: "Underline Docs", href: "/" }}
        items={[
          { label: "Guides", href: "/guides" },
          { label: "API", href: "/api" },
        ]}
        actions={[{ label: "Launch app", href: "/app", variant: "secondary" }]}
        active="/api"
      />

      <Menubar>
        <MenubarMenu>
          <MenubarTrigger>Resources</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>Components</MenubarItem>
            <MenubarItem>Templates</MenubarItem>
            <MenubarItem>Release notes</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
    </div>
  );
}`}
					description="The navbar keeps its API flat, while dropdown-heavy navigation is composed around it."
					title="Composed with dropdown menus"
				/>
				<CodeCard
					code={`import { Navbar } from "@anvilkit/navbar";

export function LandingHeader() {
  return (
    <header className="px-4 py-4 sm:px-6 lg:px-10">
      <Navbar
        logo={{
          type: "image",
          imageUrl: "/turborepo-light.svg",
          alt: "Underline Studio",
          href: "/",
        }}
        items={[
          { label: "Overview", href: "/overview" },
          { label: "Pricing", href: "/pricing" },
          { label: "Customers", href: "/customers" },
          { label: "Changelog", href: "/changelog" },
        ]}
        actions={[
          { label: "Login", href: "/login", variant: "ghost", size: "default" },
          { label: "Start free", href: "/signup", variant: "secondary" },
        ]}
        active="/pricing"
      />
    </header>
  );
}`}
					description="A realistic landing-page header that lets the component handle stacking and wrapping at smaller widths."
					title="Responsive layout"
				/>
			</div>

			<Card className="border-border/70 shadow-sm">
				<CardHeader className="border-b border-border/70">
					<CardTitle>What this demo is exercising</CardTitle>
					<CardDescription>
						A quick checklist for manual QA before shipping the package.
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-4 pt-4 text-sm text-muted-foreground md:grid-cols-3">
					<div>
						<p className="font-medium text-foreground">Layout balance</p>
						<p className="mt-1">
							Verify the three sections stay readable with longer labels and
							multiple CTAs.
						</p>
					</div>
					<div>
						<p className="font-medium text-foreground">Prop ergonomics</p>
						<p className="mt-1">
							Confirm the concise API still covers text, image, and custom logo
							use cases cleanly.
						</p>
					</div>
					<div>
						<p className="font-medium text-foreground">Composition story</p>
						<p className="mt-1">
							Use the snippets to decide when the base navbar is enough and when
							surrounding UI primitives should take over.
						</p>
					</div>
				</CardContent>
			</Card>
		</section>
	);
}
