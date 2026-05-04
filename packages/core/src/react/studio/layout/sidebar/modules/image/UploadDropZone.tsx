/**
 * @file Drag-and-drop overlay for the `image` module body (PRD §7.4).
 *
 * Wraps the asset grid and listens for drag events at the panel root.
 * On drag-over the overlay covers the body with a token-aware accent
 * border + the `studio.module.image.upload.dropZone` copy. Drops are
 * forwarded to a parent-supplied `onDrop` handler that owns the upload
 * pipeline.
 */

import {
	type DragEvent,
	type ReactNode,
	useCallback,
	useRef,
	useState,
} from "react";

import { useMsg } from "../../../../state/editor-i18n-store.js";

export interface UploadDropZoneProps {
	readonly onDrop: (files: readonly File[]) => void;
	readonly children: ReactNode;
	readonly disabled?: boolean;
}

export function UploadDropZone({
	onDrop,
	children,
	disabled,
}: UploadDropZoneProps): ReactNode {
	const msg = useMsg();
	const [active, setActive] = useState(false);
	// Tracks how deep we are inside the dragenter/dragleave hierarchy so
	// the overlay does not flicker when the cursor crosses a nested
	// element boundary inside the panel body.
	const depthRef = useRef(0);

	const handleDragEnter = useCallback(
		(event: DragEvent<HTMLDivElement>) => {
			if (disabled === true) return;
			if (!hasFiles(event)) return;
			event.preventDefault();
			depthRef.current += 1;
			setActive(true);
		},
		[disabled],
	);

	const handleDragOver = useCallback(
		(event: DragEvent<HTMLDivElement>) => {
			if (disabled === true) return;
			if (!hasFiles(event)) return;
			event.preventDefault();
			event.dataTransfer.dropEffect = "copy";
		},
		[disabled],
	);

	const handleDragLeave = useCallback(() => {
		if (disabled === true) return;
		depthRef.current = Math.max(0, depthRef.current - 1);
		if (depthRef.current === 0) setActive(false);
	}, [disabled]);

	const handleDrop = useCallback(
		(event: DragEvent<HTMLDivElement>) => {
			if (disabled === true) return;
			event.preventDefault();
			depthRef.current = 0;
			setActive(false);
			const files = Array.from(event.dataTransfer.files);
			if (files.length === 0) return;
			onDrop(files);
		},
		[disabled, onDrop],
	);

	return (
		<div
			className="relative h-full min-h-0"
			onDragEnter={handleDragEnter}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
		>
			{children}
			{active ? (
				<div
					data-testid="ak-image-dropzone-overlay"
					className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md border-2 border-dashed border-[var(--ak-studio-accent)] bg-[var(--ak-studio-panel)]/85 backdrop-blur-sm"
				>
					<p className="text-sm font-medium text-[var(--ak-studio-fg)]">
						{msg("studio.module.image.upload.dropZone")}
					</p>
				</div>
			) : null}
		</div>
	);
}

function hasFiles(event: DragEvent): boolean {
	if (event.dataTransfer === null) return false;
	const types = event.dataTransfer.types;
	if (typeof types?.includes === "function") return types.includes("Files");
	return Array.from(types ?? []).includes("Files");
}
