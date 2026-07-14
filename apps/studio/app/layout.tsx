import type { Metadata } from "next";
import localFont from "next/font/local";
import Script from "next/script";
// `<Studio>` is used beyond the Puck routes (`/test`, `/studio/canvas`),
// so core CSS stays global. Puck's own styles are injected at runtime by
// `<Puck>` (Puck 0.22+), so we no longer import `@puckeditor/core/puck.css`
// here — doing so would only trigger Puck's "styles already loaded" warning.
// The per-component sheets are scoped to `app/puck/layout.tsx` (full
// demoConfig) and the standalone `/hero` + `/navbar` pages import their one
// sheet directly.
import "@anvilkit/core/styles.css";
import "./globals.css";
import { DemoI18nProvider } from "../lib/i18n/client";
import { getServerLocale, getServerT } from "../lib/i18n/server";
import { SiteChrome } from "./_site/SiteChrome";

const geistSans = localFont({
	src: "./fonts/GeistVF.woff",
	variable: "--font-geist-sans",
});
const geistMono = localFont({
	src: "./fonts/GeistMonoVF.woff",
	variable: "--font-geist-mono",
});

export async function generateMetadata(): Promise<Metadata> {
	const t = await getServerT();
	return {
		title: t("meta.root.title"),
		description: t("meta.root.description"),
	};
}

const demoThemeBootstrapScript = `
(() => {
  try {
    const storageKey = "anvilkit-demo-theme";
    const storedTheme = window.localStorage.getItem(storageKey);
    const theme =
      storedTheme === "dark" || storedTheme === "light"
        ? storedTheme
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";

    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch {}
})();
`;

export default async function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	const locale = await getServerLocale();
	return (
		<html
			lang={locale}
			suppressHydrationWarning
			className="max-w-[100vw] overflow-x-hidden"
		>
			<body
				className={`${geistSans.variable} ${geistMono.variable} antialiased max-w-[100vw] min-h-svh overflow-x-hidden font-sans text-foreground [background:var(--demo-page-bg)] transition-[background-color,color,background] duration-160 ease-[ease]`}
			>
				{/* Inter (functional text) + Sora (the DESIGN.md Esbuild substitute,
				    display headlines), loaded at runtime so an offline build still
				    succeeds; `font-huly-sans` falls back to the system stack if the
				    fetch fails. React hoists these <link>s into <head>. */}
				<link rel="preconnect" href="https://fonts.googleapis.com" />
				<link
					rel="preconnect"
					href="https://fonts.gstatic.com"
					crossOrigin="anonymous"
				/>
				<link
					rel="stylesheet"
					href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Sora:wght@400;500;600&display=swap"
					precedence="default"
				/>
				<Script id="demo-theme-bootstrap" strategy="beforeInteractive">
					{demoThemeBootstrapScript}
				</Script>
				<DemoI18nProvider initialLocale={locale}>
					<SiteChrome />
					{children}
				</DemoI18nProvider>
			</body>
		</html>
	);
}
