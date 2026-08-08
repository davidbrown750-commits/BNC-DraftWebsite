/**
 * Cross-platform header / search verification.
 *
 * Renders the pages you name across the three browser engines that stand behind
 * the four platforms we ship to, at every breakpoint the sticky header changes
 * behaviour on, and asserts the things that have actually broken here before:
 * horizontal overflow from the mega-menu flyouts, the CTA riding on top of the
 * nav, the search box collapsing to nothing, and hover-only flyouts being
 * unreachable on touch.
 *
 * WebKit stands in for Safari on macOS and iOS. Chromium stands in for Chrome on
 * Windows and Android. That is engine-level cover, not a real-device test: it
 * will not catch iOS toolbar chrome, real touch latency, or vendor font
 * substitution. Say "verified on the WebKit and Chromium engines at N widths",
 * never "verified on iPhone", unless somebody actually held an iPhone.
 *
 *   node scripts/verify-header-platforms.mjs --base http://127.0.0.1:8899 \
 *        --pages /home.html,/accessibility.html --out /tmp/shots
 */

import { chromium, webkit } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const argv = Object.fromEntries(
  process.argv.slice(2).join(' ').split('--').filter(Boolean)
    .map(s => s.trim().split(/\s+/)).map(([k, ...v]) => [k, v.join(' ')]),
);

const BASE = argv.base || 'http://127.0.0.1:8899';
const PAGES = (argv.pages || '/home.html').split(',').map(s => s.trim()).filter(Boolean);
const OUT = argv.out || '';
const SHOT = argv.shot === 'true' || argv.shot === '';

// Desktop widths bracket the nav collapse point (1040) and the CTA/nav overlap
// range that bit us at 1100-1200. Handset widths are the three that matter.
const DESKTOP_WIDTHS = [1440, 1280, 1200, 1100, 1040, 900, 768];
const HANDSET_WIDTHS = [430, 390, 360];

