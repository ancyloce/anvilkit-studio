"use client";

import * as React from "react";
import {
	motion,
	useMotionValue,
	useSpring,
	AnimatePresence,
	type HTMLMotionProps,
	type SpringOptions,
} from "motion/react";

import { getStrictContext } from "@anvilkit/ui/lib/get-strict-context";
import {
	Slot,
	type WithAsChild,
} from "@anvilkit/ui/components/animate-ui/primitives/animate/slot";

type CursorContextType = {
	cursorPos: { x: number; y: number };
	active: boolean;
	global: boolean;
	containerRef: React.RefObject<HTMLDivElement | null>;
	cursorRef: React.RefObject<HTMLDivElement | null>;
};

const [LocalCursorProvider, useCursor] =
	getStrictContext<CursorContextType>("CursorContext");

type CursorState = {
	cursorPos: { x: number; y: number };
	active: boolean;
};

type CursorAction =
	| { type: "move"; cursorPos: { x: number; y: number } }
	| { type: "active"; active: boolean };

function cursorReducer(state: CursorState, action: CursorAction): CursorState {
	switch (action.type) {
		case "move":
			return {
				cursorPos: action.cursorPos,
				active: true,
			};
		case "active":
			return state.active === action.active
				? state
				: { ...state, active: action.active };
	}
}

type CursorProviderProps = {
	children: React.ReactNode;
	global?: boolean;
};

function CursorProvider({ children, global = false }: CursorProviderProps) {
	const [cursorState, dispatchCursor] = React.useReducer(cursorReducer, {
		cursorPos: { x: 0, y: 0 },
		active: false,
	});

	const containerRef = React.useRef<HTMLDivElement>(null);
	const cursorRef = React.useRef<HTMLDivElement>(null);

	React.useEffect(() => {
		const id = "__cursor_none_style__";
		if (document.getElementById(id)) return;

		const style = document.createElement("style");
		style.id = id;
		style.textContent = `
      .animate-ui-cursor-none, .animate-ui-cursor-none * { cursor: none !important; }
    `;
		document.head.appendChild(style);
	}, []);

	React.useEffect(() => {
		if (global) {
			const handlePointerMove = (e: PointerEvent) => {
				dispatchCursor({
					type: "move",
					cursorPos: { x: e.clientX, y: e.clientY },
				});
			};

			const handlePointerOut = (e: PointerEvent | MouseEvent) => {
				if (e instanceof PointerEvent && e.relatedTarget === null) {
					dispatchCursor({ type: "active", active: false });
				}
			};

			const handleVisibilityChange = () => {
				if (document.visibilityState === "hidden") {
					dispatchCursor({ type: "active", active: false });
				}
			};

			window.addEventListener("pointermove", handlePointerMove, {
				passive: true,
			});
			window.addEventListener("pointerout", handlePointerOut, {
				passive: true,
			});
			window.addEventListener("mouseout", handlePointerOut, { passive: true });
			document.addEventListener("visibilitychange", handleVisibilityChange);

			return () => {
				window.removeEventListener("pointermove", handlePointerMove);
				window.removeEventListener("pointerout", handlePointerOut);
				window.removeEventListener("mouseout", handlePointerOut);
				document.removeEventListener(
					"visibilitychange",
					handleVisibilityChange,
				);
			};
		}

		if (!containerRef.current) return;

		const parent = containerRef.current.parentElement;
		if (!parent) return;

		if (getComputedStyle(parent).position === "static") {
			parent.style.position = "relative";
		}

		const handlePointerMove = (e: PointerEvent) => {
			const rect = parent.getBoundingClientRect();
			dispatchCursor({
				type: "move",
				cursorPos: { x: e.clientX - rect.left, y: e.clientY - rect.top },
			});
		};

		const handlePointerOut = (e: PointerEvent | MouseEvent) => {
			if (
				e.relatedTarget === null ||
				!(parent as Node).contains(e.relatedTarget as Node)
			) {
				dispatchCursor({ type: "active", active: false });
			}
		};

		parent.addEventListener("pointermove", handlePointerMove, {
			passive: true,
		});
		parent.addEventListener("pointerout", handlePointerOut, {
			passive: true,
		});
		parent.addEventListener("mouseout", handlePointerOut, { passive: true });

		return () => {
			parent.removeEventListener("pointermove", handlePointerMove);
			parent.removeEventListener("pointerout", handlePointerOut);
			parent.removeEventListener("mouseout", handlePointerOut);
		};
	}, [global]);

	const cursorContext = React.useMemo(
		() => ({
			cursorPos: cursorState.cursorPos,
			active: cursorState.active,
			global,
			containerRef,
			cursorRef,
		}),
		[cursorState.active, cursorState.cursorPos, global],
	);

	return (
		<LocalCursorProvider value={cursorContext}>{children}</LocalCursorProvider>
	);
}

type CursorContainerProps = WithAsChild<HTMLMotionProps<"div">>;

function CursorContainer({
	ref,
	asChild = false,
	...props
}: CursorContainerProps) {
	const { containerRef, global, active } = useCursor();
	React.useImperativeHandle(ref, () => containerRef.current as HTMLDivElement);

	const Component = asChild ? Slot : motion.div;

	return (
		<Component
			ref={containerRef}
			data-slot="cursor-container"
			data-global={global}
			data-active={active}
			{...props}
		/>
	);
}

type CursorProps = WithAsChild<
	HTMLMotionProps<"div"> & {
		children: React.ReactNode;
	}
>;

