/**
 * @file Minimal `DataTransfer` test double — jsdom does not implement
 * a usable one. Backs `getData`/`setData`/`types` with a Map.
 */

export interface DataTransferDouble extends DataTransfer {
	readonly store: Map<string, string>;
}

export function createDataTransfer(): DataTransferDouble {
	const store = new Map<string, string>();
	const dt = {
		store,
		dropEffect: "none" as DataTransfer["dropEffect"],
		effectAllowed: "all" as DataTransfer["effectAllowed"],
		get types(): readonly string[] {
			return [...store.keys()];
		},
		setData(type: string, value: string): void {
			store.set(type, value);
		},
		getData(type: string): string {
			return store.get(type) ?? "";
		},
		clearData(type?: string): void {
			if (type === undefined) store.clear();
			else store.delete(type);
		},
	};
	return dt as unknown as DataTransferDouble;
}

/** Build a drag DOM event carrying `dataTransfer` + pointer coords. */
export function makeDragEvent(
	type: "dragover" | "dragleave" | "drop",
	dataTransfer: DataTransfer,
	coords: {
		clientX: number;
		clientY: number;
		relatedTarget?: EventTarget | null;
	},
): DragEvent {
	const event = new Event(type, {
		bubbles: true,
		cancelable: true,
	}) as unknown as {
		dataTransfer: DataTransfer;
		clientX: number;
		clientY: number;
		relatedTarget: EventTarget | null;
	};
	event.dataTransfer = dataTransfer;
	event.clientX = coords.clientX;
	event.clientY = coords.clientY;
	event.relatedTarget = coords.relatedTarget ?? null;
	return event as unknown as DragEvent;
}
