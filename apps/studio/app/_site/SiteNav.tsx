"use client";

import { Button, buttonVariants } from "@anvilkit/ui/button";
import { cn } from "@anvilkit/ui/lib/utils";
import { LiquidGlass, type LiquidGlassHandle } from "liquid-glass-web-react";
import { Menu, Star, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
	useCallback,
	useEffect,
	useEffectEvent,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { useDemoT } from "@/lib/i18n/client";
import { DemoThemeToggle } from "../demo-theme-toggle";
import { LanguageSwitcher } from "./LanguageSwitcher";
import {
	BRAND_CLASS,
	GITHUB_URL,
	HULY_ROOT,
	isNavLinkActive,
	NAV_LINKS,
	type SiteNavLink,
} from "./site-config";

const NAV_HEADER = cn(
	HULY_ROOT,
	"fixed inset-x-0 top-0 z-50 px-4 pt-3.5 pointer-events-none",
);

// The frosted bar surface — and the <LiquidGlass> root.
//
// `liquid-glass-web-react` only refracts its own children (it sets
// `filter: url(#…)` on a content wrapper — there is no backdrop-filter), so
// the library supplies the Liquid Glass *optics* (refraction, chromatic
// aberration, specular, glow, edge highlight) while this layer supplies the
// *material body* the page is seen through: a translucent tint plus a
// backdrop blur/saturate, the float shadow, theming, and the hover/press
// physics. `NAV_SHELL_BASE` is passed as the LiquidGlass `className`, so it
// styles the library's root <div>; when a user prefers reduced transparency
// we render a plain <div> with this same class and no lens (see below).
//
// Colours are literal rgba() arbitrary values rather than semantic tokens —
// current Chromium fails to re-resolve a var()-backed colour for
// `background`/`border-color` on a backdrop-filter layer when a `.dark`
// ancestor overrides the custom property, so the bar would keep its light
// tint in dark mode. Tailwind's `dark:` variant compiles to its own literal
// rule (no runtime var() indirection), so it sidesteps the bug outright, but
// the literal values are kept anyway to match iOS: a neutral material, not a
// tint of the page bg.
const NAV_SHELL_BASE =
	"pointer-events-auto w-full max-w-huly mx-auto rounded-full border border-[rgba(255,255,255,0.55)] dark:border-[rgba(255,255,255,0.14)] contrast-more:border-[rgba(0,0,0,0.4)] dark:contrast-more:border-[rgba(255,255,255,0.5)] backdrop-blur-[18px] backdrop-saturate-[180%] reduced-transparency:[backdrop-filter:none] reduced-transparency:[-webkit-backdrop-filter:none] [transition:background_220ms_ease,border-color_220ms_ease,box-shadow_220ms_ease,transform_320ms_cubic-bezier(0.22,0.8,0.18,1)] motion-reduce:transition-none";

// Once scrolled (or the mobile sheet is open) the material firms up so text
// stays legible over busy content; that firmer surface also happens to
// out-specificity the accessibility-preference backgrounds below (the same
// resolution order the original `.navScrolled .navShell` compound selector
// produced), so this branch intentionally does not repeat them.
const NAV_SHELL_SCROLLED =
	"bg-[rgba(255,255,255,0.68)] shadow-[0_14px_40px_-14px_rgba(0,0,0,0.38),0_3px_10px_-5px_rgba(0,0,0,0.2)] dark:bg-[rgba(28,28,32,0.62)] dark:shadow-[0_14px_40px_-14px_rgba(0,0,0,0.6),0_3px_10px_-5px_rgba(0,0,0,0.4)]";

// Resting (unscrolled) surface, plus the accessibility fallbacks that only
// take effect while resting (see NAV_SHELL_SCROLLED above).
const NAV_SHELL_REST =
	"bg-[rgba(255,255,255,0.5)] shadow-[0_10px_30px_-12px_rgba(0,0,0,0.28),0_2px_8px_-4px_rgba(0,0,0,0.16)] dark:bg-[rgba(28,28,32,0.45)] dark:shadow-[0_10px_30px_-12px_rgba(0,0,0,0.5),0_2px_8px_-4px_rgba(0,0,0,0.35)] reduced-transparency:bg-[rgba(255,255,255,0.96)] reduced-transparency:dark:bg-[rgba(22,22,26,0.97)] contrast-more:bg-[rgba(255,255,255,0.92)] contrast-more:dark:bg-[rgba(20,20,24,0.95)] no-backdrop-filter:bg-[rgba(255,255,255,0.94)] no-backdrop-filter:dark:bg-[rgba(24,24,27,0.94)]";

const NAV_ROW = "flex items-center justify-between gap-4 py-2.25 pr-3 pl-4.5";

const NAV_LINKS_GLASS_WRAP = "hidden min-[880px]:block";
const NAV_LINKS_ROW = "hidden min-[880px]:flex items-center gap-0.5";

const NAV_LINK_BASE =
	"relative text-[color-mix(in_srgb,var(--foreground)_70%,transparent)] text-[14px] font-normal tracking-[-0.01em] py-[7px] px-3.5 rounded-full whitespace-nowrap transition-colors duration-[140ms] ease-[ease] hover:text-foreground focus-visible:text-foreground focus-visible:outline-2 focus-visible:outline-huly-iris focus-visible:outline-offset-2";
const NAV_LINK_ACTIVE =
	"text-foreground font-medium reduced-transparency:bg-[color-mix(in_srgb,var(--foreground)_12%,transparent)]";

const EXTERNAL_GLYPH = "inline-block ml-1 text-[10px] opacity-65 align-middle";

const NAV_RIGHT = "inline-flex items-center gap-3";

const MOBILE_SHEET =
	"pointer-events-auto flex flex-col gap-1 max-w-huly mx-auto mt-2.5 p-2.5 rounded-[26px] border border-[rgba(255,255,255,0.55)] bg-[rgba(255,255,255,0.72)] backdrop-blur-[18px] backdrop-saturate-[185%] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.7),0_14px_40px_-14px_rgba(0,0,0,0.38)] dark:border-[rgba(255,255,255,0.16)] dark:bg-[rgba(28,28,32,0.72)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.32),0_14px_40px_-14px_rgba(0,0,0,0.6)] no-backdrop-filter:bg-[rgba(255,255,255,0.96)] dark:no-backdrop-filter:bg-[rgba(24,24,27,0.96)]";

const MOBILE_LINK =
	"text-foreground text-[16px] py-3 px-3.5 rounded-2xl transition-colors duration-[140ms] ease-[ease] hover:bg-[color-mix(in_srgb,var(--foreground)_8%,transparent)]";

const MOBILE_ACTIONS =
	"flex items-center gap-2 pt-2 pr-1.5 pb-1 pl-1.5 mt-0.5 border-t border-[color-mix(in_srgb,var(--foreground)_10%,transparent)]";

const SHOW_WIDE = "hidden min-[880px]:inline-flex";
const SHOW_NARROW = "inline-flex min-[880px]:hidden";

// useLayoutEffect runs on the client only; fall back to useEffect during SSR so
// Next's prerender doesn't warn.
const useIsoLayoutEffect =
	typeof window !== "undefined" ? useLayoutEffect : useEffect;

// Refraction at rest vs. while the lens is pressed — deepening the strength and
// widening the chromatic fringe on press is the library's "component primitive"
// press response (demo/src/App.tsx).
const REST_GLASS = { strength: 0.02, chromaticAberration: 0.28 };
const PRESS_GLASS = { strength: 0.05, chromaticAberration: 0.6 };

/**
 * AnvilKit brand mark — two interlocking pill shapes in the iris/ember pair
 * (DESIGN.md: "interlocking shapes mark", iris + ember as the whole palette).
 */
function BrandMark() {
	return (
		<svg
			width="26"
			height="26"
			viewBox="0 0 26 26"
			fill="none"
			aria-hidden="true"
			focusable="false"
		>
			<rect
				x="2"
				y="6"
				width="13"
				height="13"
				rx="6.5"
				className="fill-huly-iris"
			/>
			<rect
				x="11"
				y="6"
				width="13"
				height="13"
				rx="6.5"
				className="fill-huly-ember/85 mix-blend-screen"
			/>
		</svg>
	);
}

function NavItem({
	link,
	pathname,
	className,
	onNavigate,
	onActivate,
}: {
	link: SiteNavLink;
	pathname: string;
	className?: string;
	onNavigate?: () => void;
	/** Glide the selection lens to this item on hover/focus. */
	onActivate?: () => void;
}) {
	const t = useDemoT();
	const label = (
		<>
			{t(link.labelKey)}
			{link.external ? (
				<span className={EXTERNAL_GLYPH} aria-hidden="true">
					↗
				</span>
			) : null}
		</>
	);

	if (link.external) {
		return (
			<a
				href={link.href}
				target="_blank"
				rel="noreferrer noopener"
				className={className}
				onClick={onNavigate}
				onPointerEnter={onActivate}
				onFocus={onActivate}
			>
				{label}
			</a>
		);
	}

	const isActive = isNavLinkActive(link, pathname);
	const cls = cn(className, isActive && NAV_LINK_ACTIVE);
	return (
		<Link
			href={link.href}
			className={cls}
			aria-current={isActive ? "page" : undefined}
			onClick={onNavigate}
			onPointerEnter={onActivate}
			onFocus={onActivate}
		>
			{label}
		</Link>
	);
}

/**
 * The primary links, with a `liquid-glass-web-react` lens as the selection
 * indicator. The lens springs to the link for the current route (and previews
 * the hovered/focused link), refracting it — the library's "component
 * primitive" pattern (demo/src/App.tsx#L366). Under reduced transparency the
 * lens is dropped and the active link gets a plain CSS pill (see the stylesheet).
 */
function NavLinksGlass({
	pathname,
	plain,
	reducedMotion,
}: {
	pathname: string;
	plain: boolean;
	reducedMotion: boolean;
}) {
	const t = useDemoT();
	const activeIndex = NAV_LINKS.findIndex((link) =>
		isNavLinkActive(link, pathname),
	);
	const activeRef = useRef(activeIndex);
	useEffect(() => {
		activeRef.current = activeIndex;
	}, [activeIndex]);

	const lensRef = useRef<LiquidGlassHandle>(null);
	const groupRef = useRef<HTMLElement>(null);
	const [lens, setLens] = useState({ width: 84, height: 34 });
	// Spring + press-fx animation state, kept in refs so per-frame updates never
	// re-render React (the lens moves via the imperative `setPosition`).
	const spring = useRef({ x: 0, v: 0, target: 0, raf: 0, settled: false });
	const fx = useRef({
		raf: 0,
		strength: REST_GLASS.strength,
		ca: REST_GLASS.chromaticAberration,
	});

	// Buttons are content-sized, so the lens follows their measured centers
	// rather than assuming equal widths (mirrors the library demo).
	const measure = useCallback(() => {
		const container = lensRef.current?.element;
		const group = groupRef.current;
		if (!container || !group) return null;
		const crect = container.getBoundingClientRect();
		if (crect.width <= 0) return null;
		return Array.from(group.querySelectorAll("a")).map((anchor) => {
			const r = anchor.getBoundingClientRect();
			return {
				x: (r.left + r.width / 2 - crect.left) / crect.width,
				width: Math.round(r.width) + 8,
				height: Math.round(r.height),
			};
		});
	}, []);

	const startSpring = useCallback((target: number) => {
		const s = spring.current;
		s.target = target;
		cancelAnimationFrame(s.raf);
		let last = performance.now();
		const tick = (now: number) => {
			const dt = Math.min(0.05, (now - last) / 1000);
			last = now;
			// critically damped-ish spring (matches the library demo)
			s.v += (170 * (s.target - s.x) - 20 * s.v) * dt;
			s.x += s.v * dt;
			lensRef.current?.setPosition(s.x, 0.5);
			if (Math.abs(s.target - s.x) > 0.0005 || Math.abs(s.v) > 0.001) {
				s.raf = requestAnimationFrame(tick);
			} else {
				lensRef.current?.setPosition(s.target, 0.5);
			}
		};
		s.raf = requestAnimationFrame(tick);
	}, []);

	const glideTo = useCallback(
		(index: number, animate: boolean) => {
			const centers = measure();
			const target = centers?.[index];
			if (!target) return;
			setLens((prev) =>
				prev.width === target.width && prev.height === target.height
					? prev
					: { width: target.width, height: target.height },
			);
			const s = spring.current;
			if (animate && !reducedMotion) {
				startSpring(target.x);
			} else {
				cancelAnimationFrame(s.raf);
				s.x = target.x;
				s.target = target.x;
				s.v = 0;
				lensRef.current?.setPosition(target.x, 0.5);
			}
		},
		[measure, reducedMotion, startSpring],
	);

	// Ease the refraction toward a rest/press target without re-rendering.
	const animateGlass = useCallback(
		(target: { strength: number; chromaticAberration: number }) => {
			const engine = lensRef.current?.engine;
			if (!engine) return;
			if (reducedMotion) {
				engine.setOptions(target);
				return;
			}
			const f = fx.current;
			cancelAnimationFrame(f.raf);
			const tick = () => {
				f.strength += (target.strength - f.strength) * 0.18;
				f.ca += (target.chromaticAberration - f.ca) * 0.18;
				const settled =
					Math.abs(target.strength - f.strength) < 0.0005 &&
					Math.abs(target.chromaticAberration - f.ca) < 0.005;
				if (settled) {
					f.strength = target.strength;
					f.ca = target.chromaticAberration;
				}
				lensRef.current?.engine?.setOptions({
					strength: f.strength,
					chromaticAberration: f.ca,
				});
				if (!settled) f.raf = requestAnimationFrame(tick);
			};
			f.raf = requestAnimationFrame(tick);
		},
		[reducedMotion],
	);
	const glideToEvent = useEffectEvent(glideTo);

	// Rest the lens on the active route's link: snap on first layout, spring on
	// subsequent route changes.
	useIsoLayoutEffect(() => {
		if (plain || activeIndex < 0) return;
		const s = spring.current;
		const animate = s.settled;
		s.settled = true;
		glideTo(activeIndex, animate);
	}, [activeIndex, plain]);

	// Keep the lens on its link across viewport + font-driven layout changes.
	useEffect(() => {
		if (plain) return;
		const reset = () => glideToEvent(activeRef.current, false);
		window.addEventListener("resize", reset);
		// Re-measure once webfonts swap in (label widths shift). Ignore failures —
		// `fonts.ready` only rejects in environments without the Font Loading API.
		document.fonts?.ready?.then(reset, () => undefined);
		return () => window.removeEventListener("resize", reset);
	}, [plain]);

	useEffect(
		() => () => {
			cancelAnimationFrame(spring.current.raf);
			cancelAnimationFrame(fx.current.raf);
		},
		[],
	);

	const links = NAV_LINKS.map((link, i) => (
		<NavItem
			key={link.href}
			link={link}
			pathname={pathname}
			className={NAV_LINK_BASE}
			onActivate={plain ? undefined : () => glideTo(i, true)}
		/>
	));

	if (plain) {
		return (
			<nav className={NAV_LINKS_ROW} aria-label={t("nav.primaryAria")}>
				{links}
			</nav>
		);
	}

	return (
		<LiquidGlass
			ref={lensRef}
			className={NAV_LINKS_GLASS_WRAP}
			y={0.5}
			width={lens.width}
			height={lens.height}
			radius="auto"
			strength={REST_GLASS.strength}
			chromaticAberration={REST_GLASS.chromaticAberration}
			curvature={0.85}
			depth={8}
			glow={0.15}
			edgeHighlight={0.35}
			specular={1}
			shadow="0 0 0 1px rgba(255,255,255,0.18), 0 6px 16px rgba(0,0,0,0.28)"
			onPointerDown={() => animateGlass(PRESS_GLASS)}
			onPointerUp={() => animateGlass(REST_GLASS)}
			onPointerLeave={() => {
				animateGlass(REST_GLASS);
				glideTo(activeRef.current, true);
			}}
		>
			<nav
				className={NAV_LINKS_ROW}
				aria-label={t("nav.primaryAria")}
				ref={groupRef}
			>
				{links}
			</nav>
		</LiquidGlass>
	);
}

export function SiteNav() {
	const t = useDemoT();
	const pathname = usePathname() ?? "/";
	const [scrolled, setScrolled] = useState(false);
	const [menuOpen, setMenuOpen] = useState(false);
	// System-preference mirrors: `plain` drops the lens for reduced transparency;
	// `reducedMotion` snaps the lens instead of springing it.
	const [plain, setPlain] = useState(false);
	const [reducedMotion, setReducedMotion] = useState(false);

	useEffect(() => {
		const onScroll = () => setScrolled(window.scrollY > 8);
		onScroll();
		window.addEventListener("scroll", onScroll, { passive: true });
		return () => window.removeEventListener("scroll", onScroll);
	}, []);

	useEffect(() => {
		const transparency = window.matchMedia(
			"(prefers-reduced-transparency: reduce)",
		);
		const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
		const apply = () => {
			setPlain(transparency.matches);
			setReducedMotion(motion.matches);
		};
		apply();
		transparency.addEventListener("change", apply);
		motion.addEventListener("change", apply);
		return () => {
			transparency.removeEventListener("change", apply);
			motion.removeEventListener("change", apply);
		};
	}, []);

	// Collapse the mobile sheet whenever the route changes. `pathname` is the
	// trigger, not a value read in the body, so Biome flags it as "extra" —
	// but it is exactly the dependency we want this effect to react to.
	// biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the intended re-run trigger.
	useEffect(() => {
		setMenuOpen(false);
	}, [pathname]);

	const firm = scrolled || menuOpen;

	return (
		<header className={NAV_HEADER}>
			<div
				className={cn(
					NAV_SHELL_BASE,
					firm ? NAV_SHELL_SCROLLED : NAV_SHELL_REST,
				)}
			>
				<div className={NAV_ROW}>
					<Link
						href="/"
						className={BRAND_CLASS}
						aria-label={t("nav.brandHomeAria")}
					>
						<BrandMark />
						<span className="whitespace-nowrap">AnvilKit</span>
					</Link>

					<NavLinksGlass
						pathname={pathname}
						plain={plain}
						reducedMotion={reducedMotion}
					/>

					<div className={NAV_RIGHT}>
						<a
							className={cn(
								buttonVariants({ variant: "ghost", size: "icon" }),
								SHOW_WIDE,
								"rounded-full text-muted-foreground hover:text-foreground",
							)}
							href={GITHUB_URL}
							target="_blank"
							rel="noreferrer noopener"
							aria-label={t("nav.starAria")}
							title={t("nav.starAria")}
						>
							<Star aria-hidden="true" />
						</a>
						<span className={SHOW_WIDE}>
							<DemoThemeToggle />
						</span>
						<span className={SHOW_WIDE}>
							<LanguageSwitcher />
						</span>
						<Link
							className={cn(buttonVariants(), "rounded-full")}
							href="/puck/editor"
						>
							{t("nav.openStudio")}
						</Link>
						<Button
							type="button"
							variant="outline"
							size="icon"
							className={cn(SHOW_NARROW, "rounded-full")}
							aria-expanded={menuOpen}
							aria-label={menuOpen ? t("nav.closeMenu") : t("nav.openMenu")}
							onClick={() => setMenuOpen((open) => !open)}
						>
							{menuOpen ? (
								<X aria-hidden="true" />
							) : (
								<Menu aria-hidden="true" />
							)}
						</Button>
					</div>
				</div>
			</div>

			{menuOpen ? (
				<div className={MOBILE_SHEET}>
					{NAV_LINKS.map((link) => (
						<NavItem
							key={link.href}
							link={link}
							pathname={pathname}
							className={MOBILE_LINK}
							onNavigate={() => setMenuOpen(false)}
						/>
					))}
					<a
						href={GITHUB_URL}
						target="_blank"
						rel="noreferrer noopener"
						className={MOBILE_LINK}
					>
						{t("nav.starMobile")}
					</a>
					<div className={MOBILE_ACTIONS}>
						<LanguageSwitcher />
						<DemoThemeToggle />
					</div>
				</div>
			) : null}
		</header>
	);
}