function Cursor({ ref, asChild = false, style, ...props }: CursorProps) {
	const { cursorPos, active, containerRef, cursorRef, global } = useCursor();
	React.useImperativeHandle(ref, () => cursorRef.current as HTMLDivElement);

	const x = useMotionValue(0);
	const y = useMotionValue(0);

	React.useEffect(() => {
		const target = global
			? document.documentElement
			: containerRef.current?.parentElement;

		if (!target) return;

		if (active) {
			target.classList.add("animate-ui-cursor-none");
		} else {
			target.classList.remove("animate-ui-cursor-none");
		}

		return () => {
			target.classList.remove("animate-ui-cursor-none");
		};
	}, [active, global, containerRef]);

	React.useEffect(() => {
		x.set(cursorPos.x);
		y.set(cursorPos.y);
	}, [cursorPos, x, y]);

	const Component = asChild ? Slot : motion.div;

	return (
		<AnimatePresence>
			{active && (
				<Component
					ref={cursorRef}
					data-slot="cursor"
					data-global={global}
					data-active={active}
					style={{
						transform: "translate(-50%,-50%)",
						pointerEvents: "none",
						zIndex: 9999,
						position: global ? "fixed" : "absolute",
						top: y,
						left: x,
						...style,
					}}
					initial={{ scale: 0.95, opacity: 0 }}
					animate={{ scale: 1, opacity: 1 }}
					exit={{ scale: 0.95, opacity: 0 }}
					{...props}
				/>
			)}
		</AnimatePresence>
	);
}

type CursorFollowSide = "top" | "right" | "bottom" | "left";
type CursorFollowAlign = "start" | "center" | "end";

type CursorFollowProps = WithAsChild<
	Omit<HTMLMotionProps<"div">, "transition"> & {
		side?: CursorFollowSide;
		sideOffset?: number;
		align?: CursorFollowAlign;
		alignOffset?: number;
		transition?: SpringOptions;
		children: React.ReactNode;
	}
>;

function CursorFollow({
	ref,
	asChild = false,
	side = "bottom",
	sideOffset = 0,
	align = "end",
	alignOffset = 0,
	style,
	transition = { stiffness: 500, damping: 50, bounce: 0 },
	...props
}: CursorFollowProps) {
	const { cursorPos, active, cursorRef, global } = useCursor();
	const cursorFollowRef = React.useRef<HTMLDivElement>(null);
	React.useImperativeHandle(
		ref,
		() => cursorFollowRef.current as HTMLDivElement,
	);

	const x = useMotionValue(0);
	const y = useMotionValue(0);

	const springX = useSpring(x, transition);
	const springY = useSpring(y, transition);

	const calculateOffset = React.useCallback(() => {
		const rect = cursorFollowRef.current?.getBoundingClientRect();
		const width = rect?.width ?? 0;
		const height = rect?.height ?? 0;

		let offsetX = 0;
		let offsetY = 0;

		switch (side) {
			case "top":
				offsetY = height + sideOffset;
				switch (align) {
					case "start":
						offsetX = width + alignOffset;
						break;
					case "center":
						offsetX = width / 2;
						break;
					case "end":
						offsetX = -alignOffset;
						break;
				}
				break;

			case "bottom":
				offsetY = -sideOffset;
				switch (align) {
					case "start":
						offsetX = width + alignOffset;
						break;
					case "center":
						offsetX = width / 2;
						break;
					case "end":
						offsetX = -alignOffset;
						break;
				}
				break;

			case "left":
				offsetX = width + sideOffset;
				switch (align) {
					case "start":
						offsetY = height + alignOffset;
						break;
					case "center":
						offsetY = height / 2;
						break;
					case "end":
						offsetY = -alignOffset;
						break;
				}
				break;

			case "right":
				offsetX = -sideOffset;
				switch (align) {
					case "start":
						offsetY = height + alignOffset;
						break;
					case "center":
						offsetY = height / 2;
						break;
					case "end":
						offsetY = -alignOffset;
						break;
				}
				break;
		}

		return { x: offsetX, y: offsetY };
	}, [side, align, sideOffset, alignOffset]);

	React.useEffect(() => {
		const offset = calculateOffset();
		const cursorRect = cursorRef.current?.getBoundingClientRect();
		const cursorWidth = cursorRect?.width ?? 20;
		const cursorHeight = cursorRect?.height ?? 20;

		x.set(cursorPos.x - offset.x + cursorWidth / 2);
		y.set(cursorPos.y - offset.y + cursorHeight / 2);
	}, [calculateOffset, cursorPos, cursorRef, x, y]);

	const Component = asChild ? Slot : motion.div;

	return (
		<AnimatePresence>
			{active && (
				<Component
					ref={cursorFollowRef}
					data-slot="cursor-follow"
					data-global={global}
					data-active={active}
					style={{
						transform: "translate(-50%,-50%)",
						pointerEvents: "none",
						zIndex: 9998,
						position: global ? "fixed" : "absolute",
						top: springY,
						left: springX,
						...style,
					}}
					initial={{ scale: 0.95, opacity: 0 }}
					animate={{ scale: 1, opacity: 1 }}
					exit={{ scale: 0.95, opacity: 0 }}
					{...props}
				/>
			)}
		</AnimatePresence>
	);
}

export {
	CursorProvider,
	Cursor,
	CursorContainer,
	CursorFollow,
	useCursor,
	type CursorProviderProps,
	type CursorProps,
	type CursorContainerProps,
	type CursorFollowProps,
	type CursorFollowAlign,
	type CursorFollowSide,
	type CursorContextType,
};
