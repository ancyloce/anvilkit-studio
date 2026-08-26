/**
 * Minimum interval between rich-text field commits while the user is typing.
 *
 * TipTap owns the responsive editing surface, so the serialized Puck value can
 * update at a lower cadence without delaying text input. Blur and teardown
 * still flush synchronously so the final value is never left pending.
 */
export const RICH_TEXT_COMMIT_INTERVAL_MS = 100;

export interface RichTextSnapshot {
	getHTML(): string;
}

export interface RichTextCommitBuffer {
	schedule(snapshot: RichTextSnapshot): void;
	flush(): void;
	cancel(): void;
}

/**
 * Coalesce a burst of editor transactions into at most one HTML serialization
 * and field commit per interval. The latest snapshot always wins.
 */
export function createRichTextCommitBuffer(
	commit: (html: string) => void,
	intervalMs = RICH_TEXT_COMMIT_INTERVAL_MS,
): RichTextCommitBuffer {
	let pendingSnapshot: RichTextSnapshot | null = null;
	let timer: ReturnType<typeof setTimeout> | null = null;

	const flush = (): void => {
		if (timer !== null) {
			clearTimeout(timer);
			timer = null;
		}
		if (pendingSnapshot === null) {
			return;
		}

		const snapshot = pendingSnapshot;
		pendingSnapshot = null;
		commit(snapshot.getHTML());
	};

	return {
		schedule(snapshot) {
			pendingSnapshot = snapshot;
			if (timer === null) {
				timer = setTimeout(flush, intervalMs);
			}
		},
		flush,
		cancel() {
			pendingSnapshot = null;
			if (timer !== null) {
				clearTimeout(timer);
				timer = null;
			}
		},
	};
}
