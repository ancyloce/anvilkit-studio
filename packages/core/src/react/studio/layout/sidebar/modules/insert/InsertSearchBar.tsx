/**
 * @file Debounced search input for the `insert` module (PRD §5.4).
 *
 * Mirrors the `drawerSearch` slice in the editor UI store, but flushes
 * keystrokes through a 150 ms timer so high-frequency typing does not
 * thrash the predicate-classification pass that lives in
 * {@link InsertDrawerBody}. Local state is the source of truth for the
 * input element (so the user always sees what they typed); the store
 * receives the debounced value.
 *
 * Search is transient — `drawerSearch` is intentionally excluded from
 * persistence (see `editor-ui-store.ts`).
 */

import { Search } from "lucide-react";
import {
	type ChangeEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

import { Input } from "../../../../primitives/Input.js";
import { useMsg } from "../../../../state/editor-i18n-store.js";
import { useDrawerSearch } from "../../../../state/hooks.js";

const DEBOUNCE_MS = 150;

export function InsertSearchBar(): ReactNode {
	const msg = useMsg();
	const [storeValue, setStoreValue] = useDrawerSearch();
	const [draft, setDraft] = useState(storeValue);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		return () => {
			if (timerRef.current !== null) {
				clearTimeout(timerRef.current);
			}
		};
	}, []);

	const handleChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => {
			const next = event.target.value;
			setDraft(next);
			if (timerRef.current !== null) {
				clearTimeout(timerRef.current);
			}
			timerRef.current = setTimeout(() => {
				setStoreValue(next);
				timerRef.current = null;
			}, DEBOUNCE_MS);
		},
		[setStoreValue],
	);

	const placeholder = msg("studio.module.insert.search.placeholder");

	return (
		<div className="relative">
			<Search
				className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-[var(--ak-studio-muted-fg)]"
				aria-hidden="true"
			/>
			<Input
				type="search"
				value={draft}
				onChange={handleChange}
				placeholder={placeholder}
				aria-label={placeholder}
				className="pl-7"
			/>
		</div>
	);
}
