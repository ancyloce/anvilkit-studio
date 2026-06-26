# Inline-style → Tailwind codemod report

- Mode: **APPLY (files written)**
- Globs: `apps/demo/**/*.tsx`, `apps/docs/src/**/*.tsx`
- Files scanned: 51
- Style props converted: **16** | skipped (preserved): **25**
- Files modified: 7
- Backups: `.codemod-backups/inline-style-to-tailwind/`

## `apps/demo/app/page.tsx`

**Preserved (1):**
- L271: className is an expression (cn()/template) — not merged — `style={{ justifyContent: "center" }}`

## `apps/demo/app/_site/MiniEditor.tsx`

**Preserved (4):**
- L124: non-literal value for "background" — `style={{ background: ACCENTS[key] }}`
- L155: non-literal value for "background" — `style={{
							background: `radial-gradient(circle, ${
								accent === "iris"
									? "rgba(86,131,218,0.55)"
									: "rgba(255,137,100,0.5)"
							} 0%, transparent 70%)`,
						}}`
- L173: non-literal value for "color" — `style={{ color: accentColor }}`
- L185: non-literal value for "background" — `style={{ background: accentColor }}`

## `apps/demo/app/_site/SiteNav.tsx`

**Preserved (1):**
- L68: unmappable property/value "mixBlendMode: screen" — `style={{ mixBlendMode: "screen" }}`

## `apps/demo/app/about/page.tsx`

**Preserved (3):**
- L59: unmappable property/value "gridTemplateColumns: 1fr" — `style={{ gridTemplateColumns: "1fr" }}`
- L99: className is an expression (cn()/template) — not merged — `style={{ marginBottom: 0 }}`
- L157: className is an expression (cn()/template) — not merged — `style={{ justifyContent: "center" }}`

## `apps/demo/app/editor/page.tsx`

**Preserved (2):**
- L159: unmappable property/value "gridTemplateColumns: 1fr" — `style={{ gridTemplateColumns: "1fr" }}`
- L224: className is an expression (cn()/template) — not merged — `style={{ marginTop: 18 }}`

## `apps/docs/src/components/home-content.tsx`

**Converted (5):**

- L300: `style={{ color: "#5683da" }}` → `className="text-[#5683da]"`

- L362: `style={{ width: "60%" }}` → `className="w-[60%]"`

- L527: `style={{ marginBottom: 0 }}` → `className="mb-0"`

- L540: `style={{ marginTop: 20 }}` → `className="mt-5"`

- L559: `style={{ marginLeft: 6 }}` → `className="ml-[6px]"`

**Preserved (5):**
- L474: unmappable property/value "marginInline: auto" — `style={{ marginInline: "auto" }}`
- L484: unmappable property/value "background: var(--akh-iris)" — `style={{
									top: -60,
									left: "10%",
									width: 360,
									height: 360,
									background: "var(--akh-iris)",
								}}`
- L495: unmappable property/value "background: var(--akh-ember)" — `style={{
									bottom: -80,
									right: "8%",
									width: 320,
									height: 320,
									background: "var(--akh-ember)",
								}}`
- L525: unmappable property/value "alignItems: start" — `style={{ alignItems: "start" }}`
- L607: unmappable property/value "marginInline: auto" — `style={{ marginInline: "auto", marginTop: 18 }}`

## `apps/docs/src/components/liquid-glass-card.tsx`

**Preserved (1):**
- L193: contains spread (...style) — `style={{ ...(cssVars as CSSProperties), ...style }}`

## `apps/docs/src/components/playground.tsx`

**Converted (2):**

- L707: `style={{ fontWeight: 500 }}` → `className="font-medium"`

- L710: `style={{ color: "#6b7280" }}` → `className="text-[#6b7280]"`

**Preserved (2):**
- L689: unmappable property/value "fontSize: 0.875rem" — `style={{
						display: "flex",
						alignItems: "center",
						gap: "0.5rem",
						fontSize: "0.875rem",
						margin: "0.25rem 0",
					}}`
- L699: non-literal value for "backgroundColor" — `style={{
							display: "inline-block",
							width: "0.625rem",
							height: "0.625rem",
							borderRadius: "9999px",
							backgroundColor: connectionTone(collabStatus),
						}}`

## `apps/docs/src/routes/playground.tsx`

**Converted (1):**

- L30: `style={{ padding: "2rem", textAlign: "center" }}` → `className="p-8 text-center"`

## `apps/demo/app/puck/editor/page.tsx`

**Converted (4):**

- L1060: `style={{
							display: "grid",
							gap: "0.75rem",
							marginBottom: "1rem",
						}}` → `className="grid gap-3 mb-4"`

- L1061: `style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}` → `className="flex gap-3 flex-wrap"`

- L1079: `style={{ display: "grid", gap: "0.5rem" }}` → `className="grid gap-2"`

- L1091: `style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}` → `className="flex gap-3 flex-wrap"`

**Preserved (1):**
- L1225: className is an expression (cn()/template) — not merged — `style={{ marginTop: "1rem" }}`

## `apps/demo/app/puck/render/_components/RenderNavigation.tsx`

**Converted (1):**

- L63: `style={{ display: "contents" }}` → `className="contents"`

## `apps/demo/app/studio/canvas/[pageId]/CanvasStudioClient.tsx`

**Converted (2):**

- L188: `style={{ padding: "1.5rem" }}` → `className="p-6"`

- L196: `style={{
				display: "flex",
				flexDirection: "column",
				gap: "1rem",
				padding: "1.5rem",
			}}` → `className="flex flex-col gap-4 p-6"`

**Preserved (5):**
- L199: unmappable property/value "fontSize: 1.25rem" — `style={{ fontSize: "1.25rem", margin: 0 }}`
- L202: unmappable property/value "color: var(--demo-muted-text)" — `style={{ color: "var(--demo-muted-text)", margin: "0.25rem 0 0" }}`
- L208: unmappable property/value "height: 80vh" — `style={{
					display: "flex",
					gap: "1rem",
					alignItems: "stretch",
					height: "80vh",
				}}`
- L216: unmappable property/value "borderRadius: 12" — `style={{
						flex: 1,
						minWidth: 0,
						height: "100%",
						borderRadius: 12,
						overflow: "hidden",
						border: "1px solid var(--demo-border, #e2e8f0)",
					}}`
- L241: unmappable property/value "borderLeft: 1px solid var(--demo-border, #e2e8f0)" — `style={{
						width: "340px",
						flexShrink: 0,
						overflowY: "auto",
						borderLeft: "1px solid var(--demo-border, #e2e8f0)",
						paddingLeft: "1rem",
					}}`

## `apps/demo/app/studio/canvas/[pageId]/loading.tsx`

**Converted (1):**

- L3: `style={{ padding: "1.5rem" }}` → `className="p-6"`
