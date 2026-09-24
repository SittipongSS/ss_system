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
// 2026-09-24 — ปิดจุดบอด embed: เดิมคอลัมน์ใน `alias:table(...)` ถูก **ตัดทิ้งแล้วแค่นับ**
//   (148 ชื่อ จาก 22 จุด) ⇒ ชื่อผิดใน `deal:sales_deals(${DEAL_COLUMNS})` = 42703 ทั้ง query
//   แต่ด่านเขียว · ตอนนี้ไล่ทุก embed ทุกชั้นแล้วเทียบกับ **ตารางปลายทาง** ของมัน
//   (`checkSelectText` ใน scripts/selectExpression.mjs) · ตารางปลายทางแกะไม่ได้ = แดง
//   · รอบรีวิววันเดียวกันจับได้อีกสี่รูที่เขียวทั้งที่ฐานตอบ error ทั้ง query — ปิดแล้วทั้งหมด:
//     embed ที่ไม่มี FK เชื่อม (PGRST200) / มีหลายเส้น (PGRST201) · ตัวหน้า JSON path
//     (`metdata->>x` = 42703) · aggregate `count()`/`col.sum()` (โปรเจกต์นี้ปิด = PGRST123) ·
//     `count` ที่ปนกับชิ้นอื่น (42803) · ตารางแม่ที่ไม่อยู่ในสคีมา (PGRST205) เคยแค่ถูกพิมพ์ว่า "ข้าม"
//   · ตรวจกับฐานจริง 24/09 (GET limit=0): embed ทุกแบบในรีโปตอบ 200 (ไม่มีจอไหนพังอยู่) ·
//     ทุกกฎข้างบนยิงยืนยันทั้งขาถูก (200) และขาผิด (รหัส error ตามที่เขียน) — เคสอยู่ในคอมเมนต์
//     ของแต่ละกฎใน selectExpression.mjs และในเทสต์ src/lib/selectExpression.test.mjs
//
// ⚠️ **สิ่งที่ด่านนี้ยังมองไม่เห็น** (ข้อที่มีตัวเลข พิมพ์ท้ายผลทุกรอบ):
//   · `supabase.from(<ตัวแปร>)` — ไม่รู้ว่าตารางไหน จึงไม่รู้จะเทียบกับอะไร
//   · `.rpc()` — ชื่อฟังก์ชันกับอาร์กิวเมนต์ ไม่ได้ตรวจ
//   · `!hint` ที่เป็นชื่อ constraint ตั้งเอง — OpenAPI ไม่มีชื่อ constraint ⇒ เทียบได้แค่ชื่อตั้งต้น
//     `<ตาราง>_<คอลัมน์>_fkey` กับชื่อคอลัมน์ · ชื่ออื่น (รวมที่พิมพ์ผิด) ผ่านแต่ถูกนับว่า "ตรวจไม่ได้"
//   · many-to-many ผ่านตารางกลาง · computed relationship · ชื่อ constraint เป็นปลายทาง
//     `ชื่อ_fkey(...)` — OpenAPI ไม่บอก ⇒ ด่าน **แดง** ทั้งที่ฐานอาจรับ (ทางเลี่ยงของตัวหลัง:
//     `ตาราง!ชื่อ_fkey(...)`) · วันนี้รีโปมี 0 จุดทั้งสามแบบ
//   · ternary ที่ขาหนึ่งเป็น `count` เดี่ยว ๆ — ตัวแกะรวมสองขาเป็นข้อความเดียว ⇒ แดงผิด (0 จุด)
//   · คอลัมน์ในตัวกรอง/เรียงลำดับ `.eq('col')` · `.order('col')` · `.or('…')` — พิมพ์ผิดก็
//     42703 ทั้ง query เหมือนกัน แต่ด่านอ่านแค่ `.select()` กับ payload ของการเขียน
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
import { checkSelectText, createSelectResolver, firstArg, schemaFromDefinitions } from './selectExpression.mjs';

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
// ตัวเดียวกันในรูปที่ตัวไล่ embed ใช้ — มี FK ของแต่ละคอลัมน์ด้วย (embed แบบ `alias:fkColumn(...)`)
const schema = schemaFromDefinitions(spec.definitions);

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
const unresolved = [];
let resolvedConstants = 0;
// `unresolved` มีหลายชนิด ⇒ แยกนับให้บรรทัดสรุปไม่ปนกัน (รอบแรกนับชิ้นพังชั้นบนสุดรวมเป็น "embed")
let unresolvedConstants = 0;
let unresolvedTables = 0;
let unresolvedPieces = 0;
// นับรูปที่ด่านนี้ยังมองไม่เห็นเลย — ตัวเลขจริงดีกว่าคำว่า "ยังมีบ้าง" เพราะบอกได้ว่าคุ้มจะไล่ต่อไหม
// ⚠️ ต้องนับเฉพาะ `supabase.from(<ตัวแปร>)` เท่านั้น: `Array.from` · `Buffer.from` ·
//    `Readable.from` เป็น built-in ของ JS ที่ไม่เคยแตะ PostgREST และ `storage.from(<ถัง>)`
//    เป็นถังไฟล์ซึ่งไม่มีคอลัมน์ให้ตรวจ · ของเดิมจับ `.from(` ดิบ ๆ ⇒ ตัวเลขพองเกินสองเท่า
//    (121 ทั้งที่จุดบอดจริง 64) แล้วบรรทัดที่มีไว้บอก "เหลือจุดบอดเท่าไร" ก็โกหกเสียเอง
// จับ "ตัวที่อยู่ติดหน้า `.from(`" — `supabase.storage.from(x)` ต้องได้ `storage` ไม่ใช่ `supabase`
const FROM_IDENT = /([A-Za-z_$][\w$]*)\s*\.\s*from\(\s*(?!['"`])[A-Za-z_$]/g;
const JS_BUILTIN_FROM = new Set(['Array', 'Buffer', 'Readable', 'Uint8Array', 'Object']);

/** ชื่อที่อยู่ติดหน้า `.from(` ที่ตำแหน่ง dot (`supabase` · `storage` · `Array`) — null = ไม่ใช่ชื่อ (`x().from(`) */
function receiverBefore(src, dot) {
  const m = /([A-Za-z_$][\w$]*)\s*$/.exec(src.slice(Math.max(0, dot - 80), dot));
  return m ? m[1] : null;
}
/** `.from(` ของ **query ถัดไป** — ข้าม `Array.from(` · `Buffer.from(` ที่อยู่กลาง chain
 *  🐞 ของเดิมใช้ `indexOf('.from(')` ดิบ ⇒ `.update({ tags: Array.from(set) }).select('…')`
 *     ถูกนับว่า "query ถัดไปมาก่อน select" แล้วทั้ง select (รวม embed) ไม่ถูกอ่านเลยแบบเงียบ ๆ
 *     (รีโปมี 0 จุดวันนี้ — แต่รูปเดียวกับที่ FROM_IDENT ข้างบนเคยพลาดมาแล้ว) */
function nextQueryFrom(src, from, until = src.length) {
  for (let i = src.indexOf('.from(', from); i >= 0 && i < until; i = src.indexOf('.from(', i + 1)) {
    if (!JS_BUILTIN_FROM.has(receiverBefore(src, i))) return i;
  }
  return -1;
}
/** `.from('<ชื่อ>')` ที่ไม่ใช่ตารางของ PostgREST — ถังไฟล์ (`storage.from('b')`) กับ built-in ของ JS */
const notATable = (src, dot) => {
  const r = receiverBefore(src, dot);
  return r === 'storage' || JS_BUILTIN_FROM.has(r);
};
let fromVariable = 0;
let storageBuckets = 0;
let rpcCalls = 0;
// `.select()` เปล่า = ทั้งแถว ไม่มีชื่อให้ตรวจ — ไม่ใช่จุดบอด แต่ต้องมีตัวเลขเหมือนรูปอื่น
let selectAll = 0;
// embed `alias:table(...)` — ตรวจกับตารางปลายทางแล้ว (2026-09-24) · ตัวเลขพิมพ์ในสรุปทุกรอบ
// เพราะบรรทัดเดิม "ตัดทิ้ง 148 ชื่อ" คือสิ่งเดียวที่บอกว่าชุดนั้นไม่มีใครตรวจ — แทนด้วยตัวเลข
// ที่ตรวจจริง ไม่ใช่ลบทิ้งเฉย ๆ
let embedsChecked = 0;
let embedNamesChecked = 0;
let embedHintsChecked = 0;
let embedHintsUnverifiable = 0;
let embedUnresolved = 0;
const embedSites = new Set();

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
    if (notATable(src, m.index)) continue; // `storage.from('ถัง')` · `Array.from('abc')` — ไม่มีคอลัมน์ให้ตรวจ
    const table = m[1];
    const after = m.index + m[0].length;
    const selectAt = src.indexOf('.select(', after);
    if (selectAt < 0) continue;
    if (nextQueryFrom(src, after, selectAt) >= 0) continue; // query ถัดไปมาก่อน = อันนี้ไม่มี select
    const line = src.slice(0, m.index).split(/\r?\n/).length;
    // 🐞 ของเดิม: ตารางที่ไม่อยู่ในสคีมาถูก "ข้าม" แล้วพิมพ์ในวงเล็บท้ายรันที่เขียว ⇒ ทั้ง select
    //    (รวม embed) ไม่มีใครตรวจ ทั้งที่ฐานตอบ PGRST205 ทั้ง query (ยิงจริง 24/09) — รูปเดียวกับ
    //    "เห็นแล้วไม่พูด" ที่หัวไฟล์นี้เล่าไว้ ⇒ เข้าเพดานเดียวกับของที่แกะไม่ได้
    if (!tables[table]) {
      unresolved.push({ file: relSrc(file), line, table, why: `ตาราง \`${table}\` ไม่อยู่ในสคีมาที่ด่านโหลด ⇒ ฐานตอบ PGRST205 ทั้ง query · ทั้ง select นี้ (รวม embed) ไม่มีใครตรวจ` });
      unresolvedTables += 1;
      continue;
    }
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
      if (blocked.length) {
        unresolved.push({ file: relSrc(file), line, table, why: blocked.join(' · ') });
        unresolvedConstants += 1;
      } else resolvedConstants += 1;
    }
    // ⚠️ นับชื่อซ้ำครั้งเดียวต่อจุด — `cond ? `${COLS}, x` : COLS` แกะค่าคงที่ตัวเดียวกัน
    //    ทั้งสองขา ⇒ ชื่อผิดชื่อเดียวเคยถูกรายงานสองครั้ง แล้วเลข "พบ N จุด" ก็เกินจริง
    //    ซึ่งเป็นเลขที่คนใช้ตัดสินว่ารันที่แดงนี้หนักแค่ไหน (ตัวไล่ embed ตัดซ้ำให้ทุกชั้นแล้ว)
    // ⚠️ embed ต้องเทียบกับ **ตารางปลายทาง** ของมัน ไม่ใช่ `table` — เหตุผลเต็มอยู่หัว
    //    `checkSelectText` ใน scripts/selectExpression.mjs
    const r = checkSelectText(text, table, schema);
    for (const p of r.missing) problems.push({ file: relSrc(file), line, table: p.table, name: p.name, via: p.via });
    // embed ที่แกะตารางปลายทาง/เส้นเชื่อมไม่ได้ และชิ้นที่ฐานไม่รับ = เข้ารายการเดียวกับค่าคงที่
    //    ที่แกะไม่ได้ และโดนเพดานเดียวกัน (0) — ห้ามแยกเป็นบรรทัดเตือนที่รันยังเขียว
    for (const u of r.unresolved) {
      unresolved.push({ file: relSrc(file), line, table, why: u.via ? `embed ${u.via} — ${u.why}` : u.why });
      if (u.via) embedUnresolved += 1;
      else unresolvedPieces += 1; // ชิ้นชั้นบนสุด (วงเล็บพัง · aggregate · อ่านไม่ออก) ไม่ใช่ embed
    }
    embedsChecked += r.embeds;
    embedNamesChecked += r.names;
    embedHintsChecked += r.hintsChecked;
    embedHintsUnverifiable += r.hintsUnverifiable;
    if (r.embeds) embedSites.add(`${relSrc(file)}:${line}`);
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
    const [, table, between, op, head] = m;
    if (notATable(src, m.index)) continue; // `storage.from('ถัง').update(path, file)` ไม่ใช่ตาราง
    if (nextQueryFrom(between, 0) >= 0) continue; // `Array.from(` กลาง chain ไม่ใช่ query ใหม่
    const line = src.slice(0, m.index).split(/\r?\n/).length;
    if (!tables[table]) { // เหตุผลเดียวกับรอบอ่าน — ตารางที่ไม่มีจริงห้ามแค่ "ข้าม"
      unresolved.push({ file: relSrc(file), line, table, op, why: `ตาราง \`${table}\` ไม่อยู่ในสคีมาที่ด่านโหลด ⇒ ฐานตอบ PGRST205 ทั้งคำสั่ง · คีย์ที่เขียนไม่มีใครตรวจ` });
      unresolvedTables += 1;
      continue;
    }
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
  if (!unresolved.length) return;
  console.log(`แกะไม่ได้/ฐานไม่รับ ${unresolved.length} รายการ (ค่าคงที่ ${unresolvedConstants} · ตาราง ${unresolvedTables}`
    + ` · embed ${embedUnresolved} · ชิ้นใน select ${unresolvedPieces}):`);
  for (const u of unresolved) {
    console.log(`  ⚠ src/${u.file}:${u.line}  ${u.table}.${u.op || 'select'}(…) — ${u.why}`);
  }
  console.log('  ชื่อที่แกะไม่ได้ = ชุดคอลัมน์นั้นไม่มีใครตรวจ · ชิ้นที่ฐานไม่รับ = query นั้นพังทั้งก้อน');
}

console.log(`select ที่เขียนด้วยชื่อตัวแปร: แกะค่าได้ ${resolvedConstants} จุด · แกะไม่ได้ ${unresolvedConstants} จุด`);
// ⚠️ "ตรวจครบ" = ปลายทางเป็นตารางจริง + มี FK เชื่อมแบบไม่กำกวม — ก้อนที่ติดเส้นเชื่อมไปอยู่ใน "ติดปัญหา"
//    (รอบแรกนับก้อนที่ฐานตอบ PGRST200/201 ว่า "ตรวจแล้ว" ด้วย ⇒ ตัวเลขเคยสวยกว่าความจริง)
console.log(`embed \`alias:table(...)\`: ตรวจครบ (ตารางปลายทาง + FK เชื่อม + คอลัมน์) ${embedsChecked} ก้อน`
  + ` จาก ${embedSites.size} จุด · ชื่อคอลัมน์ในนั้น ${embedNamesChecked} ชื่อ · ติดปัญหา ${embedUnresolved} รายการ`
  + ` · \`!hint\` ตรวจกับ FK แล้ว ${embedHintsChecked} ตัว · ชื่อ constraint ที่ตรวจไม่ได้ ${embedHintsUnverifiable} ตัว`
  + ' (OpenAPI ไม่มีชื่อ constraint — เทียบได้แค่ชื่อคอลัมน์กับชื่อตั้งต้น `<ตาราง>_<คอลัมน์>_fkey`)');
reportUnresolved();
console.log(`รูปที่ยังมองไม่เห็นเลย: supabase.from(<ตัวแปร>) ${fromVariable} จุด · .rpc() ${rpcCalls} จุด`
  + ` (ไม่นับ: storage.from(<ถัง>) ${storageBuckets} จุด = ถังไฟล์ ไม่มีคอลัมน์ · \`.select()\` ว่าง ${selectAll} จุด = ทั้งแถว)`);

if (problems.length) {
  console.error(`พบคอลัมน์ที่ไม่มีจริงใน schema ${problems.length} จุด:`);
  for (const p of problems) {
    const where = p.write ? '  (เขียน)' : p.via ? `  (ใน embed ${p.via})` : '';
    console.error(`  ✗ src/${p.file}:${p.line}  ${p.table}.${p.name}${where}`);
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
 * 2026-09-24 — embed ที่แกะตารางปลายทางไม่ได้เข้าเพดานเดียวกัน (ทั้งรีโปแกะได้ครบ 58/58 ก้อน)
 *   ⇒ ทางเคลียร์ของ embed คือเขียนชื่อตาราง/วิวจริงหลัง `:` (หรือคอลัมน์ FK ของตารางแม่)
 *      ถ้าต้องใช้ชื่อ FK ให้ใส่เป็น `!hint` ตามหลังชื่อตาราง ไม่ใช่แทนชื่อตาราง
 *   · วันเดียวกัน เส้นเชื่อม PGRST200/201 · aggregate · `count` ปน · ตารางแม่ที่ไม่มีจริง
 *     เข้าเพดานเดียวกัน (ทั้งรีโป 0 รายการ) ⇒ ทางเคลียร์ของ PGRST201 คือ `!คอลัมน์FK`
 *
 * ⚠️ **ทางเคลียร์คือทำให้ชุดคอลัมน์นั้นอ่านออก ไม่ใช่ดันเพดานขึ้น** — ย้ายมันไปเป็น
 *    `const X = [...].join(', ')` ระดับโมดูล แล้วส่งชื่อนั้นเข้า `.select()` ตรง ๆ
 *    ชุดคอลัมน์ที่ประกอบตอนรัน (`buildCols(user)`) คือชุดที่ไม่มีใครตรวจได้เลยทั้งชีวิต */
const UNRESOLVED_CAP = 0;
if (unresolved.length > UNRESOLVED_CAP) {
  console.error(`\nselect/embed ที่แกะไม่ได้ ${unresolved.length} รายการ (เพดาน ${UNRESOLVED_CAP}) — ดูรายการ ⚠ ข้างบน`);
  console.error('ชุดคอลัมน์ที่แกะไม่ได้ = ไม่มีใครเทียบกับฐานให้เลย ⇒ พิมพ์ผิดเมื่อไรจอนั้นว่างเงียบ ๆ');
  process.exit(1);
}

console.log(`select/write column check ผ่าน — ตรวจ ${files.length} ไฟล์ เทียบกับ ${Object.keys(tables).length} ตารางบนฐานจริง`);
