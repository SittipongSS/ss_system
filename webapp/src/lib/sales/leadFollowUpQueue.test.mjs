// ── ขั้นติดตามในสรุปคิว + นับถอยหลังก่อนส่งกลับ (ข้อ 4 ของแผนปิดช่องว่าง UI) ──
//
// 🔴 ปัญหาที่แก้: `contacted` เป็นขั้นที่ลีดค้างมากที่สุดในระบบจริง (prod 2026-08-25:
// 106 ใบ เทียบกับ assigned 9 ใบ) แต่ไม่เคยอยู่ในสรุปคิวเลย — ทั้งการ์ดหน้าจอและ
// การ์ดสรุปเช้านับแค่ 3 ขั้นแรก ⇒ ขั้นที่แย่ที่สุดคือขั้นที่มองไม่เห็น
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leadQueueNotice, summarizeLeadQueue } from './leadDigest.js';
import { autoBounceCountdown, AUTO_BOUNCE_AFTER_BUSINESS_DAYS } from './leadAutoBounce.js';

const AS_OF = '2026-08-25T04:00:00Z';   // 25 ส.ค. 2569 เวลาไทยช่วงเช้า
const opts = { asOf: AS_OF, holidays: new Set() };
const lead = (over = {}) => ({ id: 'L1', status: 'contacted', assigneeId: 'ae-1', assigneeName: 'ก', ...over });

test('แยกใบที่ถึงกำหนดวันนี้ ออกจากใบที่เลยกำหนด', () => {
  const s = summarizeLeadQueue([
    lead({ id: 'a', followUpAt: '2026-08-25T00:00:00Z' }),
    lead({ id: 'b', followUpAt: '2026-08-20T00:00:00Z' }),
    lead({ id: 'c', followUpAt: '2026-08-28T00:00:00Z' }),
  ], opts);
  assert.equal(s.followUp.count, 3);
  assert.equal(s.followUp.dueToday, 1);
  assert.equal(s.followUp.late.count, 1);
});

/* 🔴 ใบก่อน mig 0289 ไม่มี followUpAt ⇒ ไม่มีนาฬิกาจับ ตีกลับอัตโนมัติก็ข้าม
   ถ้าไม่นับแยก หน้าจอจะขึ้น "เลยวันติดตาม 0" ทั้งที่มีใบรออยู่ร้อยกว่าใบ */
test('ใบที่ไม่มีวันติดตามนับแยก ไม่ปนกับใบที่เลยกำหนด', () => {
  const s = summarizeLeadQueue([
    lead({ id: 'a', followUpAt: null }),
    lead({ id: 'b', followUpAt: null }),
    lead({ id: 'c', followUpAt: '2026-08-20T00:00:00Z' }),
  ], opts);
  assert.equal(s.followUp.noPlan, 2);
  assert.equal(s.followUp.late.count, 1);
  assert.equal(s.followUp.dueToday, 0);
});

test('ขั้นติดตามนับรวมใน total ด้วย ไม่งั้นการ์ดหายทั้งที่มีของค้าง', () => {
  const s = summarizeLeadQueue([lead({ followUpAt: '2026-08-20T00:00:00Z' })], opts);
  assert.equal(s.total, 1);
});

test('ใบที่เลยกำหนดจัดกลุ่มตามเจ้าของ เรียงค้างนานสุดก่อน', () => {
  const s = summarizeLeadQueue([
    lead({ id: 'a', assigneeId: 'ae-1', followUpAt: '2026-08-24T00:00:00Z' }),
    lead({ id: 'b', assigneeId: 'ae-2', assigneeName: 'ข', followUpAt: '2026-08-17T00:00:00Z' }),
    lead({ id: 'c', assigneeId: 'ae-2', assigneeName: 'ข', followUpAt: '2026-08-20T00:00:00Z' }),
  ], opts);
  assert.equal(s.followUp.late.owners[0].key, 'ae-2');
  assert.equal(s.followUp.late.owners[0].count, 2);
});

