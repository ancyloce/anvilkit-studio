const pageStyle = {
	minHeight: "100vh",
	display: "grid",
	alignContent: "center",
	justifyItems: "center",
	gap: "1.5rem",
	padding: "3rem 1.5rem",
	background:
		"radial-gradient(circle at top, rgba(253,230,138,0.35), transparent 40%), linear-gradient(180deg, #fff7ed 0%, #ffffff 48%, #f8fafc 100%)",
} as const;

const cardStyle = {
	maxWidth: "44rem",
	display: "grid",
	gap: "1rem",
	padding: "2rem",
	borderRadius: "1.5rem",
	background: "rgba(255,255,255,0.88)",
	boxShadow: "0 24px 60px rgba(15, 23, 42, 0.12)",
} as const;

const linkStyle = {
	color: "#0f766e",
	fontWeight: 700,
	textDecoration: "none",
} as const;

export default function HomePage() {
	return (
		<main style={pageStyle}>
			<section style={cardStyle}>
				<p style={{ margin: 0, letterSpacing: "0.18em", textTransform: "uppercase" }}>
					Anvilkit
				</p>
				<h1 style={{ margin: 0, fontSize: "clamp(2rem, 8vw, 4rem)" }}>__NAME__</h1>
				<p style={{ margin: 0, lineHeight: 1.6 }}>
					This project was scaffolded by <code>anvilkit init</code>. Open the
					editor route to start shaping the page or swap in a template-backed
					seed document.
				</p>
				<div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
					<a href="/puck/editor" style={linkStyle}>
						Open editor
					</a>
					<a href="/puck/preview" style={linkStyle}>
						Open preview
					</a>
				</div>
			</section>
		</main>
	);
}
