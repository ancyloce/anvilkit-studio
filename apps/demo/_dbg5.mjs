import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto('http://localhost:3210/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1600);

const read = () => page.evaluate(() => {
  const ST = window.__ST; const g = document.querySelector('[class*="steps"]');
  return { st: ST ? Math.round(ST.getAll()[0].scroll()) : null,
           winY: Math.round(window.scrollY),
           card: g && g.firstElementChild ? +getComputedStyle(g.firstElementChild).opacity : null };
});

// A) scrollTo
await page.evaluate(() => window.scrollTo(0, 1700)); await page.waitForTimeout(400);
const a = await read();
// B) scrollTo + manual scroll event dispatch
await page.evaluate(() => window.dispatchEvent(new Event('scroll'))); await page.waitForTimeout(400);
const b = await read();
// C) realistic wheel scrolling from top
await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
await page.mouse.move(640, 450);
for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 200); await page.waitForTimeout(60); }
await page.waitForTimeout(500);
const c = await read();
// D) keyboard / End key
await page.keyboard.press('End'); await page.waitForTimeout(600);
const d = await read();

console.log(JSON.stringify({ A_scrollTo: a, B_dispatchEvent: b, C_wheel: c, D_end: d }, null, 1));
await browser.close();
