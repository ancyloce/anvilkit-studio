/**
 * @file Interaction validation — caps, structure, and the §16 URL
 * rules (PLAN-0020 CORE-P3-001; DD-0019 §16; ED-INT-001/002).
 *
 * ### Why URL checking is layered rather than delegated
 *
 * `@anvilkit/schema`'s `InteractionSchema` bakes in the strict §16
 * allowlist (`http`, `https`, `mailto`, `tel`). That is the right
 * default and stays the persistence contract. But §22.4 gives hosts
 * `EditorPolicies.allowRawUrls`, which has to be able to relax
 * *something* — and a frozen schema cannot see host policy. So the
 * schema runs first as the strict structural gate, and policy is
 * layered on top: when a parse fails **only** on URL-scheme
 * refinements and the host set `allowRawUrls`, those specific issues
 * are reconsidered under the policy.
 *
 * ### What policy can never relax
 *
 * §16 says `javascript:` is "always rejected", and this file treats
 * that as absolute — {@link ALWAYS_FORBIDDEN_SCHEMES} is checked
 * before and independently of any policy, so no host configuration
 * can admit it.
 *
 * That set also contains `data:` and `vbscript:`, which §16 does not
 * name. This is a deliberate, flagged extension rather than an
 * oversight: both execute attacker-controlled script when navigated
 * to (`data:text/html,<script>…`), so admitting them under
 * `allowRawUrls` would open exactly the hole the `javascript:` ban
 * exists to close. Narrowing this set back to the letter of §16 is a
 * one-line change if review prefers the literal reading.
 *
 * Node-existence checks are absent on purpose — see this package's
 * `commands/validate.ts` header: `AuthoringStateV1` alone cannot tell
 * a missing node from a default-state one. Dangling references are a
 * *resolution* concern, handled by `resolveInteraction`.
 */

import type {
	AuthoringStateV1,
	EditorError,
	EditorPolicies,
	InteractionV1,
} from "@anvilkit/contracts/editor";
import { EDITOR_COUNT_LIMITS } from "@anvilkit/contracts/editor";
import { InteractionSchema } from "@anvilkit/schema/editor";
import { makeEditorError } from "../diagnostics.js";

/**
 * Schemes no host policy may ever admit. See the file header for why
 * this is wider than §16's literal text.
 */
const ALWAYS_FORBIDDEN_SCHEMES: ReadonlySet<string> = new Set([
	"javascript",
	"data",
	"vbscript",
]);

/**
 * Extract a URL's scheme, lowercased. Returns `undefined` for a
 * relative or scheme-less string.
 *
 * Leading control characters and whitespace are stripped first:
 * browsers ignore them when resolving a URL, so `"javascript:x"`
 * navigates as `javascript:` while a naive regex sees no scheme at
 * all. Normalising here keeps the check aligned with what a browser
 * will actually do.
 */
export function urlScheme(url: string): string | undefined {
	// Per the URL spec a parser removes ASCII tab and newline from
	// anywhere in the input, then strips leading C0-control-or-space.
	// Both matter here: `java\tscript:x` and `\u0001javascript:x` each
	// navigate as `javascript:`, so a scheme check that skips this
	// normalisation can be walked straight past.
	const withoutTabs = url.replace(/[\t\n\r]/g, "");
	let start = 0;
	while (start < withoutTabs.length && withoutTabs.charCodeAt(start) <= 0x20) {
		start += 1;
	}
	const cleaned = withoutTabs.slice(start);
	return /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(cleaned)?.[1]?.toLowerCase();
}

/** Every `url` action carried by an interaction, with its index. */
function urlActions(
	interaction: InteractionV1,
): readonly { readonly index: number; readonly url: string }[] {
	const found: { index: number; url: string }[] = [];
	interaction.actions.forEach((action, index) => {
		if (action.type === "url") found.push({ index, url: action.url });
	});
	return found;
}

/**
 * Schemes that are forbidden outright, independent of policy. Always
 * run, and run first — a `javascript:` action is rejected whether or
 * not the structural parse also failed.
 */
