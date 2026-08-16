import { deriveSchemas } from "@anvilkit/plugin-code-editor";
import { configToAiContext, identifySlotFields } from "@anvilkit/schema";
import type { Config, Field } from "@puckeditor/core";

/**
 * The AI catalog types are owned by `@anvilkit/contracts`, but no app in
 * this workspace takes that dependency (`apps/studio` does not either).
 * Deriving them from the builder's own return type leaves the app's
 * dependency edges exactly where they are, and can never drift from the
 * builder they describe.
 */
export type AiGenerationContext = ReturnType<typeof configToAiContext>;
type AiComponentSchema = AiGenerationContext["availableComponents"][number];
type AiFieldSchema = AiComponentSchema["fields"][number];

/**
 * Catalog + prompt assembly (DOC-02 §6, FR-031).
 *
 * Two rules shape this file:
 *
 * 1. **No new catalog type.** The catalog IS
 *    `configToAiContext(config).availableComponents` (DOC-02 §3/§15.1) —
 *    already deterministic and name-sorted. This module renders it; it
 *    does not restate it.
 * 2. **No gate fork (FR-C13).** The embedded JSON Schema comes from the
 *    same `deriveSchemas` the code editor validates with, so the model is
 *    shown exactly the contract its output will be judged against.
 *
 * Prompt text is English and code-owned: these strings are model-facing,
 * not chrome, so they are template constants rather than i18n catalog
 * entries. `locale` steers the *generated content* language only.
 *
 * Assembly is deterministic — the same config and request produce a
 * byte-identical bundle, which is what makes the snapshot tests meaningful.
 */

export type RunKind = "outline" | "section" | "page" | "refine";

export interface PromptBundle {
	readonly system: {
		readonly role: string;
		readonly catalog: string;
		readonly rules: string;
		readonly outputContract: string;
	};
	/** Depth-bounded JSON Schema of the expected artifact (DOC-02 §7.2). */
	readonly jsonSchema: Record<string, unknown>;
	/** The raw structured catalog, for providers with native schema modes. */
	readonly catalogData: AiGenerationContext;
	/** BCP 47 — a CONTENT language hint; editor chrome i18n is separate. */
	readonly locale?: string;
	readonly theme?: "light" | "dark";
}

export interface PromptBundleOptions {
	readonly config: Config;
	readonly kind: RunKind;
	readonly locale?: string;
	readonly theme?: "light" | "dark";
	/** Appended verbatim after the rules block (section/refine context). */
	readonly extraRules?: readonly string[];
}

/**
 * Fields never shown to the model (DOC-02 §6.2 + rule R6).
 *
 * The three hidden carriers plus the two styling passthroughs: the model
 * must express styling through declared variant/size options only, and
 * naming these would tempt it to emit them.
 */
const OMITTED_FIELD_NAMES = new Set([
	"appearance",
	"interactions",
	"bindings",
	"animation",
	"classNames",
]);

/** Puck field types the extractor marks non-generatable. */
const OMITTED_FIELD_TYPES = new Set(["custom", "external"]);

/**
 * The catalog. A thin, intention-revealing alias over the shared builder —
 * the whitelist is exactly `Object.keys(config.components)`, so nothing
 * else in the app needs to list component names.
 */
export function buildCatalog(config: Config): AiGenerationContext {
	return configToAiContext(config);
}

/** Component type names the model may use. */
export function whitelistOf(config: Config): readonly string[] {
	return buildCatalog(config).availableComponents.map(
		(component) => component.componentName,
	);
}

function fieldsOf(config: Config, type: string): Record<string, Field> {
	return (config.components?.[type]?.fields ?? {}) as Record<string, Field>;
}

/** Render one field as its catalog line fragment. */
function renderField(field: AiFieldSchema): string {
	if (field.type === "select" && field.options && field.options.length > 0) {
		const values = field.options.map((option) => option.value).join(" | ");
		return `${field.name} (select: ${values})`;
	}
	if (field.type === "array") {
		const item = field.itemSchema;
		const inner = item?.properties
			?.map((property) => renderField(property))
			.join(", ");
		return inner === undefined
			? `${field.name} (array)`
			: `${field.name} (array, items: { ${inner} })`;
	}
	if (field.type === "object" && field.properties) {
		const inner = field.properties
			.map((property) => renderField(property))
			.join(", ");
		return `${field.name} (object: { ${inner} })`;
	}
	return `${field.name} (${field.type})${field.required === true ? " required" : ""}`;
}

/**
 * DOC-02 §6.2 rendering. Slot-ness and non-generatability are decided from
 * the live `Config` rather than sniffed out of the rendered description —
 * the extractor maps slots to `type: "object"`, which is indistinguishable
 * from a real object field once the Puck field type is gone.
 */
