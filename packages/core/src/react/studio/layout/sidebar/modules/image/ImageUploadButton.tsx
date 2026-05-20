/**
 * @file Upload trigger for the `image` module's panel header
 * (PRD §7.2 mock: `[↑ upload]`).
 *
 * Pure presentation — opens the host's hidden `<input type="file">`
 * via a parent-supplied callback. The actual upload pipeline lives in
 * `ImageModule`, which owns the optimistic-tile state.
 */

import { Upload } from "lucide-react";
import { type ReactNode } from "react";

import { Button } from "@/primitives/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/primitives/tooltip";
import { useMsg } from "@/state/editor-i18n-store";

export interface ImageUploadButtonProps {
  readonly onClick: () => void;
  readonly disabled?: boolean;
}

export function ImageUploadButton({
  onClick,
  disabled,
}: ImageUploadButtonProps): ReactNode {
  const msg = useMsg();
  const label = msg("studio.module.image.upload");
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="inline-flex">
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={onClick}
              disabled={disabled === true}
              aria-label={label}
              data-testid="ak-image-upload"
            >
              <Upload aria-hidden="true" />
            </Button>
          </span>
        }
      />
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
