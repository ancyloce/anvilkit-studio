import { Marquee } from "@anvilkit/ui/marquee";

const DEVICON_BASE_URL =
	"https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons";

interface LogoCloudItem {
	label: string;
	name: string;
	variant: string;
}

const logoCloudItems = [
	{
		label: "React",
		name: "react",
		variant: "original-wordmark",
	},
	{
		label: "Tailwind CSS",
		name: "tailwindcss",
		variant: "original-wordmark",
	},
	{
		label: "Docker",
		name: "docker",
		variant: "original-wordmark",
	},
	{
		label: "Node.js",
		name: "nodejs",
		variant: "original-wordmark",
	},
	{
		label: "Amazon Web Services",
		name: "amazonwebservices",
		variant: "original-wordmark",
	},
	{
		label: "Vue.js",
		name: "vuejs",
		variant: "original-wordmark",
	},
	{
		label: "Firebase",
		name: "firebase",
		variant: "plain-wordmark",
	},
	{
		label: "GraphQL",
		name: "graphql",
		variant: "plain-wordmark",
	},
] satisfies readonly LogoCloudItem[];

function getDeviconSource(name: string, variant: string) {
	return `${DEVICON_BASE_URL}/${name}/${name}-${variant}.svg`;
}

export default function MarqueeTestPage() {
	return (
		<main className="mx-auto flex min-h-[calc(100svh-5rem)] w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
			<section className="rounded-[2rem] border border-border/60 bg-background/85 p-6 shadow-sm backdrop-blur">
				<p className="text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
					UI Primitive Test
				</p>
				<h1 className="mt-3 text-[clamp(2.3rem,6vw,4.25rem)] leading-none font-black tracking-[-0.06em] text-foreground">
					Marquee scrolls without a `.theme` wrapper.
				</h1>
				<p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
					This route renders the shared `Marquee` primitive directly so the
					animation can be checked in isolation from `logo-clouds`.
				</p>
			</section>

			<section className="rounded-[2rem] border border-border/60 bg-background/80 p-4 shadow-sm backdrop-blur">
				<Marquee aria-label="Scrolling devicon wordmarks" repeat={2}>
					{logoCloudItems.map((item) => (
						<div
							key={item.name}
							className="flex min-w-[10rem] items-center justify-center px-4 py-3 sm:min-w-[12rem] sm:px-6 lg:min-w-[13.5rem] lg:px-8"
						>
							<div className="flex h-16 w-full items-center justify-center rounded-3xl px-5 dark:border dark:border-border/20 dark:bg-foreground/[0.94] dark:shadow-sm">
								{/* biome-ignore lint/performance/noImgElement: intentional raw Devicon embeds for marquee verification */}
								<img
									alt={`${item.label} logo`}
									className="h-8 w-auto max-w-[10rem] object-contain sm:h-9 sm:max-w-[11.5rem] lg:h-10 lg:max-w-[12.5rem]"
									decoding="async"
									loading="lazy"
									src={getDeviconSource(item.name, item.variant)}
								/>
							</div>
						</div>
					))}
				</Marquee>
			</section>
		</main>
	);
}
