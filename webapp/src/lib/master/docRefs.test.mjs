import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';

import { DOC_REF_TYPES, parseDocRef } from './docRefs.js';

// ── ทำไมต้องมีเทสต์ชุดนี้ ────────────────────────────────────────────────
//
// 🐞 CR/DR เคยประกาศ `column: 'code'` ตามเพื่อนบ้าน (PJ/DL ใช้ `code` จริง) ทั้งที่
// สองตารางนั้นเก็บเลขที่ไว้ที่ `docNo` ⇒ `/go/CR-26070001` ยิง `.eq('code', …)`
// PostgREST คืน 42703 แล้วผู้ใช้เห็น "เปิดทะเบียนไม่สำเร็จ: column … does not exist"
// **ทุกครั้ง** ที่กดเลขที่ในเธรด — พังเงียบตั้งแต่วันที่เพิ่มสองคำนำหน้านี้เข้ามา
//
// บั๊กแบบนี้เทสต์ระดับ unit จับไม่ได้เลย เพราะ `docRefs.js` ไม่มี I/O — มันแค่คืน
// สตริงชื่อคอลัมน์ที่ "ดูสมเหตุสมผล" · ตัวเดียวที่จับได้คือการเทียบกับ schema จริง
// เทสต์นี้จึงอ่าน migrations แล้วยืนยันว่าคอลัมน์ที่ประกาศไว้ **มีอยู่จริงในตารางนั้น**

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);

/** อ่าน migrations ทั้งหมดตามลำดับเลข แล้วสร้างแผนที่ ตาราง → เซ็ตของคอลัมน์
 *
 *  รองรับสามอย่างที่ schema นี้ใช้จริง:
 *    1. CREATE TABLE public.<t> ( … )      — คอลัมน์ตั้งต้น
 *    2. ALTER TABLE … ADD/DROP/RENAME COLUMN
 *    3. ALTER TABLE … RENAME TO <t2>       — dept_requests เกิดจากการเปลี่ยนชื่อ
 *                                            material_price_asks (0173) คอลัมน์ต้องตามไปด้วย
 */
function buildSchema() {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  const columns = new Map(); // ชื่อตาราง → Set<คอลัมน์>

  const colsOf = (table) => {
    if (!columns.has(table)) columns.set(table, new Set());
    return columns.get(table);
  };

  for (const file of files) {
    // ⚠️ ต้องตัดคอมเมนต์ก่อนเสมอ — 0173 เขียนคำสั่ง **ย้อนกลับ** ไว้เป็นคอมเมนต์
    //    (`-- ALTER TABLE public.dept_requests RENAME TO material_price_asks;`)
    //    ถ้าไม่ตัด parser จะ "ย้อนชื่อกลับ" แล้วรายงานว่า dept_requests ไม่มีคอลัมน์อะไรเลย
    const sql = readFileSync(new URL(file, MIGRATIONS), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/--[^\n]*/g, '');

    // 1) CREATE TABLE — เก็บชื่อคอลัมน์จาก "ต้นบรรทัด" ของบล็อกนิยาม
    //    (ข้าม CONSTRAINT/PRIMARY KEY/UNIQUE/CHECK/FOREIGN ที่ไม่ใช่คอลัมน์)
    const createRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_0-9]+)"?\s*\(/gi;
    let m;
    while ((m = createRe.exec(sql))) {
      const table = m[1];
      // ตัดตัวบล็อกด้วยการนับวงเล็บ — นิยามคอลัมน์มีวงเล็บซ้อน (numeric(12,2), CHECK (…))
      let depth = 1;
      let i = createRe.lastIndex;
      while (i < sql.length && depth > 0) {
        if (sql[i] === '(') depth += 1;
        else if (sql[i] === ')') depth -= 1;
        i += 1;
      }
      for (const line of sql.slice(createRe.lastIndex, i - 1).split('\n')) {
        const c = line.trim().match(/^"([A-Za-z_0-9]+)"|^([a-z_0-9]+)\s+[a-z]/);
        const name = c?.[1] || c?.[2];
        if (!name) continue;
        if (/^(constraint|primary|unique|check|foreign|exclude|like)$/i.test(name)) continue;
        colsOf(table).add(name);
      }
    }

    // 2) ALTER TABLE … — เปลี่ยนชื่อตาราง ต้องทำก่อน เพราะคำสั่งถัดไปในไฟล์เดียวกัน
    //    อาจอ้างชื่อใหม่แล้ว
    const renameTableRe = /alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?"?([a-z_0-9]+)"?\s+rename\s+to\s+"?([a-z_0-9]+)"?/gi;
    while ((m = renameTableRe.exec(sql))) {
      const [, from, to] = m;
      if (columns.has(from)) {
        colsOf(to);
        for (const c of columns.get(from)) colsOf(to).add(c);
        columns.delete(from);
      }
    }

    const alterRe = /alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?"?([a-z_0-9]+)"?([\s\S]*?);/gi;
    while ((m = alterRe.exec(sql))) {
      const [, table, body] = m;
      for (const a of body.matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?"?([A-Za-z_0-9]+)"?/gi)) {
        colsOf(table).add(a[1]);
      }
      for (const r of body.matchAll(/rename\s+column\s+"?([A-Za-z_0-9]+)"?\s+to\s+"?([A-Za-z_0-9]+)"?/gi)) {
        colsOf(table).delete(r[1]);
        colsOf(table).add(r[2]);
      }
      for (const d of body.matchAll(/drop\s+column\s+(?:if\s+exists\s+)?"?([A-Za-z_0-9]+)"?/gi)) {
        colsOf(table).delete(d[1]);
      }
    }
  }

  return columns;
}

