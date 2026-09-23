// ── ตรวจว่าชื่อคอลัมน์ใน .from(x).select(...) มีอยู่จริงใน schema ───────────────
//
// ทำไมต้องมี: PostgREST ตอบ 42703 ทั้ง query เมื่อชื่อคอลัมน์ผิด แล้วโค้ดส่วนใหญ่
// อ่าน `.data || []` โดยไม่ดู `.error` → อาการที่ผู้ใช้เห็นคือ "ไม่มีข้อมูล" ไม่ใช่ error
// ชื่อที่พิมพ์ผิดจึงอยู่ได้นานมากโดยไม่มีอะไรจับ (build/eslint/เทสต์มองไม่เห็นทั้งหมด)
//
// เจอจริง 2026-07-29 สองจุด:
//   lib/master/relations.js  products.teams   → แท็บสินค้าบนหน้าลูกค้าว่างทุกราย
//   lib/costingAdmin.js      dept_request_items.askId (ชื่อจริง requestId — ตกค้าง
//                            จาก rename mig 0173/0174) → หน้าใบขอราคาผลิตพังเมื่อมีเคสค้าง
//
// 🐞 เจอจริง 2026-09-23 — **จุดบอดของด่านนี้เอง**: รอบอ่านจับเฉพาะ `.select('สตริง')`
//   ⇒ `.select(REVISION_COLUMNS)` และเพื่อนอีก ~40 ชื่อ **หลุดเงียบสนิท ไม่ถูกนับว่าข้ามด้วยซ้ำ**
//   ทั้งที่รีโปนี้เก็บชุดคอลัมน์ก้อนใหญ่ไว้ในค่าคงที่แบบ `[...].join(', ')` เกือบทั้งหมด
//   (CUSTOMER_NAME_SELECT · ORDER_SELECT · DEAL_COLUMNS · REVISION_COLUMNS …)
//   ⇒ เติมชื่อผิด หรือเติมชื่อของ migration ที่ยังไม่ได้รัน ก็ผ่านเขียวสนิท แล้วไปโผล่
//   เป็น "ไม่มีข้อมูล" บนจอ — อาการเดียวกับที่หัวไฟล์นี้บอกว่ามีตัวเองไว้กัน
//   · รูที่สองของวันเดียวกัน: หน้าต่าง 200 ตัวอักษรระหว่าง `.from()` กับ `.select()`
//     ทำให้อีก 34 จุดไม่เคยถูกอ่าน (payload ยาว ๆ ของ `.insert({…}).select()`)
//   · ของจริงที่หลุดออกไปทั้งสองรู: `orders.updatedAt` ใน `ORDER_SELECT_SLIM` (#1486)
//     ⇒ `/api/orders?slim=1` ตาย 42703 ทั้งเส้น คิวใบยื่นของหน้า /tax ว่างอยู่ 26 วัน
//
// วิธีใช้:  node scripts/check-select-columns.mjs
//   ต้องมี .env.local (SUPABASE_URL + SERVICE_ROLE_KEY) — อ่าน schema จาก OpenAPI
//   spec ของ PostgREST ซึ่งสะท้อนฐานจริง ไม่ใช่ไฟล์ migration ที่อาจยังไม่ได้รัน
//
// ⚠️ **ด่านนี้อยู่ใน CI จริง** — step `Schema drift (select columns)` ใน
//   `.github/workflows/ci.yml` รันทุก PR และทุก push เข้า main เมื่อมี secret
//   `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (ตั้งไว้แล้วทั้งคู่) · ไม่มี secret =
//   step ถูก **ข้าม** พร้อม `::warning` ไม่ใช่เขียวเงียบ ๆ
//   ⇒ exit code ของไฟล์นี้บล็อก PR ได้จริง ห้ามคิดว่า "แค่เครื่องมือให้คนรันเอง"
//   (หัวไฟล์เดิมเขียนว่า "CI ไม่มี env" — ผิดมาตั้งแต่ ci.yml เพิ่ม step นี้ · 2026-09-23)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchSchema } from './schemaFetch.mjs';
import { columnNamesOf, createSelectResolver, embeddedNames, firstArg } from './selectExpression.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'src');

