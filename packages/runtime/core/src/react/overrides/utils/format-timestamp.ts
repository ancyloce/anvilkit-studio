/**
 * @file Shared relative-timestamp formatter for the chrome header /
 * publish panel (review findings N-b + N-c).
 *
 * Previously `PublishPanel` and `StudioHeader` each carried a
 * byte-identical `formatTimestamp` with hardcoded English relative-time
 * strings. This single helper de-duplicates them and threads `msg` so
 * the relative-time strings flow through the i18n catalog
 * (`studio.time.*`) like the rest of the chrome.
 */

/** The `useMsg()` resolver shape — `(key, fallback?) => string`. */
type MsgResolver = (key: string, fallback?: string) => string;

/**
 * Format a timestamp as a short relative label: `"just now"` under a
 * minute, `"{n}m ago"` under an hour, otherwise the localized clock
 * time. The first two strings resolve through `msg` (`studio.time.*`);
 * the clock fallback uses the host locale via `toLocaleTimeString`.
 */
export function formatRelativeTimestamp(date: Date, msg: MsgResolver): string {
	const minutes = Math.floor((Date.now() - date.getTime()) / 60_000);
	if (minutes < 1) return msg("studio.time.justNow");
	if (minutes < 60) {
		return msg("studio.time.minutesAgo").replace("{minutes}", String(minutes));
	}
	return date.toLocaleTimeString(undefined, {
		hour: "2-digit",
		minute: "2-digit",
	});
}
