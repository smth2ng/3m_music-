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
      assert.equal(positions['.about'], width === 390 ? 610 : 956, 'First screen remains aligned with the design');
      assert.ok(positions['.services-grid'] > positions['.about']);
      assert.ok(positions['.teachers'] > positions['.services-grid']);
      assert.ok(positions['.map'] > positions['.teachers']);
      const chapterGap = await page.locator('.journey').evaluate(element => parseFloat(getComputedStyle(element).marginTop));
      assert.ok(chapterGap >= (width === 390 ? 120 : 170), 'Chapters have additional breathing room');
      assert.equal(await page.locator('html').evaluate(element => getComputedStyle(element).scrollSnapType), 'none', 'Reduced motion disables magnetic scrolling');
      await page.evaluate(() => { document.activeElement.blur(); window.scrollTo(0, 0); });
      await page.mouse.move(0, 0);
      await page.screenshot({ path: `test-results/page-${width}.png`, fullPage: true });
    }
    console.log(`PASS ${width}px: layout, assets, menu, wheel/keyboard carousel, artist tab, overlay, contact dialog${width === 390 ? ', touch swipe, page scroll' : ''}`);
    await context.close();
  }
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 800 }, reducedMotion: 'no-preference', hasTouch: width === 390, isMobile: width === 390 });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    await page.waitForFunction(() => document.documentElement.classList.contains('motion-ready'));
    assert.match(await page.locator('html').evaluate(element => getComputedStyle(element).scrollSnapType), /^y mandatory$/);
    const chapter = page.locator('#services');
    await chapter.evaluate(element => element.scrollIntoView({ behavior: 'instant', block: 'start' }));
    await page.waitForFunction(() => document.querySelector('#services').classList.contains('is-visible'));
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('#services')).opacity) > .99);
    assert.ok(await chapter.evaluate(element => Math.abs(element.getBoundingClientRect().top) < 160), 'Magnetic scrolling aligns a chapter in the viewport');
    assert.equal(await page.locator('.service').first().evaluate(element => getComputedStyle(element).backdropFilter), 'none', 'Cards avoid expensive backdrop filters');
    assert.equal(await chapter.evaluate(element => getComputedStyle(element).filter), 'none', 'Reading area is never blurred');
    assert.equal(await chapter.evaluate(element => getComputedStyle(element).scrollSnapStop), 'always');
    assert.equal(await page.locator('.edge-lens').count(), 2);
    assert.ok(await page.locator('.edge-lens').first().evaluate(element => getComputedStyle(element).backdropFilter.includes('blur')), 'Glass lens is restricted to the screen edges');
    assert.ok(await page.locator('.scroll-progress').evaluate(element => Number(element.style.getPropertyValue('--scroll-progress')) > 0), 'Progress tracks the scroll position');
    if (width === 390) {
      await page.locator('#about').evaluate(element => element.scrollIntoView({ behavior: 'instant', block: 'start' }));
      const session = await context.newCDPSession(page);
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 650 }] });
      for (let step = 1; step <= 12; step++) {
        await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y: 650 - step * 40 }] });
        await page.waitForTimeout(20);
      }
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(900);
      await page.waitForFunction(() => {
        const section = document.querySelector('#services');
        const inset = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) + parseFloat(getComputedStyle(section).scrollMarginTop);
        return Math.abs(section.getBoundingClientRect().top - inset) < 6;
      }, null, { timeout: 5000 });
      await page.waitForTimeout(550);
      const stoppedAt = await page.evaluate(() => scrollY);
      await page.waitForTimeout(200);
      assert.ok(Math.abs(await page.evaluate(() => scrollY) - stoppedAt) < 2, 'Mobile scroll stops on a chapter after the animation');
    }
    if (width === 1440) {
      await page.locator('#about').evaluate(element => element.scrollIntoView({ behavior: 'instant', block: 'start' }));
      await page.mouse.move(500, 200);
      await page.mouse.wheel(0, 900);
      await page.mouse.wheel(0, 500);
      await page.waitForFunction(() => {
        const section = document.querySelector('#services');
        const inset = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) + parseFloat(getComputedStyle(section).scrollMarginTop);
        return Math.abs(section.getBoundingClientRect().top - inset) < 6;
      }, null, { timeout: 5000 });
      await page.waitForTimeout(800);
      assert.ok(await chapter.evaluate(element => Math.abs(element.getBoundingClientRect().top) < 160), 'Wheel momentum cannot skip the next chapter');
    }
    await page.screenshot({ path: `test-results/glass-${width}.png` });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => !document.documentElement.classList.contains('motion-ready'));
    assert.equal(await page.locator('html').evaluate(element => getComputedStyle(element).scrollSnapType), 'none');
    assert.equal(await chapter.evaluate(element => getComputedStyle(element).opacity), '1');
    console.log(`PASS ${width}px: magnetic scrolling, chapter reveal, glass, progress, reduced-motion preference change`);
    await context.close();
  }
  assert.deepEqual(errors, [], 'No browser errors or failed HTTP responses');
  console.log('All 7 viewport checks passed. Screenshots: test-results/');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); server.kill(); });
