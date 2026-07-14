"use client";

import * as React from "react";
import { motion, type HTMLMotionProps } from "motion/react";

import {
	useIsInView,
	type UseIsInViewOptions,
} from "@anvilkit/ui/hooks/use-is-in-view";
import { getStrictContext } from "@anvilkit/ui/lib/get-strict-context";

type TypingTextContextType = {
	isTyping: boolean;
	setIsTyping: (isTyping: boolean) => void;
};

const [TypingTextProvider, useTypingText] =
	getStrictContext<TypingTextContextType>("TypingTextContext");

type TypingState = {
	displayedText: string;
	isTyping: boolean;
};

type TypingAction =
	| { type: "typing"; isTyping: boolean }
	| { type: "text"; displayedText: string };

function typingReducer(state: TypingState, action: TypingAction): TypingState {
	switch (action.type) {
		case "typing":
			return state.isTyping === action.isTyping
				? state
				: { ...state, isTyping: action.isTyping };
		case "text":
			return state.displayedText === action.displayedText
				? state
				: { ...state, displayedText: action.displayedText };
	}
}

type TypingTextProps = React.ComponentProps<"span"> & {
	duration?: number;
	delay?: number;
	loop?: boolean;
	holdDelay?: number;
	text: string | string[];
} & UseIsInViewOptions;

function TypingText({
	ref,
	children,
	duration = 100,
	delay = 0,
	inView = false,
	inViewMargin = "0px",
	inViewOnce = true,
	loop = false,
	holdDelay = 1000,
	text,
	...props
}: TypingTextProps) {
	const { ref: localRef, isInView } = useIsInView(
		ref as React.Ref<HTMLElement>,
		{
			inView,
			inViewOnce,
			inViewMargin,
		},
	);

	const [typingState, dispatchTyping] = React.useReducer(typingReducer, {
		displayedText: "",
		isTyping: false,
	});
	const setIsTyping = React.useCallback((isTyping: boolean) => {
		dispatchTyping({ type: "typing", isTyping });
	}, []);

	React.useEffect(() => {
		if (!isInView) return;

		const timeoutIds: Array<ReturnType<typeof setTimeout>> = [];
		const texts: string[] = typeof text === "string" ? [text] : text;

		const typeText = (str: string, onComplete: () => void) => {
			dispatchTyping({ type: "typing", isTyping: true });
			let currentIndex = 0;
			const type = () => {
				if (currentIndex <= str.length) {
					dispatchTyping({
						type: "text",
						displayedText: str.substring(0, currentIndex),
					});
					currentIndex++;
					const id = setTimeout(type, duration);
					timeoutIds.push(id);
				} else {
					dispatchTyping({ type: "typing", isTyping: false });
					onComplete();
				}
			};
			type();
		};

		const eraseText = (str: string, onComplete: () => void) => {
			dispatchTyping({ type: "typing", isTyping: true });
			let currentIndex = str.length;
			const erase = () => {
				if (currentIndex >= 0) {
					dispatchTyping({
						type: "text",
						displayedText: str.substring(0, currentIndex),
					});
					currentIndex--;
					const id = setTimeout(erase, duration);
					timeoutIds.push(id);
				} else {
					dispatchTyping({ type: "typing", isTyping: false });
					onComplete();
				}
			};
			erase();
		};

		const animateTexts = (index: number) => {
			typeText(texts[index] ?? "", () => {
				const isLast = index === texts.length - 1;
				if (isLast && !loop) {
					return;
				}
				const id = setTimeout(() => {
					eraseText(texts[index] ?? "", () => {
						const nextIndex = isLast ? 0 : index + 1;
						animateTexts(nextIndex);
					});
				}, holdDelay);
				timeoutIds.push(id);
			});
		};

		const startId = setTimeout(() => {
			animateTexts(0);
		}, delay);
		timeoutIds.push(startId);

		return () => {
			timeoutIds.forEach(clearTimeout);
		};
	}, [text, duration, isInView, delay, loop, holdDelay]);

	const typingTextContext = React.useMemo(
		() => ({ isTyping: typingState.isTyping, setIsTyping }),
		[typingState.isTyping, setIsTyping],
	);

	return (
		<TypingTextProvider value={typingTextContext}>
			<span ref={localRef} data-slot="typing-text" {...props}>
				<motion.span>{typingState.displayedText}</motion.span>
				{children}
			</span>
		</TypingTextProvider>
	);
}

type TypingTextCursorProps = Omit<HTMLMotionProps<"span">, "children">;

function TypingTextCursor({
	style,
	variants,
	...props
}: TypingTextCursorProps) {
	const { isTyping } = useTypingText();

	return (
		<motion.span
			data-slot="typing-text-cursor"
			variants={{
				blinking: {
					opacity: [0, 0, 1, 1],
					transition: {
						duration: 1,
						repeat: Infinity,
						repeatDelay: 0,
						ease: "linear",
						times: [0, 0.5, 0.5, 1],
					},
				},
				visible: {
					opacity: 1,
				},
				...variants,
			}}
			animate={isTyping ? "visible" : "blinking"}
			style={{
				display: "inline-block",
				height: "16px",
				transform: "translateY(2px)",
				width: "1px",
				backgroundColor: "currentColor",
				...style,
			}}
			{...props}
		/>
	);
}

export {
	TypingText,
	TypingTextCursor,
	type TypingTextProps,
	type TypingTextCursorProps,
};
