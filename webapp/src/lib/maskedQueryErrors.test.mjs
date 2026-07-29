// ── ratchet: query พังต้องไม่ถูกรายงานว่า "ไม่พบ X" ──────────────────────────
//
// แพตเทิร์นที่ห้ามมี:
//   const { data: x } = await supabase.from(...)…      ← ทิ้ง error
//   if (!x) return notFound('ไม่พบ…')                   ← สรุปว่าไม่มีข้อมูล
// DB สะดุด / ชื่อคอลัมน์เพี้ยน / RLS ปิด → ผู้ใช้เห็น "ไม่พบดีล" แล้วไปไล่หาว่าดีล
// หายไปไหน ทั้งที่ข้อมูลอยู่ครบ · เจอจริงมาแล้วหลายรอบ (ล่าสุด products.teams ทำให้
// แท็บสินค้าบนหน้าลูกค้าว่างทุกราย — #815)
//
// ⚠️ เทสต์นี้อ่าน source อย่างเดียว จึงรันบน CI ได้ ต่างจาก `npm run check:columns`
// ที่ต้องต่อฐานจริง · สองตัวจับคนละอย่าง: ตัวนี้จับ "ทิ้ง error", ตัวนั้นจับ "ชื่อผิด"
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

function sourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.(js|mjs)$/.test(entry) && !/\.test\./.test(entry)) out.push(p);
  }
  return out;
}

// คืนจุดที่ "ทิ้ง error แล้วสรุปว่าไม่พบ" — ตรรกะเดียวกับสคริปต์สแกนที่ใช้ตอนไล่เก็บ
// คืนจุดที่ทิ้ง error แล้ว **ตัดสินใจอะไรบางอย่างจาก `!data`** — ครอบทั้งสองชั้น:
//   A: `if (!x) return notFound('ไม่พบ…')`     → บอกผู้ใช้ว่าไม่มีข้อมูล
//   B: `if (!x) return forbidden()` / `ok({})`  → บอกว่าไม่มีสิทธิ์ / ว่าสำเร็จ
// ชั้น B เนียนกว่าเพราะข้อความไม่มีคำว่า "ไม่พบ" แต่พาไปผิดทางเหมือนกัน — ที่เจอจริง:
// reorder ตอบ ok({changed:0}) = "จัดลำดับสำเร็จ" ทั้งที่ query พังและไม่ได้แตะอะไรเลย
function findMaskedDecisions() {
  const hits = [];
  for (const file of sourceFiles(SRC)) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      const m = line.match(/const\s*\{([^}]*)\}\s*=\s*(await\s+)?/);
      if (!m) return;
      const inner = m[1];
      if (!/\bdata\b/.test(inner) || /\berror\b/.test(inner)) return;
      const ctx = lines.slice(i, i + 4).join(' ');
      if (!/\.from\(|\.rpc\(|\.storage|await supabase|await admin/.test(ctx)) return;

      const varName = (inner.match(/data\s*:\s*(\w+)/) || [, 'data'])[1];
      const after = lines.slice(i, i + 12).join('\n');
      // มี `if (!x` ตามมา = เอาผลไปตัดสินใจ ⇒ ต้องแยก error ออกก่อน
      if (new RegExp(`if\\s*\\(!\\s*${varName}\\b`).test(after)) {
        hits.push(`${relative(SRC, file).split(sep).join('/')}:${i + 1} [${varName}]`);
      }
    });
  }
  return hits;
}

test('ไม่มีจุดไหนทิ้ง error ของ query แล้วเอา !data ไปตัดสินใจ', () => {
  const hits = findMaskedDecisions();
  assert.deepEqual(
    hits, [],
    `เก็บ error ของ query ก่อนตัดสินใจจาก !data:\n  ${hits.join('\n  ')}\n`
    + 'รูปแบบ: const { data: x, error: xError } = await … · if (xError) return fail(xError.message, 500)\n'
    + 'จุดที่ตั้งใจให้ล้มเหลวเงียบ (ของเสริม เช่น การ์ดสรุป/ลายเซ็น) ให้ log แล้วคอมเมนต์กำกับเจตนา',
  );
});