/* 🪤 ไม่ส่งธง = ไม่มีคีย์ ไม่ใช่ 0 — ผู้เรียกที่ไม่ได้แนบบริบทจะได้ตัวเลขที่อ่านว่า
   "ไม่มีใบไหนถูกส่งกลับเลย" ทั้งที่แปลว่า "ไม่ได้ถาม" */
test('ตัวเลขใบส่งกลับขึ้นเฉพาะเมื่อผู้เรียกยืนยันว่าแนบบริบทมาแล้ว', () => {
  const rows = [
    { id: 'x', status: 'new', bounce: { autoRounds: 1 } },
    { id: 'y', status: 'screened', bounce: { autoRounds: 2 } },
    { id: 'z', status: 'new' },
  ];
  assert.equal(summarizeLeadQueue(rows, opts).autoBounced, undefined);
  const s = summarizeLeadQueue(rows, { ...opts, withBounceContext: true });
  assert.deepEqual(s.autoBounced, { screen: 1, spread: 1 });
});

/* ⚠️ ต้องกลับสมการของ planAutoBounce เป๊ะ (`days > N` ⇒ ตีกลับ)
   เลื่อนไปวันเดียว = จอนับถอยหลังคนละวันกับที่ระบบลงมือ ซึ่งแย่กว่าไม่นับให้ดูเลย */
test('นับถอยหลังตรงกับเกณฑ์ตีกลับจริง', () => {
  const N = AUTO_BOUNCE_AFTER_BUSINESS_DAYS;
  assert.equal(autoBounceCountdown(0), N + 1);
  assert.equal(autoBounceCountdown(N), 1);        // ตรงเกณฑ์พอดี = ยังไม่ตีกลับ
  assert.equal(autoBounceCountdown(N + 1), 0);    // เกินแล้ว = เข้าเกณฑ์
  assert.equal(autoBounceCountdown(N + 9), 0);    // ไม่ติดลบ
  assert.equal(autoBounceCountdown(null), null);  // ไม่มีนาฬิกา = ไม่มีตัวเลข
});

/* ── แถบเตือนบนหัวคิว ────────────────────────────────────────────────────── */

test('แถบเตือน: เลยวันนัดมาก่อน เพราะมีนาฬิกาตีกลับเดินอยู่', () => {
  const s = summarizeLeadQueue([
    lead({ id: 'a', followUpAt: '2026-08-20T00:00:00Z' }),   // เลยแล้ว
    lead({ id: 'b', followUpAt: null }),                       // ไม่มีนาฬิกา
  ], opts);
  assert.deepEqual(leadQueueNotice(s), { kind: 'late', count: 1, tone: 'danger' });
});

test('แถบเตือน: ไม่มีใบเลยกำหนด แต่มีใบที่ไม่มีวันติดตาม ต้องยังเตือน', () => {
  const s = summarizeLeadQueue([lead({ followUpAt: null }), lead({ id: 'b', followUpAt: null })], opts);
  assert.deepEqual(leadQueueNotice(s), { kind: 'noPlan', count: 2, tone: 'warning' });
});

/* 🪤 ไม่มีอะไรต้องบอก = **ไม่มีแถบ** ไม่ใช่แถบเขียวว่า "เรียบร้อย" — พื้นที่หัวคิว
   แพงเกินกว่าจะใช้บอกว่าไม่มีอะไร (กติกาเดียวกับที่การ์ดสรุปหายไปตอนคิวว่าง) */
test('แถบเตือน: ทุกใบมีวันติดตามและยังไม่เลย = ไม่มีแถบ', () => {
  const s = summarizeLeadQueue([
    lead({ followUpAt: '2026-08-25T00:00:00Z' }),
    lead({ id: 'b', followUpAt: '2026-08-28T00:00:00Z' }),
  ], opts);
  assert.equal(leadQueueNotice(s), null);
  assert.equal(leadQueueNotice(null), null);
  assert.equal(leadQueueNotice({}), null);
});
