/**
 * Shared marketing styles for Home / Editor / About — the Huly design
 * language from DESIGN.md: aurora hero, the iris/ember accent pair, pill
 * geometry, and product-UI-as-hero framing.
 *
 * Surfaces, text, and borders are driven by the workspace shadcn tokens
 * (`--background`, `--card`, `--muted`, `--foreground`, `--muted-foreground`,
 * `--border`), so every band, card, and control flips with the demo's
 * light/dark toggle. Only the iris/ember brand accents stay fixed — they read
 * well on both themes. Atomic controls (buttons, inputs, cards) are now
 * `@anvilkit/ui` primitives; what remains here is layout + brand decoration.
 *
 * Tailwind class-string constants (the CSS-module equivalent): every
 * `MarketingMotion` GSAP hook that used to query by CSS-module class name now
 * targets a `data-anim` attribute instead — see MarketingMotion.tsx.
 */

export const page = "bg-background text-foreground";

export const container = "w-full max-w-huly mx-auto px-6";

/* ---- Bands (structural rhythm: base surface alternating with a muted one,
 * both theme-aware) ---- */
export const bandDark = "bg-background text-foreground";
export const bandVoid = "bg-background text-foreground";
export const bandLight = "bg-muted text-foreground";
export const sectionPad = "py-22";

/* ---- Tags / chips ---- */
export const tag =
	"inline-flex items-center gap-1.5 rounded-huly-tags py-[5px] px-3 text-[11px] font-medium tracking-[0.04em] uppercase";
export const tagIris =
	"text-huly-iris bg-[color-mix(in_srgb,var(--color-huly-iris)_14%,transparent)]";
export const tagEmber =
	"text-huly-ember bg-[color-mix(in_srgb,var(--color-huly-ember)_16%,transparent)]";

/* ---- Hero ---- */
export const hero =
	"relative overflow-hidden bg-background text-foreground isolate";
/* Aurora beam — a single narrow vertical streak (iris → ember → white),
 * never a full-surface fill (DESIGN.md "Gradient System"). */
export const heroAurora =
	"absolute top-[-10%] left-[60%] w-[22%] h-[120%] -skew-x-8 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-huly-iris)_60%,transparent)_0%,var(--color-huly-ember)_52%,color-mix(in_srgb,var(--foreground)_70%,transparent)_100%)] blur-[46px] opacity-35 -z-1 pointer-events-none";
/* Warm radial sunburst glow at the base of the beam. */
export const heroSunburst =
	"absolute left-[52%] bottom-[-28%] w-[640px] h-[640px] -translate-x-1/2 bg-[radial-gradient(circle,color-mix(in_srgb,var(--color-huly-ember)_42%,transparent)_0%,color-mix(in_srgb,var(--color-huly-ember)_16%,transparent)_36%,transparent_68%)] blur-[8px] -z-1 pointer-events-none";
export const heroInner =
	"grid grid-cols-1 gap-12 items-center pt-24 pb-18 min-[960px]:grid-cols-[1.05fr_0.95fr] min-[960px]:pt-33 min-[960px]:pb-24";
/* Editor Hub / About force a single column at every width (the original set
 * this via an inline `style={{ gridTemplateColumns: "1fr" }}` override, which
 * beat the responsive column split but left the responsive padding bump
 * intact — kept as its own variant rather than an inline style). */
export const heroInnerSingle =
	"grid grid-cols-1 gap-12 items-center pt-24 pb-18 min-[960px]:pt-33 min-[960px]:pb-24";
export const eyebrow = "mb-5.5";
export const heroTitle =
	"font-huly-display font-semibold text-[clamp(2.75rem,7vw,5rem)] leading-[0.92] tracking-[-0.04em] mb-5.5 max-w-[16ch]";
export const heroTitleAccent = "text-huly-iris";
export const heroLede =
	"text-muted-foreground text-[18px] leading-[1.5] tracking-[-0.01em] max-w-[46ch] mb-8";
export const heroActions = "flex flex-wrap gap-3.5 items-center";
export const heroMeta =
	"flex flex-wrap gap-5.5 mt-10 text-muted-foreground text-[13px]";
