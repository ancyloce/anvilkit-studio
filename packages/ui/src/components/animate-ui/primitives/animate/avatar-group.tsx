"use client";

import * as React from "react";
import { type HTMLMotionProps, motion, type Transition } from "motion/react";

import {
	TooltipProvider,
	Tooltip,
	TooltipTrigger,
	TooltipContent,
	TooltipArrow,
	type TooltipProviderProps,
	type TooltipProps,
	type TooltipContentProps,
	type TooltipArrowProps,
} from "./tooltip";

type AvatarProps = Omit<HTMLMotionProps<"div">, "translate"> & {
	children: React.ReactNode;
	zIndex: number;
	translate?: string | number;
} & Omit<TooltipProps, "children">;

function AvatarContainer({
	zIndex,
	translate,
	side,
	sideOffset,
	align,
	alignOffset,
	...props
}: AvatarProps) {
	return (
		<Tooltip
			side={side}
			sideOffset={sideOffset}
			align={align}
			alignOffset={alignOffset}
		>
			<TooltipTrigger
				initial="initial"
				whileHover="hover"
				whileTap="hover"
				style={{ position: "relative", zIndex }}
			>
				<motion.div
					data-slot="avatar-container"
					variants={{
						initial: { y: 0 },
						hover: { y: translate },
					}}
					{...props}
				/>
			</TooltipTrigger>
		</Tooltip>
	);
}

type AvatarGroupProps = Omit<
	React.ComponentProps<"div">,
	"children" | "translate"
> & {
	children: React.ReactNode;
	invertOverlap?: boolean;
	translate?: string | number;
	transition?: Transition;
	tooltipTransition?: Transition;
} & Omit<TooltipProviderProps, "children"> &
	Omit<TooltipProps, "children">;

function getChildKey(child: React.ReactElement) {
	if (child.key != null) {
		return String(child.key);
	}

	if (typeof child.type === "string") {
		return child.type;
	}

	const displayName =
		"name" in child.type && typeof child.type.name === "string"
			? child.type.name
			: "displayName" in child.type &&
					typeof child.type.displayName === "string"
				? child.type.displayName
				: "avatar-group-item";

	return displayName;
}

function AvatarGroup({
	ref,
	children,
	id,
	transition = { type: "spring", stiffness: 300, damping: 17 },
	invertOverlap = false,
	translate = "-30%",
	openDelay = 0,
	closeDelay = 0,
	side = "top",
	sideOffset = 25,
	align = "center",
	alignOffset = 0,
	tooltipTransition = { type: "spring", stiffness: 300, damping: 35 },
	style,
	...props
}: AvatarGroupProps) {
	const items = React.Children.toArray(children).filter((child) =>
		React.isValidElement(child),
	) as React.ReactElement[];

	return (
		<TooltipProvider
			id={id}
			openDelay={openDelay}
			closeDelay={closeDelay}
			transition={tooltipTransition}
		>
			<div
				ref={ref}
				data-slot="avatar-group"
				style={{
					display: "flex",
					alignItems: "center",
					...style,
				}}
				{...props}
			>
				{items.map((child, index) => (
					<AvatarContainer
						key={getChildKey(child)}
						zIndex={invertOverlap ? items.length - index : index}
						transition={transition}
						translate={translate}
						side={side}
						sideOffset={sideOffset}
						align={align}
						alignOffset={alignOffset}
					>
						{child}
					</AvatarContainer>
				))}
			</div>
		</TooltipProvider>
	);
}

type AvatarGroupTooltipProps = TooltipContentProps;

function AvatarGroupTooltip(props: AvatarGroupTooltipProps) {
	return <TooltipContent {...props} />;
}

type AvatarGroupTooltipArrowProps = TooltipArrowProps;

function AvatarGroupTooltipArrow(props: AvatarGroupTooltipArrowProps) {
	return <TooltipArrow {...props} />;
}

export {
	AvatarGroup,
	AvatarGroupTooltip,
	AvatarGroupTooltipArrow,
	type AvatarGroupProps,
	type AvatarGroupTooltipProps,
	type AvatarGroupTooltipArrowProps,
};
