export interface CliErrorOptions {
	readonly code: string;
	readonly exitCode?: number;
	readonly message: string;
}

export class CliError extends Error {
	readonly code: string;
	readonly exitCode: number;

	constructor({ code, exitCode = 1, message }: CliErrorOptions) {
		super(message);
		this.name = "CliError";
		this.code = code;
		this.exitCode = exitCode;
	}
}
