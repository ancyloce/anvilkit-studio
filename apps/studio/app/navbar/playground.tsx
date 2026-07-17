"use client";

import {
	type NavbarAction,
	type NavbarMenuItem,
	defaultProps as navbarDefaultProps,
} from "@anvilkit/navbar";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@anvilkit/ui/card";
import { cn } from "@anvilkit/ui/lib/utils";
import type { MouseEvent, ReactNode } from "react";
import { useState } from "react";
import { NavbarPlaygroundActionButtons } from "./playground/action-buttons-panel";
import { NavbarPlaygroundBasicDemo } from "./playground/basic-demo-section";
import { NavbarPlaygroundCodeExamples } from "./playground/code-examples-section";
import { NavbarPlaygroundIntro } from "./playground/intro-section";
import { NavbarPlaygroundLivePreview } from "./playground/live-preview-panel";
import { NavbarPlaygroundLogoControls } from "./playground/logo-controls-panel";
import { NavbarPlaygroundNavItems } from "./playground/nav-items-panel";

export type LogoMode = "text" | "image" | "custom";
export type CustomLogoPreset = "badge" | "monogram" | "stack";

export type EditableItem = NavbarMenuItem & {
	id: string;
};

export type EditableAction = NavbarAction & {
	id: string;
};

export const selectClassName =
	"flex h-8 w-full min-w-0 rounded-lg border border-input px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50";

const textareaClassName =
	"min-h-40 w-full rounded-2xl border border-border bg-primary px-4 py-4 text-sm leading-6 text-primary-foreground shadow-sm";

function createId(prefix: string) {
	return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function preventPreviewNavigation(event: MouseEvent<HTMLDivElement>) {
	const target = event.target;
	if (target instanceof HTMLElement && target.closest("a")) {
		event.preventDefault();
	}
}

export function createEditableItem(
	item?: Partial<NavbarMenuItem>,
): EditableItem {
	return {
		id: createId("item"),
		href: item?.href ?? "/new-link",
		label: item?.label ?? "New link",
	};
}

export function createEditableAction(
	action?: Partial<NavbarAction>,
): EditableAction {
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

export function ControlField({
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

export function ToggleField({
	checked,
	label,
	onChange,
}: {
	checked: boolean;
	label: string;
	onChange: (checked: boolean) => void;
}) {
	return (
		<label className="flex items-center gap-3 rounded-xl border border-border px-3 py-2 text-sm text-foreground">
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

export function CodeCard({
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

	return (
		<main className="min-h-screen">
			<div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
				<section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]">
					<NavbarPlaygroundIntro />
				</section>

				<NavbarPlaygroundBasicDemo
					defaultPreviewActions={defaultPreviewActions}
					preventPreviewNavigation={preventPreviewNavigation}
				/>

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
							<NavbarPlaygroundLivePreview
								active={active}
								items={items}
								logoHref={logoHref}
								logoImageUrl={logoImageUrl}
								logoMode={logoMode}
								logoNode={logoNode}
								logoText={logoText}
								preventPreviewNavigation={preventPreviewNavigation}
								previewActions={previewActions}
							/>
						</div>

						<div className="space-y-4">
							<NavbarPlaygroundLogoControls
								customLogoPreset={customLogoPreset}
								logoHref={logoHref}
								logoImageUrl={logoImageUrl}
								logoMode={logoMode}
								logoText={logoText}
								onCustomLogoPresetChange={setCustomLogoPreset}
								onLogoHrefChange={setLogoHref}
								onLogoImageUrlChange={setLogoImageUrl}
								onLogoModeChange={setLogoMode}
								onLogoTextChange={setLogoText}
							/>

							<NavbarPlaygroundNavItems
								active={active}
								editableItems={editableItems}
								onActiveChange={setActive}
								onEditableItemsChange={setEditableItems}
							/>

							<NavbarPlaygroundActionButtons
								editableActions={editableActions}
								onEditableActionsChange={setEditableActions}
							/>
						</div>
					</div>
				</section>

				<NavbarPlaygroundCodeExamples liveSnippet={liveSnippet} />
			</div>
		</main>
	);
}
