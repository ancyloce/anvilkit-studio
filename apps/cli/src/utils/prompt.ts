import { CliError } from "./errors.js";

export interface PromptTextOptions {
	readonly message: string;
	readonly defaultValue?: string;
	readonly when?: boolean;
}

export interface PromptSelectOption<T> {
	readonly value: T;
	readonly label: string;
	readonly hint?: string;
}

export interface PromptSelectOptions<T> {
	readonly message: string;
	readonly options: readonly PromptSelectOption<T>[];
	readonly defaultValue?: T;
}

type ClackPromptsModule = typeof import("@clack/prompts");

export function isInteractive(): boolean {
	return (
		Boolean(process.stdin.isTTY) &&
		!process.env.CI &&
		!process.argv.includes("--no-input")
	);
}

export async function promptText({
	message,
	defaultValue,
	when = true,
}: PromptTextOptions): Promise<string> {
	if (!when) {
		return defaultValue ?? "";
	}

	ensureInteractive(message);
	const prompts = await loadPrompts();
	const result = await prompts.text({
		message,
		initialValue: defaultValue,
		placeholder: defaultValue,
		validate(value) {
			if ((value ?? "").trim().length === 0) {
				return `${message} is required.`;
			}
			return undefined;
		},
	});

	if (prompts.isCancel(result)) {
		throw new CliError({
			code: "PROMPT_CANCELLED",
			exitCode: 1,
			message: "Prompt cancelled.",
		});
	}

	return result.trim();
}

export async function promptSelect<T>({
	message,
	options,
	defaultValue,
}: PromptSelectOptions<T>): Promise<T> {
	ensureInteractive(message);
	const prompts = await loadPrompts();
	const normalizedOptions = options.map((option) => ({
		value: option.value,
		label: option.label,
		hint: option.hint,
	})) as Parameters<typeof prompts.select<T>>[0]["options"];
	const result = await prompts.select<T>({
		message,
		options: normalizedOptions,
		initialValue: defaultValue,
	});

	if (prompts.isCancel(result)) {
		throw new CliError({
			code: "PROMPT_CANCELLED",
			exitCode: 1,
			message: "Prompt cancelled.",
		});
	}

	return result;
}

function ensureInteractive(message: string): void {
	if (isInteractive()) {
		return;
	}

	throw new CliError({
		code: "MISSING_FLAG",
		exitCode: 2,
		message: `Missing ${message}; pass a flag for non-TTY use.`,
	});
}

async function loadPrompts(): Promise<ClackPromptsModule> {
	return import("@clack/prompts");
}
