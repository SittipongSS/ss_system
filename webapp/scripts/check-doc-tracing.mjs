#!/usr/bin/env node
/* ── ด่าน "route เอกสารประเมินพกไบนารีไปครบ และ route เบาไม่ลากของหนักตาม" (PR-2 มติ 12 · 24 · §15 Gates) ───────
 *
 * รายงานการประเมินพื้นที่ (SU-…) ใช้ของหนักสองตัวที่ **build ผ่านเสมอแม้ไฟล์ไม่ถูกก๊อปไป deploy**:
 *   · chromium  — `@sparticuz/chromium` แตกไบนารี brotli จาก `bin/*.br` ด้วย fs ตอน runtime ⇒ file tracing มองไม่เห็น
 *                 ต้องสั่ง `outputFileTracingIncludes` ใน `next.config.mjs` (key เป็น glob — `[id]` ต้อง escape ไม่งั้นไม่แมตช์เงียบ ๆ)
 *   · sharp     — ไบนารีของแพลตฟอร์ม (`@img/sharp-<แพลตฟอร์ม>/lib/*.node` + libvips) ถูก require ด้วยชื่อที่ประกอบตอนรัน
 *                 🪤 บน Vercel ตัว trace ของ next-server **ตัด sharp ออกโดยตั้งใจ** (`next/dist/build/collect-build-traces.js`:
 *                 `hasNextSupport` ⇒ ignore `node_modules/sharp` + `@img/sharp-libvips*` — ตัวย่อรูปของ next/image ไปรันนอก next-server)
 *                 ⇒ sharp ไปถึงฟังก์ชันได้ **ทางเดียวคือ trace ของ route เอง** · บนเครื่องนักพัฒนา (`next start`) มันอยู่ใน
 *                 node_modules อยู่แล้ว จึงไม่มีวันเห็นอาการนี้ก่อนขึ้น production
 * และกลับด้าน: โมดูลของเอกสารถูกแบ่งตามน้ำหนัก (`surveyReportRows` เบา · `surveyReportImages`/`surveyReportPaper` โหลดของหนักด้วย
 * `await import()` ข้างในฟังก์ชัน) เพื่อไม่ให้ GET ใบประเมินที่ช่างเปิดหน้างาน · GET/PATCH คำร้อง · ดึงผลกลับ พก chromium ~70 MB
 * หรือ sharp ไปด้วย — import ผิดบรรทัดเดียวพังข้อนี้ได้โดยไม่มีเทสต์ไหนแดง (เทสต์ซอร์สเดินได้แค่ static import)
 *
 * ⇒ ด่านนี้อ่าน **ผลของ build จริง**: `.next/server/app/<route>/route.js.nft.json` (รายชื่อไฟล์ที่ฟังก์ชันของ route พกไป)
 *
 *   route เอกสาร   `api/service/surveys/[id]/document`   ต้องมี: ไฟล์ `.br` ของ chromium ครบทุกไฟล์ · puppeteer-core · ไบนารี sharp
 *   route ส่งผล    `api/service/surveys/[id]/send`       ต้องมี: ไบนารี sharp · **ห้ามมี** puppeteer-core / @sparticuz/chromium
 *   GET ใบประเมิน  `api/service/surveys/[id]`            **ห้ามมี** sharp / puppeteer-core / @sparticuz/chromium
 *   ดึงผลกลับ      `api/service/surveys/[id]/recall`     เหมือนกัน
 *   สลับวิธีประเมิน `api/service/surveys/[id]/method`     เหมือนกัน (ประเมินจากแบบ งวด S2a — เส้นนี้ไม่ออกเอกสาร ไม่แตะรูป)
 *   GET/PATCH คำร้อง `api/sa/requests/[id]`              เหมือนกัน
 *
 * รัน **หลัง** `npm run build` (จาก `webapp/`):  node scripts/check-doc-tracing.mjs [--dir .next]
 * CI รันให้ต่อจากขั้น Build (`.github/workflows/ci.yml`) · ไม่ต้องมี secret · ไม่แตะฐาน
 *
 * ⚠️ ชื่อไบนารีของ sharp ตามแพลตฟอร์มที่ build (CI/Vercel = linux-x64 · เครื่องนักพัฒนา = darwin-arm64) — ด่านจับด้วยรูปของ
 *   path ไม่ผูกกับแพลตฟอร์มใด · ที่ต้องเป็น linux จริงคือ build ของ Vercel ซึ่ง CI (ubuntu) เป็นตัวแทน
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** ไฟล์ `.br` ของ chromium ที่ต้องไปด้วยครบ — ชุดของ `@sparticuz/chromium` 149 (ใช้เมื่ออ่าน `node_modules` ไม่ได้) */
export const CHROMIUM_BR_FALLBACK = Object.freeze(['al2023.tar.br', 'chromium.br', 'fonts.tar.br', 'swiftshader.tar.br']);

