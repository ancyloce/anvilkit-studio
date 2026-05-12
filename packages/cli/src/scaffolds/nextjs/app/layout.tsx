import type { ReactNode } from "react";

interface RootLayoutProps {
	readonly children: ReactNode;
}

const bodyStyle = {
	margin: 0,
	fontFamily:
		"\"Iowan Old Style\", \"Palatino Linotype\", \"URW Palladio L\", P052, serif",
	background: "#f8fafc",
	color: "#0f172a",
} as const;

export default function RootLayout({ children }: RootLayoutProps) {
	return (
		<html lang="en">
			<body style={bodyStyle}>{children}</body>
		</html>
	);
}
