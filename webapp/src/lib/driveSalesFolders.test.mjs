// ── ชื่อโฟลเดอร์ไฟล์แนบต้องมาจากคอลัมน์ที่มีอยู่จริง ────────────────────────
//
// `SALES_THREAD_FOLDER` ใน lib/drive.js บอกว่าจะตั้งชื่อโฟลเดอร์ Drive ของแต่ละ
// entity จากคอลัมน์ไหน แล้ว `docLabel()` หยิบคีย์แรกที่มีค่า — ถ้า **ไม่มีคีย์ไหน
// เป็นคอลัมน์จริงเลย** มันไม่ error แต่ตกไปใช้ `String(row.id)` เงียบ ๆ
// ⇒ เปิด Drive มาเจอโฟลเดอร์ชื่อ "LEAD-a1b2c3d4" เรียงกันเป็นร้อย ไม่รู้ของใคร
//
// ตัวตรวจที่มีอยู่ (scripts/check-select-columns.mjs) จับไม่ได้ เพราะ query ตรงนี้
// เป็น `.select('*')` — ชื่อคอลัมน์ไปโผล่ใน labelKeys ซึ่งไม่ใช่ที่ที่มันสแกน
//
// เจอจริง 2026-08-04 (ตรวจ flow LD): lead ตั้งไว้เป็น name/companyName/title
// ซึ่ง sales_leads ไม่มีสักตัว (ของจริงคือ contactName/company — mig 0091)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const MIGRATIONS = join(ROOT, 'supabase/migrations');

/** คอลัมน์ของตารางหนึ่ง ๆ รวบจาก CREATE TABLE + ALTER TABLE ... ADD COLUMN ทุก migration
 *  ⚠️ SQL ในโปรเจกต์นี้เขียนทั้งตัวพิมพ์เล็กและใหญ่ (0008 ใช้ `create table`, 0091 ใช้
 *  `CREATE TABLE`) — regex ต้อง case-insensitive ไม่งั้นตารางเก่าจะอ่านได้ 0 คอลัมน์
 *  แล้วเทสต์จะฟ้องผิดตัว */
function columnsOf(table) {
  const cols = new Set();
  const createRe = new RegExp(`CREATE TABLE\\s+(?:IF NOT EXISTS\\s+)?public\\.${table}\\s*\\(`, 'i');
  const alterRe = new RegExp(`ALTER TABLE\\s+(?:ONLY\\s+)?public\\.${table}\\b([\\s\\S]*?);`, 'gi');
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8');

    // CREATE TABLE — เอาเฉพาะชื่อคอลัมน์ที่ขึ้นต้นบรรทัดด้วยย่อหน้า 2 ช่อง
    // (ข้าม CHECK/CONSTRAINT/PRIMARY KEY ที่ย่อหน้าเหมือนกัน)
    const created = createRe.exec(sql);
    if (created) {
      const body = sql.slice(created.index + created[0].length);
      for (const line of body.split('\n')) {
        if (/^\s*\);?\s*$/.test(line)) break;
        const m = line.match(/^\s{2}"?([A-Za-z_][A-Za-z0-9_]*)"?\s+[A-Za-z]/);
        if (m && !/^(CHECK|CONSTRAINT|PRIMARY|UNIQUE|FOREIGN|REFERENCES)$/i.test(m[1])) cols.add(m[1]);
      }
    }

    // ALTER TABLE ... ADD COLUMN [IF NOT EXISTS] "col"
    for (const [, chunk] of sql.matchAll(alterRe)) {
      for (const [, col] of chunk.matchAll(/ADD COLUMN\s+(?:IF NOT EXISTS\s+)?"?([A-Za-z_][A-Za-z0-9_]*)"?/gi)) {
        cols.add(col);
      }
    }
  }
  return cols;
}

/** อ่าน SALES_THREAD_FOLDER จาก source (เป็น const ภายในโมดูล ไม่ได้ export) */
function salesThreadFolders() {
  const src = readFileSync(join(ROOT, 'src/lib/drive.js'), 'utf8');
  const block = src.slice(src.indexOf('const SALES_THREAD_FOLDER = {'));
  const body = block.slice(0, block.indexOf('\n};'));
  const out = {};
  for (const [, type, table, keys] of body.matchAll(
    /^\s{2}(\w+):\s*\{[^}]*table:\s*'([^']+)'[^}]*labelKeys:\s*\[([^\]]*)\]/gm,
  )) {
    out[type] = { table, labelKeys: [...keys.matchAll(/'([^']+)'/g)].map(([, k]) => k) };
  }
  return out;
}

