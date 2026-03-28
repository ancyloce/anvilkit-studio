"use client";

import {
	Navbar,
	type NavbarAction,
	type NavbarMenuItem,
	defaultProps as navbarDefaultProps,
} from "@anvilkit/navbar";
import { Button, buttonVariants } from "@anvilkit/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@anvilkit/ui/card";
import { Input } from "@anvilkit/ui/input";
import { cn } from "@anvilkit/ui/lib/utils";
import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";
import { useState } from "react";

type LogoMode = "text" | "image" | "custom";
type CustomLogoPreset = "badge" | "monogram" | "stack";

type EditableItem = NavbarMenuItem & {
	id: string;
};

type EditableAction = NavbarAction & {
	id: string;
};

const selectClassName =
	"flex h-8 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50";

const textareaClassName =
	"min-h-40 w-full rounded-2xl border border-border bg-primary px-4 py-4 text-sm leading-6 text-primary-foreground shadow-sm";

const customLogoOptions: Array<{
	label: string;
	value: CustomLogoPreset;
	description: string;
}> = [
	{
		label: "Badge",
		value: "badge",
		description: "A rounded status badge with a built-in beta marker.",
	},
	{
		label: "Monogram",
		value: "monogram",
		description: "A compact brand monogram with a supporting label.",
	},
	{
		label: "Stack",
		value: "stack",
		description: "A stacked wordmark for product or platform navigation.",
	},
];

const variantOptions: Array<NonNullable<NavbarAction["variant"]>> = [
	"default",
	"secondary",
	"outline",
	"ghost",
	"link",
	"destructive",
];

const sizeOptions: Array<NonNullable<NavbarAction["size"]>> = [
	"sm",
	"default",
	"lg",
];

function createId(prefix: string) {
	return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function createEditableItem(item?: Partial<NavbarMenuItem>): EditableItem {
	return {
		id: createId("item"),
		href: item?.href ?? "/new-link",
		label: item?.label ?? "New link",
	};
}

function createEditableAction(action?: Partial<NavbarAction>): EditableAction {
	return {
		id: createId("action"),
		disabled: action?.disabled ?? false,
		href: action?.href ?? "/action",
		label: action?.label ?? "Action",
		openInNewTab: action?.openInNewTab ?? false,
		size: action?.size ?? "lg",
		variant: action?.variant ?? "secondary",
	};
}

function formatCodeString(value: string) {
	return JSON.stringify(value);
}

function renderCustomLogoNode(
	preset: CustomLogoPreset,
	label: string,
): ReactNode {
	const brand = label || "Underline";
	const initials = brand
		.split(" ")
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase() ?? "")
		.join("");

	if (preset === "monogram") {
		return (
			<span className="inline-flex items-center gap-3 text-primary-foreground">
				<span className="inline-flex size-10 items-center justify-center rounded-2xl border border-primary-foreground/18 bg-primary-foreground/10 text-sm font-semibold">
					{initials || "U"}
				</span>
				<span className="text-sm font-semibold uppercase tracking-[0.24em] text-primary-foreground/78">
					{brand}
				</span>
			</span>
		);
	}

	if (preset === "stack") {
		return (
			<span className="inline-flex flex-col leading-none text-primary-foreground">
				<span className="text-xs font-semibold uppercase tracking-[0.32em] text-primary-foreground/62">
					Anvilkit
				</span>
				<span className="text-lg font-semibold tracking-tight">{brand}</span>
			</span>
		);
	}

	return (
		<span className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/18 bg-primary-foreground/10 px-3 py-2 text-sm font-semibold text-primary-foreground">
			<span>{brand}</span>
			<span className="rounded-full bg-primary-foreground px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.24em] text-primary">
				Beta
			</span>
		</span>
	);
}

