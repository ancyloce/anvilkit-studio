import { cn } from "@anvilkit/ui/lib/utils";
import { Toast as ToastPrimitive } from "@base-ui/react/toast";
import { XIcon } from "lucide-react";
import * as React from "react";

/**
 * Toast primitive (UI-2, PRD-0012 M0-06 audit): a thin Base UI Toast wrapper
 * with the shadcn-neutral styling used across @anvilkit/ui. Ships the
 * imperative manager (`createToastManager`) so non-React layers (e.g. the
 * canvas editor's action layer) can fire toasts:
 *
 * ```tsx
 * const manager = createToastManager();
 * <ToastProvider toastManager={manager}>
 *   <App />
 *   <ToastViewport><Toasts /></ToastViewport>
 * </ToastProvider>
 * // anywhere: manager.add({ title: "Saved", type: "success" })
 * ```
 */

export const createToastManager = ToastPrimitive.createToastManager;
export const useToastManager = ToastPrimitive.useToastManager;

function ToastProvider({ ...props }: ToastPrimitive.Provider.Props) {
	return <ToastPrimitive.Provider data-slot="toast-provider" {...props} />;
}

function ToastPortal({ ...props }: ToastPrimitive.Portal.Props) {
	return <ToastPrimitive.Portal data-slot="toast-portal" {...props} />;
}

function ToastViewport({ className, ...props }: ToastPrimitive.Viewport.Props) {
	return (
		<ToastPrimitive.Portal>
			<ToastPrimitive.Viewport
				data-slot="toast-viewport"
				className={cn(
					"fixed right-4 bottom-4 z-[60] flex w-80 flex-col-reverse gap-2 outline-none",
					className,
				)}
				{...props}
			/>
		</ToastPrimitive.Portal>
	);
}

const TOAST_TYPE_CLASSES: Record<string, string> = {
	error: "ring-destructive/40 text-destructive",
	warning: "ring-amber-500/40",
	success: "ring-emerald-500/40",
};

/**
 * Renders the manager's toast stack. Must live under `<ToastProvider>`
 * (inside `<ToastViewport>`).
 */
function Toasts({ className }: { className?: string }) {
	const { toasts } = useToastManager();
	return (
		<>
			{toasts.map((toast) => (
				<ToastPrimitive.Root
					key={toast.id}
					toast={toast}
					data-slot="toast"
					data-type={toast.type ?? "info"}
					className={cn(
						"pointer-events-auto relative rounded-lg bg-popover p-3 pr-8 text-popover-foreground text-sm shadow-lg ring-1 ring-foreground/10 transition-[opacity,transform] duration-150 data-ending-style:opacity-0 data-starting-style:translate-y-2 data-starting-style:opacity-0",
						TOAST_TYPE_CLASSES[toast.type ?? ""],
						className,
					)}
				>
					<ToastPrimitive.Title
						data-slot="toast-title"
						className="font-medium"
					/>
					<ToastPrimitive.Description
						data-slot="toast-description"
						className="text-muted-foreground text-xs"
					/>
					<ToastPrimitive.Close
						data-slot="toast-close"
						aria-label="Close"
						className="absolute top-2.5 right-2.5 rounded p-0.5 text-muted-foreground hover:text-foreground"
					>
						<XIcon className="size-3.5" aria-hidden />
					</ToastPrimitive.Close>
				</ToastPrimitive.Root>
			))}
		</>
	);
}

export { ToastPortal, ToastProvider, Toasts, ToastViewport };
