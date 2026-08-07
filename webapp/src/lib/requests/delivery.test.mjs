// RD ส่งของ = สร้างแถวเอง (P3b) — ด่านล้วน ทดสอบได้โดยไม่แตะ DB
//
// ⚠️ ด่านที่นี่คือสิ่งเดียวที่กันไม่ให้ผู้ใช้เจอ error ดิบของ Postgres ตอนกดส่ง —
// รหัสกลิ่นซ้ำจะชน scents_code_uk ซึ่งเป็นข้อความอังกฤษที่อ่านไม่รู้เรื่อง
// และมาตอนที่สายเกินจะแก้ทีละช่องแล้ว
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_DELIVERY_ROWS, deliveryItemRow, normalizeDeliveryRows, normalizeFormulaDelivery,
} from './delivery.js';
import { rowStage } from './rowStage.js';

const ok = { name: 'Forest night A', code: 'SC-2601', readyAt: '2026-08-05' };

test('ส่งของต้องมีอย่างน้อยหนึ่งรายการ และไม่เกินเพดาน', () => {
  assert.match(normalizeDeliveryRows([]).error, /อย่างน้อย 1 รายการ/);
  const many = Array.from({ length: MAX_DELIVERY_ROWS + 1 }, (_, i) => ({
    ...ok, name: `A${i}`, code: `SC-${i}`,
  }));
  assert.match(normalizeDeliveryRows(many).error, /สูงสุด/);
});

test('ชื่อกับรหัสบังคับทั้งคู่ — รหัสว่าง = กลิ่นร่างที่ไม่มีใครกลับมาใส่ให้', () => {
  assert.match(normalizeDeliveryRows([{ code: 'SC-1' }]).error, /ชื่อกลิ่น/);
  assert.match(normalizeDeliveryRows([{ name: 'A' }]).error, /รหัสกลิ่น/);
  assert.equal(normalizeDeliveryRows([ok]).error, null);
});

test('⭐ รหัสซ้ำถูกจับที่นี่ ทั้งซ้ำในชุดเดียวกันและซ้ำกับทะเบียน', () => {
  const dup = normalizeDeliveryRows([ok, { ...ok, name: 'อีกตัว' }]);
  assert.match(dup.error, /ซ้ำกับรายการก่อนหน้า/);
  assert.match(dup.error, /SC-2601/, 'ต้องบอกรหัสที่ชน ไม่ใช่แค่บอกว่าซ้ำ');

  const taken = normalizeDeliveryRows([ok], { existingCodes: ['sc-2601'] });
  assert.match(taken.error, /ถูกใช้ไปแล้วในทะเบียน/, 'เทียบไม่สนตัวพิมพ์เหมือน index');
});

test('ชื่อซ้ำในชุดเดียวก็ไม่ได้ — ตัวตนของกลิ่นคือชื่อ+ลูกค้า จะได้ตัวเดียวแล้วอีกตัวหาย', () => {
  assert.match(
    normalizeDeliveryRows([ok, { ...ok, code: 'SC-2602' }]).error,
    /ชื่อกลิ่นซ้ำ/,
  );
});

test('วันที่พร้อมส่งเว้นว่างได้ = วันนี้ · ใส่มาแล้วต้องเป็น ISO', () => {
  assert.equal(normalizeDeliveryRows([{ name: 'A', code: 'SC-1' }], { today: '2026-08-05' })
    .rows[0].readyAt, '2026-08-05');
  assert.match(normalizeDeliveryRows([{ ...ok, readyAt: '05/08/2026' }]).error, /วันที่พร้อมส่ง/);
});

// ⭐ **วันผลิต ≠ วันพร้อมส่ง** (มติผู้ใช้ 2026-08-08 · ม-66 · mig 0224) — กลิ่นตัวหนึ่ง
// ผลิตเสร็จวันที่ 1 แต่รอตัวอื่นในชุดจนพร้อมส่งพร้อมกันวันที่ 8 เป็นเรื่องปกติ
// 🐞 เดิมมีช่องเดียวที่ถูกเขียนลงทั้ง `items.readyAt` และ `scents.sentAt` ⇒ ป้ายบน
// ทะเบียนเขียนว่า "ส่งลูกค้า" แต่ค่าที่ได้คือวันที่ RD ส่งมอบให้ฝ่ายขาย
test('⭐ วันผลิตแยกจากวันพร้อมส่ง — ไม่กรอก = วันเดียวกับที่ส่งมอบ', () => {
  const split = normalizeDeliveryRows([{ ...ok, producedAt: '2026-08-01' }]).rows[0];
  assert.equal(split.producedAt, '2026-08-01');
  assert.equal(split.readyAt, '2026-08-05');
  // ไม่กรอกวันผลิต = ผลิตเสร็จวันเดียวกับที่ส่งมอบ (เคสส่วนใหญ่) ไม่ใช่บังคับพิมพ์ซ้ำ
  assert.equal(normalizeDeliveryRows([ok]).rows[0].producedAt, '2026-08-05');
  assert.match(normalizeDeliveryRows([{ ...ok, producedAt: '01/08/2026' }]).error, /วันที่ผลิตกลิ่น/);
});

