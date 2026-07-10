import type { ReactNode } from "react";

import type { StudioPluginOverlay, StudioPluginProvider } from "@/types/plugin";

export function composePluginProviders(
	providers: readonly StudioPluginProvider[],
	children: ReactNode,
): ReactNode {
	return providers.reduceRight<ReactNode>((wrapped, provider) => {
		const ProviderComponent = provider.component;
		return <ProviderComponent key={provider.id}>{wrapped}</ProviderComponent>;
	}, children);
}

export function splitOverlaysByPlacement(
	overlays: readonly StudioPluginOverlay[],
): {
	readonly viewport: readonly StudioPluginOverlay[];
	readonly canvas: readonly StudioPluginOverlay[];
	readonly notifications: readonly StudioPluginOverlay[];
} {
	const viewport: StudioPluginOverlay[] = [];
	const canvas: StudioPluginOverlay[] = [];
	const notifications: StudioPluginOverlay[] = [];
	for (const overlay of overlays) {
		if (overlay.placement === "viewport") viewport.push(overlay);
		else if (overlay.placement === "canvas") canvas.push(overlay);
		else if (overlay.placement === "notifications") notifications.push(overlay);
	}
	return { viewport, canvas, notifications };
}