function buildLiveSnippet(params: {
	actions: NavbarAction[];
	active?: string;
	items: NavbarMenuItem[];
	logoHref: string;
	logoImageUrl: string;
	logoMode: LogoMode;
	logoText: string;
}) {
	const logoProp =
		params.logoMode === "image"
			? `      logo={{ type: "image", imageUrl: ${formatCodeString(params.logoImageUrl)}, alt: ${formatCodeString(params.logoText || "Brand")}, href: ${formatCodeString(params.logoHref)} }}`
			: `      logo={{ type: "text", text: ${formatCodeString(params.logoText || "Brand")}, href: ${formatCodeString(params.logoHref)} }}`;

	const logoNodeProp =
		params.logoMode === "custom" ? "      logoNode={<BrandMark />}" : null;

	const itemLines =
		params.items.length > 0
			? params.items
					.map(
						(item) =>
							`        { label: ${formatCodeString(item.label)}, href: ${formatCodeString(item.href)} },`,
					)
					.join("\n")
			: "";

	const actionLines =
		params.actions.length > 0
			? params.actions
					.map((action) => {
						const parts = [`label: ${formatCodeString(action.label)}`];

						if (action.href) {
							parts.push(`href: ${formatCodeString(action.href)}`);
						}

						if (action.variant && action.variant !== "secondary") {
							parts.push(`variant: ${formatCodeString(action.variant)}`);
						}

						if (action.size && action.size !== "lg") {
							parts.push(`size: ${formatCodeString(action.size)}`);
						}

						if (action.disabled) {
							parts.push("disabled: true");
						}

						if (action.openInNewTab) {
							parts.push("openInNewTab: true");
						}

						return `        { ${parts.join(", ")} },`;
					})
					.join("\n")
			: "";

	return [
		'import { Navbar } from "@anvilkit/navbar";',
		"",
		"export function SiteHeader() {",
		"  return (",
		"    <Navbar",
		logoProp,
		logoNodeProp,
		itemLines ? `      items={[\n${itemLines}\n      ]}` : "      items={[]}",
		actionLines
			? `      actions={[\n${actionLines}\n      ]}`
			: "      actions={[]}",
		params.active ? `      active=${formatCodeString(params.active)}` : null,
		"    />",
		"  );",
		"}",
	]
		.filter(Boolean)
		.join("\n");
}

function ControlField({
	children,
	hint,
	label,
}: {
	children: ReactNode;
	hint?: string;
	label: string;
}) {
	return (
		<div className="grid gap-2 text-sm">
			<span className="font-medium text-foreground">{label}</span>
			{children}
			{hint ? (
				<span className="text-xs text-muted-foreground">{hint}</span>
			) : null}
		</div>
	);
}

function ToggleField({
	checked,
	label,
	onChange,
}: {
	checked: boolean;
	label: string;
	onChange: (checked: boolean) => void;
}) {
	return (
		<label className="flex items-center gap-3 rounded-xl border border-border bg-background/80 px-3 py-2 text-sm text-foreground">
			<input
				checked={checked}
				className="size-4 rounded border-border"
				onChange={(event) => onChange(event.currentTarget.checked)}
				type="checkbox"
			/>
			<span>{label}</span>
		</label>
	);
}