test('⭐ แถวที่เกิดต้องอยู่ขั้น "ส่งแล้ว รอไปรับ" ไม่ใช่ "รอรับเรื่อง"', () => {
  // RD สร้างแถวตอนส่ง ⇒ รับเรื่องกับส่งของจบพร้อมกัน · ถ้า ackAt ว่าง RD จะเห็น
  // ปุ่ม "รับเรื่อง" บนแถวที่ตัวเองเพิ่งส่งไปเอง
  const row = deliveryItemRow(ok, {
    requestId: 'DR-1', sortOrder: 1, scentId: 'SCT-9',
    ackAt: '2026-08-01', user: { id: 'u-rd', name: 'สมชาย' },
  });
  assert.equal(rowStage(row), 'ready');
  assert.equal(row.ackAt, '2026-08-01', 'ยกวันรับเรื่องของใบมาเป็นค่าตั้งต้น');
  assert.equal(row.readyAt, '2026-08-05');
  assert.equal(row.lineKind, 'scent_dev');
  assert.equal(row.label, 'Forest night A', 'snapshot ป้ายชื่อ ณ ตอนส่ง');
  assert.equal(row.producedScentId, 'SCT-9');
  // ⚠️ ห้ามใส่ scentId ด้วย — 0204 นิยามว่ามันคือ "กลิ่นที่อ้างถึง" ของ product_dev
  // ส่วนสายพัฒนากลิ่น กลิ่นคือผลลัพธ์ · ใส่สองช่อง = แหล่งความจริงสองที่
  assert.equal('scentId' in row, false);
});

test('ใบที่ยังไม่เคยรับเรื่อง — ถอยไปใช้วันที่ส่งเป็นวันรับเรื่อง', () => {
  const row = deliveryItemRow(ok, { requestId: 'DR-1', sortOrder: 1, scentId: 'SCT-9', ackAt: null });
  assert.equal(row.ackAt, '2026-08-05');
  assert.equal(rowStage(row), 'ready');
});

// ── RD ส่งของของ "พัฒนาผลิตภัณฑ์" (P4b) ───────────────────────────────────
//
// ⭐ ต่างจากพัฒนากลิ่นตรงที่ **แถวมีอยู่แล้ว** — SA สร้างไว้ตอนเปิดใบ
// ⇒ เป็นการขยายก้าว `ready` ไม่ใช่สร้างแถวใหม่
test('ส่งสูตร: ชื่อกับรหัสบังคับ วันที่ไม่บังคับ', () => {
  assert.match(normalizeFormulaDelivery({}).error, /ชื่อสูตร/);
  assert.match(normalizeFormulaDelivery({ formulaName: 'Well sleep #2' }).error, /รหัสสูตร/);
  const okDelivery = { formulaName: 'Well sleep #2', formulaCode: 'PF-1' };
  assert.equal(normalizeFormulaDelivery(okDelivery).error, null);
  assert.equal(normalizeFormulaDelivery(okDelivery).value.formulaDate, null);
  assert.match(normalizeFormulaDelivery({ ...okDelivery, formulaDate: '05/08/2026' }).error, /วันที่/);
});

test('⚠️ ไม่รับหมวดกับกลิ่น — สองอย่างนั้นอยู่บนแถวและเป็นตัวตนของสูตรพอดี', () => {
  // ถามซ้ำเมื่อไร ผู้ใช้จะกรอกให้ต่างจากที่ขอไว้ได้ แล้วสูตรที่เกิดจะไม่ตรงกับแถวที่สั่ง
  const { value } = normalizeFormulaDelivery({
    formulaName: 'A', formulaCode: 'PF-1', categoryCode: '99-999', scentId: 'SCT-อื่น',
  });
  assert.equal('categoryCode' in value, false);
  assert.equal('scentId' in value, false);
});

// ── ชั้นกลาง: direction ตอบบรีฟก้อนไหน (mig 0213) ──────────────────────
test('⭐ มีบรีฟก้อนเดียว = เลือกให้เลย ไม่ต้องถาม', () => {
  // ช่องที่มีตัวเลือกเดียวแต่ยังบังคับให้กด คือขั้นตอนที่ไม่ได้ตัดสินใจอะไร
  const { rows, error } = normalizeDeliveryRows(
    [{ name: 'Amber Woods', code: 'SC-2611' }],
    { briefs: [{ id: 'B1' }] },
  );
  assert.equal(error, null);
  assert.equal(rows[0].briefId, 'B1');
});

test('หลายบรีฟต้องเลือกเอง · ตอบก้อนเดิมซ้ำได้ (1 บรีฟ : หลาย direction)', () => {
  const briefs = [{ id: 'B1' }, { id: 'B2' }];
  assert.match(
    normalizeDeliveryRows([{ name: 'A', code: 'SC-1' }], { briefs }).error,
    /ตอบบรีฟก้อนไหน/,
  );
  const two = normalizeDeliveryRows(
    [{ name: 'A', code: 'SC-1', briefId: 'B1' }, { name: 'B', code: 'SC-2', briefId: 'B1' }],
    { briefs },
  );
  assert.equal(two.error, null);
  assert.deepEqual(two.rows.map((r) => r.briefId), ['B1', 'B1']);
});

test('⚠️ บรีฟของใบอื่นต้องไม่ผ่าน — ไม่งั้นยิงตรงแล้วผูกข้ามลูกค้าได้', () => {
  assert.match(
    normalizeDeliveryRows([{ name: 'A', code: 'SC-1', briefId: 'B9' }], {
      briefs: [{ id: 'B1' }],
    }).error,
    /ไม่ได้อยู่ในคำร้องใบนี้/,
  );
});

test('ใบเก่าที่ยังไม่มีบรีฟยังส่งได้ — briefs ว่างแปลว่าไม่บังคับ', () => {
  const { rows, error } = normalizeDeliveryRows([{ name: 'A', code: 'SC-1' }], {});
  assert.equal(error, null);
  assert.equal(rows[0].briefId, null);
});
