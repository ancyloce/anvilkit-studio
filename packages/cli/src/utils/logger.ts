import pc from "picocolors";

function write(prefix: string, message: string): void {
	process.stderr.write(`${prefix} ${message}\n`);
}

export function info(message: string): void {
	write(pc.cyan("›"), message);
}

export function warn(message: string): void {
	write(pc.yellow("!"), message);
}

export function error(message: string): void {
	write(pc.red("×"), message);
}

export function success(message: string): void {
	write(pc.green("✓"), message);
}
