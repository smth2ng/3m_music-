const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { existsSync } = require('node:fs');
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
    if (width !== 390 && width !== 1440) {
      console.log(`PASS ${width}px: layout and assets`);
      await context.close();
      continue;
    }
    const menu = page.getByRole('navigation', { name: 'Основная навигация' });
    assert.equal(await menu.getByRole('link', { name: 'Главная' }).getAttribute('aria-current'), 'page');
    await menu.getByRole('link', { name: 'О студии' }).click();
    await page.waitForURL('**/studio.html');
    assert.equal(await menu.getByRole('link', { name: 'О студии' }).getAttribute('aria-current'), 'page');
    assert.equal(await page.getByRole('heading', { level: 1 }).innerText(), 'О студии');
    assert.equal(await page.locator('#teachers .teacher').count(), 2);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Studio fits at ${width}px`);
    await page.getByRole('link', { name: 'Путь артиста' }).click();
    await page.waitForURL('**/studio.html#journey');
    await menu.getByRole('link', { name: 'Контакты' }).click();
    await page.waitForURL('**/index.html#contacts');
    await page.evaluate(() => window.scrollTo(0, 0));
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
    const positions = await page.evaluate(() => Object.fromEntries(['.about', '.services-grid', '.map'].map(selector => [selector, document.querySelector(selector).getBoundingClientRect().top + scrollY])));
    assert.equal(positions['.about'], width === 390 ? 610 : 956, 'First screen remains aligned with the design');
    assert.ok(positions['.services-grid'] > positions['.about']);
    assert.ok(positions['.map'] > positions['.services-grid']);
    assert.equal(await page.locator('html').evaluate(element => getComputedStyle(element).scrollSnapType), 'none', 'Reduced motion disables magnetic scrolling');
    console.log(`PASS ${width}px: layout, assets, menu, wheel/keyboard carousel, artist tab, overlay, contact dialog${width === 390 ? ', touch swipe, page scroll' : ''}`);
    await context.close();
  }
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 800 }, reducedMotion: 'no-preference' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    await page.waitForFunction(() => document.documentElement.classList.contains('motion-ready'));
    assert.match(await page.locator('html').evaluate(element => getComputedStyle(element).scrollSnapType), /^y(?: proximity)?$/);
    const chapter = page.locator('#services');
    await chapter.evaluate(element => element.scrollIntoView({ behavior: 'instant', block: 'start' }));
    await page.waitForFunction(() => document.querySelector('#services').classList.contains('is-visible'));
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('#services')).opacity) > .99);
    assert.ok(await chapter.evaluate(element => Math.abs(element.getBoundingClientRect().top) < 160), 'Magnetic scrolling aligns a chapter in the viewport');
    assert.ok(await page.locator('.service').first().evaluate(element => getComputedStyle(element).backdropFilter.includes('blur')), 'Glass panels use backdrop blur');
    assert.ok(await page.locator('.scroll-progress').evaluate(element => Number(element.style.getPropertyValue('--scroll-progress')) > 0), 'Progress tracks the scroll position');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => !document.documentElement.classList.contains('motion-ready'));
    assert.equal(await page.locator('html').evaluate(element => getComputedStyle(element).scrollSnapType), 'none');
    assert.equal(await chapter.evaluate(element => getComputedStyle(element).opacity), '1');
    console.log(`PASS ${width}px: magnetic scrolling, chapter reveal, glass, progress, reduced-motion preference change`);
    await context.close();
  }
  assert.deepEqual(errors, [], 'No browser errors or failed HTTP responses');
  console.log('All 7 viewport checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); server.kill(); });
