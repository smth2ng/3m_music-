const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { existsSync, mkdirSync } = require('node:fs');
const { chromium } = require('playwright');
const port = 4173;
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, PORT: String(port) }, stdio: 'pipe' });
let browser;
async function ready() {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(origin)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Development server did not become ready');
}
(async () => {
  await ready();
  const executablePath = process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
  const errors = [];
  mkdirSync('test-results', { recursive: true });
  for (const width of [320, 390, 600, 768, 1024, 1440, 1920]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 768, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()}: ${response.url()}`); });
    await page.goto(origin);
    await page.locator('img').evaluateAll(images => images.forEach(image => { image.loading = 'eager'; }));
    await page.waitForFunction(() => [...document.images].every(image => image.complete));
    assert.equal(await page.locator('img').evaluateAll(images => images.every(image => image.naturalWidth > 0)), true, `Images load at ${width}`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `No horizontal overflow at ${width}`);
    assert.equal(await page.locator('h1').count(), 1);
    const menu = page.locator('.navigation'), toggle = page.locator('.menu-toggle');
    assert.equal(await menu.isVisible(), false);
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    assert.equal(await menu.locator('a').count(), 5);
    assert.equal(await menu.isVisible(), true);
    const menuBox = await menu.boundingBox();
    assert.ok(menuBox.x >= 0 && menuBox.x + menuBox.width <= width, `Menu stays inside viewport at ${width}`);
    if ([390, 1440].includes(width)) await page.screenshot({ path: `test-results/menu-${width}.png`, fullPage: true });
    await page.keyboard.press('Escape');
    assert.equal(await menu.isVisible(), false);
    assert.equal(await toggle.evaluate(element => element === document.activeElement), true);
    await toggle.click();
    await menu.locator('a[href="#services"]').click();
    assert.equal(await menu.isVisible(), false);
    assert.equal(await page.evaluate(() => location.hash), '#services');
    await page.evaluate(() => { history.replaceState(null, '', '/'); window.scrollTo(0, 0); });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const cards = page.locator('.artist');
    if (await cards.nth(1).getAttribute('aria-current') === 'true') await cards.nth(1).press('ArrowLeft');
    const frontBox = await cards.nth(0).boundingBox();
    const initialScroll = await page.evaluate(() => scrollY);
    await page.mouse.move(frontBox.x + frontBox.width / 2, frontBox.y + frontBox.height / 2);
    await page.mouse.wheel(120, 0);
    await page.waitForFunction(() => document.querySelector('[data-artist="1"]').getAttribute('aria-current') === 'true');
    assert.equal(await page.evaluate(() => scrollY), initialScroll, 'Wheel over cards keeps page position');
    await page.mouse.wheel(80, 0);
    assert.equal(await cards.nth(1).getAttribute('aria-current'), 'true', 'Wheel momentum does not switch twice');
    assert.equal(await cards.nth(0).locator('.artist-overlay').evaluate(element => getComputedStyle(element).opacity), '0.38');
    await cards.nth(1).press('ArrowLeft');
    assert.equal(await cards.nth(0).getAttribute('aria-current'), 'true');
    await page.mouse.wheel(0, 130);
    await page.waitForFunction(() => scrollY > 0);
    assert.equal(await cards.nth(0).getAttribute('aria-current'), 'true', 'Vertical wheel scrolls page without switching artists');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const popupPromise = page.waitForEvent('popup');
    await cards.nth(0).click();
    const popup = await popupPromise;
    await popup.waitForLoadState();
    assert.ok(popup.url().endsWith('/artists/artist-1.html'));
    assert.equal(await popup.locator('body').innerText(), '', 'Artist page is intentionally empty');
    await popup.close();
    assert.equal(await cards.nth(0).getAttribute('aria-current'), 'true', 'Click opens page without changing the artist');
    if (width === 390) {
      const session = await context.newCDPSession(page);
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 270, y: 350 }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 160, y: 352 }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForFunction(() => document.querySelector('[data-artist="1"]').getAttribute('aria-current') === 'true');
      assert.equal(context.pages().length, 1, 'Swipe does not open an artist tab');
      await cards.nth(1).press('ArrowRight');
      await page.evaluate(() => window.scrollTo(0, 130));
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await cards.nth(0).getAttribute('aria-current'), 'true', 'Page scroll does not change artist');
      await cards.nth(0).press('ArrowRight');
      await page.waitForTimeout(360); // Allow the swipe's synthetic-click guard to expire.
      const secondPopupPromise = page.waitForEvent('popup');
      await cards.nth(1).click();
      const secondPopup = await secondPopupPromise;
      await secondPopup.waitForLoadState();
      assert.ok(secondPopup.url().endsWith('/artists/artist-2.html'));
      assert.equal(await secondPopup.locator('body').innerText(), '');
      await secondPopup.close();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      if (await cards.nth(1).getAttribute('aria-current') === 'true') await cards.nth(1).press('ArrowLeft');
    }
    await page.locator('[data-contact]').click();
    assert.equal(await page.locator('dialog').evaluate(element => element.open), true);
    assert.equal(await page.locator('dialog a').getAttribute('href'), 'tel:+79109407608');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('dialog').evaluate(element => element.open), false);
    assert.equal(await page.locator('.map').getAttribute('target'), '_blank');
    if ([390, 1440].includes(width)) {
      const positions = await page.evaluate(() => Object.fromEntries(['.about', '.services-grid', '.teachers', '.map'].map(selector => [selector, document.querySelector(selector).getBoundingClientRect().top + scrollY])));
      const expected = width === 390 ? { '.about': 610, '.services-grid': 1106.36, '.teachers': 2454.6, '.map': 3384.6 } : { '.about': 956, '.services-grid': 1506.12, '.teachers': 2681, '.map': 4019 };
      for (const [selector, y] of Object.entries(expected)) assert.ok(Math.abs(positions[selector] - y) < 2, `Design position ${selector} at ${width}: ${positions[selector]} vs ${y}`);
      await page.evaluate(() => { document.activeElement.blur(); window.scrollTo(0, 0); });
      await page.mouse.move(0, 0);
      await page.screenshot({ path: `test-results/page-${width}.png`, fullPage: true });
    }
    console.log(`PASS ${width}px: layout, assets, menu, wheel/keyboard carousel, artist tab, overlay, contact dialog${width === 390 ? ', touch swipe, page scroll' : ''}`);
    await context.close();
  }
  assert.deepEqual(errors, [], 'No browser errors or failed HTTP responses');
  console.log('All 7 viewport checks passed. Screenshots: test-results/');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); server.kill(); });