function forbiddenSchemeErrors(
	interaction: InteractionV1,
): readonly EditorError[] {
	const errors: EditorError[] = [];
	for (const { index, url } of urlActions(interaction)) {
		const scheme = urlScheme(url);
		if (scheme !== undefined && ALWAYS_FORBIDDEN_SCHEMES.has(scheme)) {
			errors.push(
				makeEditorError(
					"EDITOR_INVALID_CSS_VALUE",
					`interaction action URL scheme "${scheme}:" is never permitted (DD-0019 §16)`,
					{
						path: ["actions", index, "url"],
						details: {
							kind: "interaction-url",
							interactionId: interaction.id,
							scheme,
							policyOverridable: false,
						},
					},
				),
			);
		}
	}
	return errors;
}

/**
 * True when a Zod issue is the `SafeUrlSchema` scheme refinement —
 * the one issue class `allowRawUrls` is allowed to reconsider.
 *
 * Matched on the issue *path* (an action's `url` member) rather than
 * the message text, so rewording the schema's message cannot silently
 * widen what policy may relax.
 */
function isUrlSchemeIssue(issue: { readonly path: PropertyKey[] }): boolean {
	return issue.path.length > 0 && issue.path[issue.path.length - 1] === "url";
}

/**
 * Structural validation, with `allowRawUrls` layered over the schema's
 * strict URL refinement.
 */
function structureErrors(
	interaction: InteractionV1,
	policies: EditorPolicies,
): readonly EditorError[] {
	const parsed = InteractionSchema.safeParse(interaction);
	if (parsed.success) return [];

	const issues = parsed.error.issues;
	const relaxable = policies.allowRawUrls === true;
	const surfaced = relaxable
		? issues.filter((i) => !isUrlSchemeIssue(i))
		: issues;
	if (surfaced.length === 0) return [];

	// One aggregated error per interaction, matching
	// `styleDefinitionShapeErrors`. Emitting one error per issue would
	// be unbounded on a hostile document — a deeply malformed
	// interaction can produce hundreds of Zod issues.
	return [
		makeEditorError(
			"EDITOR_INVALID_CSS_VALUE",
			`interaction "${interaction.id}" is not valid`,
			{
				details: {
					kind: "interaction",
					interactionId: interaction.id,
					issueCount: surfaced.length,
					firstPath: surfaced[0]?.path.map(String) ?? [],
				},
			},
		),
	];
}

/**
 * Validate an `interaction.create` command against the document.
 *
 * Rejects: duplicate ids, the §7.3 per-document and per-interaction
 * caps, structural violations, and forbidden URL schemes. Deliberately
 * does **not** reject references to nodes that are absent from the
 * authoring state — see the file header.
 */
export function interactionCreateErrors(
	state: AuthoringStateV1,
	interaction: InteractionV1,
	policies: EditorPolicies = {},
): readonly EditorError[] {
	const errors: EditorError[] = [];

	if (Object.hasOwn(state.interactions, interaction.id)) {
		errors.push(
			makeEditorError(
				"EDITOR_COMMAND_CONFLICT",
				`interaction "${interaction.id}" already exists`,
				{
					details: {
						kind: "interaction",
						reason: "duplicate-id",
						interactionId: interaction.id,
					},
				},
			),
		);
	}

	if (
		Object.keys(state.interactions).length >=
			EDITOR_COUNT_LIMITS.interactions &&
		!Object.hasOwn(state.interactions, interaction.id)
	) {
		errors.push(
			makeEditorError(
				"EDITOR_LIMIT_EXCEEDED",
				`document already holds the maximum of ${EDITOR_COUNT_LIMITS.interactions} interactions`,
				{
					details: {
						kind: "interaction",
						limit: EDITOR_COUNT_LIMITS.interactions,
					},
				},
			),
		);
	}

	if (interaction.actions.length > EDITOR_COUNT_LIMITS.actionsPerInteraction) {
		errors.push(
			makeEditorError(
				"EDITOR_LIMIT_EXCEEDED",
				`interaction "${interaction.id}" exceeds ${EDITOR_COUNT_LIMITS.actionsPerInteraction} actions`,
				{
					details: {
						kind: "interaction",
						limit: EDITOR_COUNT_LIMITS.actionsPerInteraction,
						actual: interaction.actions.length,
					},
				},
			),
		);
	}

	// Absolute scheme bans run independently of the structural parse so
	// a `javascript:` URL is reported as such, not as a generic shape
	// error that a host might read as policy-relaxable.
	errors.push(...forbiddenSchemeErrors(interaction));
	errors.push(...structureErrors(interaction, policies));
	return errors;
}
