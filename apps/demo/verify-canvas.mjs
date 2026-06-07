import { chromium } from "@playwright/test";

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await (
	await browser.newContext({ viewport: { width: 1400, height: 900 } })
).newPage();
const allMsgs = [];
page.on("console", (msg) => {
	allMsgs.push(`[${msg.type()}] ${msg.text().slice(0, 300)}`);
});
page.on("pageerror", (e) => allMsgs.push(`[pageerror] ${e.message}`));
const pageId = `verify-${Date.now()}`;
await page.goto(`http://localhost:3000/studio/canvas/${pageId}`, {
	timeout: 60000,
	waitUntil: "domcontentloaded",
});
// poll mount + workspace
const start = Date.now();
let mountSeen = false,
	wsSeen = false;
while (Date.now() - start < 240000) {
	if (!mountSeen) {
		const has = await page
			.locator('[data-testid="canvas-studio-mount"]')
			.count();
		if (has) {
			mountSeen = true;
			console.log(
				"+",
				`${((Date.now() - start) / 1000).toFixed(1)}s`,
				"mount visible",
			);
		}
	}
	if (!wsSeen) {
		const has = await page
			.locator('[data-testid="canvas-workspace-root"]')
			.count();
		if (has) {
			wsSeen = true;
			console.log(
				"+",
				`${((Date.now() - start) / 1000).toFixed(1)}s`,
				"workspace visible",
			);
			break;
		}
	}
	await page.waitForTimeout(2000);
}
if (!wsSeen) {
	console.log("NO WORKSPACE — bailing");
	await browser.close();
	process.exit(0);
}
await page.waitForTimeout(2000);
await page.click('[data-testid="panel-dock-elements"]');
await page.waitForTimeout(500);
const tools = await page.$$eval('[data-testid^="elements-tool-"]', (els) =>
	els.map((e) => e.getAttribute("data-testid")),
);
console.log("TOOLS:", tools.join(","));
const rectTool =
	tools.find((t) => /rect|rectangle|square|shape/i.test(t)) ||
	tools.find((t) => !/select/i.test(t));
await page.click(`[data-testid="${rectTool}"]`);
const canvas = page.locator('[data-testid="pages-canvas"] canvas').first();
const box = await canvas.boundingBox();
const x1 = box.x + 280,
	y1 = box.y + 220,
	x2 = box.x + 560,
	y2 = box.y + 440;
await page.mouse.move(x1, y1);
await page.mouse.down();
await page.mouse.move(x2, y2, { steps: 15 });
await page.mouse.up();
console.log("DRAW: dragged");
await page.waitForTimeout(800);
const selectTool = tools.find((t) => /select/i.test(t));
if (selectTool)
	await page.click(`[data-testid="${selectTool}"]`).catch(() => undefined);
const cx = (x1 + x2) / 2,
	cy = (y1 + y2) / 2;
await page.mouse.click(cx, cy);
await page.waitForTimeout(1500);
console.log("CLICK: selected (Transformer rendered)");
await page.mouse.move(cx, y2 + 60);
await page.waitForTimeout(500);
await page.screenshot({ path: "/tmp/canvas-verify.png", fullPage: false });
console.log("--- CONSOLE (last 40) ---");
console.log(allMsgs.slice(-40).join("\n"));
const hit = allMsgs.some((s) =>
	s.includes("external nodes to the Transformer"),
);
console.log(
	"--- KONVA EXTERNAL-NODES ERROR? ---",
	hit ? "YES (BAD)" : "NO (GOOD)",
);
await browser.close();
