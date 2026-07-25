"use client";

/**
 * @file `ImageAdjustment` model helpers (PLAN-0020 CORE-P1B-010;
 * ED-IMAGE-001/002; DD-0019 §17).
 *
 * Pure normalization over the contract shape: crop rects and focal
 * positions live in normalized 0–1 source-image coordinates, rotation
 * quadrant-only. Adjustments are written to the component prop the
 * `ImageTarget.cropPropPath` declares (host storage/upload stays with
 * the host asset adapter — the established `plugin-asset-manager`
 * idiom); decorative mode writes an EMPTY alt string (never removes
 * the prop), which the a11y rule treats as an explicit choice when
 * `EditorPolicies.requireAltText` is off.
 */

import type { ImageAdjustment } from "@anvilkit/contracts/editor";

const clamp01 = (value: number): number =>
	Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

/** The identity adjustment (cover, centered focal, no crop). */
export function defaultImageAdjustment(): ImageAdjustment {
	return { fit: "cover", position: { x: 0.5, y: 0.5 } };
}

/**
 * Normalize an adjustment: clamp focal + crop into 0–1, drop
 * degenerate crops (zero area), snap rotation to quadrants.
 */
export function normalizeImageAdjustment(
	input: ImageAdjustment,
): ImageAdjustment {
	const position = {
		x: clamp01(input.position.x),
		y: clamp01(input.position.y),
	};
	let crop = input.crop;
	if (crop !== undefined) {
		const x = clamp01(crop.x);
		const y = clamp01(crop.y);
		const width = Math.min(clamp01(crop.width), 1 - x);
		const height = Math.min(clamp01(crop.height), 1 - y);
		crop = width <= 0 || height <= 0 ? undefined : { x, y, width, height };
	}
	const rotation =
		input.rotation === 90 || input.rotation === 180 || input.rotation === 270
			? input.rotation
			: input.rotation === 0
				? 0
				: undefined;
	return {
		fit: input.fit,
		position,
		...(crop !== undefined ? { crop } : {}),
		...(rotation !== undefined ? { rotation } : {}),
	};
}
