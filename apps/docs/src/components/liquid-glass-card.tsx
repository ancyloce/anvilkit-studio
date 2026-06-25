import {
	type CSSProperties,
	type HTMLAttributes,
	type ReactNode,
	useEffect,
	useRef,
} from "react";
import "@/styles/liquid-glass.css";

/**
 * A single labeled icon inside a {@link LiquidGlassCard}. The `icon` is purely
 * decorative (rendered `aria-hidden`); the accessible meaning comes from
 * `label` + optional `description`, so screen-reader users never depend on the
 * glyph.
 */
export interface LiquidGlassItem {
	icon: ReactNode;
	label: string;
	description?: string;
}

export interface LiquidGlassCardProps
	extends Omit<HTMLAttributes<HTMLElement>, "title"> {
	/** Card heading. */
	title: string;
	/** Optional lede shown under the title. */
	description?: string;
	/** 3–6 labeled icons (the "multi-icon" feature cluster). */
	items: LiquidGlassItem[];
	/** Optional CTA / footer slot (e.g. a router `<Link>`) — kept framework-agnostic. */
	footer?: ReactNode;
	/** Heading element for correct document outline. @default 3 */
	headingLevel?: 2 | 3 | 4;
	/** Base tint color (any CSS color) driving the glow + accents. */
	tint?: string;
	/** Glow intensity, 0–1. @default 0.5 */
	tintIntensity?: number;
	/** Backdrop blur radius in px (recommended 10–20). @default 16 */
	blur?: number;
	/** Pointer-driven specular highlight + 3D tilt. @default true */
	interactive?: boolean;
	/** Scroll-driven hue shift on the tint glow (the "living glass" effect). @default true */
	dynamicTint?: boolean;
}

/**
 * Liquid Glass feature-layer card.
 *
 * A transparent, tactile glass surface for capability / plugin showcases. It
 * layers (bottom→top): a tint glow, a translucent blurred fill, a pointer-
 * tracked specular highlight, a hover sheen sweep, and finally the content.
 *
 * ## Usage
 * ```tsx
 * <LiquidGlassCard
 *   title="Composable foundation"
 *   description="A typed core, a headless IR, and export targets — one schema."
 *   tint="var(--akh-iris)"
 *   items={[
 *     { icon: <Boxes />, label: "Independent packages", description: "…" },
 *     { icon: <FileCode2 />, label: "Headless Page IR", description: "…" },
 *     { icon: <Share2 />, label: "Export anywhere", description: "…" },
 *   ]}
 *   footer={<Link to="/docs/components" className="aklg-cta">Browse →</Link>}
 * />
 * ```
 *
 * ## Tuning the dynamic tint
 * - **Intensity** — `tintIntensity` (0–1) scales the glow opacity; the scroll
 *   sensitivity (hue-rotation range) is the `0.5` multiplier in the effect's
 *   `hue` calc below (±12° at viewport edges). Lower it for a calmer shift,
 *   raise it for a more vivid "living" feel.
 * - **Blur** — `blur` maps to `--aklg-blur`; 10–20px keeps content legible.
 * - **Tint** — `tint` accepts any CSS color or custom property, e.g.
 *   `"var(--akh-ember)"`.
 *
 * ## Fallbacks & accessibility
 * - Without `backdrop-filter` support the CSS swaps to a near-solid fill (text
 *   stays AA-legible). The glow/specular layers live below the content, so the
 *   text region is never tinted.
 * - Under `prefers-reduced-motion` all listeners are skipped and the card
 *   renders fully static (the JS no-ops; CSS also neutralizes transforms).
 * - Renders fully on the server (content-first / LCP-safe); the runtime CSS
 *   vars default to a neutral, centered state until hydration.
 */
