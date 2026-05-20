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

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/primitives/input-group";
import { useMsg } from "@/state/editor-i18n-store";

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
    <InputGroup>
      <InputGroupAddon>
        <Search aria-hidden="true" />
      </InputGroupAddon>
      <InputGroupInput
        type="search"
        value={draft}
        onChange={handleChange}
        placeholder={placeholder}
        aria-label={placeholder}
        data-testid="ak-image-search"
      />
    </InputGroup>
  );
}
