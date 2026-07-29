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

const res = await fetch(`${url}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
if (!res.ok) {
  console.error(`อ่าน schema ไม่สำเร็จ: ${res.status}`);
  process.exit(1);
}
const spec = await res.json();
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

if (problems.length) {
  console.error(`พบคอลัมน์ที่ไม่มีจริงใน schema ${problems.length} จุด:`);
  for (const p of problems) console.error(`  ✗ src/${p.file}:${p.line}  ${p.table}.${p.name}`);
  console.error('\nชื่อผิด = PostgREST ตอบ 42703 ทั้ง query · ที่ไหนอ่าน `.data || []` จะกลายเป็น "ไม่มีข้อมูล" เงียบ ๆ');
  process.exit(1);
}

console.log(`select-column check ผ่าน — ตรวจ ${files.length} ไฟล์ เทียบกับ ${Object.keys(tables).length} ตารางบนฐานจริง`);
if (skippedTables.size) {
  console.log(`(ข้ามตารางที่ไม่อยู่ใน schema: ${[...skippedTables].join(', ')})`);
}
