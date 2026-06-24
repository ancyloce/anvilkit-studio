"use client";

import { Button, buttonVariants } from "@anvilkit/ui/button";
import { cn } from "@anvilkit/ui/lib/utils";
import { Menu, Star, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { DemoThemeToggle } from "../demo-theme-toggle";
import styles from "./site.module.css";
import {
	GITHUB_URL,
	isNavLinkActive,
	NAV_LINKS,
	type SiteNavLink,
} from "./site-config";

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
}: {
	link: SiteNavLink;
	pathname: string;
	className?: string;
	onNavigate?: () => void;
}) {
	const label = (
		<>
			{link.label}
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
		>
			{label}
		</Link>
	);
}

export function SiteNav() {
	const pathname = usePathname() ?? "/";
	const [scrolled, setScrolled] = useState(false);
	const [menuOpen, setMenuOpen] = useState(false);

	useEffect(() => {
		const onScroll = () => setScrolled(window.scrollY > 8);
		onScroll();
		window.addEventListener("scroll", onScroll, { passive: true });
		return () => window.removeEventListener("scroll", onScroll);
	}, []);

	// Collapse the mobile sheet whenever the route changes. `pathname` is the
	// trigger, not a value read in the body, so Biome flags it as "extra" —
	// but it is exactly the dependency we want this effect to react to.
	// biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the intended re-run trigger.
	useEffect(() => {
		setMenuOpen(false);
	}, [pathname]);

	return (
		<header
			className={`huly-root ${styles.nav}${scrolled || menuOpen ? ` ${styles.navScrolled}` : ""}`}
		>
			<div className={styles.navInner}>
				<Link href="/" className={styles.brand} aria-label="AnvilKit home">
					<BrandMark />
					<span className={styles.brandText}>AnvilKit</span>
				</Link>

				<nav className={styles.navLinks} aria-label="Primary">
					{NAV_LINKS.map((link) => (
						<NavItem
							key={link.label}
							link={link}
							pathname={pathname}
							className={styles.navLink}
						/>
					))}
				</nav>

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
						aria-label="Star AnvilKit on GitHub"
						title="Star AnvilKit on GitHub"
					>
						<Star aria-hidden="true" />
					</a>
					<span className={styles.showWide}>
						<DemoThemeToggle />
					</span>
					<Link
						className={cn(buttonVariants(), "rounded-full")}
						href="/puck/editor"
					>
						Open Studio
					</Link>
					<Button
						type="button"
						variant="outline"
						size="icon"
						className={`${styles.showNarrow} rounded-full`}
						aria-expanded={menuOpen}
						aria-label={menuOpen ? "Close menu" : "Open menu"}
						onClick={() => setMenuOpen((open) => !open)}
					>
						{menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
					</Button>
				</div>
			</div>

			{menuOpen ? (
				<div className={styles.mobileSheet}>
					{NAV_LINKS.map((link) => (
						<NavItem
							key={link.label}
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
						★ Star Us on GitHub
					</a>
				</div>
			) : null}
		</header>
	);
}
