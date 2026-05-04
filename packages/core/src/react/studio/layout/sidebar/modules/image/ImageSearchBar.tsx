/**
 * @file `image` module search input.
 *
 * Mirrors `InsertSearchBar` but writes to a parent-controlled callback
 * instead of a store slice — PRD §9.3 explicitly excludes asset search
 * from persistence. The parent owns the debounced query and threads it
 * into the asset filter pipeline; this component is a controlled input
 * that emits a debounced 150 ms `onChange`.
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

const DEBOUNCE_MS = 150;

export interface ImageSearchBarProps {
	readonly onChange: (next: string) => void;
}

export function ImageSearchBar({ onChange }: ImageSearchBarProps): ReactNode {
	const msg = useMsg();
	const [draft, setDraft] = useState("");
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
				onChange(next);
				timerRef.current = null;
			}, DEBOUNCE_MS);
		},
		[onChange],
	);

	const placeholder = msg("studio.module.image.search.placeholder");

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
				data-testid="ak-image-search"
			/>
		</div>
	);
}
