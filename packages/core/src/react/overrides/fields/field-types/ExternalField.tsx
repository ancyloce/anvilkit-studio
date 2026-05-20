/**
 * @file Default renderer for Puck `external` fields.
 *
 * v1 surfaces a "Pick item…" button that opens a popover containing
 * an async-loaded list. The full table-style picker from Puck's
 * reference impl is deferred — most consumers wire their own
 * external pickers via field-config callbacks.
 */

import type {
  FieldProps,
  ExternalField as PuckExternalField,
} from "@puckeditor/core";
import { ChevronDown, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { Button } from "@/primitives/button";
import { Card, CardContent } from "@/primitives/card";
import { Empty, EmptyDescription, EmptyTitle } from "@/primitives/empty";
import { Input } from "@/primitives/input";
import { ScrollArea } from "@/primitives/scroll-area";
import { Spinner } from "@/primitives/spinner";

import { FieldLabel } from "../../layout/FieldLabel";
import type { FieldRendererProps } from "./TextField";

interface ExternalFieldRendererProps extends FieldProps<
  PuckExternalField<Record<string, unknown>>,
  Record<string, unknown> | null | undefined
> {
  readonly name: string;
  readonly children?: ReactNode;
}

interface ExternalRow {
  readonly raw: unknown;
  readonly mapped: Record<string, unknown>;
  readonly summary: string;
}

function asString(input: unknown): string {
  if (typeof input === "string") return input;
  if (typeof input === "number" || typeof input === "boolean")
    return String(input);
  return "";
}

function summarize(row: unknown): string {
  if (row === null || typeof row !== "object") return asString(row);
  const obj = row as Record<string, unknown>;
  return (
    asString(obj.title) ||
    asString(obj.label) ||
    asString(obj.name) ||
    asString(obj.id) ||
    "(item)"
  );
}

// Debounce window for query → fetch, matching the sidebar search bars
// (`ImageSearchBar`, `TextSearchBar`). Keeps remote CMS sources from
// firing a request per keystroke.
const QUERY_DEBOUNCE_MS = 150;

// `fetchList` is typed by Puck as `(params: { query, filters }) => …`.
// We additionally pass an `AbortSignal` so cooperative hosts can cancel
// in-flight network work; hosts that ignore the extra property are
// unaffected (the local cancellation flag still prevents stale writes).
type FetchListWithSignal = (params: {
  query: string;
  filters: Record<string, unknown>;
  signal?: AbortSignal;
}) => Promise<unknown[] | null>;

function rowKey(row: ExternalRow): string {
  const raw =
    row.raw !== null && typeof row.raw === "object"
      ? (row.raw as Record<string, unknown>)
      : undefined;
  return (
    asString(row.mapped.id) ||
    asString(row.mapped.key) ||
    asString(raw?.id) ||
    asString(raw?.key) ||
    row.summary
  );
}

export function ExternalField({
  field,
  value,
  onChange,
  readOnly,
  id,
  name,
}: ExternalFieldRendererProps): ReactNode {
  const [open, setOpen] = useState(false);
  // Seed query/filters from Puck's documented external-field contract.
  // Ignoring `initialQuery` / `initialFilters` silently changes the
  // result set a host configured.
  const [query, setQuery] = useState(() => field.initialQuery ?? "");
  const [debouncedQuery, setDebouncedQuery] = useState(
    () => field.initialQuery ?? "",
  );
  const [filters, setFilters] = useState<Record<string, unknown>>(() => ({
    ...(field.initialFilters ?? {}),
  }));
  const [rows, setRows] = useState<ExternalRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce query → fetch. Typing updates `query` (and the input)
  // immediately; the fetch only sees `debouncedQuery`.
  useEffect(() => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedQuery(query);
      debounceTimerRef.current = null;
    }, QUERY_DEBOUNCE_MS);
    return () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [query]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    void (async () => {
      try {
        const result = (await (field.fetchList as FetchListWithSignal)({
          query: debouncedQuery,
          filters,
          signal: controller.signal,
        })) as unknown[] | null;
        if (cancelled) return;
        setLoadError(false);
        const next = (result ?? []).map((raw) => {
          const mapped =
            field.mapProp !== undefined
              ? (field.mapProp(raw as Record<string, unknown>) as Record<
                  string,
                  unknown
                >)
              : (raw as Record<string, unknown>);
          return {
            raw,
            mapped,
            summary: summarize(raw),
          } satisfies ExternalRow;
        });
        setRows(next);
      } catch {
        if (!cancelled) {
          setRows([]);
          setLoadError(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      // Abort cooperative in-flight network work and prevent stale
      // resolution from a superseded query/filter set.
      controller.abort();
    };
  }, [open, debouncedQuery, filters, field]);

  const summary =
    value === null || value === undefined
      ? null
      : ((field.getItemSummary?.(value, undefined) as ReactNode | undefined) ??
        summarize(value));

  return (
    <FieldLabel
      icon={field.labelIcon}
      label={field.label ?? name}
      type="external"
      el="div"
      readOnly={readOnly}
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <Button
            id={id}
            variant="outline"
            size="sm"
            disabled={readOnly}
            onClick={() => setOpen((p) => !p)}
          >
            <span>
              {summary === null ? (field.placeholder ?? "Select…") : summary}
            </span>
            <ChevronDown />
          </Button>
          {value !== null && value !== undefined && readOnly !== true ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Clear"
              onClick={() => onChange(null as never)}
            >
              <X />
            </Button>
          ) : null}
        </div>
        {open ? (
          <Card size="sm">
            <CardContent className="flex flex-col gap-2">
              {field.filterFields !== undefined
                ? Object.entries(field.filterFields).map(
                    ([filterKey, filterField]) => (
                      <Input
                        key={filterKey}
                        value={asString(filters[filterKey])}
                        onChange={(event) =>
                          setFilters((prev) => ({
                            ...prev,
                            [filterKey]: event.target.value,
                          }))
                        }
                        placeholder={
                          ("label" in filterField &&
                          typeof filterField.label === "string"
                            ? filterField.label
                            : undefined) ?? filterKey
                        }
                        name={`${name}-filter-${filterKey}`}
                      />
                    ),
                  )
                : null}
              {field.showSearch !== false ? (
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search…"
                  name={`${name}-search`}
                />
              ) : null}
              <ScrollArea className="max-h-48">
                {loading ? (
                  <Empty className="border-0 p-3">
                    <Spinner />
                  </Empty>
                ) : loadError ? (
                  <Empty className="border-0 p-3">
                    <EmptyTitle>Could not load results</EmptyTitle>
                    <EmptyDescription>
                      Try a different search term.
                    </EmptyDescription>
                  </Empty>
                ) : rows.length === 0 ? (
                  <Empty className="border-0 p-3">
                    <EmptyTitle>No results</EmptyTitle>
                    <EmptyDescription>
                      Try a different search term.
                    </EmptyDescription>
                  </Empty>
                ) : (
                  <ul className="flex flex-col">
                    {rows.map((row) => (
                      <li key={rowKey(row)}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start"
                          onClick={() => {
                            onChange(row.mapped as never);
                            setOpen(false);
                          }}
                        >
                          {row.summary}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </FieldLabel>
  );
}

export type { FieldProps as PuckFieldProps };
