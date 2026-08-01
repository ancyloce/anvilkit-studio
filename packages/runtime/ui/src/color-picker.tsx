"use client";

import { Pipette, RotateCcw } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
	type KeyboardEvent,
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useEffect,
	useId,
	useLayoutEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";

type Hsv = { h: number; s: number; v: number };

const EASE = [0.23, 1, 0.32, 1] as const;
const DISC_RADIUS = 84;
const THUMB_INSET = 9;
const POPOVER_WIDTH = 188;

const WHEEL_W = 180;
const WHEEL_CX = WHEEL_W / 2;
const WHEEL_CY = DISC_RADIUS;
const BAND_STROKE = 14;
const BAND_R = DISC_RADIUS + 6 + BAND_STROKE / 2;
const BAND_HALF_SPAN = (42 * Math.PI) / 180;
const BAND_ANG_LEFT = Math.PI / 2 + BAND_HALF_SPAN;
const BAND_ANG_RIGHT = Math.PI / 2 - BAND_HALF_SPAN;
const WHEEL_H = WHEEL_CY + BAND_R + THUMB_INSET + 2;

const clamp = (value: number, min: number, max: number) =>
	Math.min(Math.max(value, min), max);

function normalizeHex(input: string): string | null {
	const raw = input.trim().replace(/^#/, "").toLowerCase();
	if (/^[0-9a-f]{6}$/.test(raw)) return `#${raw}`;
	if (/^[0-9a-f]{3}$/.test(raw)) {
		return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`;
	}
	return null;
}

/**
 * Host-injectable eyedropper. Resolves to a hex color, or `null` when the user
 * cancelled. Lets an app supply its own picker (or a test double) instead of
 * the Chromium-only platform `EyeDropper`.
 */
export type ColorEyeDropper = () => Promise<string | null>;

/** Split `#rrggbb` into 0-255 channels. Returns null for anything else. */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
	const normalized = normalizeHex(hex);
	if (!normalized) return null;
	return {
		r: parseInt(normalized.slice(1, 3), 16),
		g: parseInt(normalized.slice(3, 5), 16),
		b: parseInt(normalized.slice(5, 7), 16),
	};
}

function rgbToHex(r: number, g: number, b: number): string {
	const channel = (n: number) =>
		Math.round(clamp(n, 0, 255))
			.toString(16)
			.padStart(2, "0");
	return `#${channel(r)}${channel(g)}${channel(b)}`;
}

const K1 = 0.206;
const K2 = 0.03;
const K3 = (1 + K1) / (1 + K2);

const toe = (x: number) =>
	0.5 * (K3 * x - K1 + Math.sqrt((K3 * x - K1) ** 2 + 4 * K2 * K3 * x));

const toeInv = (x: number) => (x * x + K1 * x) / (K3 * (x + K2));

const srgbTransfer = (x: number) =>
	x >= 0.0031308 ? 1.055 * Math.pow(x, 1 / 2.4) - 0.055 : 12.92 * x;

const srgbTransferInv = (x: number) =>
	x >= 0.04045 ? Math.pow((x + 0.055) / 1.055, 2.4) : x / 12.92;

function oklabToLinearSrgb(
	L: number,
	a: number,
	b: number,
): [number, number, number] {
	const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
	return [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
	];
}

function linearSrgbToOklab(
	r: number,
	g: number,
	b: number,
): [number, number, number] {
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	return [
		0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
	];
}

function computeMaxSaturation(a: number, b: number): number {
	let k0: number, k1: number, k2: number, k3: number, k4: number;
	let wl: number, wm: number, ws: number;
	if (-1.88170328 * a - 0.80936493 * b > 1) {
		k0 = 1.19086277;
		k1 = 1.76576728;
		k2 = 0.59662641;
		k3 = 0.75515197;
		k4 = 0.56771245;
		wl = 4.0767416621;
		wm = -3.3077115913;
		ws = 0.2309699292;
	} else if (1.81444104 * a - 1.19445276 * b > 1) {
		k0 = 0.73956515;
		k1 = -0.45954404;
		k2 = 0.08285427;
		k3 = 0.1254107;
		k4 = 0.14503204;
		wl = -1.2684380046;
		wm = 2.6097574011;
		ws = -0.3413193965;
	} else {
		k0 = 1.35733652;
		k1 = -0.00915799;
		k2 = -1.1513021;
		k3 = -0.50559606;
		k4 = 0.00692167;
		wl = -0.0041960863;
		wm = -0.7034186147;
		ws = 1.707614701;
	}
	let S = k0 + k1 * a + k2 * b + k3 * a * a + k4 * a * b;
	const kl = 0.3963377774 * a + 0.2158037573 * b;
	const km = -0.1055613458 * a - 0.0638541728 * b;
	const ks = -0.0894841775 * a - 1.291485548 * b;
	const l_ = 1 + S * kl;
	const m_ = 1 + S * km;
	const s_ = 1 + S * ks;
	const f = wl * l_ ** 3 + wm * m_ ** 3 + ws * s_ ** 3;
	const f1 = 3 * (wl * kl * l_ ** 2 + wm * km * m_ ** 2 + ws * ks * s_ ** 2);
	const f2 = 6 * (wl * kl * kl * l_ + wm * km * km * m_ + ws * ks * ks * s_);
	S -= (f * f1) / (f1 * f1 - 0.5 * f * f2);
	return S;
}

function findCusp(a: number, b: number): [number, number] {
	const sCusp = computeMaxSaturation(a, b);
	const [r, g, bb] = oklabToLinearSrgb(1, sCusp * a, sCusp * b);
	const lCusp = Math.cbrt(1 / Math.max(r, g, bb));
	return [lCusp, lCusp * sCusp];
}

const CUSP_BINS = 1024;
const cuspCache = new Float64Array(CUSP_BINS * 2);
const cuspSeen = new Uint8Array(CUSP_BINS);

function cuspForHue(h: number): [number, number] {
	const bin = Math.min(
		CUSP_BINS - 1,
		Math.floor((((h % 1) + 1) % 1) * CUSP_BINS),
	);
	if (!cuspSeen[bin]) {
		const angle = (2 * Math.PI * (bin + 0.5)) / CUSP_BINS;
		const [lCusp, cCusp] = findCusp(Math.cos(angle), Math.sin(angle));
		cuspCache[bin * 2] = lCusp;
		cuspCache[bin * 2 + 1] = cCusp;
		cuspSeen[bin] = 1;
	}
	return [cuspCache[bin * 2] ?? 0, cuspCache[bin * 2 + 1] ?? 0];
}

const S0 = 0.5;

function okhsvToLinearSrgb(
	h: number,
	s: number,
	v: number,
	cusp?: [number, number],
): [number, number, number] {
	if (v <= 0) return [0, 0, 0];
	const a_ = Math.cos(2 * Math.PI * h);
	const b_ = Math.sin(2 * Math.PI * h);
	const [cuspL, cuspC] = cusp ?? findCusp(a_, b_);
	const sMax = cuspC / cuspL;
	const tMax = cuspC / (1 - cuspL);
	const k = 1 - S0 / sMax;
	const denom = S0 + tMax - tMax * k * s;
	const lV = 1 - (s * S0) / denom;
	const cV = (s * tMax * S0) / denom;
	let L = v * lV;
	let C = v * cV;
	const lVt = toeInv(lV);
	const cVt = (cV * lVt) / lV;
	const lNew = toeInv(L);
	C = (C * lNew) / L;
	L = lNew;
	const [rs, gs, bs] = oklabToLinearSrgb(lVt, a_ * cVt, b_ * cVt);
	const scaleL = Math.cbrt(1 / Math.max(rs, gs, bs, 0));
	L *= scaleL;
	C *= scaleL;
	return oklabToLinearSrgb(L, C * a_, C * b_);
}

function hsvToHex({ h, s, v }: Hsv): string {
	const rgb = okhsvToLinearSrgb(h / 360, s / 100, v / 100);
	const channel = (x: number) =>
		Math.round(clamp(srgbTransfer(x), 0, 1) * 255)
			.toString(16)
			.padStart(2, "0");
	return `#${channel(rgb[0])}${channel(rgb[1])}${channel(rgb[2])}`;
}

function hexToHsv(hex: string): Hsv {
	const value = parseInt(hex.slice(1), 16);
	const r = srgbTransferInv(((value >> 16) & 255) / 255);
	const g = srgbTransferInv(((value >> 8) & 255) / 255);
	const b = srgbTransferInv((value & 255) / 255);
	const [L, labA, labB] = linearSrgbToOklab(r, g, b);
	if (L <= 1e-6) return { h: 0, s: 0, v: 0 };
	const C = Math.hypot(labA, labB);
	if (C < 1e-6) return { h: 0, s: 0, v: clamp(toe(L), 0, 1) * 100 };
	const a_ = labA / C;
	const b_ = labB / C;
	const h = (Math.atan2(labB, labA) / (2 * Math.PI) + 1) % 1;
	const [cuspL, cuspC] = findCusp(a_, b_);
	const sMax = cuspC / cuspL;
	const tMax = cuspC / (1 - cuspL);
	const k = 1 - S0 / sMax;
	const t = tMax / (C + L * tMax);
	const lV = t * L;
	const cV = t * C;
	const lVt = toeInv(lV);
	const cVt = (cV * lVt) / lV;
	const [rs, gs, bs] = oklabToLinearSrgb(lVt, a_ * cVt, b_ * cVt);
	const scaleL = Math.cbrt(1 / Math.max(rs, gs, bs, 0));
	const toeL = toe(L / scaleL);
	const v = toeL / lV;
	const s = ((S0 + tMax) * cV) / (tMax * S0 + tMax * k * cV);
	return {
		h: h * 360,
		s: clamp(s, 0, 1) * 100,
		v: clamp(v, 0, 1) * 100,
	};
}

const THUMB_SHADOW = "0 0 0 1px rgba(0,0,0,0.14), 0 1px 3px rgba(0,0,0,0.25)";

function ColorDisc({
	hsv,
	onChange,
}: {
	hsv: Hsv;
	onChange: (next: Hsv) => void;
}) {
	const discRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [dragging, setDragging] = useState(false);
	const reachRadius = DISC_RADIUS - THUMB_INSET;

	useEffect(() => {
		const canvas = canvasRef.current;
		const ctx = canvas?.getContext("2d");
		if (!canvas || !ctx) return;
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		const size = Math.round(DISC_RADIUS * 2 * dpr);
		canvas.width = size;
		canvas.height = size;
		const image = ctx.createImageData(size, size);
		const data = image.data;
		const center = size / 2;
		const reach = (DISC_RADIUS - THUMB_INSET) * dpr;
		for (let y = 0; y < size; y++) {
			for (let x = 0; x < size; x++) {
				const dx = x + 0.5 - center;
				const dy = y + 0.5 - center;
				const h = (Math.atan2(dy, dx) / (2 * Math.PI) + 1.25) % 1;
				const s = clamp(Math.hypot(dx, dy) / reach, 0, 1);
				const rgb = okhsvToLinearSrgb(h, s, 1, cuspForHue(h));
				const i = (y * size + x) * 4;
				data[i] = Math.round(clamp(srgbTransfer(rgb[0]), 0, 1) * 255);
				data[i + 1] = Math.round(clamp(srgbTransfer(rgb[1]), 0, 1) * 255);
				data[i + 2] = Math.round(clamp(srgbTransfer(rgb[2]), 0, 1) * 255);
				data[i + 3] = 255;
			}
		}
		const layer = document.createElement("canvas");
		layer.width = size;
		layer.height = size;
		layer.getContext("2d")?.putImageData(image, 0, 0);
		ctx.filter = `blur(${5 * dpr}px)`;
		ctx.drawImage(layer, 0, 0);
		ctx.filter = "none";
		ctx.globalCompositeOperation = "destination-in";
		ctx.beginPath();
		ctx.arc(center, center, center - 0.5, 0, Math.PI * 2);
		ctx.fill();
		ctx.globalCompositeOperation = "source-over";
	}, []);

	const fromPointer = useCallback(
		(clientX: number, clientY: number) => {
			const rect = discRef.current?.getBoundingClientRect();
			if (!rect) return;
			const dx = clientX - rect.left - DISC_RADIUS;
			const dy = clientY - rect.top - DISC_RADIUS;
			const h = ((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360;
			const s = clamp(Math.hypot(dx, dy) / reachRadius, 0, 1) * 100;
			onChange({ ...hsv, h, s });
		},
		[hsv, onChange, reachRadius],
	);

	const handlePointerDown = (e: ReactPointerEvent) => {
		e.preventDefault();
		try {
			discRef.current?.setPointerCapture(e.pointerId);
		} catch {}
		setDragging(true);
		fromPointer(e.clientX, e.clientY);
	};

	const handlePointerMove = (e: ReactPointerEvent) => {
		if (!dragging) return;
		if (e.pointerType === "mouse" && e.buttons === 0) {
			setDragging(false);
			return;
		}
		fromPointer(e.clientX, e.clientY);
	};

	const handleKeyDown = (e: KeyboardEvent) => {
		let dh = 0;
		let ds = 0;
		if (e.key === "ArrowRight") dh = 2;
		else if (e.key === "ArrowLeft") dh = -2;
		else if (e.key === "ArrowUp") ds = 2;
		else if (e.key === "ArrowDown") ds = -2;
		else return;
		e.preventDefault();
		onChange({
			...hsv,
			h: (hsv.h + dh + 360) % 360,
			s: clamp(hsv.s + ds, 0, 100),
		});
	};

	const angle = ((hsv.h - 90) * Math.PI) / 180;
	const radius = (hsv.s / 100) * reachRadius;
	const thumbX = DISC_RADIUS + radius * Math.cos(angle);
	const thumbY = DISC_RADIUS + radius * Math.sin(angle);

	return (
		<div
			ref={discRef}
			role="slider"
			aria-label="Hue and saturation"
			aria-valuemin={0}
			aria-valuemax={360}
			aria-valuenow={Math.round(hsv.h)}
			aria-valuetext={`Hue ${Math.round(hsv.h)} degrees, saturation ${Math.round(hsv.s)}%`}
			tabIndex={0}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={() => setDragging(false)}
			onPointerCancel={() => setDragging(false)}
			onLostPointerCapture={() => setDragging(false)}
			onKeyDown={handleKeyDown}
			className="relative mx-auto cursor-pointer rounded-full outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
			style={{
				width: DISC_RADIUS * 2,
				height: DISC_RADIUS * 2,
				touchAction: "none",
			}}
		>
			<canvas
				ref={canvasRef}
				aria-hidden
				className="pointer-events-none absolute inset-0 size-full rounded-full ring-1 ring-foreground/10 ring-inset"
			/>
			<div
				className="pointer-events-none absolute size-4 rounded-full border-2 border-white transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none"
				style={{
					left: thumbX,
					top: thumbY,
					background: hsvToHex(hsv),
					boxShadow: THUMB_SHADOW,
					transform: `translate(-50%, -50%) scale(${dragging ? 1.25 : 1})`,
				}}
			/>
		</div>
	);
}

function bandPoint(t: number) {
	const angle = BAND_ANG_LEFT + t * (BAND_ANG_RIGHT - BAND_ANG_LEFT);
	return {
		x: WHEEL_CX + BAND_R * Math.cos(angle),
		y: WHEEL_CY + BAND_R * Math.sin(angle),
	};
}

function BrightnessBand({
	hsv,
	onChange,
}: {
	hsv: Hsv;
	onChange: (next: Hsv) => void;
}) {
	const svgRef = useRef<SVGSVGElement>(null);
	const [dragging, setDragging] = useState(false);
	const gradientId = useId();

	const fromPointer = useCallback(
		(clientX: number, clientY: number) => {
			const rect = svgRef.current?.getBoundingClientRect();
			if (!rect) return;
			const dx = clientX - rect.left - WHEEL_CX;
			const dy = clientY - rect.top - WHEEL_CY;
			let angle = Math.atan2(dy, dx);
			if (angle < -Math.PI / 2) angle += Math.PI * 2;
			const t = clamp(
				(BAND_ANG_LEFT - angle) / (BAND_ANG_LEFT - BAND_ANG_RIGHT),
				0,
				1,
			);
			onChange({ ...hsv, v: t * 100 });
		},
		[hsv, onChange],
	);

	const handlePointerDown = (e: ReactPointerEvent) => {
		e.preventDefault();
		try {
			svgRef.current?.setPointerCapture(e.pointerId);
		} catch {}
		setDragging(true);
		fromPointer(e.clientX, e.clientY);
	};

	const handlePointerMove = (e: ReactPointerEvent) => {
		if (!dragging) return;
		if (e.pointerType === "mouse" && e.buttons === 0) {
			setDragging(false);
			return;
		}
		fromPointer(e.clientX, e.clientY);
	};

	const handleKeyDown = (e: KeyboardEvent<SVGElement>) => {
		let delta = 0;
		if (e.key === "ArrowRight" || e.key === "ArrowUp") delta = 2;
		else if (e.key === "ArrowLeft" || e.key === "ArrowDown") delta = -2;
		else if (e.key === "PageUp") delta = 10;
		else if (e.key === "PageDown") delta = -10;
		else if (e.key === "Home") delta = -hsv.v;
		else if (e.key === "End") delta = 100 - hsv.v;
		else return;
		e.preventDefault();
		onChange({ ...hsv, v: clamp(hsv.v + delta, 0, 100) });
	};

	const left = bandPoint(0);
	const right = bandPoint(1);
	const bandPath = `M ${left.x} ${left.y} A ${BAND_R} ${BAND_R} 0 0 0 ${right.x} ${right.y}`;
	const thumb = bandPoint(hsv.v / 100);

	return (
		<svg
			ref={svgRef}
			role="slider"
			aria-label="Brightness"
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={Math.round(hsv.v)}
			tabIndex={0}
			viewBox={`0 0 ${WHEEL_W} ${WHEEL_H}`}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={() => setDragging(false)}
			onPointerCancel={() => setDragging(false)}
			onLostPointerCapture={() => setDragging(false)}
			onKeyDown={handleKeyDown}
			className="absolute inset-0 cursor-pointer rounded-2xl outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
			style={{
				width: WHEEL_W,
				height: WHEEL_H,
				touchAction: "none",
				pointerEvents: "none",
			}}
		>
			<defs>
				<linearGradient
					id={gradientId}
					gradientUnits="userSpaceOnUse"
					x1={left.x}
					y1={left.y}
					x2={right.x}
					y2={right.y}
				>
					<stop offset="0" stopColor="#000" />
					<stop offset="1" stopColor="#fff" />
				</linearGradient>
			</defs>
			<path
				d={bandPath}
				fill="none"
				strokeWidth={BAND_STROKE + 2}
				strokeLinecap="round"
				className="stroke-foreground/15"
			/>
			<path
				d={bandPath}
				fill="none"
				stroke={`url(#${gradientId})`}
				strokeWidth={BAND_STROKE}
				strokeLinecap="round"
				style={{ pointerEvents: "stroke" }}
			/>
			<path
				d={bandPath}
				fill="none"
				stroke="transparent"
				strokeWidth={BAND_STROKE + 10}
				strokeLinecap="round"
				style={{ pointerEvents: "stroke" }}
			/>
			<circle
				cx={thumb.x}
				cy={thumb.y}
				r={dragging ? 9 : 7.5}
				fill={hsvToHex({ h: hsv.h, s: 0, v: hsv.v })}
				stroke="#fff"
				strokeWidth={2}
				style={{
					pointerEvents: "none",
					transition: "r 150ms cubic-bezier(0.23, 1, 0.32, 1)",
					filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.35))",
				}}
			/>
		</svg>
	);
}

const emptySubscribe = () => () => {};

interface EyeDropperConstructor {
	new (): { open(): Promise<{ sRGBHex: string }> };
}

function useEyeDropper(): EyeDropperConstructor | null {
	return useSyncExternalStore(
		emptySubscribe,
		() => (window as { EyeDropper?: EyeDropperConstructor }).EyeDropper ?? null,
		() => null,
	);
}

function ColorPopover({
	id,
	anchorRef,
	value,
	onValueChange,
	onClose,
	eyeDropper: eyeDropperAdapter,
	rgb = false,
	testId,
}: {
	id: string;
	anchorRef: React.RefObject<HTMLButtonElement | null>;
	value: string;
	onValueChange: (hex: string) => void;
	/**
	 * `"cancel"` when dismissed with Escape (host should revert), `"commit"` for
	 * every other dismissal. Hosts that treat open-popover changes as a live
	 * preview use this to learn when a value became final.
	 */
	onClose: (reason: "commit" | "cancel") => void;
	eyeDropper?: ColorEyeDropper;
	/** Show R/G/B 0-255 inputs beneath the hex field. */
	rgb?: boolean;
	testId?: string;
}) {
	const popRef = useRef<HTMLDivElement>(null);
	const [pos, setPos] = useState<{
		top: number;
		left: number;
		origin: string;
	} | null>(null);
	const shouldReduceMotion = useReducedMotion();
	const platformEyeDropper = useEyeDropper();
	const eyeDropper: ColorEyeDropper | null =
		eyeDropperAdapter ??
		(platformEyeDropper
			? () =>
					new platformEyeDropper()
						.open()
						.then((result) => result.sRGBHex)
						.catch(() => null)
			: null);

	const initial = normalizeHex(value) ?? "#ffffff";
	const [state, setState] = useState<{
		hsv: Hsv;
		draft: string;
		/** Last `value` PROP consumed — the baseline an external edit differs from. */
		seen: string;
		/** Last hex this popover emitted — an echo of it is not an external edit. */
		emitted: string;
	}>(() => ({
		hsv: hexToHsv(initial),
		draft: initial,
		seen: initial,
		emitted: initial,
	}));

	// Adopt an EXTERNAL change to `value`. `seen` deliberately tracks the prop and
	// not our own output: hosts that treat an open popover as a live preview never
	// feed `value` back, so writing our emitted hex here would make the unchanged
	// prop read as "changed back" and reset the wheel on every pointer move.
	const incoming = normalizeHex(value);
	if (incoming && incoming !== state.seen) {
		setState((prev) =>
			incoming === prev.emitted
				? // A host echoing our own last emission: bank it as seen, but keep the
					// live HSV — re-deriving it from hex round-trips through a lossy
					// conversion and nudges the thumb mid-drag.
					{ ...prev, seen: incoming }
				: {
						hsv: hexToHsv(incoming),
						draft: incoming,
						seen: incoming,
						emitted: incoming,
					},
		);
	}

	const apply = (next: Hsv) => {
		const hex = hsvToHex(next);
		setState((prev) => ({ ...prev, hsv: next, draft: hex, emitted: hex }));
		onValueChange(hex);
	};

	const commitDraft = () => {
		const hex = normalizeHex(state.draft);
		if (hex && hex !== hsvToHex(state.hsv)) {
			apply(hexToHsv(hex));
		} else {
			setState((prev) => ({ ...prev, draft: hsvToHex(prev.hsv) }));
		}
	};

	const place = useCallback(() => {
		const anchor = anchorRef.current;
		const pop = popRef.current;
		if (!anchor || !pop) return;
		const rect = anchor.getBoundingClientRect();
		const height = pop.offsetHeight;
		const left = clamp(
			rect.right - POPOVER_WIDTH,
			8,
			window.innerWidth - POPOVER_WIDTH - 8,
		);
		let top = rect.bottom + 8;
		let origin = "top right";
		if (top + height > window.innerHeight - 8) {
			top = Math.max(8, rect.top - 8 - height);
			origin = "bottom right";
		}
		setPos({ top, left, origin });
	}, [anchorRef]);

	useLayoutEffect(() => {
		place();
	}, [place]);

	useEffect(() => {
		window.addEventListener("resize", place);
		window.addEventListener("scroll", place, true);
		return () => {
			window.removeEventListener("resize", place);
			window.removeEventListener("scroll", place, true);
		};
	}, [place]);

	useEffect(() => {
		popRef.current?.focus({ preventScroll: true });
	}, []);

	useEffect(() => {
		const handleDown = (e: PointerEvent) => {
			const target = e.target as Node;
			if (
				!popRef.current?.contains(target) &&
				!anchorRef.current?.contains(target)
			) {
				onClose("commit");
			}
		};
		document.addEventListener("pointerdown", handleDown);
		return () => document.removeEventListener("pointerdown", handleDown);
	}, [anchorRef, onClose]);

	return createPortal(
		<motion.div
			ref={popRef}
			id={id}
			role="dialog"
			aria-label="Color picker"
			tabIndex={-1}
			initial={
				shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.82 }
			}
			animate={{ opacity: 1, scale: 1 }}
			exit={
				shouldReduceMotion
					? { opacity: 0, transition: { duration: 0.12 } }
					: {
							opacity: 0,
							scale: 0.9,
							transition: { duration: 0.14, ease: EASE },
						}
			}
			transition={{ type: "spring", duration: 0.4, bounce: 0 }}
			onKeyDown={(e) => {
				if (e.key === "Escape") {
					e.stopPropagation();
					onClose("cancel");
				}
			}}
			className="fixed z-50 flex flex-col gap-2 rounded-t-[94px] rounded-b-2xl border border-border/60 bg-popover/95 px-3 pt-2.5 pb-3 shadow-xl backdrop-blur-xl outline-none"
			style={{
				width: POPOVER_WIDTH,
				top: pos?.top ?? -9999,
				left: pos?.left ?? -9999,
				transformOrigin: pos?.origin,
			}}
		>
			<div
				className="relative -mx-2"
				style={{ width: WHEEL_W, height: WHEEL_H }}
			>
				<motion.div
					initial={
						shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.85 }
					}
					animate={{ opacity: 1, scale: 1 }}
					transition={{
						type: "spring",
						duration: 0.45,
						bounce: 0,
						delay: 0.05,
					}}
					className="absolute inset-x-0 top-0"
					style={{ height: DISC_RADIUS * 2 }}
				>
					<ColorDisc hsv={state.hsv} onChange={apply} />
				</motion.div>
				<div
					className="pointer-events-none absolute inset-0"
					style={{
						WebkitMaskImage: `radial-gradient(circle at ${WHEEL_CX}px ${WHEEL_CY}px, transparent ${DISC_RADIUS}px, black ${DISC_RADIUS + 1}px)`,
						maskImage: `radial-gradient(circle at ${WHEEL_CX}px ${WHEEL_CY}px, transparent ${DISC_RADIUS}px, black ${DISC_RADIUS + 1}px)`,
					}}
				>
					<motion.div
						initial={
							shouldReduceMotion ? { opacity: 0 } : { y: -18, scale: 0.85 }
						}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						transition={{
							type: "spring",
							duration: 0.5,
							bounce: 0,
							delay: 0.16,
						}}
						className="pointer-events-none absolute inset-0"
					>
						<BrightnessBand hsv={state.hsv} onChange={apply} />
					</motion.div>
				</div>
			</div>
			<div className="flex items-center gap-1.5">
				<input
					type="text"
					value={state.draft}
					onChange={(e) =>
						setState((prev) => ({ ...prev, draft: e.target.value }))
					}
					onBlur={commitDraft}
					onKeyDown={(e) => {
						if (e.key === "Enter") e.currentTarget.blur();
					}}
					aria-label="Hex color"
					data-testid={testId ? `${testId}-hex` : undefined}
					spellCheck={false}
					autoComplete="off"
					className="h-7 w-full min-w-0 rounded-md bg-muted/70 px-2 text-[12px] font-medium text-foreground/90 outline-none transition-colors hover:bg-muted focus:bg-muted"
					style={{ fontVariantNumeric: "tabular-nums" }}
				/>
				{eyeDropper && (
					<button
						type="button"
						aria-label="Pick a color from the screen"
						title="Pick a color from the screen"
						data-testid={testId ? `${testId}-eyedropper` : undefined}
						onClick={() => {
							void eyeDropper().then((picked) => {
								const hex = picked ? normalizeHex(picked) : null;
								if (hex) apply(hexToHsv(hex));
							});
						}}
						className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md bg-muted/70 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					>
						<Pipette aria-hidden className="size-3.5" />
					</button>
				)}
			</div>
			{rgb ? (
				<div className="flex items-center gap-1">
					{(["r", "g", "b"] as const).map((channel) => {
						const channels = hexToRgb(hsvToHex(state.hsv)) ?? {
							r: 0,
							g: 0,
							b: 0,
						};
						return (
							<input
								key={channel}
								type="number"
								min={0}
								max={255}
								step={1}
								value={channels[channel]}
								aria-label={`${channel.toUpperCase()} channel`}
								data-testid={testId ? `${testId}-${channel}` : undefined}
								onChange={(e) => {
									const n = Number(e.currentTarget.value);
									if (!Number.isFinite(n)) return;
									const next = { ...channels, [channel]: n };
									const hex = normalizeHex(rgbToHex(next.r, next.g, next.b));
									if (hex) apply(hexToHsv(hex));
								}}
								className="h-6 w-full min-w-0 rounded-md bg-muted/70 px-1 text-center text-[11px] text-foreground/90 outline-none transition-colors hover:bg-muted focus:bg-muted"
								style={{ fontVariantNumeric: "tabular-nums" }}
							/>
						);
					})}
				</div>
			) : null}
		</motion.div>,
		document.body,
	);
}

