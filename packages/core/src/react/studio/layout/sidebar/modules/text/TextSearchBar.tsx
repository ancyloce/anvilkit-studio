/**
 * @file `text` module search input.
 *
 * Mirrors {@link ../image/ImageSearchBar.tsx} — debounced 150 ms,
 * parent-controlled, transient (PRD §9.3 — copy search is not
 * persisted). The parent threads the debounced query into the snippet
 * filter pipeline; this component owns the visible draft state for
 * keystroke responsiveness.
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

export interface TextSearchBarProps {
  readonly onChange: (next: string) => void;
}

export function TextSearchBar({ onChange }: TextSearchBarProps): ReactNode {
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

  const placeholder = msg("studio.module.text.search.placeholder");

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
        data-testid="ak-text-search"
      />
    </InputGroup>
  );
}
