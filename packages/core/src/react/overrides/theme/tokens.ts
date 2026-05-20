/**
 * @file Typed accessors for `--ak-studio-*` CSS variables.
 *
 * The chrome reads token values via inline styles or via Tailwind's
 * `bg-[var(--ak-studio-bg)]` arbitrary-value syntax. When a renderer
 * needs the resolved value at runtime (e.g. drawing on a `<canvas>`),
 * `readToken("bg")` resolves it through `getComputedStyle` of the
 * passed element (or `documentElement`).
 */

export type StudioToken =
  | "bg"
  | "fg"
  | "panel"
  | "panel-fg"
  | "border"
  | "muted"
  | "muted-fg"
  | "accent"
  | "accent-fg"
  | "ring";

export const STUDIO_TOKENS: readonly StudioToken[] = [
  "bg",
  "fg",
  "panel",
  "panel-fg",
  "border",
  "muted",
  "muted-fg",
  "accent",
  "accent-fg",
  "ring",
];

export function tokenVar(token: StudioToken): string {
  return `var(--ak-studio-${token})`;
}

export function tokenName(token: StudioToken): string {
  return `--ak-studio-${token}`;
}

/**
 * Resolve a token to its current computed value. Returns the empty
 * string in non-DOM environments and when the variable is unset.
 */
export function readToken(token: StudioToken, target?: Element): string {
  if (typeof window === "undefined") return "";
  const element = target ?? document.documentElement;
  return window
    .getComputedStyle(element)
    .getPropertyValue(tokenName(token))
    .trim();
}
