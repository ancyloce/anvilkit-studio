import React, { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@anvilkit/ui/lib/utils";

const FALLBACK_RGBA_PREFIX = "rgba(0, 0, 0,";

interface FlickeringGridProps extends React.HTMLAttributes<HTMLDivElement> {
	squareSize?: number;
	gridGap?: number;
	flickerChance?: number;
	color?: string;
	width?: number;
	height?: number;
	className?: string;
	maxOpacity?: number;
}

function getRgbPrefix(color: string) {
	const matches = color.match(
		/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i,
	);

	if (!matches) {
		return null;
	}

	const [, r, g, b] = matches;
	return `rgba(${r}, ${g}, ${b},`;
}

function resolveCssColor(color: string, element: HTMLElement | null) {
	if (typeof window === "undefined") {
		return color;
	}

	if (color === "currentColor" && element) {
		return window.getComputedStyle(element).color;
	}

	if (
		!color.includes("var(") &&
		!color.includes("currentColor") &&
		!color.includes("color-mix(")
	) {
		return color;
	}

	const target = element ?? document.body;
	const probe = document.createElement("span");

	probe.style.position = "absolute";
	probe.style.visibility = "hidden";
	probe.style.pointerEvents = "none";
	probe.style.color = color;

	target.appendChild(probe);
	const resolvedColor = window.getComputedStyle(probe).color || color;
	probe.remove();

	return resolvedColor;
}

function toRgbaPrefix(color: string, element: HTMLElement | null) {
	if (typeof window === "undefined") {
		return FALLBACK_RGBA_PREFIX;
	}

	const resolvedColor = resolveCssColor(color, element);
	const rgbPrefix = getRgbPrefix(resolvedColor);

	if (rgbPrefix) {
		return rgbPrefix;
	}

	const canvas = document.createElement("canvas");
	canvas.width = canvas.height = 1;
	const ctx = canvas.getContext("2d");

	if (!ctx) {
		return FALLBACK_RGBA_PREFIX;
	}

	ctx.fillStyle = resolvedColor;
	ctx.fillRect(0, 0, 1, 1);
	const [r, g, b] = Array.from(ctx.getImageData(0, 0, 1, 1).data);

	return `rgba(${r}, ${g}, ${b},`;
}

export const FlickeringGrid: React.FC<FlickeringGridProps> = ({
	squareSize = 4,
	gridGap = 6,
	flickerChance = 0.3,
	color = "rgb(0, 0, 0)",
	width,
	height,
	className,
	maxOpacity = 0.3,
	...props
}) => {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [isInView, setIsInView] = useState(false);
	const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
	const [resolvedColorPrefix, setResolvedColorPrefix] =
		useState(FALLBACK_RGBA_PREFIX);

	const updateResolvedColor = useCallback(() => {
		setResolvedColorPrefix(toRgbaPrefix(color, containerRef.current));
	}, [color]);

	useEffect(() => {
		updateResolvedColor();

		if (typeof MutationObserver === "undefined") {
			return;
		}

		const observer = new MutationObserver(() => {
			updateResolvedColor();
		});

		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class", "style"],
		});

		observer.observe(document.body, {
			attributes: true,
			attributeFilter: ["class", "style"],
		});

		return () => {
			observer.disconnect();
		};
	}, [updateResolvedColor]);

	const setupCanvas = useCallback(
		(canvas: HTMLCanvasElement, width: number, height: number) => {
			const dpr = window.devicePixelRatio || 1;
			canvas.width = width * dpr;
			canvas.height = height * dpr;
			canvas.style.width = `${width}px`;
			canvas.style.height = `${height}px`;
			const cols = Math.ceil(width / (squareSize + gridGap));
			const rows = Math.ceil(height / (squareSize + gridGap));

			const squares = new Float32Array(cols * rows);
			for (let i = 0; i < squares.length; i++) {
				squares[i] = Math.random() * maxOpacity;
			}

			return { cols, rows, squares, dpr };
		},
		[squareSize, gridGap, maxOpacity],
	);

	const updateSquares = useCallback(
		(squares: Float32Array, deltaTime: number) => {
			for (let i = 0; i < squares.length; i++) {
				if (Math.random() < flickerChance * deltaTime) {
					squares[i] = Math.random() * maxOpacity;
				}
			}
		},
		[flickerChance, maxOpacity],
	);

	const drawGrid = useCallback(
		(
			ctx: CanvasRenderingContext2D,
			width: number,
			height: number,
			cols: number,
			rows: number,
			squares: Float32Array,
			dpr: number,
		) => {
			ctx.clearRect(0, 0, width, height);
			ctx.fillStyle = "transparent";
			ctx.fillRect(0, 0, width, height);

			for (let i = 0; i < cols; i++) {
				for (let j = 0; j < rows; j++) {
					const opacity = squares[i * rows + j];
					ctx.fillStyle = `${resolvedColorPrefix}${opacity})`;
					ctx.fillRect(
						i * (squareSize + gridGap) * dpr,
						j * (squareSize + gridGap) * dpr,
						squareSize * dpr,
						squareSize * dpr,
					);
				}
			}
		},
		[resolvedColorPrefix, squareSize, gridGap],
	);

	useEffect(() => {
		const canvas = canvasRef.current;
		const container = containerRef.current;
		const ctx = canvas?.getContext("2d") ?? null;
		let animationFrameId: number | null = null;
		let resizeObserver: ResizeObserver | null = null;
		let intersectionObserver: IntersectionObserver | null = null;
		let gridParams: ReturnType<typeof setupCanvas> | null = null;

		if (canvas && container && ctx) {
			const updateCanvasSize = () => {
				const newWidth = width || container.clientWidth;
				const newHeight = height || container.clientHeight;
				setCanvasSize({ width: newWidth, height: newHeight });
				gridParams = setupCanvas(canvas, newWidth, newHeight);
			};

			updateCanvasSize();

			let lastTime = 0;
			const animate = (time: number) => {
				if (!isInView || !gridParams) return;

				const deltaTime = (time - lastTime) / 1000;
				lastTime = time;

				updateSquares(gridParams.squares, deltaTime);
				drawGrid(
					ctx,
					canvas.width,
					canvas.height,
					gridParams.cols,
					gridParams.rows,
					gridParams.squares,
					gridParams.dpr,
				);
				animationFrameId = requestAnimationFrame(animate);
			};

			resizeObserver = new ResizeObserver(() => {
				updateCanvasSize();
			});
			resizeObserver.observe(container);

			intersectionObserver = new IntersectionObserver(
				([entry]) => {
					if (entry) {
						setIsInView(entry.isIntersecting);
					}
				},
				{ threshold: 0 },
			);
			intersectionObserver.observe(canvas);

			if (isInView) {
				animationFrameId = requestAnimationFrame(animate);
			}
		}

		return () => {
			if (animationFrameId !== null) {
				cancelAnimationFrame(animationFrameId);
			}
			if (resizeObserver) {
				resizeObserver.disconnect();
			}
			if (intersectionObserver) {
				intersectionObserver.disconnect();
			}
		};
	}, [setupCanvas, updateSquares, drawGrid, width, height, isInView]);

	return (
		<div
			ref={containerRef}
			className={cn(`h-full w-full ${className}`)}
			{...props}
		>
			<canvas
				ref={canvasRef}
				className="pointer-events-none"
				style={{
					width: canvasSize.width,
					height: canvasSize.height,
				}}
			/>
		</div>
	);
};
