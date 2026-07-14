type DiscBase = {
	x: number;
	y: number;
	w: number;
	h: number;
};

type Disc = DiscBase & {
	p: number;
};

type Point = {
	x: number;
	y: number;
};

type Particle = {
	x: number;
	sx: number;
	dx: number;
	y: number;
	vy: number;
	p: number;
	r: number;
	c: string;
};

type ParticleArea = {
	sx: number;
	sw: number;
	ex: number;
	ew: number;
	h: number;
};

type HoleState = {
	discs: Disc[];
	lines: Point[][];
	particles: Particle[];
	clip: {
		disc: Disc;
		i: number;
		path: Path2D | null;
	};
	startDisc: DiscBase;
	endDisc: DiscBase;
	rect: { width: number; height: number };
	render: { width: number; height: number; dpi: number };
	particleArea: ParticleArea;
	linesCanvas: HTMLCanvasElement | null;
};

const linear = (p: number) => p;
const easeInExpo = (p: number) => (p === 0 ? 0 : Math.pow(2, 10 * (p - 1)));

function createHoleState(): HoleState {
	return {
		discs: [],
		lines: [],
		particles: [],
		clip: { disc: { p: 0, x: 0, y: 0, w: 0, h: 0 }, i: 0, path: null },
		startDisc: { x: 0, y: 0, w: 0, h: 0 },
		endDisc: { x: 0, y: 0, w: 0, h: 0 },
		rect: { width: 0, height: 0 },
		render: { width: 0, height: 0, dpi: 1 },
		particleArea: { sx: 0, sw: 0, ex: 0, ew: 0, h: 0 },
		linesCanvas: null,
	};
}

function tweenValue(
	start: number,
	end: number,
	p: number,
	ease: "inExpo" | null = null,
) {
	const delta = end - start;
	const easeFn = ease === "inExpo" ? easeInExpo : linear;
	return start + delta * easeFn(p);
}

function tweenDisc(state: HoleState, disc: Disc) {
	const { startDisc, endDisc } = state;
	disc.x = tweenValue(startDisc.x, endDisc.x, disc.p);
	disc.y = tweenValue(startDisc.y, endDisc.y, disc.p, "inExpo");
	disc.w = tweenValue(startDisc.w, endDisc.w, disc.p);
	disc.h = tweenValue(startDisc.h, endDisc.h, disc.p);
}

function setSize(state: HoleState, canvas: HTMLCanvasElement) {
	const rect = canvas.getBoundingClientRect();
	state.rect = { width: rect.width, height: rect.height };
	state.render = {
		width: rect.width,
		height: rect.height,
		dpi: window.devicePixelRatio || 1,
	};
	canvas.width = state.render.width * state.render.dpi;
	canvas.height = state.render.height * state.render.dpi;
}

function setDiscs(state: HoleState, numberOfDiscs: number) {
	const { width, height } = state.rect;
	state.discs = [];
	state.startDisc = {
		x: width * 0.5,
		y: height * 0.45,
		w: width * 0.75,
		h: height * 0.7,
	};
	state.endDisc = {
		x: width * 0.5,
		y: height * 0.95,
		w: 0,
		h: 0,
	};
	let prevBottom = height;
	state.clip = {
		disc: { p: 0, x: 0, y: 0, w: 0, h: 0 },
		i: 0,
		path: null,
	};
	for (let i = 0; i < numberOfDiscs; i++) {
		const p = i / numberOfDiscs;
		const disc = { p, x: 0, y: 0, w: 0, h: 0 };
		tweenDisc(state, disc);
		const bottom = disc.y + disc.h;
		if (bottom <= prevBottom) {
			state.clip = { disc: { ...disc }, i, path: null };
		}
		prevBottom = bottom;
		state.discs.push(disc);
	}
	const clipPath = new Path2D();
	const disc = state.clip.disc;
	clipPath.ellipse(disc.x, disc.y, disc.w, disc.h, 0, 0, Math.PI * 2);
	clipPath.rect(disc.x - disc.w, 0, disc.w * 2, disc.y);
	state.clip.path = clipPath;
}

function setLines(
	state: HoleState,
	numberOfLines: number,
	strokeColor: string,
) {
	const { width, height } = state.rect;
	state.lines = [];
	const linesAngle = (Math.PI * 2) / numberOfLines;
	for (let i = 0; i < numberOfLines; i++) {
		state.lines.push([]);
	}
	state.discs.forEach((disc) => {
		for (let i = 0; i < numberOfLines; i++) {
			const angle = i * linesAngle;
			const p = {
				x: disc.x + Math.cos(angle) * disc.w,
				y: disc.y + Math.sin(angle) * disc.h,
			};
			state.lines[i]?.push(p);
		}
	});
	const offCanvas = document.createElement("canvas");
	offCanvas.width = width;
	offCanvas.height = height;
	const ctx = offCanvas.getContext("2d");
	if (!ctx) return;
	const clipPath = state.clip.path;
	if (!clipPath) return;
	state.lines.forEach((line) => {
		ctx.save();
		let lineIsIn = false;
		line.forEach((p1, j) => {
			if (j === 0) return;
			const p0 = line[j - 1];
			if (!p0) return;
			if (
				!lineIsIn &&
				(ctx.isPointInPath(clipPath, p1.x, p1.y) ||
					ctx.isPointInStroke(clipPath, p1.x, p1.y))
			) {
				lineIsIn = true;
			} else if (lineIsIn) {
				ctx.clip(clipPath);
			}
			ctx.beginPath();
			ctx.moveTo(p0.x, p0.y);
			ctx.lineTo(p1.x, p1.y);
			ctx.strokeStyle = strokeColor;
			ctx.lineWidth = 2;
			ctx.stroke();
			ctx.closePath();
		});
		ctx.restore();
	});
	state.linesCanvas = offCanvas;
}

