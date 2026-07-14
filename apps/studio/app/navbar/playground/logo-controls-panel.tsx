import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@anvilkit/ui/card";
import { Input } from "@anvilkit/ui/input";
import type { Dispatch, SetStateAction } from "react";
import {
	ControlField,
	type CustomLogoPreset,
	type LogoMode,
	selectClassName,
} from "../playground";

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

export function NavbarPlaygroundLogoControls({
	customLogoPreset,
	logoHref,
	logoImageUrl,
	logoMode,
	logoText,
	onCustomLogoPresetChange,
	onLogoHrefChange,
	onLogoImageUrlChange,
	onLogoModeChange,
	onLogoTextChange,
}: {
	customLogoPreset: CustomLogoPreset;
	logoHref: string;
	logoImageUrl: string;
	logoMode: LogoMode;
	logoText: string;
	onCustomLogoPresetChange: Dispatch<SetStateAction<CustomLogoPreset>>;
	onLogoHrefChange: Dispatch<SetStateAction<string>>;
	onLogoImageUrlChange: Dispatch<SetStateAction<string>>;
	onLogoModeChange: Dispatch<SetStateAction<LogoMode>>;
	onLogoTextChange: Dispatch<SetStateAction<string>>;
}) {
	return (
		<Card className="border-border/70 shadow-sm">
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
								onLogoModeChange(event.currentTarget.value as LogoMode)
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
							onChange={(event) => onLogoHrefChange(event.currentTarget.value)}
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
							logoMode === "image" ? "Image alt text / brand name" : "Logo text"
						}
					>
						<Input
							onChange={(event) => onLogoTextChange(event.currentTarget.value)}
							placeholder="Underline"
							value={logoText}
						/>
					</ControlField>

					{logoMode === "image" ? (
						<ControlField label="Image URL">
							<Input
								onChange={(event) =>
									onLogoImageUrlChange(event.currentTarget.value)
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
									onCustomLogoPresetChange(
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
							Text mode uses the logo string directly and keeps the prop surface
							fully serializable.
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
	);
}
