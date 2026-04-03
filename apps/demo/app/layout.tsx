import type { Metadata } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import "@puckeditor/core/puck.css";
import "@anvilkit/bento-grid/styles.css";
import "@anvilkit/blog-list/styles.css";
import "@anvilkit/hero/styles.css";
import "@anvilkit/helps/styles.css";
import "@anvilkit/logo-clouds/styles.css";
import "@anvilkit/navbar/styles.css";
import "@anvilkit/pricing-minimal/styles.css";
import "@anvilkit/section/styles.css";
import "@anvilkit/statistics/styles.css";
import { DemoThemeToggle } from "./demo-theme-toggle";
import "./globals.css";

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
				<Script id="demo-theme-bootstrap" strategy="beforeInteractive">
					{demoThemeBootstrapScript}
				</Script>
				<div className="mx-auto flex w-full max-w-7xl justify-end px-4 pt-4 sm:px-6 lg:px-8">
					<div className="inline-flex items-center gap-3 rounded-full border border-border/60 bg-background/85 px-2 py-2 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/70">
						<span className="pl-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
							Theme
						</span>
						<DemoThemeToggle />
					</div>
				</div>
				{children}
			</body>
		</html>
	);
}
