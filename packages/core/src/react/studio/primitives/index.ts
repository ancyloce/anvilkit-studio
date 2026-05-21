/**
 * @file Internal shadcn/ui primitive barrel.
 *
 * These are internal Studio primitives only. Public consumers should
 * import Studio through `@anvilkit/core/react`, not this directory.
 */

export {
	Accordion,
	AccordionItem,
	AccordionPanel,
	AccordionTrigger,
} from "./accordion";
export { toggleVariants } from "./animate-ui/components/base/toggle";
export { Toggle, ToggleGroup } from "./animate-ui/components/base/toggle-group";
export {
	Tooltip,
	TooltipProvider,
	TooltipTrigger,
} from "./animate-ui/components/base/tooltip";
export { Avatar, AvatarFallback, AvatarImage } from "./avatar";
export { Button, buttonVariants } from "./button";
export { Checkbox } from "./checkbox";
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
} from "./dialog";
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
} from "./dropdown-menu";
export {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "./empty";
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
} from "./field";
export { Input } from "./input";
export {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
	InputGroupText,
	InputGroupTextarea,
} from "./input-group";
export {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemFooter,
	ItemGroup,
	ItemHeader,
	ItemMedia,
	ItemSeparator,
	ItemTitle,
} from "./item";
export { Label } from "./label";
export { Popover, PopoverContent, PopoverTrigger } from "./popover";
export { ScrollArea, ScrollBar } from "./scroll-area";
export { Separator } from "./separator";
export { Skeleton } from "./skeleton";
export { Toaster } from "./sonner";
export { Tabs, TabsList, TabsPanel, TabsPanels, TabsTab } from "./tabs";
export { Textarea } from "./textarea";
