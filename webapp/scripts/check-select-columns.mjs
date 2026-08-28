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
// วิธีใช้:  node scripts/check-select-columns.mjs
//   ต้องมี .env.local (SUPABASE_URL + SERVICE_ROLE_KEY) — อ่าน schema จาก OpenAPI
//   spec ของ PostgREST ซึ่งสะท้อนฐานจริง ไม่ใช่ไฟล์ migration ที่อาจยังไม่ได้รัน
//   ⚠️ จึงไม่ใช่ unit test (CI ไม่มี env) — เป็นเครื่องมือให้คนรันตอนแตะ query
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchSchema } from './schemaFetch.mjs';

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

const problems = [];
const skippedTables = new Set();
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  // .from('table') … .select('cols') — จำกัดระยะเพื่อไม่ให้ข้ามไป select ของ query ถัดไป
  const re = /\.from\(\s*['"`](\w+)['"`]\s*\)([\s\S]{0,200}?)\.select\(\s*(['"`])([\s\S]*?)\3/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const [, table, between, , selectRaw] = m;
    // มี .from() คั่นกลาง = จับข้ามคู่ ข้ามไป
    if (between.includes('.from(')) continue;
    if (!tables[table]) { skippedTables.add(table); continue; }
    const line = src.slice(0, m.index).split(/\r?\n/).length;
    // ตัด embed ซ้อน: alias:table(...) และ table(...)
    const flat = selectRaw.replace(/\w+\s*:\s*\w+\s*\([^)]*\)/g, '').replace(/\w+\s*\([^)]*\)/g, '');
    for (const piece of flat.split(',')) {
      const name = piece.trim().replace(/^["']|["']$/g, '').split(/[:!]/)[0].trim();
      if (!name || name === '*' || /[^A-Za-z0-9_]/.test(name)) continue;
      if (!tables[table].has(name)) problems.push({ file: relative(SRC, file).split(sep).join('/'), line, table, name });
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
  const src = readFileSync(file, 'utf8');
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
        problems.push({ file: relative(SRC, file).split(sep).join('/'), line, table, name, write: true });
      }
    }
  }
}

if (problems.length) {
  console.error(`พบคอลัมน์ที่ไม่มีจริงใน schema ${problems.length} จุด:`);
  for (const p of problems) {
    console.error(`  ✗ src/${p.file}:${p.line}  ${p.table}.${p.name}${p.write ? '  (เขียน)' : ''}`);
  }
  console.error('\nอ่านผิด = PostgREST ตอบ 42703 ทั้ง query · ที่ไหนอ่าน `.data || []` จะกลายเป็น "ไม่มีข้อมูล" เงียบ ๆ');
  console.error('เขียนผิด = PGRST204 ทั้งคำสั่ง ⇒ ปุ่มนั้นกดไม่ผ่านเลย (หรือเงียบ ถ้าโค้ดกลืน error)');
  process.exit(1);
}

console.log(`select/write column check ผ่าน — ตรวจ ${files.length} ไฟล์ เทียบกับ ${Object.keys(tables).length} ตารางบนฐานจริง`);
if (skippedTables.size) {
  console.log(`(ข้ามตารางที่ไม่อยู่ใน schema: ${[...skippedTables].join(', ')})`);
}
