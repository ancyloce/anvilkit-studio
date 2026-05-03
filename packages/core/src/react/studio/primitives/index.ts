/**
 * @file Internal primitives barrel.
 *
 * NOT EXPORTED publicly (PRD §7.3). Layout components reach in via
 * relative imports. The package's `react/overrides` subpath
 * deliberately does not re-export anything from this directory.
 */

export { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from "./Button.js";
export { Dialog } from "./Dialog.js";
export { Input, type InputProps } from "./Input.js";
export { ScrollArea, type ScrollAreaProps } from "./ScrollArea.js";
export { Separator, type SeparatorProps } from "./Separator.js";
export { Tabs } from "./Tabs.js";
export { Tooltip, type TooltipProps } from "./Tooltip.js";
