import type { Metadata } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import "@puckeditor/core/puck.css";
// `<Studio>` is used beyond the Puck routes (`/test`, `/studio/canvas`),
// so core + Puck CSS stay global. The per-component sheets are scoped to
// `app/puck/layout.tsx` (full demoConfig) and the standalone `/hero` +
// `/navbar` pages import their one sheet directly.
import "@anvilkit/core/styles.css";
import "./globals.css";
// Huly design tokens (DESIGN.md) scoped to `.huly-root` — used only by the
// marketing chrome and the Home / Editor / About pages.
import "./_site/huly.css";
import { SiteChrome } from "./_site/SiteChrome";

const geistSans = localFont({
	src: "./fonts/GeistVF.woff",
	variable: "--font-geist-sans",
});
const geistMono = localFont({
	src: "./fonts/GeistMonoVF.woff",
	variable: "--font-geist-mono",
});

export const metadata: Metadata = {
	title: "Anvilkit Components Demo",
	description:
		"Puck-native validation surface for the Anvilkit components workspace.",
};

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

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" suppressHydrationWarning>
			<body
				className={`${geistSans.variable} ${geistMono.variable} antialiased`}
			>
				{/* Inter (functional text) + Sora (the DESIGN.md Esbuild substitute,
				    display headlines), loaded at runtime so an offline build still
				    succeeds; `.huly-root` falls back to the system stack if the fetch
				    fails. React hoists these <link>s into <head>. */}
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
				<SiteChrome />
				{children}
			</body>
		</html>
	);
}
