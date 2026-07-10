function levenshtein(a: string, b: string): number {
	const m = a.length;
	const n = b.length;
	if (m === 0) return n;
	if (n === 0) return m;

	// Single rolling buffer of length n+1 plus one saved diagonal.
	const buf = new Array<number>(n + 1);
	for (let j = 0; j <= n; j++) buf[j] = j;

	for (let i = 1; i <= m; i++) {
		let prevDiag = buf[0]!;
		buf[0] = i;
		const ai = a.charCodeAt(i - 1);
		for (let j = 1; j <= n; j++) {
			const above = buf[j]!;
			const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
			const del = above + 1;
			const ins = buf[j - 1]! + 1;
			const sub = prevDiag + cost;
			buf[j] = del < ins ? (del < sub ? del : sub) : ins < sub ? ins : sub;
			prevDiag = above;
		}
	}

	return buf[n]!;
}

export function closestMatch(
	needle: string,
	haystack: readonly string[],
): string | undefined {
	if (haystack.length === 0) return undefined;
	const lowerNeedle = needle.toLowerCase();
	let best: string | undefined;
	let bestDist = Number.POSITIVE_INFINITY;
	for (let i = 0; i < haystack.length; i++) {
		const candidate = haystack[i]!;
		const dist = levenshtein(lowerNeedle, candidate.toLowerCase());
		if (dist < bestDist) {
			bestDist = dist;
			best = candidate;
		}
	}
	// Tighter than half the needle so short identifiers don't match
	// arbitrary candidates; also reject distance >= needle.length so a
	// suggestion always has at least one character in common.
	const threshold = Math.max(2, Math.ceil(needle.length / 3));
	if (bestDist <= threshold && bestDist < needle.length) {
		return best;
	}
	return undefined;
}
