import { cn } from "@anvilkit/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const linkVariants = cva(
	"inline-flex items-center gap-2 rounded-md text-sm font-medium underline-offset-4 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
	{
		variants: {
			variant: {
				default: "text-foreground hover:text-primary",
				muted: "text-muted-foreground hover:text-foreground",
				inverse: "text-primary-foreground/80 hover:text-primary-foreground",
				unstyled: "",
			},
			underline: {
				true: "hover:underline",
				false: "no-underline",
			},
		},
		defaultVariants: {
			variant: "default",
			underline: false,
		},
	},
);

function Link({
	className,
	variant = "default",
	underline = false,
	...props
}: React.ComponentProps<"a"> & VariantProps<typeof linkVariants>) {
	return (
		<a
			data-slot="link"
			className={cn(linkVariants({ variant, underline, className }))}
			{...props}
		/>
	);
}

export { Link, linkVariants };
