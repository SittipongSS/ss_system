import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import {
  CUSTOMER_NAME_MIRRORS, cascadeCustomerName, liveCustomerNameMirrors,
} from './customerNameMirrors.js';

/* ทะเบียนนี้คือ "แหล่งเดียว" ที่บอกว่าตารางไหนถือสำเนาชื่อลูกค้า และสำเนานั้นต้อง
   เดินตามทะเบียน (live) หรือตรึงไว้เพราะเป็นเอกสาร (frozen)

   🐞 บั๊กที่ชุดนี้กันไม่ให้เกิดซ้ำ: มี 5 ตารางถือคอลัมน์ `customerName` แต่ตอนแก้ลูกค้า
   cascade ให้ตารางเดียวแบบ hard-code ⇒ เปลี่ยนชื่อลูกค้าแล้วโครงการ/ดีลค้างชื่อเก่า
   ถาวร (วัดจริง 2026-08-27: projects 3 แถว · sales_deals 4 แถว) */

// 'displayName' ไม่ใช่คอลัมน์จริง — เป็นตัวบอกว่าให้คิดจากกติกาสองภาษา
// (customerSnapshotName: ไทยก่อน ไม่มีค่อยตกไปอังกฤษ) ดูหัวไฟล์ customerNameMirrors.js
const SOURCE_FIELDS = new Set(['displayName', 'name', 'nameEn', 'taxId', 'arCode']);

test('ทุกตารางในทะเบียนต้องประกาศโหมดชัดเจน — frozen ต้องบอกเหตุผลด้วย', () => {
  assert.ok(CUSTOMER_NAME_MIRRORS.length >= 5, 'ทะเบียนต้องครอบตารางที่ถือสำเนาจริง');
  const seen = new Set();
  for (const m of CUSTOMER_NAME_MIRRORS) {
    assert.ok(m.table, 'ต้องมีชื่อตาราง');
    assert.equal(seen.has(m.table), false, `ตาราง ${m.table} ประกาศซ้ำ`);
    seen.add(m.table);
    assert.ok(['live', 'frozen'].includes(m.mode), `โหมดของ ${m.table} ต้องเป็น live หรือ frozen`);
    if (m.mode === 'frozen') {
      // ตรึงไว้ต้องมีเหตุผล ไม่ใช่ "ลืม cascade" ที่ปลอมเป็นการตัดสินใจ
      assert.ok((m.reason || '').length > 30, `${m.table} เป็น frozen ต้องเขียนเหตุผลกำกับ`);
      assert.equal(m.fields, undefined, `${m.table} เป็น frozen ห้ามมี fields ให้เขียนทับ`);
    } else {
      assert.ok(m.fields && Object.keys(m.fields).length, `${m.table} เป็น live ต้องบอกว่าเขียนคอลัมน์ไหน`);
      for (const [column, source] of Object.entries(m.fields)) {
        assert.ok(SOURCE_FIELDS.has(source), `${m.table}.${column} อ้างฟิลด์ลูกค้าที่ไม่รู้จัก: ${source}`);
      }
    }
  }
});

test('เอกสารการค้าต้องเป็น frozen เสมอ — ชื่อบนใบคือชื่อ ณ วันออกใบ', () => {
  const modeOf = (table) => CUSTOMER_NAME_MIRRORS.find((m) => m.table === table)?.mode;
  // มติผู้ใช้ 2026-08-27: อยากได้ข้อมูลใหม่บนใบต้องออก Rev. ห้าม cascade ทับ
  assert.equal(modeOf('quotations'), 'frozen');
  assert.equal(modeOf('sales_orders'), 'frozen');
  // ของที่ไม่ใช่เอกสารต้องเดินตามทะเบียน
  assert.equal(modeOf('projects'), 'live');
  assert.equal(modeOf('sales_deals'), 'live');
  assert.equal(modeOf('excise_registrations'), 'live');
});

/* ── ยาม "ตารางที่ถือสำเนาต้องอยู่ในทะเบียน" ────────────────────────────
   🐞 2026-11-09: `products` ถือ `customerName` แต่ไม่เคยถูกประกาศ ⇒ แก้ชื่อลูกค้าแล้ว
   FG ทุกตัวค้างชื่อเก่าถาวร (FG-1056-03-002 · วัดได้ 53 แถว) · เทสต์เดิมนับแค่ "≥ 5 ตาราง"
   จึงไม่มีอะไรแดง ⇒ อ่าน migration จริงแล้วบังคับว่าทุกตารางที่มีคอลัมน์นี้ต้องประกาศโหมด
   ตามลำดับเหตุการณ์ในไฟล์: CREATE TABLE (เนื้อมี "customerName") · ALTER … ADD COLUMN ·
   RENAME TO (material_price_asks → dept_requests ที่ 0173) · DROP TABLE · ตัดคอมเมนต์ทิ้งก่อน
   (0364 มี `-- DROP TABLE …` เป็นสูตรถอย ไม่ใช่การลบจริง) */
