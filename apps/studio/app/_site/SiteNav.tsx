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
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { useDemoT } from "@/lib/i18n/client";
import { DemoThemeToggle } from "../demo-theme-toggle";
import { LanguageSwitcher } from "./LanguageSwitcher";
import styles from "./site.module.css";
import {
	GITHUB_URL,
	isNavLinkActive,
	NAV_LINKS,
	type SiteNavLink,
} from "./site-config";

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
				fill="var(--huly-electric-iris)"
			/>
			<rect
				x="11"
				y="6"
				width="13"
				height="13"
				rx="6.5"
				fill="var(--huly-ember-pulse)"
				fillOpacity="0.85"
				style={{ mixBlendMode: "screen" }}
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
				<span className={styles.externalGlyph} aria-hidden="true">
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
	const cls = [className, isActive ? styles.navLinkActive : null]
		.filter(Boolean)
		.join(" ");
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
	activeRef.current = activeIndex;

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
		const reset = () => glideTo(activeRef.current, false);
		window.addEventListener("resize", reset);
		// Re-measure once webfonts swap in (label widths shift). Ignore failures —
		// `fonts.ready` only rejects in environments without the Font Loading API.
		document.fonts?.ready?.then(reset, () => undefined);
		return () => window.removeEventListener("resize", reset);
	}, [plain, glideTo]);

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
			className={styles.navLink}
			onActivate={plain ? undefined : () => glideTo(i, true)}
		/>
	));

	if (plain) {
		return (
			<nav className={styles.navLinks} aria-label={t("nav.primaryAria")}>
				{links}
			</nav>
		);
	}

	return (
		<LiquidGlass
			ref={lensRef}
			className={styles.navLinksGlass}
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
				className={styles.navLinks}
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
	const headerClass = `huly-root ${styles.nav}${firm ? ` ${styles.navScrolled}` : ""}`;

	return (
    <header className={headerClass}>
      <div className={styles.navShell}>
        <div className={styles.navRow}>
          <Link
            href="/"
            className={styles.brand}
            aria-label={t("nav.brandHomeAria")}
          >
            <BrandMark />
            <span className={styles.brandText}>AnvilKit</span>
          </Link>

          <NavLinksGlass
            pathname={pathname}
            plain={plain}
            reducedMotion={reducedMotion}
          />

          <div className={styles.navRight}>
            <a
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon" }),
                styles.showWide,
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
            <span className={styles.showWide}>
              <DemoThemeToggle />
            </span>
            <span className={styles.showWide}>
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
              className={`${styles.showNarrow} rounded-full`}
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
        <div className={styles.mobileSheet}>
          {NAV_LINKS.map((link) => (
            <NavItem
              key={link.href}
              link={link}
              pathname={pathname}
              className={styles.mobileLink}
              onNavigate={() => setMenuOpen(false)}
            />
          ))}
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer noopener"
            className={styles.mobileLink}
          >
            {t("nav.starMobile")}
          </a>
          <div className={styles.mobileActions}>
            <LanguageSwitcher />
            <DemoThemeToggle />
          </div>
        </div>
      ) : null}
    </header>
  );
}