function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    try {
      const text = readFileSync(join(HERE, '..', file), 'utf8');
      const out = {};
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim() || line.trim().startsWith('#') || !line.includes('=')) continue;
        const i = line.indexOf('=');
        out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
      }
      return out;
    } catch { /* ลองไฟล์ถัดไป */ }
  }
  return {};
}

const env = { ...loadEnv(), ...process.env };
const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error('ข้าม: ไม่มี SUPABASE_URL / SERVICE_ROLE_KEY (ดู .env.example)');
  process.exit(0);
}

const spec = await fetchSchema({ url, key, label: 'อ่านสคีมาจากฐาน' });
const tables = Object.fromEntries(
  Object.entries(spec.definitions || {}).map(([name, def]) => [name, new Set(Object.keys(def.properties || {}))]),
);

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|mjs)$/.test(entry) && !/\.test\./.test(entry)) files.push(p);
  }
})(SRC);

const srcCache = new Map();
/** อ่านไฟล์ครั้งเดียวแล้วจำไว้ — ตัวแกะค่าคงที่วิ่งข้ามไฟล์ไปมา (import)
 *  คืน null เมื่อไม่มีไฟล์นั้น — ตัวแกะใช้ค่านี้ตัดสินว่า `./x` เป็น `.js` หรือ `/index.js` */
function readSource(file) {
  if (!srcCache.has(file)) {
    try { srcCache.set(file, readFileSync(file, 'utf8')); } catch { srcCache.set(file, null); }
  }
  return srcCache.get(file);
}
const relSrc = (file) => relative(SRC, file).split(sep).join('/');

// ── ค่าคงที่ใน .select(IDENT) — แกะค่าจริงออกมาตรวจ ─────────────────────────
//
// เครื่องมือแกะอยู่ที่ `scripts/selectExpression.mjs` (แยกไว้ให้เทสต์ได้โดยไม่ต้องมีฐาน —
// `src/lib/selectExpression.test.mjs`) · ที่นั่นเขียนไว้ครบว่าทำไมถึงไม่ทำเป็น parser
const resolveSelect = createSelectResolver({
  srcRoot: SRC,
  readSource: (f) => readSource(f),
  label: relSrc,
});

