#!/usr/bin/env node
// run-veridian driver — launches and drives the Veridian stack so an agent can
// confirm a change works in the real app (not just tests).
//
//   node driver.mjs api      # start FastAPI, smoke-test /health + /predict + /dashboard
//   node driver.mjs web      # start API + Next.js web, screenshot pages, run /score flow
//   node driver.mjs all      # full end-to-end (default): API + web + browser + /score
//   node driver.mjs up       # start API + web, print URLs, stay running (Ctrl-C to stop)
//
// Flags:  --copilot  also screenshot /copilot and hit /ask (real external LLM call)
//         --keep     leave the servers running after the run (default: tear down)
//         --out DIR  screenshot output dir (default: ./screenshots next to this file)
//
// Needs only Node 18+ and Google Chrome installed (driven via playwright-core's
// `chrome` channel — no chromium download). Run `npm install` in this dir once.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');                 // .../veridian
const WEB_DIR = join(ROOT, 'web');
const VENV_PY = join(ROOT, '.venv', 'bin', 'python');
const LOCAL_DB = `sqlite:///${join(ROOT, 'data', 'veridian.db')}`;

const API_PORT = Number(process.env.VERIDIAN_API_PORT || 8000);
const WEB_PORT = Number(process.env.VERIDIAN_WEB_PORT || 3000);
const API = `http://127.0.0.1:${API_PORT}`;
const WEB = `http://127.0.0.1:${WEB_PORT}`;

const argv = process.argv.slice(2);
const cmd = argv.find((a) => !a.startsWith('-')) || 'all';
const flag = (name) => argv.includes(name);
const outDir = (() => {
  const i = argv.indexOf('--out');
  return resolve(i >= 0 && argv[i + 1] ? argv[i + 1] : join(HERE, 'screenshots'));
})();

const KEEP = flag('--keep');
const WITH_COPILOT = flag('--copilot');

// --- process lifecycle -----------------------------------------------------
const owned = [];                 // children we spawned (we kill these)
let shuttingDown = false;

function launch(name, file, args, opts) {
  const child = spawn(file, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  child._name = name;
  child.stdout.on('data', (b) => process.env.VERIDIAN_VERBOSE && process.stdout.write(`[${name}] ${b}`));
  child.stderr.on('data', (b) => process.env.VERIDIAN_VERBOSE && process.stderr.write(`[${name}] ${b}`));
  child.on('exit', (code) => { if (!shuttingDown) console.error(`[${name}] exited early (code ${code})`); });
  owned.push(child);
  return child;
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of owned) { try { c.kill('SIGTERM'); } catch {} }
  await sleep(700);
  for (const c of owned) { try { if (!c.killed) c.kill('SIGKILL'); } catch {} }
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { await shutdown(); process.exit(130); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForHttp(url, { timeoutMs = 90_000, ok = (r) => r.ok } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { const r = await fetch(url); if (ok(r)) return true; } catch {}
    await sleep(500);
  }
  throw new Error(`timed out waiting for ${url}`);
}

// --- servers ---------------------------------------------------------------
async function ensureApi() {
  if (await isUp(`${API}/health`)) { console.log(`• API already up at ${API}`); return false; }
  if (!existsSync(VENV_PY)) throw new Error(`missing venv python at ${VENV_PY} — create it (see SKILL.md Build)`);
  console.log(`• starting API: uvicorn api.main:app --port ${API_PORT}  (DATABASE_URL -> local SQLite)`);
  launch('api', VENV_PY, ['-m', 'uvicorn', 'api.main:app', '--port', String(API_PORT)],
    { cwd: ROOT, env: { ...process.env, DATABASE_URL: LOCAL_DB, PYTHONUNBUFFERED: '1' } });
  await waitForHttp(`${API}/health`);
  console.log(`  API ready (${API})`);
  return true;
}

async function ensureWeb() {
  if (await isUp(WEB)) { console.log(`• web already up at ${WEB}`); return false; }
  if (!existsSync(join(WEB_DIR, 'node_modules'))) throw new Error(`web/node_modules missing — run \`npm install\` in web/`);
  console.log(`• starting web: npm run dev  (port ${WEB_PORT})`);
  launch('web', 'npm', ['run', 'dev', '--', '--port', String(WEB_PORT)],
    { cwd: WEB_DIR, env: { ...process.env, NEXT_PUBLIC_API_URL: API, BROWSER: 'none' } });
  await waitForHttp(WEB, { ok: (r) => r.status < 500 });
  console.log(`  web ready (${WEB})`);
  return true;
}

const isUp = (url) => fetch(url).then((r) => r.status < 500).catch(() => false);

// --- API smoke -------------------------------------------------------------
let failures = 0;
function check(name, cond, detail = '') {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!cond) failures++;
  return cond;
}

const DELAY_BODY = {
  order_purchase_timestamp: '2018-03-10T14:00:00', estimated_delivery_days: 25, n_items: 1,
  total_price: 120, total_freight: 20, customer_seller_distance_km: 900,
  customer_state: 'SP', main_seller_state: 'RS', primary_payment_type: 'credit_card', main_category: 'furniture_decor',
};
const LOW_REVIEW_BODY = {
  estimated_delivery_days: 12, customer_seller_distance_km: 2000,
  customer_state: 'AM', main_seller_state: 'SP', actual_delivery_days: 20,
};

