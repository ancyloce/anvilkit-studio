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
} from "./accordion";
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
	InputGroupTextarea,
	InputGroupText,
} from "./input-group";
export { Label } from "./label";
export { Popover, PopoverContent, PopoverTrigger } from "./popover";
export { ScrollArea, ScrollBar } from "./scroll-area";
export { Separator } from "./separator";
export { Skeleton } from "./skeleton";
export { Toaster } from "./sonner";
export {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
	tabsListVariants,
} from "./tabs";
export { Textarea } from "./textarea";
export { Toggle, toggleVariants } from "./toggle";
export { ToggleGroup, ToggleGroupItem } from "./toggle-group";
export {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "./tooltip";
