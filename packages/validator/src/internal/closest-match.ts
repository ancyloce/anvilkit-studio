function levenshtein(a: string, b: string): number {
	const m = a.length;
	const n = b.length;
	const dp: number[][] = Array.from({ length: m + 1 }, () =>
		Array.from({ length: n + 1 }, () => 0),
	);
	for (let i = 0; i <= m; i++) dp[i]![0] = i;
	for (let j = 0; j <= n; j++) dp[0]![j] = j;
	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			dp[i]![j] = Math.min(
				dp[i - 1]![j]! + 1,
				dp[i]![j - 1]! + 1,
				dp[i - 1]![j - 1]! + cost,
			);
		}
	}
	return dp[m]![n]!;
}

export function closestMatch(
	needle: string,
	haystack: readonly string[],
): string | undefined {
	if (haystack.length === 0) return undefined;
	let best: string | undefined;
	let bestDist = Number.POSITIVE_INFINITY;
	const lowerNeedle = needle.toLowerCase();
	for (const candidate of haystack) {
		const dist = levenshtein(lowerNeedle, candidate.toLowerCase());
		if (dist < bestDist) {
			bestDist = dist;
			best = candidate;
		}
	}
	const threshold = Math.max(3, Math.ceil(needle.length / 2));
	return bestDist <= threshold ? best : undefined;
}
