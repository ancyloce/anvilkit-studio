"use client";

import { cn } from "@anvilkit/ui/lib/utils";
import { motion } from "motion/react";
import * as React from "react";
import {
	createHoleState,
	drawDiscs,
	drawLines,
	drawParticles,
	type HoleState,
	initHole,
	moveDiscs,
	moveParticles,
	setDiscs,
	setLines,
	setParticles,
	setSize,
} from "./hole-engine";

type HoleBackgroundProps = React.ComponentProps<"div"> & {
	strokeColor?: string;
	numberOfLines?: number;
	numberOfDiscs?: number;
	particleRGBColor?: [number, number, number];
};

function HoleBackground({
	strokeColor = "#737373",
	numberOfLines = 50,
	numberOfDiscs = 50,
	particleRGBColor = [255, 255, 255],
	className,
	children,
	...props
}: HoleBackgroundProps) {
	const canvasRef = React.useRef<HTMLCanvasElement>(null);
	const stateRef = React.useRef<HoleState>(createHoleState());

	const initEvent = React.useEffectEvent(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		initHole(stateRef.current, canvas, {
			numberOfDiscs,
			numberOfLines,
			strokeColor,
			particleRGBColor,
		});
	});
	const moveDiscsEvent = React.useEffectEvent(() => {
		moveDiscs(stateRef.current);
	});
	const moveParticlesEvent = React.useEffectEvent(() => {
		moveParticles(stateRef.current, particleRGBColor);
	});
	const drawDiscsEvent = React.useEffectEvent(
		(ctx: CanvasRenderingContext2D) => {
			drawDiscs(ctx, stateRef.current, strokeColor);
		},
	);
	const drawLinesEvent = React.useEffectEvent(
		(ctx: CanvasRenderingContext2D) => {
			drawLines(ctx, stateRef.current);
		},
	);
	const drawParticlesEvent = React.useEffectEvent(
		(ctx: CanvasRenderingContext2D) => {
			drawParticles(ctx, stateRef.current);
		},
	);
	const resizeEvent = React.useEffectEvent(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		setSize(stateRef.current, canvas);
		setDiscs(stateRef.current, numberOfDiscs);
		setLines(stateRef.current, numberOfLines, strokeColor);
		setParticles(stateRef.current, particleRGBColor);
	});

	React.useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		let animationFrameId = 0;
		initEvent();
		const tick = () => {
			const canvas = canvasRef.current;
			if (!canvas) return;
			const ctx = canvas.getContext("2d");
			if (!ctx) return;
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			ctx.save();
			ctx.scale(stateRef.current.render.dpi, stateRef.current.render.dpi);
			moveDiscsEvent();
			moveParticlesEvent();
			drawDiscsEvent(ctx);
			drawLinesEvent(ctx);
			drawParticlesEvent(ctx);
			ctx.restore();
			animationFrameId = requestAnimationFrame(tick);
		};
		tick();
		const handleResize = () => resizeEvent();
		window.addEventListener("resize", handleResize);
		return () => {
			window.removeEventListener("resize", handleResize);
			cancelAnimationFrame(animationFrameId);
		};
	}, []);

	return (
		<div
			data-slot="hole-background"
			className={cn(
				"relative size-full overflow-hidden",
				'before:content-[""] before:absolute before:top-1/2 before:left-1/2 before:block before:size-[140%] dark:before:[background:radial-gradient(ellipse_at_50%_55%,transparent_10%,black_50%)] before:[background:radial-gradient(ellipse_at_50%_55%,transparent_10%,white_50%)] before:[transform:translate3d(-50%,-50%,0)]',
				'after:content-[""] after:absolute after:z-[5] after:top-1/2 after:left-1/2 after:block after:size-full after:[background:radial-gradient(ellipse_at_50%_75%,#a900ff_20%,transparent_75%)] after:[transform:translate3d(-50%,-50%,0)] after:mix-blend-overlay',
				className,
			)}
			{...props}
		>
			{children}
			<canvas
				ref={canvasRef}
				className="absolute inset-0 block size-full dark:opacity-20 opacity-10"
			/>
			<motion.div
				className={cn(
					"absolute top-[-71.5%] left-1/2 z-[3] w-[30%] h-[140%] rounded-b-full blur-3xl opacity-75 dark:mix-blend-plus-lighter mix-blend-plus-darker [transform:translate3d(-50%,0,0)] [background-position:0%_100%] [background-size:100%_200%]",
					"dark:[background:linear-gradient(20deg,#00f8f1,#ffbd1e20_16.5%,#fe848f_33%,#fe848f20_49.5%,#00f8f1_66%,#00f8f160_85.5%,#ffbd1e_100%)_0_100%_/_100%_200%] [background:linear-gradient(20deg,#00f8f1,#ffbd1e40_16.5%,#fe848f_33%,#fe848f40_49.5%,#00f8f1_66%,#00f8f180_85.5%,#ffbd1e_100%)_0_100%_/_100%_200%]",
				)}
				animate={{ backgroundPosition: "0% 300%" }}
				transition={{ duration: 5, ease: "linear", repeat: Infinity }}
			/>
			<div className="absolute top-0 left-0 z-[7] size-full dark:[background:repeating-linear-gradient(transparent,transparent_1px,white_1px,white_2px)] mix-blend-overlay opacity-50" />
		</div>
	);
}

export { HoleBackground, type HoleBackgroundProps };