const MIGRATIONS_DIR = new URL('../../../supabase/migrations/', import.meta.url);
const IDENT = String.raw`(?:public\.)?"?(\w+)"?`;

function tablesHoldingCustomerName() {
  const holders = new Set();
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = readFileSync(new URL(file, MIGRATIONS_DIR), 'utf8').replace(/--[^\n]*/g, '');
    const events = [];
    for (const m of sql.matchAll(new RegExp(String.raw`create\s+table\s+(?:if\s+not\s+exists\s+)?${IDENT}\s*\(`, 'gi'))) {
      let depth = 1;
      let i = m.index + m[0].length;
      for (; i < sql.length && depth; i += 1) {
        if (sql[i] === '(') depth += 1;
        else if (sql[i] === ')') depth -= 1;
      }
      if (/"customerName"/.test(sql.slice(m.index, i))) events.push({ at: m.index, add: m[1] });
    }
    for (const m of sql.matchAll(new RegExp(String.raw`alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${IDENT}([^;]*);`, 'gi'))) {
      if (/add\s+column\s+(?:if\s+not\s+exists\s+)?"customerName"/i.test(m[2])) events.push({ at: m.index, add: m[1] });
      const renamed = m[2].match(/^\s*rename\s+to\s+"?(\w+)"?/i);
      if (renamed) events.push({ at: m.index, from: m[1], to: renamed[1] });
    }
    for (const m of sql.matchAll(new RegExp(String.raw`drop\s+table\s+(?:if\s+exists\s+)?${IDENT}`, 'gi'))) {
      events.push({ at: m.index, drop: m[1] });
    }
    for (const e of events.sort((a, b) => a.at - b.at)) {
      if (e.add) holders.add(e.add);
      else if (e.drop) holders.delete(e.drop);
      else if (holders.delete(e.from)) holders.add(e.to);
    }
  }
  return holders;
}

/* ตารางที่ถือสำเนาแต่ **ยังไม่มีมติ** ว่าเดินตามหรือตรึง — แยกไว้ตรงนี้แทนการแปะ
   'frozen' ปลอม ๆ ให้ผ่านยาม (frozen = ตัดสินแล้วว่าเป็นเอกสาร) · พฤติกรรมเท่ากับ
   frozen คือไม่ cascade · ตัดสินแล้วย้ายเข้าทะเบียนจริงพร้อมลบออกจากที่นี่ */
const UNDECIDED_CUSTOMER_NAME_COPIES = Object.freeze({
  // ว่างอยู่ — dept_requests ตัดสินแล้ว 09/11 (live) · ตารางใหม่ที่ยังไม่มีมติมาไว้ที่นี่พร้อมเหตุผล
});

test('ทุกตารางที่ migration ให้คอลัมน์ customerName ต้องประกาศในทะเบียน (live/frozen)', () => {
  const declared = new Set(CUSTOMER_NAME_MIRRORS.map((m) => m.table));
  const holders = tablesHoldingCustomerName();
  // ตัวยามต้องเห็นของจริง ไม่ใช่ regex พังแล้วคืนชุดว่างให้ผ่านเงียบ ๆ
  for (const known of ['projects', 'sales_deals', 'quotations', 'scents', 'service_sites', 'dept_requests']) {
    assert.ok(holders.has(known), `ยามต้องเจอ ${known} จาก migration`);
  }
  // ตารางที่ถูกลบ/เปลี่ยนชื่อไปแล้วต้องไม่ถูกเรียกร้อง
  for (const gone of ['material_price_requests', 'material_price_asks', 'product_spec_issues']) {
    assert.equal(holders.has(gone), false, `${gone} ไม่มีแล้ว ยามต้องไม่นับ`);
  }
  const missing = [...holders].filter((t) => !declared.has(t) && !(t in UNDECIDED_CUSTOMER_NAME_COPIES));
  assert.deepEqual(missing, [], `ตารางถือสำเนาชื่อลูกค้าแต่ไม่ได้ประกาศโหมดใน customerNameMirrors.js: ${missing.join(', ')}`);
  for (const t of Object.keys(UNDECIDED_CUSTOMER_NAME_COPIES)) {
    assert.equal(declared.has(t), false, `${t} มีมติแล้ว — ลบออกจากลิสต์ยังไม่ตัดสิน`);
  }
});