// ไม่มีข้อยกเว้นแล้ว — quotation/sales_order ถูกแก้ในรอบตรวจ DL (2026-08-05)
// ตอนที่ไฟล์แนบบน prod ยังเป็น 0 ทุกชนิด จึงเปลี่ยนชื่อโฟลเดอร์ได้โดยไม่ทิ้งของเก่า
const KNOWN_BROKEN = [];

test('อ่าน SALES_THREAD_FOLDER + คอลัมน์จาก migration ได้จริง (กันเทสต์กลายเป็นเทสต์เปล่า)', () => {
  const folders = salesThreadFolders();
  assert.ok(Object.keys(folders).length >= 5, `อ่าน SALES_THREAD_FOLDER ไม่ครบ: ${Object.keys(folders)}`);
  assert.ok(columnsOf('sales_leads').has('contactName'), 'ตัวอ่านคอลัมน์จาก migration ใช้ไม่ได้');
  assert.ok(columnsOf('quotations').has('quoteNumber'), 'ตัวอ่านคอลัมน์ (ALTER/CREATE) ใช้ไม่ได้');
});

test('ทุก entity ต้องมี labelKey ที่เป็นคอลัมน์จริงอย่างน้อย 1 ตัว', () => {
  const folders = salesThreadFolders();
  for (const [type, { table, labelKeys }] of Object.entries(folders)) {
    if (KNOWN_BROKEN.includes(type)) continue;
    const cols = columnsOf(table);
    const hit = labelKeys.filter((key) => cols.has(key));
    assert.ok(
      hit.length > 0,
      `${type} → ${table}: ไม่มี labelKey ตัวไหนเป็นคอลัมน์จริง (${labelKeys.join(', ')}) `
      + '⇒ โฟลเดอร์ Drive จะตั้งชื่อด้วย id ดิบ',
    );
  }
});

test('ลีดตั้งชื่อโฟลเดอร์ด้วยชื่อผู้ติดต่อ/บริษัท ไม่ใช่ id ดิบ', () => {
  const { lead } = salesThreadFolders();
  assert.equal(lead.table, 'sales_leads');
  assert.deepEqual(lead.labelKeys, ['contactName', 'company']);
  const cols = columnsOf('sales_leads');
  for (const key of lead.labelKeys) assert.ok(cols.has(key), `sales_leads ไม่มีคอลัมน์ ${key}`);
});

test('ไม่มีข้อยกเว้นค้างอยู่ — ทุก entity ผ่านด่านจริง', () => {
  assert.deepEqual(KNOWN_BROKEN, [], 'มีข้อยกเว้นค้าง = ยังมีโฟลเดอร์ที่ตั้งชื่อด้วย id ดิบ');
});

/* ⭐ ทุก labelKey ต้องเป็นคอลัมน์จริง — ไม่ใช่แค่ "มีอย่างน้อยหนึ่งตัว"
   คีย์ผีที่ปนอยู่ (เช่น `docNo` ที่ไม่มีในตารางไหนเลย) ไม่ทำให้พังวันนี้เพราะมีตัวสำรอง
   แต่มันคือหลักฐานว่าไม่มีใครเคยเทียบกับ schema จริง */
test('ทุก labelKey เป็นคอลัมน์จริง ไม่มีคีย์ผีปนมา', () => {
  for (const [type, { table, labelKeys }] of Object.entries(salesThreadFolders())) {
    const cols = columnsOf(table);
    const ghosts = labelKeys.filter((key) => !cols.has(key));
    assert.deepEqual(ghosts, [], `${type} → ${table}: คีย์ที่ไม่มีในตาราง ${ghosts.join(', ')}`);
  }
});

test('เอกสารที่คนเรียกด้วยเลขที่ ต้องตั้งชื่อโฟลเดอร์ด้วยเลขที่นั้น', () => {
  const folders = salesThreadFolders();
  assert.equal(folders.quotation.labelKeys[0], 'quoteNumber');
  assert.equal(folders.sales_order.labelKeys[0], 'orderNumber');
  // ดีล/โครงการเรียกกันด้วยรหัส (DL-… / PJ-…) จึงให้ code มาก่อนชื่อ
  assert.equal(folders.deal.labelKeys[0], 'code');
  assert.equal(folders.project.labelKeys[0], 'code');
});
