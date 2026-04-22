const previewShellStyle = {
	minHeight: "100vh",
	display: "grid",
	placeItems: "center",
	padding: "2rem",
	background:
		"linear-gradient(180deg, rgba(240,253,250,1) 0%, rgba(255,255,255,1) 100%)",
} as const;

const previewCardStyle = {
	maxWidth: "38rem",
	display: "grid",
	gap: "0.75rem",
	padding: "2rem",
	borderRadius: "1.25rem",
	background: "#ffffff",
	boxShadow: "0 24px 60px rgba(15, 23, 42, 0.08)",
} as const;

export default function PreviewPage() {
	return (
		<main style={previewShellStyle}>
			<section style={previewCardStyle}>
				<p style={{ margin: 0, letterSpacing: "0.18em", textTransform: "uppercase" }}>
					Preview
				</p>
				<h1 style={{ margin: 0 }}>Preview surface reserved</h1>
				<p style={{ margin: 0, lineHeight: 1.6 }}>
					Use this route for lightweight render previews or custom review flows as
					your app evolves.
				</p>
				<a href="/puck/editor" style={{ color: "#0f766e", fontWeight: 700 }}>
					Back to editor
				</a>
			</section>
		</main>
	);
}