export const heroMetaStrong = "text-foreground font-semibold";

/* ---- Product screenshot frame (editor UI mock) ---- */
export const productFrame =
	"rounded-huly-cards border border-border bg-card shadow-huly-xl overflow-hidden";
export const mockBar =
	"flex items-center gap-2 py-3 px-3.5 border-b border-border bg-[color-mix(in_srgb,var(--card)_70%,var(--muted))]";
export const mockDot = "w-2.5 h-2.5 rounded-full bg-muted-foreground";
export const mockUrl =
	"ml-2 text-[11px] text-muted-foreground font-[ui-monospace,SFMono-Regular,Menlo,monospace]";
export const mockBody = "grid grid-cols-[116px_1fr_132px] min-h-[320px]";
export const mockSidebar =
	"border-r border-border py-3.5 px-2.5 flex flex-col gap-2.25";
export const mockSidebarLine =
	"h-2.25 rounded-full bg-[color-mix(in_srgb,var(--muted-foreground)_26%,transparent)]";
export const mockSidebarLineFirst =
	"w-[70%] bg-[color-mix(in_srgb,var(--color-huly-iris)_60%,transparent)]";
export const mockCanvas = "p-4 flex flex-col gap-3 bg-background";
export const mockBlock =
	"rounded-[8px] border border-border bg-card p-3 flex flex-col gap-2";
export const mockBlockActive =
	"border-huly-iris shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-huly-iris)_45%,transparent)]";
export const mockLine =
	"h-2 rounded-full bg-[color-mix(in_srgb,var(--muted-foreground)_24%,transparent)]";
export const mockLineWide =
	"w-[80%] h-3 bg-[color-mix(in_srgb,var(--foreground)_24%,transparent)]";
export const mockPill =
	"self-start rounded-full bg-huly-ember w-[78px] h-[18px]";
export const mockInspector =
	"border-l border-border py-3.5 px-2.5 flex flex-col gap-2.5";
export const mockField =
	"h-6.5 rounded-[6px] border border-border bg-[color-mix(in_srgb,var(--card)_70%,var(--muted))]";

/* ---- Section headers ---- */
export const sectionHead = "max-w-[56ch] mb-12";
export const sectionHeadCenter = "mx-auto text-center";
export const kicker = "mb-4.5";
export const sectionTitle =
	"font-huly-display font-semibold text-[clamp(2rem,4vw,3rem)] leading-none tracking-[-0.03em] mb-4.5";
export const sectionLede =
	"text-[18px] leading-[1.5] tracking-[-0.01em] text-muted-foreground";

/* ---- Feature / link / step cards (the visual shell is now <Card>; these
 * strings carry only layout + brand decoration) ---- */
export const featureGrid =
	"grid grid-cols-1 gap-4 sm:grid-cols-2 min-[980px]:grid-cols-4";
/* Soft ember glow in the corner of a card; apply alongside <Card>. */
export const cardGlow =
	"before:content-[''] before:absolute before:-top-20 before:-right-20 before:w-[220px] before:h-[220px] before:bg-[radial-gradient(circle,color-mix(in_srgb,var(--color-huly-ember)_18%,transparent)_0%,transparent_70%)] before:pointer-events-none";
export const featureIcon =
	"inline-flex items-center justify-center w-10 h-10 rounded-[10px] border border-border text-huly-iris bg-[color-mix(in_srgb,var(--color-huly-iris)_10%,transparent)]";
export const featureIconEmber =
	"text-huly-ember bg-[color-mix(in_srgb,var(--color-huly-ember)_12%,transparent)]";
export const featureTitle =
	"font-huly-display font-medium text-[1.75rem] leading-[1.05] tracking-[-0.02em] mt-1";
export const featureBody = "text-muted-foreground text-[14px] leading-[1.55]";

/* ---- Link cards (editor capability grid) ---- */
export const linkGrid =
	"grid grid-cols-1 gap-4 sm:grid-cols-2 min-[980px]:grid-cols-3";