const ENGINES = [
  { key: 'chromium-win', engine: chromium, label: 'Chromium (Windows Chrome / Edge)', touch: false,
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' },
  { key: 'webkit-mac', engine: webkit, label: 'WebKit (macOS Safari)', touch: false, ua: null },
  { key: 'webkit-ios', engine: webkit, label: 'WebKit (iOS Safari)', touch: true, ua: null, handset: true, dpr: 3 },
  { key: 'chromium-android', engine: chromium, label: 'Chromium (Android Chrome)', touch: true, handset: true, dpr: 2.625,
    ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36' },
];

const findings = [];
function fail(where, msg, detail) { findings.push({ level: 'FAIL', where, msg, detail }); }
function warn(where, msg, detail) { findings.push({ level: 'WARN', where, msg, detail }); }

async function probe(page) {
  return page.evaluate(() => {
    const r = (el) => (el ? el.getBoundingClientRect() : null);
    const nav = document.querySelector('.sitenav');
    const menu = document.querySelector('.sitenav-menu');
    const cta = document.querySelector('.sitenav-cta');
    const search = document.querySelector('.ss-wrap');
    const input = document.querySelector('.ss-input');
    const toggle = document.querySelector('.navtoggle');
    const logo = document.querySelector('.sitenav-logo');
    const cs = (el) => (el ? getComputedStyle(el) : null);
    return {
      hasNav: !!nav,
      docW: document.documentElement.scrollWidth,
      viewW: window.innerWidth,
      navPos: nav ? cs(nav).position : null,
      menu: r(menu), cta: r(cta), search: r(search), logo: r(logo),
      toggleShown: toggle ? cs(toggle).display !== 'none' : false,
      menuShown: menu ? cs(menu).display !== 'none' : false,
      inputFontPx: input ? parseFloat(cs(input).fontSize) : null,
      // A tap target under 44px on a touch device is a WCAG 2.5.5 problem.
      ctaH: cta ? r(cta).height : null,
      toggleBox: toggle ? r(toggle) : null,
      searchLeftOfMenu: (r(search) && r(menu)) ? r(search).left < r(menu).left : null,
      logoLeftOfSearch: (r(logo) && r(search)) ? r(logo).left < r(search).left : null,
    };
  });
}

async function run() {
  if (OUT) fs.mkdirSync(OUT, { recursive: true });

  for (const eng of ENGINES) {
    const browser = await eng.engine.launch();
    const widths = eng.handset ? HANDSET_WIDTHS : DESKTOP_WIDTHS;

    for (const pagePath of PAGES) {
      for (const w of widths) {
        const ctx = await browser.newContext({
          viewport: { width: w, height: eng.handset ? 844 : 900 },
          deviceScaleFactor: eng.dpr || 1,
          hasTouch: eng.touch,
          isMobile: !!eng.handset,
          userAgent: eng.ua || undefined,
        });
        const page = await ctx.newPage();
        const where = `${eng.key} ${w}px ${pagePath}`;
        try {
          const resp = await page.goto(BASE + pagePath, { waitUntil: 'load', timeout: 30000 });
          if (!resp || resp.status() >= 400) { fail(where, 'page did not load', resp && resp.status()); await ctx.close(); continue; }
          await page.waitForTimeout(350);
          const m = await probe(page);

          if (!m.hasNav) { fail(where, 'no .sitenav on the page'); await ctx.close(); continue; }

          // 1. the flyouts must not stretch the document
          if (m.docW > m.viewW + 1) {
            fail(where, 'horizontal overflow', `scrollWidth ${m.docW} vs viewport ${m.viewW}`);
          }
          // 2. the CTA must not sit on top of the nav items
          if (m.menuShown && m.menu && m.cta && m.menu.right > m.cta.left + 1) {
            fail(where, 'CTA overlaps the nav', `menu.right ${Math.round(m.menu.right)} > cta.left ${Math.round(m.cta.left)}`);
          }
          // 3. search sits between the logo and the nav, and stays usable
          if (m.menuShown) {
            if (m.searchLeftOfMenu === false) fail(where, 'search is not left of the nav');
            if (m.logoLeftOfSearch === false) fail(where, 'search is not right of the logo');
            if (m.search && m.search.width < 90) fail(where, 'search box collapsed', `width ${Math.round(m.search.width)}px`);
          }
          // 4. below the collapse point the hamburger is the only way in
          if (!m.menuShown && !m.toggleShown) fail(where, 'nav collapsed with no hamburger to open it');
          // 5. iOS zooms the page when a focused input is under 16px
          if (eng.handset && m.inputFontPx && m.inputFontPx < 16) {
            warn(where, 'input font under 16px will auto-zoom on iOS', `${m.inputFontPx}px`);
          }
          // 6. tap targets
          if (eng.touch && m.toggleBox && (m.toggleBox.width < 44 || m.toggleBox.height < 44)) {
            warn(where, 'hamburger tap target under 44px', `${Math.round(m.toggleBox.width)}x${Math.round(m.toggleBox.height)}`);
          }
          if (eng.touch && m.ctaH && m.ctaH < 44) {
            warn(where, 'CTA tap target under 44px tall', `${Math.round(m.ctaH)}px`);
          }
          // 7. on touch, a hover-only flyout is unreachable: tapping must open it
          if (eng.touch && m.toggleShown) {
            await page.click('.navtoggle');
            await page.waitForTimeout(250);
            const opened = await page.evaluate(() => {
              const menu = document.querySelector('.sitenav-menu');
              return !!menu && getComputedStyle(menu).display !== 'none';
            });
            if (!opened) fail(where, 'tapping the hamburger does not reveal the nav');
            const after = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
            if (!after) fail(where, 'opening the nav causes horizontal overflow');
          }

          if (SHOT && OUT) {
            const name = `${eng.key}_${w}_${pagePath.replace(/[^a-z0-9]+/gi, '-')}.png`;
            await page.screenshot({ path: path.join(OUT, name) });
          }
        } catch (e) {
          fail(where, 'exception', String(e).slice(0, 200));
        }
        await ctx.close();
      }
    }
    await browser.close();
  }

  const fails = findings.filter(f => f.level === 'FAIL');
  const warns = findings.filter(f => f.level === 'WARN');
  const seen = new Set();
  for (const f of [...fails, ...warns]) {
    const k = `${f.level}|${f.msg}|${f.detail || ''}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const same = findings.filter(g => `${g.level}|${g.msg}|${g.detail || ''}` === k);
    console.log(`${f.level}: ${f.msg}${f.detail ? ' — ' + f.detail : ''}`);
    console.log(`        ${same.length} occurrence(s), first: ${same[0].where}`);
  }
  console.log(`\n${ENGINES.length} engines x ${PAGES.length} page(s): ${fails.length} failures, ${warns.length} warnings`);
  process.exit(fails.length ? 1 : 0);
}

run();