function CodeCard({
	code,
	description,
	title,
}: {
	code: string;
	description: string;
	title: string;
}) {
	return (
		<Card className="border-border/70 bg-card/90 shadow-sm">
			<CardHeader className="border-b border-border/70">
				<CardTitle>{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent className="pt-4">
				<pre
					className={cn(textareaClassName, "overflow-x-auto whitespace-pre")}
				>
					<code>{code}</code>
				</pre>
			</CardContent>
		</Card>
	);
}

export function NavbarPlayground() {
	const [logoMode, setLogoMode] = useState<LogoMode>("text");
	const [logoText, setLogoText] = useState(
		navbarDefaultProps.logo.text ?? "Underline",
	);
	const [logoHref, setLogoHref] = useState(navbarDefaultProps.logo.href ?? "/");
	const [logoImageUrl, setLogoImageUrl] = useState("/turborepo-light.svg");
	const [customLogoPreset, setCustomLogoPreset] =
		useState<CustomLogoPreset>("badge");
	const [active, setActive] = useState(navbarDefaultProps.active ?? "");
	const [editableItems, setEditableItems] = useState<EditableItem[]>(() =>
		navbarDefaultProps.items.map((item) => createEditableItem(item)),
	);
	const [editableActions, setEditableActions] = useState<EditableAction[]>(() =>
		navbarDefaultProps.actions.map((action) => createEditableAction(action)),
	);

	const items = editableItems.map(({ id: _id, ...item }) => item);
	const actions = editableActions.map(({ id: _id, ...action }) => action);
	const logoNode =
		logoMode === "custom"
			? renderCustomLogoNode(customLogoPreset, logoText)
			: undefined;
	const defaultPreviewActions = navbarDefaultProps.actions.map((action) => ({
		...action,
		onClick: (event: MouseEvent<HTMLElement>) => {
			event.preventDefault();
		},
	}));

	const previewActions = actions.map((action) => ({
		...action,
		onClick: (event: MouseEvent<HTMLElement>) => {
			event.preventDefault();
		},
	}));

	const liveSnippet = buildLiveSnippet({
		actions,
		active: active || undefined,
		items,
		logoHref,
		logoImageUrl,
		logoMode,
		logoText,
	});

	const preventPreviewNavigation = (event: MouseEvent<HTMLDivElement>) => {
		const target = event.target;

		if (target instanceof HTMLElement && target.closest("a")) {
			event.preventDefault();
		}
	};

	return (
		<main className="min-h-screen">
			<div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
				<section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]">
					<div className="space-y-4">
						<span className="inline-flex w-fit items-center rounded-full border border-border bg-background/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground shadow-sm">
							Navbar Playground
						</span>
						<div className="space-y-3">
							<h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
								Showcase, tweak, and document the new{" "}
								<code>@anvilkit/navbar</code> component from a real demo app
								surface.
							</h1>
							<p className="max-w-3xl text-base text-muted-foreground sm:text-lg">
								This route pairs a default demo, a live configuration panel, and
								copy-ready code examples. Preview links are intercepted here so
								you can experiment safely without leaving the page.
							</p>
						</div>
						<div className="flex flex-wrap gap-3">
							<Link
								className={cn(
									buttonVariants({ size: "lg", variant: "default" }),
								)}
								href="/puck/editor"
							>
								Open Puck editor
							</Link>
							<Link
								className={cn(
									buttonVariants({ size: "lg", variant: "outline" }),
								)}
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

					<Card className="border-border/70 bg-background/90 shadow-sm">
						<CardHeader className="border-b border-border/70">
							<CardTitle>How to use this page</CardTitle>
							<CardDescription>
								Start with the default navbar, then adjust props live in the
								panel.
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
									The navbar ships flat navigation links and action buttons. If
									you need dropdown-heavy navigation, compose it alongside the
									navbar rather than pushing that complexity into its base
									props.
								</p>
							</div>
						</CardContent>
					</Card>
				</section>

				<section className="space-y-4">
					<div className="space-y-2">
						<h2 className="text-2xl font-semibold tracking-tight text-foreground">
							Basic Demo
						</h2>
						<p className="text-sm text-muted-foreground">
							The default package state with a sample brand, centered links, and
							a single right-side signup action.
						</p>
					</div>

					<Card className="border-border/70 bg-card/92 shadow-sm">
						<CardContent className="space-y-5 pt-6">
							<div
								className="rounded-[2rem] border border-border/70 bg-background p-3 shadow-sm"
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
									<p className="mt-2 font-medium text-foreground">
										Logo section
									</p>
									<p className="mt-1 text-sm text-muted-foreground">
										Accepts text or image props today, plus a React node
										override when the consumer wants a custom lockup.
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
									<p className="mt-2 font-medium text-foreground">
										Action buttons
									</p>
									<p className="mt-1 text-sm text-muted-foreground">
										Multiple CTAs are supported with button variant, size, href,
										and disabled state baked into the array shape.
									</p>
								</div>
							</div>
						</CardContent>
					</Card>
				</section>

				<section className="space-y-4">
					<div className="space-y-2">
						<h2 className="text-2xl font-semibold tracking-tight text-foreground">
							Interactive Configuration Panel
						</h2>
						<p className="text-sm text-muted-foreground">
							Modify the navbar in real time, then copy the generated JSX from
							the code examples section below.
						</p>
					</div>

					<div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.9fr)]">
						<div className="space-y-4 xl:sticky xl:top-6 xl:self-start">
							<Card className="border-border/70 bg-card/92 shadow-sm">
								<CardHeader className="border-b border-border/70">
									<CardTitle>Live Preview</CardTitle>
									<CardDescription>
										This preview reflects your current control values.
									</CardDescription>
								</CardHeader>
								<CardContent className="space-y-5 pt-5">
									<div
										className="rounded-[2rem] border border-border/70 bg-background p-3 shadow-sm"
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
												{actions.length} configured
											</p>
										</div>
									</div>
								</CardContent>
							</Card>

							<Card className="border-border/70 bg-background/90 shadow-sm">
								<CardHeader className="border-b border-border/70">
									<CardTitle>Preview tips</CardTitle>
									<CardDescription>
										Useful behaviors to validate while you experiment.
									</CardDescription>
								</CardHeader>
								<CardContent className="grid gap-3 pt-4 text-sm text-muted-foreground">
									<p>
										1. Increase the number of items to confirm the center
										section still wraps cleanly on smaller widths.
									</p>
									<p>
										2. Swap between image and custom logo modes to verify the
										left slot stays vertically aligned.
									</p>
									<p>
										3. Mix button variants and disabled states to see how the
										right action cluster balances visually.
									</p>
								</CardContent>
							</Card>
						</div>

						<div className="space-y-4">
							<Card className="border-border/70 bg-background/90 shadow-sm">
								<CardHeader className="border-b border-border/70">
									<CardTitle>Logo Controls</CardTitle>
									<CardDescription>
										Choose between text, image, and custom node presentation.
									</CardDescription>
								</CardHeader>
								<CardContent className="grid gap-4 pt-4">
									<div className="grid gap-4 md:grid-cols-2">
										<ControlField label="Logo mode">
											<select
												className={selectClassName}
												onChange={(event) =>
													setLogoMode(event.currentTarget.value as LogoMode)
												}
												value={logoMode}
											>
												<option value="text">Text</option>
												<option value="image">Image</option>
												<option value="custom">Custom node</option>
											</select>
										</ControlField>

										<ControlField label="Logo href">
											<Input
												onChange={(event) =>
													setLogoHref(event.currentTarget.value)
												}
												placeholder="/"
												value={logoHref}
											/>
										</ControlField>
									</div>

									<div className="grid gap-4 md:grid-cols-2">
										<ControlField
											hint={
												logoMode === "custom"
													? "Used as the accessible fallback label and in the preset node."
													: undefined
											}
											label={
												logoMode === "image"
													? "Image alt text / brand name"
													: "Logo text"
											}
										>
											<Input
												onChange={(event) =>
													setLogoText(event.currentTarget.value)
												}
												placeholder="Underline"
												value={logoText}
											/>
										</ControlField>

										{logoMode === "image" ? (
											<ControlField label="Image URL">
												<Input
													onChange={(event) =>
														setLogoImageUrl(event.currentTarget.value)
													}
													placeholder="https://example.com/logo.svg"
													value={logoImageUrl}
												/>
											</ControlField>
										) : logoMode === "custom" ? (
											<ControlField label="Custom preset">
												<select
													className={selectClassName}
													onChange={(event) =>
														setCustomLogoPreset(
															event.currentTarget.value as CustomLogoPreset,
														)
													}
													value={customLogoPreset}
												>
													{customLogoOptions.map((option) => (
														<option key={option.value} value={option.value}>
															{option.label}
														</option>
													))}
												</select>
											</ControlField>
										) : (
											<div className="rounded-2xl border border-dashed border-border bg-muted/25 p-4 text-sm text-muted-foreground">
												Text mode uses the logo string directly and keeps the
												prop surface fully serializable.
											</div>
										)}
									</div>

									{logoMode === "custom" ? (
										<div className="rounded-2xl border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
											{
												customLogoOptions.find(
													(option) => option.value === customLogoPreset,
												)?.description
											}
										</div>
									) : null}
								</CardContent>
							</Card>

							<Card className="border-border/70 bg-background/90 shadow-sm">
								<CardHeader className="border-b border-border/70">
									<div className="flex flex-wrap items-center justify-between gap-3">
										<div>
											<CardTitle>Navigation Items</CardTitle>
											<CardDescription>
												Update labels, links, and which item should be marked
												active.
											</CardDescription>
										</div>
										<Button
											onClick={() =>
												setEditableItems((current) => [
													...current,
													createEditableItem({
														href: `/item-${current.length + 1}`,
														label: `Item ${current.length + 1}`,
													}),
												])
											}
											size="sm"
											type="button"
											variant="secondary"
										>
											Add item
										</Button>
									</div>
								</CardHeader>
								<CardContent className="grid gap-4 pt-4">
									{editableItems.length === 0 ? (
										<div className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">
											No items configured. Add a link to repopulate the center
											navigation.
										</div>
									) : (
										editableItems.map((item, index) => (
											<div
												key={item.id}
												className="grid gap-4 rounded-2xl border border-border/70 bg-muted/25 p-4"
											>
												<div className="flex items-center justify-between gap-3">
													<div>
														<p className="text-sm font-medium text-foreground">
															Item {index + 1}
														</p>
														<p className="text-xs text-muted-foreground">
															Configure the label and destination for this link.
														</p>
													</div>
													<div className="flex flex-wrap gap-2">
														<Button
															onClick={() => setActive(item.href)}
															size="sm"
															type="button"
															variant={
																active === item.href ? "secondary" : "outline"
															}
														>
															{active === item.href ? "Active" : "Set active"}
														</Button>
														<Button
															onClick={() => {
																setEditableItems((current) =>
																	current.filter(
																		(entry) => entry.id !== item.id,
																	),
																);

																if (active === item.href) {
																	const fallback = editableItems.find(
																		(entry) => entry.id !== item.id,
																	);
																	setActive(fallback?.href ?? "");
																}
															}}
															size="sm"
															type="button"
															variant="ghost"
														>
															Remove
														</Button>
													</div>
												</div>

												<div className="grid gap-4 md:grid-cols-2">
													<ControlField label="Label">
														<Input
															onChange={(event) =>
																setEditableItems((current) =>
																	current.map((entry) =>
																		entry.id === item.id
																			? {
																					...entry,
																					label: event.currentTarget.value,
																				}
																			: entry,
																	),
																)
															}
															value={item.label}
														/>
													</ControlField>

													<ControlField label="Href">
														<Input
															onChange={(event) => {
																const nextHref = event.currentTarget.value;

																setEditableItems((current) =>
																	current.map((entry) =>
																		entry.id === item.id
																			? {
																					...entry,
																					href: nextHref,
																				}
																			: entry,
																	),
																);

																if (active === item.href) {
																	setActive(nextHref);
																}
															}}
															value={item.href}
														/>
													</ControlField>
												</div>
											</div>
										))
									)}
								</CardContent>
							</Card>

							<Card className="border-border/70 bg-background/90 shadow-sm">
								<CardHeader className="border-b border-border/70">
									<div className="flex flex-wrap items-center justify-between gap-3">
										<div>
											<CardTitle>Action Buttons</CardTitle>
											<CardDescription>
												Control the right-side CTAs, including variant, size,
												and disabled state.
											</CardDescription>
										</div>
										<Button
											onClick={() =>
												setEditableActions((current) => [
													...current,
													createEditableAction({
														href: `/action-${current.length + 1}`,
														label: `Action ${current.length + 1}`,
													}),
												])
											}
											size="sm"
											type="button"
											variant="secondary"
										>
											Add action
										</Button>
									</div>
								</CardHeader>
								<CardContent className="grid gap-4 pt-4">
									{editableActions.length === 0 ? (
										<div className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">
											No actions configured. Add one or more buttons to populate
											the right section.
										</div>
									) : (
										editableActions.map((action, index) => (
											<div
												key={action.id}
												className="grid gap-4 rounded-2xl border border-border/70 bg-muted/25 p-4"
											>
												<div className="flex items-center justify-between gap-3">
													<div>
														<p className="text-sm font-medium text-foreground">
															Action {index + 1}
														</p>
														<p className="text-xs text-muted-foreground">
															Keep button copy short so the cluster stays
															balanced.
														</p>
													</div>
													<Button
														onClick={() =>
															setEditableActions((current) =>
																current.filter(
																	(entry) => entry.id !== action.id,
																),
															)
														}
														size="sm"
														type="button"
														variant="ghost"
													>
														Remove
													</Button>
												</div>

												<div className="grid gap-4 md:grid-cols-2">
													<ControlField label="Label">
														<Input
															onChange={(event) =>
																setEditableActions((current) =>
																	current.map((entry) =>
																		entry.id === action.id
																			? {
																					...entry,
																					label: event.currentTarget.value,
																				}
																			: entry,
																	),
																)
															}
															value={action.label}
														/>
													</ControlField>

													<ControlField label="Href">
														<Input
															onChange={(event) =>
																setEditableActions((current) =>
																	current.map((entry) =>
																		entry.id === action.id
																			? {
																					...entry,
																					href: event.currentTarget.value,
																				}
																			: entry,
																	),
																)
															}
															value={action.href ?? ""}
														/>
													</ControlField>
												</div>

												<div className="grid gap-4 md:grid-cols-2">
													<ControlField label="Variant">
														<select
															className={selectClassName}
															onChange={(event) =>
																setEditableActions((current) =>
																	current.map((entry) =>
																		entry.id === action.id
																			? {
																					...entry,
																					variant: event.currentTarget
																						.value as NonNullable<
																						NavbarAction["variant"]
																					>,
																				}
																			: entry,
																	),
																)
															}
															value={action.variant ?? "secondary"}
														>
															{variantOptions.map((variant) => (
																<option key={variant} value={variant}>
																	{variant}
																</option>
															))}
														</select>
													</ControlField>

													<ControlField label="Size">
														<select
															className={selectClassName}
															onChange={(event) =>
																setEditableActions((current) =>
																	current.map((entry) =>
																		entry.id === action.id
																			? {
																					...entry,
																					size: event.currentTarget
																						.value as NonNullable<
																						NavbarAction["size"]
																					>,
																				}
																			: entry,
																	),
																)
															}
															value={action.size ?? "lg"}
														>
															{sizeOptions.map((size) => (
																<option key={size} value={size}>
																	{size}
																</option>
															))}
														</select>
													</ControlField>
												</div>

												<div className="grid gap-3 md:grid-cols-2">
													<ToggleField
														checked={Boolean(action.disabled)}
														label="Disabled"
														onChange={(checked) =>
															setEditableActions((current) =>
																current.map((entry) =>
																	entry.id === action.id
																		? {
																				...entry,
																				disabled: checked,
																			}
																		: entry,
																),
															)
														}
													/>
													<ToggleField
														checked={Boolean(action.openInNewTab)}
														label="Open in new tab"
														onChange={(checked) =>
															setEditableActions((current) =>
																current.map((entry) =>
																	entry.id === action.id
																		? {
																				...entry,
																				openInNewTab: checked,
																			}
																		: entry,
																),
															)
														}
													/>
												</div>
											</div>
										))
									)}
								</CardContent>
							</Card>
						</div>
					</div>
				</section>

				<section className="space-y-4">
					<div className="space-y-2">
						<h2 className="text-2xl font-semibold tracking-tight text-foreground">
							Code Examples
						</h2>
						<p className="max-w-3xl text-sm text-muted-foreground">
							Use the live snippet to mirror your current test case, then
							reference the examples below for minimal usage, composed dropdown
							patterns, and responsive page integration.
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

      <Menubar className="bg-background/80">
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

					<Card className="border-border/70 bg-background/90 shadow-sm">
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
									Confirm the concise API still covers text, image, and custom
									logo use cases cleanly.
								</p>
							</div>
							<div>
								<p className="font-medium text-foreground">Composition story</p>
								<p className="mt-1">
									Use the snippets to decide when the base navbar is enough and
									when surrounding UI primitives should take over.
								</p>
							</div>
						</CardContent>
					</Card>
				</section>
			</div>
		</main>
	);
}