/* Hover affordance for an interactive <Card> link. */
export const linkCardInteractive =
	"transition-[box-shadow,transform] duration-[160ms] ease-[ease] hover:-translate-y-0.5 hover:shadow-huly-md";
export const linkCardHead = "flex items-center justify-between gap-2.5";
export const linkCardTitle = "text-[16px] font-semibold tracking-[-0.01em]";
export const linkCardArrow = "text-huly-iris text-[16px]";
export const linkCardBody = "text-muted-foreground text-[14px] leading-[1.55]";
export const linkCardPath =
	"mt-auto font-[ui-monospace,SFMono-Regular,Menlo,monospace] text-[12px] text-muted-foreground";

/* ---- Usage guide steps ---- */
export const steps = "grid grid-cols-1 gap-4.5 min-[720px]:grid-cols-2";
export const stepNum =
	"inline-flex items-center justify-center w-14 h-14 rounded-huly-panels border border-border bg-muted font-huly-display text-[28px] font-semibold text-huly-iris";
export const stepTitle = "text-[18px] font-semibold tracking-[-0.01em]";
export const stepBody = "text-muted-foreground text-[14px] leading-[1.55]";

/* ---- Code blocks ---- */
export const codeBlock =
	"rounded-huly-cards border border-border bg-[color-mix(in_srgb,var(--card)_60%,var(--muted))] text-[color-mix(in_srgb,var(--foreground)_90%,transparent)] py-4 px-4.5 font-[ui-monospace,SFMono-Regular,Menlo,monospace] text-[12.5px] leading-[1.6] overflow-x-auto whitespace-pre";

/* ---- Mini interactive editor ---- */
export const miniEditor =
	"grid grid-cols-1 gap-4.5 items-start min-[920px]:grid-cols-[360px_1fr]";
export const field = "flex flex-col gap-2";
export const label =
	"text-[12px] font-semibold tracking-[0.06em] uppercase text-muted-foreground";
export const swatchRow = "inline-flex gap-2.5";

/* Live preview surface for the mini editor */
export const miniPreviewWrap = "flex flex-col gap-4";
export const miniPreview =
	"relative overflow-hidden rounded-huly-cards border border-border bg-card min-h-[280px] grid place-items-center py-12 px-8";
export const previewBlock = "relative z-1 w-full max-w-[40ch]";
export const previewAligncenter = "text-center mx-auto";
export const previewAlignleft = "text-left";
export const previewEyebrow =
	"text-[12px] font-semibold tracking-[0.14em] uppercase mb-3";
export const previewHeadline =
	"font-huly-display font-semibold text-[clamp(1.75rem,4vw,2.5rem)] leading-none tracking-[-0.03em] text-foreground mb-3.5";
export const previewBody =
	"text-muted-foreground text-[15px] leading-[1.5] mb-5.5";
export const previewCta =
	"inline-flex items-center rounded-huly-buttons py-[11px] px-5.5 text-[14px] font-medium text-white";
export const previewGlow =
	"absolute [inset:auto_-10%_-40%_auto] w-[380px] h-[380px] rounded-full blur-[10px] opacity-45 z-0";

/* ---- Embedded live editor (iframe) ---- */
export const embedFrame =
	"rounded-huly-cards border border-border bg-card shadow-huly-xl overflow-hidden";
export const embed =
	"block w-full h-[760px] border-0 bg-background max-[720px]:h-[560px]";

/* ---- Generic prose for About ---- */
export const proseList =
	"grid gap-3 m-0 p-0 list-none [&_li]:relative [&_li]:pl-[26px] [&_li]:text-muted-foreground [&_li]:text-[15px] [&_li]:leading-[1.55] [&_li]:before:content-[''] [&_li]:before:absolute [&_li]:before:left-0 [&_li]:before:top-2 [&_li]:before:w-2 [&_li]:before:h-2 [&_li]:before:rounded-full [&_li]:before:bg-huly-iris";

/* Two-column split used on the editor / about pages */
export const split =
	"grid grid-cols-1 gap-10 items-center min-[920px]:grid-cols-2";
