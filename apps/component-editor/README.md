# component-editor

AI-agent-driven component editor (PRD 0022 / plan 0036). A product shell on
the AnvilKit Studio runtime: editor, preview, and publish routes plus a BFF
for the agent service. Dev serves on port **3200** (`pnpm dev`).

Routes: `/editor/[pageId]` (Studio mount) · `/preview/[pageId]` (draft via
AnvilKitRender) · `/render/[...slug]` (published) · `/api/pages` (storage).
