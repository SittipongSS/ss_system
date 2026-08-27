import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  CUSTOMER_NAME_MIRRORS, cascadeCustomerName, liveCustomerNameMirrors,
} from './customerNameMirrors.js';

/* ทะเบียนนี้คือ "แหล่งเดียว" ที่บอกว่าตารางไหนถือสำเนาชื่อลูกค้า และสำเนานั้นต้อง
   เดินตามทะเบียน (live) หรือตรึงไว้เพราะเป็นเอกสาร (frozen)

   🐞 บั๊กที่ชุดนี้กันไม่ให้เกิดซ้ำ: มี 5 ตารางถือคอลัมน์ `customerName` แต่ตอนแก้ลูกค้า
   cascade ให้ตารางเดียวแบบ hard-code ⇒ เปลี่ยนชื่อลูกค้าแล้วโครงการ/ดีลค้างชื่อเก่า
   ถาวร (วัดจริง 2026-08-27: projects 3 แถว · sales_deals 4 แถว) */

const SOURCE_FIELDS = new Set(['name', 'nameEn', 'taxId', 'arCode']);

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