const norm = (file) => String(file ?? '').replace(/\\/g, '/');
const inPackage = (name) => {
  const needle = `node_modules/${name}/`;
  return (file) => norm(file).includes(needle);
};

/* สิ่งที่ตรวจได้ใน trace — ชื่อ → ตัวจับไฟล์ */
const isChromium = inPackage('@sparticuz/chromium');
const isPuppeteer = inPackage('puppeteer-core');
const isSharpPackage = (file) => inPackage('sharp')(file) || /node_modules\/@img\/sharp-/.test(norm(file));
// ตัว addon ของแพลตฟอร์ม กับ libvips ที่มันลิงก์ — ขาดตัวใดตัวหนึ่ง sharp โหลดไม่ขึ้นบน Lambda
const isSharpAddon = (file) => /node_modules\/@img\/sharp-(?!libvips-)[^/]+\/lib\/[^/]+\.node$/.test(norm(file));
const isSharpVips = (file) => /node_modules\/@img\/sharp-libvips-[^/]+\/lib\/libvips[^/]*$/.test(norm(file));

const FORBID = Object.freeze({
  chromium: { test: isChromium, label: '@sparticuz/chromium' },
  puppeteer: { test: isPuppeteer, label: 'puppeteer-core' },
  sharp: { test: isSharpPackage, label: 'sharp' },
});

const LIGHT = Object.freeze(['sharp', 'puppeteer', 'chromium']);

/**
 * กติกาของแต่ละ route — `route` = path ใต้ `src/app` (ไม่มี `/route.js`) · `key` = คีย์ที่ต้องใช้ใน `outputFileTracingIncludes`
 * `need`: `'chromiumBin'` | `'puppeteer'` | `'sharpBinary'` · `forbid`: คีย์ของ `FORBID`
 */
export const DOC_TRACING_RULES = Object.freeze([
  {
    route: 'api/service/surveys/[id]/document', label: 'route เอกสารประเมิน (GET/POST — วัดกระดาษ · ตรึง · เก็บ PDF · ออกเลข)',
    need: ['chromiumBin', 'puppeteer', 'sharpBinary'], forbid: [],
  },
  {
    route: 'api/service/surveys/[id]/send', label: 'route ส่งผล (ตรวจรูป + ออกเลข — ไม่เปิด chromium · มติ 3)',
    need: ['sharpBinary'], forbid: ['puppeteer', 'chromium'],
  },
  { route: 'api/service/surveys/[id]', label: 'GET ใบประเมิน (ช่างเปิดหน้างาน)', need: [], forbid: LIGHT },
  { route: 'api/service/surveys/[id]/recall', label: 'ดึงผลกลับ', need: [], forbid: LIGHT },
  { route: 'api/service/surveys/[id]/method', label: 'สลับวิธีประเมิน', need: [], forbid: LIGHT },
  { route: 'api/sa/requests/[id]', label: 'GET/PATCH คำร้อง', need: [], forbid: LIGHT },
].map((rule) => Object.freeze(rule)));