test('ข้อมูลหลักต้อง live — สินค้า/กลิ่น/สูตร/ไซต์ เดินตามทะเบียนลูกค้าเสมอ', () => {
  const modeOf = (table) => CUSTOMER_NAME_MIRRORS.find((m) => m.table === table)?.mode;
  // `products.customerName` มาจาก schema ตั้งต้น (ก่อน migration 0001) ยามข้างบนจึงมองไม่เห็น
  // ⇒ ล็อกตรงนี้แทน — นี่คือบั๊ก FG-1056-03-002 (09/11)
  for (const table of ['products', 'scents', 'formulas', 'service_sites', 'material_prices',
    'scent_customer_shares', 'formula_customer_shares',
    // คำร้อง RQ: มติเจ้าของ 09/11 "เปลี่ยนตาม" (รวมใบที่ปิดแล้ว)
    'dept_requests']) {
    assert.equal(modeOf(table), 'live', `${table} เป็นทะเบียน ต้องเดินตามลูกค้า`);
    assert.equal(
      CUSTOMER_NAME_MIRRORS.find((m) => m.table === table).fields.customerName,
      'displayName',
      `${table} ต้องประทับผ่าน customerSnapshotName (ลูกค้าชื่ออังกฤษล้วนห้ามได้ null)`,
    );
  }
});

test('cascade เขียนเฉพาะตาราง live และแมปฟิลด์ตามที่ประกาศ', async () => {
  const writes = [];
  const supabase = {
    from(table) {
      return {
        update(patch) {
          return { eq(column, value) { writes.push({ table, patch, column, value }); return { error: null }; } };
        },
      };
    },
  };
  const failed = await cascadeCustomerName(supabase, 'CUS-1', { name: 'ชื่อใหม่', taxId: '0105561000000' });
  assert.deepEqual(failed, []);
  assert.deepEqual(writes.map((w) => w.table).sort(), liveCustomerNameMirrors().map((m) => m.table).sort());
  // เอกสารต้องไม่ถูกแตะแม้แต่ครั้งเดียว
  for (const w of writes) {
    assert.ok(!['quotations', 'sales_orders'].includes(w.table), `ห้ามเขียนทับ ${w.table}`);
    assert.equal(w.column, 'customerId');
    assert.equal(w.value, 'CUS-1');
    assert.equal(w.patch.customerName, 'ชื่อใหม่');
  }
  assert.equal(writes.find((w) => w.table === 'excise_registrations').patch.taxId, '0105561000000');
  // ตารางที่ไม่เก็บเลขภาษีต้องไม่ถูกยัดคอลัมน์ที่ไม่มีจริง
  assert.equal('taxId' in writes.find((w) => w.table === 'projects').patch, false);
});

test('ตารางที่เขียนไม่ผ่านถูกรายงานกลับ ไม่ใช่เงียบ — และไม่ทำให้ทั้งชุดหยุด', async () => {
  const touched = [];
  const supabase = {
    from(table) {
      return {
        update() {
          return {
            eq() {
              touched.push(table);
              return { error: table === 'projects' ? { message: 'boom' } : null };
            },
          };
        },
      };
    },
  };
  const failed = await cascadeCustomerName(supabase, 'CUS-1', { name: 'ชื่อใหม่', taxId: null });
  assert.deepEqual(failed, ['projects']);
  // ตารางที่เหลือยังถูกเขียนครบ — ตัวเดียวพลาดต้องไม่ล้มทั้งชุด
  assert.equal(touched.length, liveCustomerNameMirrors().length);
});

test('customerId ว่าง = ไม่ยิงอะไรเลย (กันเขียนทับทั้งตาราง)', async () => {
  let called = false;
  const supabase = {
    from() {
      called = true;
      return { update() { return { eq() { return { error: null }; } }; } };
    },
  };
  assert.deepEqual(await cascadeCustomerName(supabase, null, { name: 'x' }), []);
  assert.deepEqual(await cascadeCustomerName(supabase, 'CUS-1', null), []);
  assert.equal(called, false);
});

test('route แก้ลูกค้าต้องเรียกตัวกลาง ไม่เขียน cascade เองอีกชุด', () => {
  const src = readFileSync(new URL('../../app/api/customers/[id]/route.js', import.meta.url), 'utf8');
  assert.match(src, /cascadeCustomerName\(supabase, id, updated\)/);
  // ⚠️ ห้ามกลับไป hard-code ตารางเดียวแบบเดิม
  assert.doesNotMatch(src, /from\('excise_registrations'\)\s*\.update\(/);
  for (const m of CUSTOMER_NAME_MIRRORS) {
    assert.doesNotMatch(
      src,
      new RegExp(`from\\('${m.table}'\\)[\\s\\S]{0,40}\\.update\\([\\s\\S]{0,60}customerName`),
      `route ห้ามเขียน customerName ลง ${m.table} ตรง ๆ — ให้ผ่านทะเบียนกลาง`,
    );
  }
});
