/**
 * @file Inline rename dialog for an asset tile (PRD §7.4 Rename).
 *
 * Mirrors the `AddPageDialog` idiom — single field, cancel/submit row,
 * async `onSubmit` so the source can throw and the form can surface
 * the message inline.
 */

import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { Button } from "@/primitives/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/primitives/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/primitives/field";
import { Input } from "@/primitives/input";
import { useMsg } from "@/state/editor-i18n-store";
import type { StudioAsset } from "@/types/sidebar";

export interface RenameAssetDialogProps {
  readonly asset: StudioAsset | null;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmit: (asset: StudioAsset, nextName: string) => Promise<void>;
}

export function RenameAssetDialog({
  asset,
  onOpenChange,
  onSubmit,
}: RenameAssetDialogProps): ReactNode {
  const msg = useMsg();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (asset !== null) {
      setDraft(asset.name);
      setError(null);
      setSubmitting(false);
    }
  }, [asset]);

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (asset === null) return;
    const trimmed = draft.trim();
    if (trimmed === "" || trimmed === asset.name) {
      onOpenChange(false);
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(asset, trimmed);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };
  const inputId = "ak-image-rename-input";

  return (
    <Dialog open={asset !== null} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="ak-image-rename-dialog"
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>{msg("studio.module.image.actions.rename")}</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={inputId}>
                {msg("studio.module.image.actions.rename")}
              </FieldLabel>
              <Input
                id={inputId}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                autoFocus
                required
                data-testid="ak-image-rename-input"
              />
            </Field>
            {error !== null ? <FieldError>{error}</FieldError> : null}
            <DialogFooter className="mt-2">
              <DialogClose
                render={
                  <Button variant="ghost" type="button">
                    {msg("studio.module.layer.pages.dialog.cancel")}
                  </Button>
                }
              />
              <Button
                type="submit"
                disabled={submitting || draft.trim().length === 0}
                data-testid="ak-image-rename-submit"
              >
                {msg("studio.module.image.actions.rename")}
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