export function ColorRow({
	label,
	value,
	onValueChange,
	displayValue,
	onReset,
	onCommit,
	onCancel,
	eyeDropper,
	rgb = false,
	compact = false,
	swatchStyle,
	disabled = false,
	"data-testid": dataTestId,
}: {
	label: string;
	value: string;
	/**
	 * Fires on EVERY change while the popover is open, including each pointer
	 * move across the disc. Hosts with an undo stack should treat this as a live
	 * preview and use {@link onCommit} for the final value.
	 */
	onValueChange: (value: string) => void;
	/** Text shown instead of the hex value, e.g. "Auto". */
	displayValue?: string;
	/** When set, shows a reset icon that reverts the row. */
	onReset?: () => void;
	/** Popover dismissed by any means other than Escape — the value is final. */
	onCommit?: (value: string) => void;
	/** Popover dismissed with Escape — the host should revert to its pre-edit value. */
	onCancel?: () => void;
	/** Host-supplied eyedropper; falls back to the platform `EyeDropper`. */
	eyeDropper?: ColorEyeDropper;
	/** Show R/G/B 0-255 inputs in the popover. */
	rgb?: boolean;
	/** Swatch-only, for compact hosts (toolbars) that supply their own label. */
	compact?: boolean;
	/**
	 * Overrides the swatch fill. Lets a host show a non-color state the hex
	 * cannot express — e.g. a split gradient for a mixed multi-selection.
	 */
	swatchStyle?: React.CSSProperties;
	disabled?: boolean;
	"data-testid"?: string;
}) {
	const [open, setOpen] = useState(false);
	const toggleRef = useRef<HTMLButtonElement>(null);
	const popoverId = useId();

	// The disc works in 6-digit hex, but hosts may carry `#rrggbbaa`. Split the
	// alpha off on the way in and re-attach it on the way out so an opacity a
	// caller set elsewhere survives a trip through the picker.
	const alphaSuffix =
		/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})$/.exec(value)?.[1] ?? "";
	const baseValue = alphaSuffix ? value.slice(0, 7) : value;
	const withAlpha = (hex: string) => `${hex}${alphaSuffix}`;

	// `onCommit` must report the hex as of CLOSE. While the popover is open the
	// host may only be PREVIEWING (never feeding `value` back), so the prop can
	// stay stale for the whole interaction — track the last emitted hex instead
	// and only resync from the prop once closed.
	const latestRef = useRef(value);
	if (!open) latestRef.current = value;

	const close = useCallback(
		(reason: "commit" | "cancel") => {
			setOpen(false);
			toggleRef.current?.focus({ preventScroll: true });
			if (reason === "cancel") onCancel?.();
			else onCommit?.(latestRef.current);
		},
		[onCancel, onCommit],
	);

	const toggle = (
		<button
			ref={toggleRef}
			type="button"
			aria-expanded={open}
			aria-haspopup="dialog"
			aria-controls={open ? popoverId : undefined}
			aria-label={`${label} color`}
			data-testid={dataTestId}
			disabled={disabled}
			onClick={() => (open ? close("commit") : setOpen(true))}
			className="flex items-center gap-2 transition-transform not-disabled:cursor-pointer active:not-disabled:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
		>
			{compact ? null : (
				<span
					className="text-[12.5px] font-medium text-muted-foreground"
					style={{ fontVariantNumeric: "tabular-nums" }}
				>
					{displayValue ?? value}
				</span>
			)}
			<span
				className="size-4.5 rounded-full border border-border/70"
				style={swatchStyle ?? { background: value }}
			/>
		</button>
	);

	const popover = (
		<AnimatePresence>
			{open && (
				<ColorPopover
					id={popoverId}
					anchorRef={toggleRef}
					value={baseValue}
					onValueChange={(hex) => {
						latestRef.current = withAlpha(hex);
						onValueChange(withAlpha(hex));
					}}
					onClose={close}
					eyeDropper={eyeDropper}
					rgb={rgb}
					testId={dataTestId}
				/>
			)}
		</AnimatePresence>
	);

	// Compact hosts lay out their own label, so the row chrome is dropped
	// entirely and only the swatch (plus its popover) renders.
	if (compact) {
		return (
			<span className="inline-flex items-center">
				{toggle}
				{popover}
			</span>
		);
	}

	return (
		<div className="flex h-8 w-full shrink-0 items-center justify-between rounded-lg bg-muted/60 px-3 transition-colors select-none hover:bg-muted/80">
			<span className="text-[12.5px] font-medium text-foreground/90">
				{label}
			</span>
			<span className="flex items-center gap-2">
				{onReset && (
					<button
						type="button"
						onClick={onReset}
						aria-label={`Reset ${label}`}
						title="Reset"
						className="inline-flex size-5 cursor-pointer items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-foreground/10 hover:text-foreground"
					>
						<RotateCcw aria-hidden className="size-3" />
					</button>
				)}
				{toggle}
			</span>
			{popover}
		</div>
	);
}
