export interface BenchResult {
	/** Stable identifier — used as the key in `baseline.json`. */
	readonly name: string;
	/** Mean duration of one invocation, in ms. */
	readonly meanMs: number;
	/** Throughput (operations per second). */
	readonly hz: number;
	/** Output size, in bytes. Only set for byte-producing benches (html-export). */
	readonly bytes?: number;
}

export interface BenchBaselineEntry {
	readonly meanMs: number;
	readonly hz: number;
	readonly bytes?: number;
	/** ISO-8601 timestamp when the baseline row was last written. */
	readonly recordedAt: string;
}

export type BenchBaseline = Record<string, BenchBaselineEntry>;

export interface BenchComparison {
	readonly name: string;
	readonly meanMs: number;
	readonly baselineMeanMs: number | null;
	readonly meanDeltaPct: number | null;
	readonly bytes?: number;
	readonly baselineBytes?: number;
	readonly bytesDeltaPct: number | null;
	readonly regression: boolean;
	readonly reasons: string[];
}