function initParticle(
	state: HoleState,
	particleRGBColor: [number, number, number],
	start: boolean = false,
) {
	const sx = state.particleArea.sx + state.particleArea.sw * Math.random();
	const ex = state.particleArea.ex + state.particleArea.ew * Math.random();
	const dx = ex - sx;
	const y = start ? state.particleArea.h * Math.random() : state.particleArea.h;
	const r = 0.5 + Math.random() * 4;
	const vy = 0.5 + Math.random();
	return {
		x: sx,
		sx,
		dx,
		y,
		vy,
		p: 0,
		r,
		c: `rgba(${particleRGBColor[0]}, ${particleRGBColor[1]}, ${particleRGBColor[2]}, ${Math.random()})`,
	};
}

function setParticles(
	state: HoleState,
	particleRGBColor: [number, number, number],
) {
	const { width, height } = state.rect;
	state.particles = [];
	const disc = state.clip.disc;
	const sw = disc.w * 0.5;
	const ew = disc.w * 2;
	state.particleArea = {
		sw,
		ew,
		h: height * 0.85,
		sx: (width - sw) / 2,
		ex: (width - ew) / 2,
	};
	const totalParticles = 100;
	for (let i = 0; i < totalParticles; i++) {
		state.particles.push(initParticle(state, particleRGBColor, true));
	}
}

function drawDiscs(
	ctx: CanvasRenderingContext2D,
	state: HoleState,
	strokeColor: string,
) {
	ctx.strokeStyle = strokeColor;
	ctx.lineWidth = 2;
	const outerDisc = state.startDisc;
	ctx.beginPath();
	ctx.ellipse(
		outerDisc.x,
		outerDisc.y,
		outerDisc.w,
		outerDisc.h,
		0,
		0,
		Math.PI * 2,
	);
	ctx.stroke();
	ctx.closePath();
	const clipPath = state.clip.path;
	if (!clipPath) return;
	state.discs.forEach((disc, i) => {
		if (i % 5 !== 0) return;
		if (disc.w < state.clip.disc.w - 5) {
			ctx.save();
			ctx.clip(clipPath);
		}
		ctx.beginPath();
		ctx.ellipse(disc.x, disc.y, disc.w, disc.h, 0, 0, Math.PI * 2);
		ctx.stroke();
		ctx.closePath();
		if (disc.w < state.clip.disc.w - 5) {
			ctx.restore();
		}
	});
}

function drawLines(ctx: CanvasRenderingContext2D, state: HoleState) {
	if (state.linesCanvas) {
		ctx.drawImage(state.linesCanvas, 0, 0);
	}
}

function drawParticles(ctx: CanvasRenderingContext2D, state: HoleState) {
	const clipPath = state.clip.path;
	if (!clipPath) return;
	ctx.save();
	ctx.clip(clipPath);
	state.particles.forEach((particle) => {
		ctx.fillStyle = particle.c;
		ctx.beginPath();
		ctx.rect(particle.x, particle.y, particle.r, particle.r);
		ctx.closePath();
		ctx.fill();
	});
	ctx.restore();
}

function moveDiscs(state: HoleState) {
	state.discs.forEach((disc) => {
		disc.p = (disc.p + 0.001) % 1;
		tweenDisc(state, disc);
	});
}

function moveParticles(
	state: HoleState,
	particleRGBColor: [number, number, number],
) {
	state.particles.forEach((particle, idx) => {
		particle.p = 1 - particle.y / state.particleArea.h;
		particle.x = particle.sx + particle.dx * particle.p;
		particle.y -= particle.vy;
		if (particle.y < 0) {
			state.particles[idx] = initParticle(state, particleRGBColor);
		}
	});
}

function initHole(
	state: HoleState,
	canvas: HTMLCanvasElement,
	opts: {
		numberOfDiscs: number;
		numberOfLines: number;
		strokeColor: string;
		particleRGBColor: [number, number, number];
	},
) {
	setSize(state, canvas);
	setDiscs(state, opts.numberOfDiscs);
	setLines(state, opts.numberOfLines, opts.strokeColor);
	setParticles(state, opts.particleRGBColor);
}

export {
	createHoleState,
	type Disc,
	type DiscBase,
	drawDiscs,
	drawLines,
	drawParticles,
	type HoleState,
	initHole,
	moveDiscs,
	moveParticles,
	type Particle,
	type ParticleArea,
	type Point,
	setDiscs,
	setLines,
	setParticles,
	setSize,
};
