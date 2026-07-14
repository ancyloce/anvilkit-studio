import { Link } from "@tanstack/react-router";
import type { HomeMessages } from "@/lib/home-messages";
import { docSplat } from "@/lib/i18n";

export interface HomeInstallSectionProps {
	t: HomeMessages;
	locale: string;
}

// Install band — the `pnpm add ...` code block plus a collaboration-guide
// callout (needs `locale` for its docs link). `data-reveal` /
// `data-reveal-item` are queried live by `HomeContent`'s GSAP scope.
export function HomeInstallSection({ t, locale }: HomeInstallSectionProps) {
	return (
		<section className="akh-band akh-band--base akh-section">
			<div className="akh-inner" data-reveal>
				<div className="akh-grid akh-grid--2" style={{ alignItems: "start" }}>
					<div className="akh-section-head mb-0">
						<p className="akh-eyebrow" data-reveal-item>
							{t.installEyebrow}
						</p>
						<h2 className="akh-display akh-display--mid" data-reveal-item>
							{t.installHeading}
						</h2>
						<p className="akh-lede" data-reveal-item>
							{t.installBody}
						</p>
						<p className="akh-card-body mt-5" data-reveal-item>
							{t.collabBefore}{" "}
							<Link
								to="/$"
								params={{
									_splat: docSplat(locale, "guides/collaboration"),
								}}
								className="akh-link"
							>
								{t.collabLink}
							</Link>{" "}
							{t.collabAfter}
						</p>
					</div>
					<div className="akh-install" data-reveal-item>
						<div className="akh-install-bar">
							<span className="akh-frame-dot" />
							<span className="akh-frame-dot" />
							<span className="akh-frame-dot" />
							<span className="ml-[6px]">Terminal</span>
						</div>
						<pre>
							<code>
								<span className="tok-cmd">pnpm add</span>{" "}
								<span className="tok-pkg">@anvilkit/core</span>{" "}
								<span className="tok-pkg">@anvilkit/ir</span> \{"\n"}
								{"         "}
								<span className="tok-pkg">@anvilkit/schema</span>{" "}
								<span className="tok-pkg">@anvilkit/validator</span> \{"\n"}
								{"         "}
								<span className="tok-pkg">@anvilkit/plugin-ai-copilot</span> \
								{"\n"}
								{"         "}
								<span className="tok-pkg">@anvilkit/plugin-asset-manager</span>{" "}
								\{"\n"}
								{"         "}
								<span className="tok-pkg">@anvilkit/plugin-export-html</span> \
								{"\n"}
								{"         "}
								<span className="tok-pkg">@anvilkit/plugin-export-react</span> \
								{"\n"}
								{"         "}
								<span className="tok-pkg">
									@anvilkit/plugin-version-history
								</span>
							</code>
						</pre>
					</div>
				</div>
			</div>
		</section>
	);
}
