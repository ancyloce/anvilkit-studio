/**
 * @file Internal shadcn/ui primitive barrel.
 *
 * These are internal Studio primitives only. Public consumers should
 * import Studio through `@anvilkit/core/react`, not this directory.
 */

export {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "./accordion.js";
export { Button, buttonVariants } from "./button.js";
export { Checkbox } from "./checkbox.js";
export {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogOverlay,
	DialogPortal,
	DialogTitle,
	DialogTrigger,
} from "./dialog.js";
export {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuPortal,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "./dropdown-menu.js";
export {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "./empty.js";
export {
	Field,
	FieldContent,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSeparator,
	FieldSet,
	FieldTitle,
} from "./field.js";
export { Input } from "./input.js";
export {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
	InputGroupTextarea,
	InputGroupText,
} from "./input-group.js";
export { Label } from "./label.js";
export { Popover, PopoverContent, PopoverTrigger } from "./popover.js";
export { ScrollArea, ScrollBar } from "./scroll-area.js";
export { Separator } from "./separator.js";
export { Skeleton } from "./skeleton.js";
export { Toaster } from "./sonner.js";
export {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
	tabsListVariants,
} from "./tabs.js";
export { Textarea } from "./textarea.js";
export { Toggle, toggleVariants } from "./toggle.js";
export { ToggleGroup, ToggleGroupItem } from "./toggle-group.js";
export {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "./tooltip.js";
