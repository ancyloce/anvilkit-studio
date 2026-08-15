import type { Metadata } from "next";
import "@anvilkit/core/styles.css";
import "./globals.css";

export const metadata: Metadata = {
	title: "AnvilKit Component Editor",
	description: "AI-agent-driven component editor built on AnvilKit Studio.",
};

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en">
			<body className="bg-background text-foreground antialiased">
				{children}
			</body>
		</html>
	);
}
