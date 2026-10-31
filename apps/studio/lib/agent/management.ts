/**
 * @file Pure helpers of the knowledge and MCP management views (P20).
 * Nothing here fetches.
 */
import type { components } from "./generated/agent";

type Schemas = components["schemas"];

export type Source = Schemas["Source"];
export type SourcePage = Schemas["SourcePage"];
export type AccessEntry = Schemas["AccessEntry"];
export type SearchResponse = Schemas["SearchResponse"];
export type Snapshot = Schemas["Snapshot"];
export type RecallMemoriesResponse = Schemas["RecallMemoriesResponse"];
export type MemoryFact = Schemas["MemoryFact"];
export type MemoryPage = Schemas["MemoryPage"];
export type Descriptor = Schemas["Descriptor"];
export type CatalogPage = Schemas["CatalogPage"];
export type Grant = Schemas["Grant"];
export type GrantPage = Schemas["GrantPage"];
export type RevocationProgress = Schemas["RevocationProgress"];
export type ToolDeclaration = Schemas["ToolDeclaration"];
export type Money = Schemas["Money"];

const PRINCIPAL_TYPES = ["tenant", "project", "actor", "role"] as const;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

/**
 * Parses "type:id" access entries (space, comma or newline separated); a
 * "manage:" prefix grants manage (P2.7: read, replace the list, delete).
 * `null` when one is malformed.
 */
export function parseAccess(text: string): AccessEntry[] | null {
	const out: AccessEntry[] = [];
	for (const raw of text.split(/[\s,]+/).filter(Boolean)) {
		const manage = raw.startsWith("manage:");
		const token = manage ? raw.slice("manage:".length) : raw;
		const i = token.indexOf(":");
		const type = token.slice(0, i);
		const id = token.slice(i + 1);
		if (
			i <= 0 ||
			!(PRINCIPAL_TYPES as readonly string[]).includes(type) ||
			!ID.test(id)
		)
			return null;
		out.push({
			principalType: type as AccessEntry["principalType"],
			principalId: id,
			...(manage ? { permission: "manage" as const } : {}),
		});
	}
	return out;
}

export function formatAccess(entries: readonly AccessEntry[]): string {
	return entries
		.map(
			(e) =>
				`${e.permission === "manage" ? "manage:" : ""}${e.principalType}:${e.principalId}`,
		)
		.join(", ");
}

/**
 * Formats an amount at scale 6 (the contract's integer string) for display
 * without floating point: "1500000" USD → "USD 1.500000".
 */
export function formatMoney(money: Money): string {
	const negative = money.amount.startsWith("-");
	const digits = (negative ? money.amount.slice(1) : money.amount).padStart(
		7,
		"0",
	);
	return `${money.currency} ${negative ? "-" : ""}${digits.slice(0, -6)}.${digits.slice(-6)}`;
}

/** Parses a decimal amount ("1.5") to the contract's scale-6 integer string; `null` when malformed. */
export function parseMoney(text: string): string | null {
	const m = /^(0|[1-9][0-9]{0,23})(?:\.([0-9]{1,6}))?$/.exec(text.trim());
	if (!m?.[1]) return null;
	const scaled = `${m[1]}${(m[2] ?? "").padEnd(6, "0")}`.replace(
		/^0+(?=\d)/,
		"",
	);
	return scaled;
}

/** Revocation states told apart: admission blocked is not convergence. */
export function revocationPhase(
	p: RevocationProgress,
): "active" | "blocked" | "converging" | "converged" {
	if (p.sendersConverged) return "converged";
	if (p.newAdmissionBlocked)
		return p.controlState === "converging" ? "converging" : "blocked";
	return "active";
}