/** คีย์ของ `outputFileTracingIncludes` สำหรับ route นี้ — glob: `[id]` ต้อง escape (`\\[id\\]` ในซอร์ส JS) */
export const tracingKey = (route) => `/${route.replace(/\[/g, '\\\\[').replace(/\]/g, '\\\\]')}`;

const sample = (files, test) => files.filter(test).slice(0, 3).map(norm).map((f) => f.replace(/^(\.\.\/)+/, ''));

/**
 * ตรวจ trace ของ route เดียว — ตรรกะล้วน (เทสต์ป้อนรายชื่อไฟล์เอง)
 * @param rule   หนึ่งแถวของ `DOC_TRACING_RULES`
 * @param files  `files` ของ `route.js.nft.json` (path สัมพัทธ์จากโฟลเดอร์ของไฟล์นั้น)
 * @param opts.chromiumBr  ชื่อไฟล์ `.br` ที่ต้องมีครบ (ไม่ส่ง = `CHROMIUM_BR_FALLBACK`)
 * @returns ข้อความไทยของทุกข้อที่ไม่ผ่าน พร้อมวิธีแก้ · `[]` = ผ่าน
 */
export function docTracingIssues(rule, files, { chromiumBr = CHROMIUM_BR_FALLBACK } = {}) {
  const list = Array.isArray(files) ? files : [];
  const issues = [];
  const key = tracingKey(rule.route);

  if (rule.need.includes('chromiumBin')) {
    const missing = chromiumBr.filter((name) => !list.some((file) => norm(file).endsWith(`node_modules/@sparticuz/chromium/bin/${name}`)));
    if (missing.length) {
      issues.push(`ขาดไบนารีของ chromium ${missing.length}/${chromiumBr.length} ไฟล์ (${missing.join(' · ')}) — PDF จะล้มบน production ด้วย `
        + `"input directory does not exist" · เพิ่ม '${key}': ['node_modules/@sparticuz/chromium/bin/**/*'] ใน outputFileTracingIncludes ของ next.config.mjs `
        + '(key เป็น glob — ต้อง escape วงเล็บเหลี่ยม)');
    }
  }
  if (rule.need.includes('puppeteer') && !list.some(isPuppeteer)) {
    issues.push('ไม่มี puppeteer-core ใน trace — route นี้ต้องพิมพ์ PDF ได้ · ตรวจว่า `surveyReportPaper.js` ยังโหลด `@/lib/documents/htmlPdf` '
      + 'ด้วย `await import()` ที่ตัวติดตามไฟล์ตามได้ (ชื่อโมดูลเป็นสตริงตรง ๆ)');
  }
  if (rule.need.includes('sharpBinary')) {
    const lacks = [!list.some(isSharpAddon) && 'ตัว addon (@img/sharp-<แพลตฟอร์ม>/lib/*.node)', !list.some(isSharpVips) && 'libvips (@img/sharp-libvips-<แพลตฟอร์ม>/lib/libvips*)']
      .filter(Boolean);
    if (lacks.length) {
      issues.push(`ขาดไบนารีของ sharp — ${lacks.join(' และ ')} · ตัวย่อรูปจะโหลดไม่ขึ้นบน production (รูปทุกไฟล์เป็น sharp_unavailable) · `
        + `เพิ่ม '${key}': ['node_modules/sharp/**/*', 'node_modules/@img/**/*'] ใน outputFileTracingIncludes ของ next.config.mjs`);
    }
  }
  for (const name of rule.forbid) {
    const rule2 = FORBID[name];
    const hits = list.filter(rule2.test);
    if (hits.length) {
      issues.push(`ลาก ${rule2.label} ไปด้วย ${hits.length} ไฟล์ (เช่น ${sample(list, rule2.test).join(' · ')}) — route นี้ต้องเบา · `
        + 'หา static import ที่พาโมดูลหนักเข้ามา: ของหนักต้องเข้าทาง `await import()` ข้างในฟังก์ชันเท่านั้น '
        + '(`surveyReportImages` → sharp · `surveyReportPaper` → chromium) และ route นี้ import ได้แค่ `surveyReportRows`');
    }
  }
  return issues;
}

