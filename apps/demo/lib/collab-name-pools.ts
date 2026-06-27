import type { DemoLocale } from "@/lib/i18n/messages";

/**
 * Locale-aware collaborator name generation for the demo's presence cursors.
 *
 * A fresh visitor's display name is built as `"<guestPrefix>-<name>"` in the
 * demo's active language (the cookie-driven {@link DemoLocale}), e.g.
 * `Guest-John` (en), `访客-张伟` (zh), `ゲスト-さくら` (ja), `손님-지훈` (ko).
 *
 * Extensibility: add a language by adding one entry to {@link COLLAB_NAME_POOLS}.
 * Because the key type is `DemoLocale` (the union that already governs the rest
 * of demo i18n), the compiler enforces that every supported locale has a pool.
 */
export interface NamePool {
	/** Localized "guest/visitor" prefix shown before the given name. */
	readonly guestPrefix: string;
	/** Given-name pool; one is picked deterministically from the peer id. */
	readonly names: readonly string[];
}

export const COLLAB_NAME_POOLS: Record<DemoLocale, NamePool> = {
	en: {
		guestPrefix: "Guest",
		names: ["John", "Emma", "Liam", "Olivia", "Noah", "Ava", "Mia", "Lucas"],
	},
	zh: {
		guestPrefix: "访客",
		names: ["张伟", "王芳", "李娜", "刘洋", "陈静", "杨磊", "黄敏", "赵强"],
	},
	ja: {
		guestPrefix: "ゲスト",
		names: [
			"さくら",
			"ハルト",
			"ユイ",
			"ソウタ",
			"ミオ",
			"レン",
			"アオイ",
			"ハナ",
		],
	},
	ko: {
		guestPrefix: "손님",
		names: ["지훈", "서연", "민준", "하윤", "도윤", "지우", "예준", "수아"],
	},
};

/** Stable, non-negative hash of a seed string (same style as `peerColor`). */
function hashSeed(seed: string): number {
	let hash = 0;
	for (const ch of seed) {
		hash = (hash * 31 + ch.charCodeAt(0)) | 0;
	}
	return ((hash % 1_000_000) + 1_000_000) % 1_000_000;
}

/**
 * Deterministic, locale-aware `"<prefix>-<name>"` for a peer. The same `seed`
 * always yields the same name, so two tabs of one identity (and the remote
 * view of a peer) agree. Unknown locales fall back to English.
 */
export function localizedDisplayName(locale: DemoLocale, seed: string): string {
	const pool = COLLAB_NAME_POOLS[locale] ?? COLLAB_NAME_POOLS.en;
	const name = pool.names[hashSeed(seed) % pool.names.length];
	return `${pool.guestPrefix}-${name}`;
}