async function smokeApi() {
  console.log('\n== API smoke ==');
  const post = (path, body) => fetch(`${API}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });

  const health = await (await fetch(`${API}/health`)).json();
  check('GET /health', health.status === 'ok' && (health.models_loaded || []).includes('delay'),
    `models_loaded=${JSON.stringify(health.models_loaded)}`);

  const meta = await (await fetch(`${API}/models/delay`)).json();
  check('GET /models/delay', meta.name === 'delay' && typeof meta.roc_auc === 'number', `roc_auc=${meta.roc_auc}`);

  const d = await (await post('/predict/delay', DELAY_BODY)).json();
  check('POST /predict/delay', typeof d.probability === 'number' && ['low', 'medium', 'high'].includes(d.risk_level),
    `probability=${d.probability} risk=${d.risk_level}`);

  const lr = await (await post('/predict/low-review', LOW_REVIEW_BODY)).json();
  check('POST /predict/low-review', typeof lr.probability === 'number', `probability=${lr.probability}`);

  const dashRes = await fetch(`${API}/dashboard`);
  const dash = await dashRes.json();
  check('GET /dashboard', dashRes.ok && Array.isArray(dash.orders) && dash.orders.length > 0,
    `orders=${(dash.orders || []).length}`);

  const seg = await (await fetch(`${API}/segments`)).json();
  check('GET /segments', Array.isArray(seg.segments) && seg.segments.length > 0,
    `segments=${(seg.segments || []).length} repeat_rate=${seg.summary?.repeat_rate_pct}%`);

  const fc = await (await fetch(`${API}/forecast`)).json();
  check('GET /forecast', Array.isArray(fc.series) && fc.series.length > 0,
    `series=${(fc.series || []).length} next_orders=${fc.summary?.next_orders}`);

  if (WITH_COPILOT) {
    const ask = await (await post('/ask', { question: 'What ROC-AUC does the delay model achieve?' })).json();
    check('POST /ask (external LLM)', typeof ask.answer === 'string' && ask.answer.length > 0,
      `model=${ask.llm_model} tokens=${ask.tokens}${ask.error ? ' (degraded: ' + ask.error + ')' : ''}`);
  }
}

// --- browser ---------------------------------------------------------------
async function smokeWeb() {
  const { chromium } = await import('playwright-core');
  mkdirSync(outDir, { recursive: true });
  console.log(`\n== web (screenshots -> ${outDir}) ==`);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60_000);
  // Viewport-only: these pages are long (scroll animations / big tables); the
  // above-the-fold view is the meaningful, compact shot.
  const shot = (name) => page.screenshot({ path: join(outDir, name) });

  try {
    await page.goto(WEB + '/', { waitUntil: 'networkidle' });
    const title = await page.title();
    await shot('01-landing.png');
    check('GET / (landing)', /veridian/i.test(title), `title="${title}"`);

    await page.goto(WEB + '/dashboard', { waitUntil: 'networkidle' });
    await shot('02-dashboard.png');
    check('GET /dashboard (page)', !/\/login$/.test(page.url()), `final url=${page.url()}`);

    // The money flow: /score is pre-filled — click "Score order", read the risk.
    await page.goto(WEB + '/score', { waitUntil: 'networkidle' });
    const submit = page.getByRole('button', { name: /score order/i });
    await submit.waitFor({ state: 'visible' });
    await submit.click();
    await page.getByText('Delivery delay risk').waitFor({ state: 'visible' });
    const pct = await page.locator('p.font-display.text-4xl').first().innerText().catch(() => '');
    await shot('03-score-result.png');
    check('POST /score flow (delay risk renders)', /\d+(\.\d+)?%/.test(pct), `probability shown=${pct || 'n/a'}`);

    await page.goto(WEB + '/segments', { waitUntil: 'networkidle' });
    await page.getByText('Customer segments').first().waitFor({ state: 'visible' });
    await shot('04-segments.png');
    check('GET /segments (page)', !/\/login$/.test(page.url()), `final url=${page.url()}`);

    await page.goto(WEB + '/forecast', { waitUntil: 'networkidle' });
    await page.getByText('Demand forecast').first().waitFor({ state: 'visible' });
    await shot('05-forecast.png');
    check('GET /forecast (page)', !/\/login$/.test(page.url()), `final url=${page.url()}`);

    if (WITH_COPILOT) {
      await page.goto(WEB + '/copilot', { waitUntil: 'networkidle' });
      await shot('06-copilot.png');
      check('GET /copilot (page)', !/\/login$/.test(page.url()), `final url=${page.url()}`);
    }
  } finally {
    await browser.close();
  }
}

// --- main ------------------------------------------------------------------
async function main() {
  console.log(`run-veridian driver — cmd=${cmd}  ROOT=${ROOT}`);
  try {
    if (cmd === 'api') {
      await ensureApi();
      await smokeApi();
    } else if (cmd === 'web') {
      await ensureApi();
      await ensureWeb();
      await smokeWeb();
    } else if (cmd === 'all') {
      await ensureApi();
      await smokeApi();
      await ensureWeb();
      await smokeWeb();
    } else if (cmd === 'up') {
      await ensureApi();
      await ensureWeb();
      console.log(`\nServers running:\n  API  ${API}  (docs at ${API}/docs)\n  web  ${WEB}\nPress Ctrl-C to stop.`);
      await new Promise(() => {});   // stay alive until signal
      return;
    } else {
      console.error(`unknown command: ${cmd}\nusage: node driver.mjs [api|web|all|up] [--copilot] [--keep] [--out DIR]`);
      process.exit(2);
    }
  } catch (err) {
    console.error('\nDRIVER ERROR:', err.message);
    failures++;
  }

  console.log(`\n${failures === 0 ? '✓ ALL CHECKS PASSED' : `✗ ${failures} CHECK(S) FAILED`}`);
  if (KEEP) {
    console.log('(--keep) leaving servers running. Press Ctrl-C to stop.');
    await new Promise(() => {});
  } else {
    await shutdown();
    process.exit(failures === 0 ? 0 : 1);
  }
}

main();