/** path ของไฟล์ trace ของ route ใต้โฟลเดอร์ build */
export const nftPathOf = (buildDir, route) => join(buildDir, 'server', 'app', ...route.split('/'), 'route.js.nft.json');

/** ชื่อไฟล์ `.br` ที่ติดตั้งอยู่จริง — เวอร์ชันของ chromium เปลี่ยนชุดไฟล์ได้ ด่านเดินตามของที่ลงไว้ */
function installedChromiumBr(root) {
  try {
    const names = readdirSync(join(root, 'node_modules', '@sparticuz', 'chromium', 'bin')).filter((name) => name.endsWith('.br')).sort();
    return names.length ? names : [...CHROMIUM_BR_FALLBACK];
  } catch {
    return [...CHROMIUM_BR_FALLBACK];
  }
}

/**
 * ตรวจทุก route ของ `DOC_TRACING_RULES` กับ build ที่ `buildDir`
 * @returns `{ ok, results: [{ route, label, file, count, issues }] }` — ไม่มีไฟล์ trace = ข้อผิด (route หาย/เปลี่ยนชื่อ หรือยังไม่ได้ build)
 */
export function checkDocTracing({ root = process.cwd(), buildDir = join(root, '.next'), rules = DOC_TRACING_RULES } = {}) {
  const chromiumBr = installedChromiumBr(root);
  const results = rules.map((rule) => {
    const file = nftPathOf(buildDir, rule.route);
    if (!existsSync(file)) {
      return { route: rule.route, label: rule.label, file, count: 0, issues: [`ไม่พบ ${file} — route นี้ถูกย้าย/เปลี่ยนชื่อ หรือยังไม่ได้รัน npm run build`] };
    }
    let files;
    try {
      files = JSON.parse(readFileSync(file, 'utf8')).files;
    } catch (error) {
      return { route: rule.route, label: rule.label, file, count: 0, issues: [`อ่าน ${file} ไม่ได้: ${error.message}`] };
    }
    if (!Array.isArray(files)) return { route: rule.route, label: rule.label, file, count: 0, issues: [`${file} ไม่มีรายการ files`] };
    return { route: rule.route, label: rule.label, file, count: files.length, issues: docTracingIssues(rule, files, { chromiumBr }) };
  });
  return { ok: results.every((r) => r.issues.length === 0), results };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const at = process.argv.indexOf('--dir');
  const buildDir = resolve(at !== -1 && process.argv[at + 1] ? process.argv[at + 1] : '.next');
  if (!existsSync(buildDir)) {
    console.error(`✗ ไม่พบโฟลเดอร์ build ${buildDir} — ด่านนี้ต้องรันหลัง npm run build`);
    process.exit(1);
  }
  const { ok, results } = checkDocTracing({ buildDir });
  for (const r of results) {
    if (!r.issues.length) {
      console.log(`✓ /${r.route} — ${r.label} · ${r.count} ไฟล์`);
      continue;
    }
    console.error(`✗ /${r.route} — ${r.label}`);
    for (const issue of r.issues) console.error(`    · ${issue}`);
  }
  if (!ok) {
    console.error('\n❌ trace ของ route เอกสารประเมินไม่ตรงกติกา — ดูวิธีแก้ในแต่ละข้อ (scripts/check-doc-tracing.mjs)');
    process.exit(1);
  }
  console.log('Document tracing OK: chromium + sharp ไปกับ route ที่ใช้ · route เบาไม่ลากของหนัก');
}
