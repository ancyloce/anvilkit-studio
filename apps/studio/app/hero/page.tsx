import { Hero, defaultProps as heroDefaultProps } from "@anvilkit/hero";
import "@anvilkit/hero/styles.css";
import { CodeBlock as CodeBlockPrimitive } from "@anvilkit/ui/components/animate-ui/primitives/animate/code-block";
import { cn } from "@anvilkit/ui/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
	title: "Hero Demo | Anvilkit Components Demo",
	description: "Reference-driven demo surface for the @anvilkit/hero package.",
};

// This route is a fixed, always-dark mockup shell (independent of the app's
// light/dark toggle), so it uses literal colors rather than shadcn tokens.
const page = "bg-[linear-gradient(180deg,#050505_0%,#0a0a0a_36%,#121212_100%)]";
const preview = "relative";
const heroFrame = "relative";
const content =
	"relative z-1 max-w-[78rem] mx-auto -mt-12 px-6 pb-16 max-[720px]:-mt-8 max-[720px]:px-4 max-[720px]:pb-12";
const header =
	"grid gap-6 p-7 border border-[rgba(255,255,255,0.08)] rounded-[1.75rem] bg-[rgba(13,13,16,0.88)] backdrop-blur-[14px] shadow-[0_1.5rem_3.5rem_rgba(0,0,0,0.35)] max-[720px]:p-5 max-[720px]:rounded-[1.4rem]";
const eyebrow =
	"mb-3 text-[#ff7a9b] text-[0.8rem] font-bold tracking-[0.18em] uppercase";
const title =
	"max-w-[42rem] text-[#fcfcfd] text-[clamp(2rem,4vw,3.5rem)] leading-[0.98] tracking-[-0.05em]";
const lede = "max-w-[44rem] mt-4 text-[rgba(255,255,255,0.72)] text-[1.02rem]";
const actions = "flex flex-wrap gap-[0.85rem]";
const actionBase =
	"inline-flex items-center justify-center min-h-12 py-3 px-[1.15rem] rounded-full transition-[transform,box-shadow,background-color] duration-[140ms] ease-[ease] hover-fine:-translate-y-px";
const primaryAction = cn(
	actionBase,
	"bg-[#ff2c62] text-white shadow-[0_0.9rem_2rem_rgba(255,44,98,0.22)] hover-fine:bg-[#ff4473]",
);
const secondaryAction = cn(
	actionBase,
	"border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.04)] text-[rgba(255,255,255,0.88)] hover-fine:bg-[rgba(255,255,255,0.08)]",
);
const heroGrid =
	"grid grid-cols-[repeat(auto-fit,minmax(18rem,1fr))] gap-4 mt-4";
const card =
	"p-[1.35rem] border border-[rgba(255,255,255,0.08)] rounded-[1.5rem] bg-[rgba(14,14,18,0.82)] shadow-[0_1rem_2.5rem_rgba(0,0,0,0.22)]";
const cardLabel =
	"inline-block mb-3 text-[#ff9bb5] text-[0.78rem] font-bold tracking-[0.16em] uppercase";
const cardHeading = "mb-[0.8rem] text-[#f7f7fa] text-[1.35rem] leading-[1.08]";
const list = "grid gap-3 pl-4 text-[rgba(255,255,255,0.72)]";
const codeBlock =
	"overflow-x-auto p-4 rounded-[1rem] bg-[#0a0b0f] text-[#f6f7fb] text-[0.9rem] leading-[1.55] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] [&_pre]:!bg-transparent [&_pre]:!m-0 [&_pre]:whitespace-pre-wrap [&_pre]:break-words";

const heroSnippet = `import { Hero, defaultProps } from "@anvilkit/hero";

export function MarketingHero() {
	return <Hero {...defaultProps} />;
}`;

export default function HeroDemoPage() {
	return (
		<main className={page}>
			<section className={preview}>
				<div className={heroFrame}>
					<Hero {...heroDefaultProps} />
				</div>
			</section>

			<section className={content}>
				<div className={header}>
					<div>
						<p className={eyebrow}>Marketing Surface</p>
						<h1 className={title}>
							Hero package demo with the real exported defaults.
						</h1>
						<p className={lede}>
							This route renders `@anvilkit/hero` directly, using the same
							default props and styles that the package exposes to consumers and
							to the Puck demo config.
						</p>
					</div>

					<div className={actions}>
						<Link href="/" className={secondaryAction}>
							Back to demo hub
						</Link>
						<Link href="/puck/editor" className={secondaryAction}>
							Open Puck editor
						</Link>
						<Link href="/puck/render" className={primaryAction}>
							Open render surface
						</Link>
					</div>
				</div>

				<div className={heroGrid}>
					<article className={card}>
						<span className={cardLabel}>Package contract</span>
						<h2 className={cardHeading}>What this validates</h2>
						<ul className={list}>
							<li>
								The announcement pill uses `RainbowButton` from `@anvilkit/ui`.
							</li>
							<li>Both download CTAs use the shared `Button` primitive.</li>
							<li>
								The demo route consumes the published package surface, not local
								mock markup.
							</li>
							<li>
								Edit-mode-safe behavior is preserved in the shared Puck config.
							</li>
						</ul>
					</article>

					<article className={card}>
						<span className={cardLabel}>Usage</span>
						<h2 className={cardHeading}>Import from the package</h2>
						<CodeBlockPrimitive
							code={heroSnippet}
							lang="tsx"
							theme="dark"
							className={codeBlock}
						/>
					</article>
				</div>
			</section>
		</main>
	);
}