export function LiquidGlassCard({
	title,
	description,
	items,
	footer,
	headingLevel = 3,
	tint,
	tintIntensity,
	blur,
	interactive = true,
	dynamicTint = true,
	className,
	style,
	...rest
}: LiquidGlassCardProps) {
	const ref = useRef<HTMLElement>(null);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		// Content-first: never touch the DOM under reduced motion.
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		if (!interactive && !dynamicTint) return;

		let frame = 0;
		let px = 50;
		let py = 50;
		let pointerDirty = false;
		let scrollDirty = dynamicTint;

		// All reads happen first, then all writes — batched once per frame so the
		// pointer + scroll updates never thrash layout.
		const tick = () => {
			frame = 0;
			if (scrollDirty) {
				const rect = el.getBoundingClientRect();
				const vh = window.innerHeight || 1;
				const center = (rect.top + rect.height / 2) / vh; // 0 (top) → 1 (bottom)
				const clamped = Math.min(1, Math.max(0, center));
				const hue = (clamped - 0.5) * 24; // ±12° — scroll sensitivity knob
				el.style.setProperty("--aklg-hue", hue.toFixed(2));
				scrollDirty = false;
			}
			if (pointerDirty) {
				el.style.setProperty("--aklg-mx", px.toFixed(2));
				el.style.setProperty("--aklg-my", py.toFixed(2));
				pointerDirty = false;
			}
		};
		const schedule = () => {
			if (!frame) frame = requestAnimationFrame(tick);
		};

		const onPointerMove = (e: PointerEvent) => {
			const rect = el.getBoundingClientRect();
			px = Math.min(
				100,
				Math.max(0, ((e.clientX - rect.left) / rect.width) * 100),
			);
			py = Math.min(
				100,
				Math.max(0, ((e.clientY - rect.top) / rect.height) * 100),
			);
			pointerDirty = true;
			schedule();
		};
		const onPointerLeave = () => {
			px = 50;
			py = 50;
			pointerDirty = true;
			schedule();
		};
		const onScroll = () => {
			scrollDirty = true;
			schedule();
		};

		if (interactive) {
			el.addEventListener("pointermove", onPointerMove);
			el.addEventListener("pointerleave", onPointerLeave);
		}
		if (dynamicTint) {
			window.addEventListener("scroll", onScroll, { passive: true });
			schedule(); // seed the initial hue from the load-time scroll position
		}

		return () => {
			if (frame) cancelAnimationFrame(frame);
			el.removeEventListener("pointermove", onPointerMove);
			el.removeEventListener("pointerleave", onPointerLeave);
			window.removeEventListener("scroll", onScroll);
		};
	}, [interactive, dynamicTint]);

	const cssVars: Record<string, string> = {};
	if (tint) cssVars["--aklg-tint"] = tint;
	if (tintIntensity !== undefined) {
		cssVars["--aklg-tint-strength"] = String(tintIntensity);
	}
	if (blur !== undefined) cssVars["--aklg-blur"] = `${blur}px`;

	const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";

	return (
		<article
			ref={ref}
			className={className ? `aklg-card ${className}` : "aklg-card"}
			style={{ ...(cssVars as CSSProperties), ...style }}
			{...rest}
		>
			{/* Decorative glass layers — never announced, never capture pointer. */}
			<span className="aklg-glow" aria-hidden="true" />
			<span className="aklg-spec" aria-hidden="true" />
			<span className="aklg-sheen" aria-hidden="true" />

			<div className="aklg-content">
				<Heading className="aklg-title">{title}</Heading>
				{description ? <p className="aklg-desc">{description}</p> : null}

				<ul className="aklg-items">
					{items.map((item) => (
						<li className="aklg-item" key={item.label}>
							<span className="aklg-tile" aria-hidden="true">
								{item.icon}
							</span>
							<span>
								<span className="aklg-item-label">{item.label}</span>
								{item.description ? (
									<p className="aklg-item-desc">{item.description}</p>
								) : null}
							</span>
						</li>
					))}
				</ul>

				{footer ? <div className="aklg-footer">{footer}</div> : null}
			</div>
		</article>
	);
}
