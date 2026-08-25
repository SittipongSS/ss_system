// ── ลบระเบียนแม่ = ต้องกวาดไฟล์แนบของมันด้วย ────────────────────────────────
//
// `attachments` เป็น polymorphic (`entityId` เป็น text ไม่มี FK) ⇒ **ฐานข้อมูล
// cascade ให้ไม่ได้** ต้องเรียก `purgeAttachments()` เอง ซึ่งลบทั้งแถว ทิ้งไฟล์บน Drive
// และถอนสิทธิ์เอกสารร่วมให้ครบในตัว
//
// 🐞 วัดบน production 2026-08-25: แถวไฟล์แนบกำพร้า 5 แถว — `order` 2 · `dept_request_item` 3
// ตรงกับเส้นลบสองเส้นที่ลืมเรียกตัวเก็บกวาดเป๊ะ ๆ · ปลายทางของมันคือปุ่ม "ล้างแถวกำพร้า"
// ในหน้าตั้งค่า ซึ่งเป็นงานที่คนต้องมานั่งกดเก็บกวาดสิ่งที่ระบบทำหล่นไว้เอง
//
// ⚠️ เส้น "rollback ของแถวที่เพิ่งสร้าง" ไม่ต้องกวาด — แถวอายุไม่กี่วินาที ยังไม่มีทาง
// มีไฟล์แนบ · แต่ต้องประกาศไว้ในลิสต์พร้อมเหตุผล ไม่ใช่ปล่อยให้เงียบ
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PARENT_TABLE } from './attachments.js';

const SRC = fileURLToPath(new URL('../../', import.meta.url));

/* ตารางแม่ที่ **ลบทีละใบแล้วไฟล์แนบต้องหายตาม** — มาจากทะเบียนกลาง ไม่ใช่ลิสต์มือ
   ⚠️ `customers`/`products` มีเส้นลบของตัวเองที่เรียก purgeAttachments อยู่แล้ว
   ทั้งคู่ยังอยู่ในชุดนี้เพื่อให้เทสต์จับได้ถ้าวันหนึ่งมีคนเพิ่มเส้นลบเส้นที่สอง */
const PARENT_TABLES = [...new Set(Object.values(PARENT_TABLE))];

/* เส้นที่ลบ "แถวที่เพิ่งสร้างในคำขอเดียวกัน" — ยังไม่มีไฟล์แนบได้ในทางกายภาพ
   คีย์ = ไฟล์ (นับจาก src/) · ค่า = เหตุผล */
const ROLLBACK_ONLY = {
  'app/api/orders/route.js': 'rollback ใบสั่งซื้อที่เพิ่งสร้างเมื่อขั้นถัดไปล้ม',
  'app/api/sa/requests/route.js': 'rollback คำร้องที่เพิ่งสร้างเมื่อออกเลขที่/บรรทัดล้ม',
  'app/api/sahamit/forecast/rounds/[id]/create-sales-deal/route.js': 'rollback ดีลที่เพิ่งสร้างจากรอบพยากรณ์',
  'app/api/sahamit/po/[id]/settle-deal/route.js': 'rollback ดีลที่เพิ่งสร้างตอนปิด PO',
  'app/api/sahamit/po/[id]/create-project/route.js': 'rollback โครงการที่เพิ่งสร้างจาก PO',
  'app/api/sales-planning/deals/[id]/create-project/route.js': 'rollback โครงการที่เพิ่งสร้างจากดีล',
};

function jsFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) { jsFiles(full, out); continue; }
    if (/\.js$/.test(entry)) out.push(full);
  }
  return out;
}

const deleters = [];
for (const file of jsFiles(SRC)) {
  if (/\.test\.mjs$/.test(file)) continue;
  const text = readFileSync(file, 'utf8');
  const hit = PARENT_TABLES.filter((table) => text.includes(`from('${table}').delete()`));
  if (hit.length) {
    deleters.push({
      file: path.relative(SRC, file),
      tables: hit,
      purges: text.includes('purgeAttachments'),
    });
  }
}

test('⭐ ทุกไฟล์ที่ลบระเบียนแม่ ต้องกวาดไฟล์แนบ หรือประกาศว่าเป็น rollback', () => {
  const guilty = deleters
    .filter((d) => !d.purges && !ROLLBACK_ONLY[d.file])
    .map((d) => `${d.file} (${d.tables.join(', ')})`);
  assert.deepEqual(
    guilty,
    [],
    `เส้นลบที่ไม่ได้กวาดไฟล์แนบ:\n  ${guilty.join('\n  ')}\n`
    + 'เรียก purgeAttachments(entityType, id) ก่อนลบแถว — หรือถ้าเป็น rollback ของแถวที่เพิ่ง\n'
    + 'สร้างในคำขอเดียวกัน ให้เพิ่มลง ROLLBACK_ONLY พร้อมเหตุผล',
  );
});

test('ลิสต์ rollback ต้องไม่มีของตายค้าง — ทุกรายการต้องยังลบตารางแม่อยู่จริง', () => {
  const seen = new Set(deleters.map((d) => d.file));
  const stale = Object.keys(ROLLBACK_ONLY).filter((f) => !seen.has(f));
  assert.deepEqual(stale, [], `ลิสต์ rollback อ้างไฟล์ที่เลิกลบตารางแม่แล้ว: ${stale.join(', ')}`);
});

test('ตัวเก็บกวาดต้องทำครบสามอย่าง — แถว · ไฟล์บน Drive · สิทธิ์ที่เคยให้', () => {
  const source = readFileSync(path.join(SRC, 'lib/master/attachments.js'), 'utf8');
  assert.match(source, /export async function purgeAttachments/);
  assert.match(source, /releaseAttachmentFile\(att\)/, 'ต้องปล่อยของบน Drive ต่อไฟล์');
  assert.match(source, /\.from\('attachments'\)\.delete\(\)/, 'ต้องลบแถวจริง');
});
