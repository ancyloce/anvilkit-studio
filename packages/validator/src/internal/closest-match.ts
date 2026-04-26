function levenshtein(a: string, b: string): number {
	const m = a.length;
	const n = b.length;
	if (m === 0) return n;
	if (n === 0) return m;

	let prev = new Array<number>(n + 1);
	let curr = new Array<number>(n + 1);
	for (let j = 0; j <= n; j++) prev[j] = j;

	for (let i = 1; i <= m; i++) {
		curr[0] = i;
		const ai = a.charCodeAt(i - 1);
		for (let j = 1; j <= n; j++) {
			const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
			const del = prev[j]! + 1;
			const ins = curr[j - 1]! + 1;
			const sub = prev[j - 1]! + cost;
			curr[j] = del < ins ? (del < sub ? del : sub) : ins < sub ? ins : sub;
		}
		const tmp = prev;
		prev = curr;
		curr = tmp;
	}

	return prev[n]!;
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