export function renderCatalog(
	config: Config,
	context: AiGenerationContext = buildCatalog(config),
): string {
	// The shared, already-sorted slot index — the same helper the rest of
	// the workspace uses to answer "which fields are slots".
	const slotIndex = identifySlotFields(config);

	const blocks = context.availableComponents.map(
		(component: AiComponentSchema) => {
			const puckFields = fieldsOf(config, component.componentName);
			const slotNames = new Set(slotIndex.get(component.componentName) ?? []);
			const slots: string[] = [];
			const rendered: string[] = [];

			for (const field of component.fields) {
				const puckType = puckFields[field.name]?.type;
				if (
					OMITTED_FIELD_NAMES.has(field.name) ||
					(puckType !== undefined && OMITTED_FIELD_TYPES.has(puckType))
				) {
					continue;
				}
				if (slotNames.has(field.name)) {
					const allow = field.allow;
					slots.push(
						allow && allow.length > 0
							? `${field.name} (allow: ${allow.join(" | ")})`
							: field.name,
					);
					continue;
				}
				rendered.push(renderField(field));
			}

			const heading = component.description
				? `### ${component.componentName} — ${component.description}`
				: `### ${component.componentName}`;
			const lines = [heading];
			if (rendered.length > 0) lines.push(`fields: ${rendered.join(" · ")}`);
			if (slots.length > 0) lines.push(`slots: ${slots.join(", ")}`);
			return lines.join("\n");
		},
	);

	return blocks.join("\n\n");
}

/** DOC-02 §6.1 — one paragraph per run kind, no persona filler. */
const ROLES: Record<RunKind, string> = {
	outline:
		"You plan pages built from a fixed component catalog. Given a brief, " +
		"produce an ordered outline of the sections the page needs. You do not " +
		"write the sections themselves.",
	section:
		"You compose one section of a page from a fixed component catalog, " +
		"following an outline entry you are given.",
	page: "You compose complete pages from a fixed component catalog.",
	refine:
		"You revise an existing selection by proposing editor intents. You do " +
		"not rewrite the document.",
};

/** DOC-02 §6.3 — the canonical, numbered v1 rules text. */
function renderRules(locale: string | undefined): string {
	return [
		"Rules:",
		"R1. Use ONLY the component types listed in the catalog. Any other type is rejected.",
		"R2. Use ONLY the listed fields per component, with values matching the listed type;",
		"    for select fields use ONLY the listed option values, verbatim.",
		'R3. NEVER emit "id" or "akId" — identifiers are assigned by the editor.',
		'R4. Slot content is expressed as "children" arrays; when a component lists more than',
		'    one slot, each child carries "slot": "<slotName>" from the listed slot names.',
		"R5. Nesting depth must not exceed 16 levels.",
		'R6. Do not emit fields named "appearance", "interactions", "bindings" or "animation".',
		"    Styling is expressed ONLY through the listed variant/size/option fields.",
		`R7. Content language: ${locale ?? "match the user's brief"}.`,
		"R8. Emit exactly ONE JSON object matching the provided schema — no prose, no code",
		"    fences, no comments, no trailing text.",
	].join("\n");
}

/** DOC-02 §6.4 — the schema, prefixed by its one-sentence instruction. */
function renderOutputContract(jsonSchema: Record<string, unknown>): string {
	return [
		"Your entire reply must be a single JSON object valid against this schema.",
		JSON.stringify(jsonSchema, null, "\t"),
	].join("\n");
}

/**
 * Assemble the full prompt bundle. Deterministic: same config + same
 * options ⇒ byte-identical output.
 */
export function buildPromptBundle(options: PromptBundleOptions): PromptBundle {
	const { config, kind, locale, theme, extraRules } = options;
	const catalogData = buildCatalog(config);
	// FR-C13: the SAME gate the code editor validates with.
	const { jsonSchema } = deriveSchemas(config);

	const rules = [renderRules(locale), ...(extraRules ?? [])].join("\n");

	return {
		system: {
			role: ROLES[kind],
			catalog: renderCatalog(config, catalogData),
			rules,
			outputContract: renderOutputContract(jsonSchema),
		},
		jsonSchema,
		catalogData,
		...(locale === undefined ? {} : { locale }),
		...(theme === undefined ? {} : { theme }),
	};
}

/** The four system blocks concatenated in DOC-02 §6 order. */
export function renderSystemPrompt(bundle: PromptBundle): string {
	const { role, catalog, rules, outputContract } = bundle.system;
	return [role, catalog, rules, outputContract].join("\n\n");
}