const problems = [];
const skippedTables = new Set();
const unresolved = [];
let resolvedConstants = 0;
// นับรูปที่ด่านนี้ยังมองไม่เห็นเลย — ตัวเลขจริงดีกว่าคำว่า "ยังมีบ้าง" เพราะบอกได้ว่าคุ้มจะไล่ต่อไหม
// ⚠️ ต้องนับเฉพาะ `supabase.from(<ตัวแปร>)` เท่านั้น: `Array.from` · `Buffer.from` ·
//    `Readable.from` เป็น built-in ของ JS ที่ไม่เคยแตะ PostgREST และ `storage.from(<ถัง>)`
//    เป็นถังไฟล์ซึ่งไม่มีคอลัมน์ให้ตรวจ · ของเดิมจับ `.from(` ดิบ ๆ ⇒ ตัวเลขพองเกินสองเท่า
//    (121 ทั้งที่จุดบอดจริง 64) แล้วบรรทัดที่มีไว้บอก "เหลือจุดบอดเท่าไร" ก็โกหกเสียเอง
// จับ "ตัวที่อยู่ติดหน้า `.from(`" — `supabase.storage.from(x)` ต้องได้ `storage` ไม่ใช่ `supabase`
const FROM_IDENT = /([A-Za-z_$][\w$]*)\s*\.\s*from\(\s*(?!['"`])[A-Za-z_$]/g;
const JS_BUILTIN_FROM = new Set(['Array', 'Buffer', 'Readable', 'Uint8Array', 'Object']);
let fromVariable = 0;
let storageBuckets = 0;
let rpcCalls = 0;
// `.select()` เปล่า = ทั้งแถว ไม่มีชื่อให้ตรวจ — ไม่ใช่จุดบอด แต่ต้องมีตัวเลขเหมือนรูปอื่น
let selectAll = 0;
// ชื่อที่ถูกตัดทิ้งเพราะอยู่ใน embed `alias:table(...)` — คนละตาราง ด่านไม่ได้ตรวจสักชื่อ
let embeddedDropped = 0;
const embeddedSites = new Set();

for (const file of files) {
  const src = readSource(file);
  for (const v of src.matchAll(FROM_IDENT)) {
    if (v[1] === 'storage') storageBuckets += 1;
    else if (!JS_BUILTIN_FROM.has(v[1])) fromVariable += 1;
  }
  rpcCalls += (src.match(/\.rpc\(/g) || []).length;
  // ── จับคู่ .from('table') กับ .select(<expr>) ของ query เดียวกัน ─────────────
  //
  // 🐞 ของเดิมใช้หน้าต่าง `[\s\S]{0,200}?` ระหว่างสองตัว ⇒ **34 จุดหลุดเงียบ** เพราะ
  //    payload ของ `.insert({…}).select()` / `.update({…}).select(…)` ยาวเกิน 200 ตัวอักษร
  //    (ยาวสุดในรีโป 3,868) · ในนั้นมี `.select(LINE_SELECT)` ที่ไม่เคยไปถึงตัวแกะค่าคงที่ด้วย
  //    และการดันหน้าต่างให้กว้างขึ้นเฉย ๆ **ทำให้หายไปอีก 37 จุด**: regex กินข้อความไปด้วย
  //    ⇒ คู่ที่อยู่ถัดไปถูกกลืนหายทั้งคู่ (วัดแล้วที่ 1,500)
  // ⇒ เลิกใช้หน้าต่าง: ไล่ `.from('t')` ทีละตัว แล้วมองไปข้างหน้าหา `.select(` ตัวแรก
  //    โดยหยุดถ้าเจอ `.from(` ตัวถัดไปก่อน (= คนละ query แล้ว) · วัดกับทั้งรีโปแล้ว
  //    ได้ 1,233 จุดโดยไม่หายสักจุดจากของเดิม 1,198
  const re = /\.from\(\s*['"`](\w+)['"`]\s*\)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const table = m[1];
    const after = m.index + m[0].length;
    const nextFrom = src.indexOf('.from(', after);
    const selectAt = src.indexOf('.select(', after);
    if (selectAt < 0) continue;
    if (nextFrom >= 0 && nextFrom < selectAt) continue; // query ถัดไปมาก่อน = อันนี้ไม่มี select
    if (!tables[table]) { skippedTables.add(table); continue; }
    const line = src.slice(0, m.index).split(/\r?\n/).length;
    const arg = firstArg(src, selectAt + '.select('.length - 1);
    // ⚠️ อ่าน argument ไม่ออก **ต้องดัง** — `continue` เงียบ ๆ ตรงนี้คือรูปเดียวกับบั๊กที่
    //    ทำให้ด่านนี้ต้องถูกรื้อ: จุดที่ด่านเห็นแล้ว อ่านไม่ออก แล้วไม่บอกใครสักคำ
    if (arg === null) {
      unresolved.push({ file: relSrc(file), line, table, why: 'หาวงเล็บปิดของ .select() ไม่เจอ — อ่าน argument ไม่ออก' });
      continue;
    }
    const expr = arg.trim();
    if (!expr) { selectAll += 1; continue; } // `.select()` = ทั้งแถว ไม่มีชื่อให้ตรวจ

    const { text, blocked, viaName } = resolveSelect(expr, { file, src, at: m.index });
    if (viaName) {
      if (blocked.length) unresolved.push({ file: relSrc(file), line, table, why: blocked.join(' · ') });
      else resolvedConstants += 1;
    }
    const dropped = embeddedNames(text).length;
    if (dropped) { embeddedDropped += dropped; embeddedSites.add(`${relSrc(file)}:${line}`); }

    // ⚠️ นับชื่อซ้ำครั้งเดียวต่อจุด — `cond ? `${COLS}, x` : COLS` แกะค่าคงที่ตัวเดียวกัน
    //    ทั้งสองขา ⇒ ชื่อผิดชื่อเดียวเคยถูกรายงานสองครั้ง แล้วเลข "พบ N จุด" ก็เกินจริง
    //    ซึ่งเป็นเลขที่คนใช้ตัดสินว่ารันที่แดงนี้หนักแค่ไหน
    for (const name of new Set(columnNamesOf(text))) {
      if (!tables[table].has(name)) problems.push({ file: relSrc(file), line, table, name });
    }
  }
}

// ── รอบสอง: คอลัมน์ใน payload ของ .update()/.insert()/.upsert() ─────────────
//
// ทำไมต้องมี: รอบแรกดูแต่ `.select(...)` ⇒ ชื่อคอลัมน์ที่ **เขียน** ผิดหลุดหมด และ
// อาการหนักกว่าฝั่งอ่าน — PostgREST ตอบ PGRST204 ทั้งคำสั่ง ปุ่มนั้นจึงกดไม่ผ่านเลย
//
// เจอจริง 2026-08-28: `dept_requests."answeredById"` / `"answeredByName"` ถูกเขียน
// จากสามทาง (ปุ่ม "ตอบแล้ว" · ปุ่ม "ยังไม่จบ" · ตราหลุดเมื่อถูกถามกลับ) ทั้งที่คอลัมน์
// มีจริงแค่บน `dept_request_items` ⇒ RD กดปิดเรื่องไม่ได้ทั้งระบบ และทาง /api/updates
// กลืน error เงียบจนไม่มีใครเห็น (mig 0306)
//
// ⚠️ **ไม่มี parser** — จับสองรูปแบบเท่าที่อ่านจากข้อความได้จริง:
//   1. object literal ตรง ๆ `.update({ colA: …, colB: … })` — คีย์ชั้นบนสุดเท่านั้น
//   2. ตัวแปรสะสม `.update(patch)` / `.update({ ...patch, updatedAt })` ที่ชื่อลงท้าย
//      ว่า patch/payload/fields/values (ธรรมเนียมรีโปนี้: `patch` · `turnPatch` · `headPatch`)
// ⚠️ ตัวแปรสะสมนับเฉพาะบรรทัดที่อยู่ **ระหว่างจุดประกาศตัวแปรกับจุดที่เขียนลงตาราง** —
//    ไฟล์เดียวมี `patch` คนละตัวคนละฟังก์ชันได้ (route ของคำร้องมีทั้งของหัวใบและของแถว)
//    ⇒ ไล่ทั้งไฟล์เมื่อไรจะได้คอลัมน์ของตารางอื่นมาปนจนเตือนผิดทุกใบ
// ⚠️ `...row.patch` (ตัวแปรที่มีเจ้าของ) ข้าม — หาจุดประกาศไม่ได้ ก็ไม่เดา
const WRITE_VAR = /(patch|payload|fields|values)$/i;
const KEY_IN_OBJECT = /[{,]\s*['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?\s*:/g;

/** คีย์ชั้นบนสุดของ object literal + ตัวแปรที่ถูก spread เข้ามา */
function literalPayload(src, openIndex) {
  let depth = 0;
  let i = openIndex;
  const keys = [];
  const spreads = [];
  for (; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') { depth -= 1; if (depth === 0) break; }
    else if (depth === 1) {
      if (ch === '.' && src.startsWith('...', i)) {
        const sp = /^\.\.\.\s*([A-Za-z_$][\w$]*)(\.)?/.exec(src.slice(i, i + 60));
        if (sp && !sp[2]) spreads.push(sp[1]);
      } else if ((ch === '{' || ch === ',' || i === openIndex) === false && /[A-Za-z_"']/.test(ch)) {
        const m = /^["']?([A-Za-z_][A-Za-z0-9_]*)["']?\s*:/.exec(src.slice(i, i + 80));
        const before = src.slice(0, i).replace(/\s+$/, '').slice(-1);
        if (m && (before === '{' || before === ',')) { keys.push(m[1]); i += m[0].length - 1; }
      }
    }
  }
  return { keys, spreads, end: i };
}

/** คีย์ที่ถูกยัดใส่ตัวแปรสะสม — เฉพาะช่วงตั้งแต่จุดประกาศจนถึงจุดที่เขียนลงตาราง */
function scopedVarKeys(src, name, writeIndex) {
  const decl = new RegExp(`(?:const|let|var)\\s+${name}\\s*=`, 'g');
  let from = -1;
  let d;
  while ((d = decl.exec(src)) !== null && d.index < writeIndex) from = d.index;
  if (from < 0) return [];
  const region = src.slice(from, writeIndex);
  const keys = new Set();
  for (const a of region.matchAll(new RegExp(`\\b${name}\\.([A-Za-z_][A-Za-z0-9_]*)\\s*=[^=]`, 'g'))) keys.add(a[1]);
  for (const a of region.matchAll(new RegExp(`Object\\.assign\\(\\s*${name}\\s*,\\s*\\{([\\s\\S]*?)\\}`, 'g'))) {
    for (const k of `{${a[1]}`.matchAll(KEY_IN_OBJECT)) keys.add(k[1]);
  }
  return [...keys];
}

for (const file of files) {
  const src = readSource(file);
  const re = /\.from\(\s*['"`](\w+)['"`]\s*\)([\s\S]{0,200}?)\.(update|insert|upsert)\(\s*\[?\s*(\{|[A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const [, table, between, , head] = m;
    if (between.includes('.from(')) continue;
    if (!tables[table]) { skippedTables.add(table); continue; }
    const line = src.slice(0, m.index).split(/\r?\n/).length;
    const names = new Set();
    if (head === '{') {
      const open = m.index + m[0].length - 1;
      const { keys, spreads } = literalPayload(src, open);
      for (const k of keys) names.add(k);
      for (const v of spreads) {
        if (WRITE_VAR.test(v)) for (const k of scopedVarKeys(src, v, m.index)) names.add(k);
      }
    } else if (WRITE_VAR.test(head)) {
      for (const k of scopedVarKeys(src, head, m.index)) names.add(k);
    }
    for (const name of names) {
      if (!tables[table].has(name)) {
        problems.push({ file: relSrc(file), line, table, name, write: true });
      }
    }
  }
}

/** รายชื่อที่แกะไม่ได้ — พิมพ์ก่อนเสมอ ทั้งตอนผ่านและตอนแดง เพราะอยู่เงียบ ๆ ไม่ได้อีกแล้ว */
function reportUnresolved() {
  console.log(`select ที่เขียนด้วยชื่อตัวแปร: แกะค่าได้ ${resolvedConstants} จุด · แกะไม่ได้ ${unresolved.length} จุด`);
  if (!unresolved.length) return;
  for (const u of unresolved) {
    console.log(`  ⚠ src/${u.file}:${u.line}  ${u.table}.select(…) — ${u.why}`);
  }
  console.log('  ชื่อที่แกะไม่ได้ = ชุดคอลัมน์นั้นไม่มีใครตรวจ ต้องไล่ด้วยตาเมื่อแตะ query นั้น');
}

reportUnresolved();
console.log(`ชื่อที่ตัดทิ้งเพราะอยู่ใน embed \`alias:table(...)\`: ${embeddedDropped} ชื่อ`
  + ` จาก ${embeddedSites.size} จุด (คนละตาราง ด่านนี้ไม่ตรวจ — แม้จุดนั้นจะนับว่า "แกะค่าได้")`);
console.log(`รูปที่ยังมองไม่เห็นเลย: supabase.from(<ตัวแปร>) ${fromVariable} จุด · .rpc() ${rpcCalls} จุด`
  + ` (ไม่นับ: storage.from(<ถัง>) ${storageBuckets} จุด = ถังไฟล์ ไม่มีคอลัมน์ · \`.select()\` ว่าง ${selectAll} จุด = ทั้งแถว)`);

if (problems.length) {
  console.error(`พบคอลัมน์ที่ไม่มีจริงใน schema ${problems.length} จุด:`);
  for (const p of problems) {
    console.error(`  ✗ src/${p.file}:${p.line}  ${p.table}.${p.name}${p.write ? '  (เขียน)' : ''}`);
  }
  console.error('\nอ่านผิด = PostgREST ตอบ 42703 ทั้ง query · ที่ไหนอ่าน `.data || []` จะกลายเป็น "ไม่มีข้อมูล" เงียบ ๆ');
  console.error('เขียนผิด = PGRST204 ทั้งคำสั่ง ⇒ ปุ่มนั้นกดไม่ผ่านเลย (หรือเงียบ ถ้าโค้ดกลืน error)');
  process.exit(1);
}

/* เพดานจำนวนจุดที่ "แกะค่าไม่ได้" — **ขึ้นไม่ได้ ลงได้อย่างเดียว** (กติกาเดียวกับ ratchet
 * ของ check-row-cap.mjs / audit-ui.mjs)
 *
 * ทำไมต้องเป็น 0 และทำไมต้องบล็อก ไม่ใช่แค่พิมพ์เตือน: บั๊กที่ทำให้ต้องมารื้อด่านนี้
 * (`orders.updatedAt` อยู่ได้ 26 วัน) คือ "จุดที่ด่านเห็นแล้วไม่พูดอะไร" · ถ้าจุดที่แกะ
 * ไม่ได้ได้แค่ ⚠ ในล็อกของรันที่เขียว มันก็คือความเงียบแบบเดิมในรูปที่สุภาพขึ้น —
 * ตัวเลขจะไต่จาก 0 เป็น N โดยไม่มีอะไรแดง
 *
 * 2026-09-23 — ตั้งครั้งแรกที่ 0 ตอนเพิ่มตัวแกะค่าคงที่ (ทั้งรีโปแกะได้ครบ 65/65 จุด)
 *
 * ⚠️ **ทางเคลียร์คือทำให้ชุดคอลัมน์นั้นอ่านออก ไม่ใช่ดันเพดานขึ้น** — ย้ายมันไปเป็น
 *    `const X = [...].join(', ')` ระดับโมดูล แล้วส่งชื่อนั้นเข้า `.select()` ตรง ๆ
 *    ชุดคอลัมน์ที่ประกอบตอนรัน (`buildCols(user)`) คือชุดที่ไม่มีใครตรวจได้เลยทั้งชีวิต */
const UNRESOLVED_CAP = 0;
if (unresolved.length > UNRESOLVED_CAP) {
  console.error(`\nselect ที่แกะค่าไม่ได้ ${unresolved.length} จุด (เพดาน ${UNRESOLVED_CAP}) — ดูรายการ ⚠ ข้างบน`);
  console.error('ชุดคอลัมน์ที่แกะไม่ได้ = ไม่มีใครเทียบกับฐานให้เลย ⇒ พิมพ์ผิดเมื่อไรจอนั้นว่างเงียบ ๆ');
  process.exit(1);
}

console.log(`select/write column check ผ่าน — ตรวจ ${files.length} ไฟล์ เทียบกับ ${Object.keys(tables).length} ตารางบนฐานจริง`);
if (skippedTables.size) {
  console.log(`(ข้ามตารางที่ไม่อยู่ใน schema: ${[...skippedTables].join(', ')})`);
}
