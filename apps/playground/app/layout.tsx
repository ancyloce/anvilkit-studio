import "@anvilkit/core/styles.css";
import "@anvilkit/hero/styles.css";

import type { Metadata } from "next";
import type { ReactElement, ReactNode } from "react";

export const metadata: Metadata = {
	title: "AnvilKit Playground",
	description:
		"Minimal compatibility surface for the public @anvilkit/* packages.",
};

export default function RootLayout({
	children,
}: {
	readonly children: ReactNode;
}): ReactElement {
	return (
		<html lang="en">
			<body style={{ margin: 0 }}>{children}</body>
		</html>
	);
}