const SCHEMA = buildSchema();

test('ตัวอ่าน migrations ทำงานจริง — ไม่ใช่เทสต์ที่เขียวเพราะ parser คืนของว่าง', () => {
  // ถ้า parser พัง เทสต์ข้างล่างจะเขียวหมดโดยไม่ได้ตรวจอะไรเลย — กันไว้ที่นี่
  assert.ok(SCHEMA.size > 30, `อ่านตารางได้แค่ ${SCHEMA.size} ตาราง — parser น่าจะพัง`);
  assert.ok(SCHEMA.get('quotations')?.has('quoteNumber'));
  assert.ok(SCHEMA.get('projects')?.has('code'));
  // ตารางที่เกิดจากการเปลี่ยนชื่อ ต้องพาคอลัมน์ตามมาด้วย (0158 → 0173)
  assert.ok(SCHEMA.has('dept_requests'), 'dept_requests หายไป — การตาม RENAME TO ไม่ทำงาน');
  assert.ok(!SCHEMA.has('material_price_asks'), 'ชื่อเก่ายังอยู่ — ควรถูกแทนที่ด้วยชื่อใหม่');
});

test('⭐ ทุกคำนำหน้าใน DOC_REF_TYPES ต้องชี้คอลัมน์ที่มีอยู่จริงในตารางนั้น', () => {
  for (const [prefix, ref] of Object.entries(DOC_REF_TYPES)) {
    const cols = SCHEMA.get(ref.table);
    assert.ok(cols, `${prefix}: ไม่พบตาราง "${ref.table}" ใน migrations`);
    assert.ok(
      cols.has(ref.column),
      `${prefix} (${ref.label}) ชี้คอลัมน์ "${ref.column}" ที่ไม่มีในตาราง "${ref.table}" — `
        + `/go/${prefix}-… จะพังด้วย 42703 · คอลัมน์ที่มีจริงคล้าย ๆ กัน: `
        + [...cols].filter((c) => /code|no|number/i.test(c)).join(', '),
    );
  }
});

test('CR/DR ใช้ docNo ไม่ใช่ code — ตรึงบั๊กที่เคยเกิด', () => {
  assert.equal(DOC_REF_TYPES.CR.column, 'docNo');
  assert.equal(DOC_REF_TYPES.DR.column, 'docNo');
});

test('parseDocRef ยังจับรหัสของสองคำนำหน้านี้ได้ (ไม่ได้พังตั้งแต่ก่อนถึง DB)', () => {
  assert.deepEqual(parseDocRef('CR-26070001')?.table, 'costing_requests');
  assert.deepEqual(parseDocRef('CR-26070001')?.column, 'docNo');
  assert.deepEqual(parseDocRef('DR-26080012')?.column, 'docNo');
});
