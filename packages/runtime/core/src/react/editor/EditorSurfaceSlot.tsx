"use client";

/**
 * @file `EditorSurfaceSlot` — the persistent host/plugin UI slot inside
 * the editor's provider tree (PLAN-0020 CORE-P3-008; DD-0019 §21.2).
 *
 * ### The gap this closes
 *
 * §21.2's proposal flow starts with "the AI extension … produces typed
 * commands". Core owned steps 3–6 (preview, review, confirm, undo)
 * but there was nowhere for a host or plugin to *render* the thing
 * that produces step 2, so the review dialog could never appear and
 * the acceptance scenario was unreachable in `apps/studio`. Every
 * existing seam is transient:
 *
 * - `StudioProps.headerEnd` lands inside `SystemMenuTrigger`'s
 *   `<Popover>` — lazy content that **unmounts when the popover
 *   closes**, destroying an in-flight review dialog;
 * - the sidebar panel seams (`registerCopilotPanel` and friends)
 *   unmount when their rail tab is not active;
 * - Puck `overrides` are merged into `<Puck>`, but the AnvilKit chrome
 *   replaces Puck's header, so those never render.
 *
 * So the gap was **host extensibility**, not AI. This slot is the fix:
 * a stable mount point that lives exactly as long as the editor
 * runtime, inside `StudioEditorBridgeContext`, so its children can use
 * `useStudioEditor()`, the command port, and selection.
 *
 * ### Bundle discipline (§28)
 *
 * Core renders thunks it was handed and imports nothing itself — an
 * AI plugin's code enters the graph only through the host's own
 * import, never through the `<Studio>` entry chunk. This module is
 * reached only from `StudioEditorMount`'s enabled branch.
 *
 * ### Failure isolation
 *
 * A surface that throws must not take the editor down with it, so
 * each one renders inside its own error boundary. A crashed surface
 * disappears; the editor keeps working.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";
import { useSidebarRegistryStoreApiOrNull } from "../../state/sidebar-registry/SidebarRegistryProvider.js";
import { useSidebarRegistry } from "../../state/sidebar-registry/use-sidebar-registry.js";
import type { StudioEditorSurface } from "../../types/sidebar.js";

/** Props for {@link EditorSurfaceSlot}. */
export interface EditorSurfaceSlotProps {
	/**
	 * The host node from `StudioProps.editorSlot`, rendered before any
	 * plugin-contributed surface.
	 */
	readonly hostSlot?: ReactNode;
}

interface BoundaryProps {
	readonly surfaceId: string;
	readonly children: ReactNode;
}

interface BoundaryState {
	readonly crashed: boolean;
}

/**
 * Per-surface error boundary. A class component because React has no
 * hook equivalent; deliberately silent in the tree (renders `null`)
 * and loud in the console, matching how the chrome treats a plugin
 * surface that misbehaves.
 */
class SurfaceBoundary extends Component<BoundaryProps, BoundaryState> {
	override state: BoundaryState = { crashed: false };

	static getDerivedStateFromError(): BoundaryState {
		return { crashed: true };
	}

	override componentDidCatch(error: unknown, info: ErrorInfo): void {
		console.error(
			`[studio] editor surface "${this.props.surfaceId}" crashed and was unmounted.`,
			error,
			info.componentStack,
		);
	}

	override render(): ReactNode {
		return this.state.crashed ? null : this.props.children;
	}
}

/** Render one registered surface behind its own boundary. */
function Surface({ surface }: { surface: StudioEditorSurface }): ReactNode {
	const Render = surface.render;
	return (
		<SurfaceBoundary surfaceId={surface.id}>
			<Render />
		</SurfaceBoundary>
	);
}

/**
 * Plugin-registered surfaces. Split out so the registry hooks are only
 * called when a provider actually exists — `StudioEditorMount` is used
 * standalone in tests and in hosts without the AnvilKit chrome.
 */
function PluginSurfaces(): ReactNode {
	const surfaces = useSidebarRegistry((state) => state.editorSurfaces);
	if (surfaces.size === 0) {
		return null;
	}
	return (
		<>
			{[...surfaces.values()].map((surface) => (
				<Surface key={surface.id} surface={surface} />
			))}
		</>
	);
}

/**
 * The persistent slot: the host node, then every plugin-registered
 * surface. Renders no wrapper element — positioning belongs to the
 * surface, which is expected to portal or absolutely position its own
 * chrome.
 */
export function EditorSurfaceSlot({
	hostSlot,
}: EditorSurfaceSlotProps): ReactNode {
	// `OrNull` because the editor mount is also used outside the
	// AnvilKit chrome's provider stack (unit tests, `chrome="puck"`
	// hosts that opt into the editor runtime directly).
	const hasRegistry = useSidebarRegistryStoreApiOrNull() !== null;
	return (
		<>
			{hostSlot === undefined ? null : (
				<SurfaceBoundary surfaceId="host">{hostSlot}</SurfaceBoundary>
			)}
			{hasRegistry ? <PluginSurfaces /> : null}
		</>
	);
}
