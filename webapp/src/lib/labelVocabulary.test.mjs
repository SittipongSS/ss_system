// ── คำบนป้ายทั้งระบบ — ล็อกไว้หลังรอบไล่ความยาว (มติผู้ใช้ 2026-08-08) ────
//
// ⭐ ป้ายในคอลัมน์เดียวกันต้องกว้างใกล้กัน ไม่ใช่ "เล็กบ้างใหญ่บ้าง" — วัดจริงบน
// dev server แล้วย่อคำที่ยาวผิดพวก 9 คำ · ตัวเลขความกว้างทั้งชุดอยู่ใน
// `UI_DESIGN_SYSTEM.md` §ป้ายในตาราง
//
// ⚠️ **เทสต์นี้ล็อก "คำ" ไม่ใช่ "ความกว้าง"** — ความกว้างวัดในเบราว์เซอร์เท่านั้น
// (ฟอนต์ไทยคำนวณจากจำนวนอักขระไม่ได้) · ที่ล็อกได้คือคำที่วัดไปแล้ว ถ้ามีคนเปลี่ยน
// คำ เทสต์ดับ = ต้องกลับไปวัดใหม่ ไม่ใช่เดาว่า "ยาวขึ้นนิดเดียว"
//
// 🪤 กฎ 3 ข้อที่หลุดมาแล้วจริง และเทสต์นี้กันไว้:
//   1 ป้ายเล่า "ขั้นที่ผ่านมาแล้ว" แทนสภาพตอนนี้ ("ส่งแล้ว — รอรับเรื่อง")
//   2 ป้ายพูดซ้ำกับคอลัมน์ข้าง ๆ (ต่อ "3 รายการ" ทั้งที่มีคอลัมน์คืบหน้า)
//   3 ชุดป้ายเดียวกันถูกก๊อปไปประกาศซ้ำอีกไฟล์ แล้วเพี้ยนหากันเงียบ ๆ
import test from 'node:test';
import assert from 'node:assert/strict';
import { REQUEST_STATUS_LABELS } from './requests/statuses.js';
import { ROW_STAGE_LABELS, nextStepForRow } from './requests/rowStage.js';
import { requestNextStep } from './requests/queueBoard.js';
import { SCENT_STATUS_LABELS } from './master/scents.js';
import { FORMULA_STATUS_LABELS } from './master/formulas.js';

test('⭐ A · สถานะคำร้อง — ป้ายบอกสภาพตอนนี้ ไม่ใช่ขั้นที่ผ่านมาแล้ว', () => {
  assert.deepEqual(REQUEST_STATUS_LABELS, {
    draft: 'ร่าง',
    pending: 'รอรับเรื่อง',            // เดิม "ส่งแล้ว — รอรับเรื่อง" 120px
    acknowledged: 'กำลังดำเนินการ',     // เดิม "รับเรื่องแล้ว — กำลังดำเนินการ" 170px
    answered: 'ตอบแล้ว',
    closed: 'ปิดเรื่อง',
    cancelled: 'ยกเลิก',
  });
  // ⚠️ "ส่งแล้ว" / "รับเรื่องแล้ว" คือขั้นก่อนหน้า ซึ่งรางก้าวบนหัวใบเล่าอยู่แล้ว
  for (const label of Object.values(REQUEST_STATUS_LABELS)) {
    assert.ok(!label.includes('—'), `ป้ายสถานะไม่ควรมีสองท่อน: "${label}"`);
  }
});

test('⭐ B · ขั้นของแถว — ตัดคำที่บอกขั้นก่อนหน้าออก', () => {
  assert.deepEqual(ROW_STAGE_LABELS, {
    awaiting_ack: 'รอรับเรื่อง',
    developing: 'กำลังทำ',
    ready: 'รอไปรับ',              // เดิม "เสร็จแล้ว รอไปรับ" 106px
    picked_up: 'รับของแล้ว',
    sent: 'ส่งลูกค้าแล้ว',          // เดิม "ส่งให้ลูกค้าแล้ว" 94px
    revised: 'ลูกค้าขอให้แก้',
    awaiting_price: 'รอใส่ราคา',
    // รอบไล่คำ 2026-08-15 — "เสร็จ" ขัดกับป้ายบรรทัดที่เขียน "เสร็จแล้ว" ·
    // "ไม่ได้ใช้" เปลี่ยนเป็น "ไม่ถูกเลือก" (แถวจบเพราะลูกค้าเลือกตัวอื่น)
    done: 'เสร็จแล้ว',
    declined: 'ไม่ถูกเลือก',
  });
});

test('⭐ C · ปุ่มก้าวถัดไปต้องไม่ยาวกว่าป้ายของขั้นเดียวกัน', () => {
  // ขั้น `sent` เคยเป็นตัวเดียวในชุดที่ปุ่ม (114px) ยาวกว่าป้าย (94px) ⇒ อ่านผิดจังหวะ
  const stepOf = (row) => nextStepForRow(row, { dept: 'RD' }, { role: 'ae' })?.label;
  assert.equal(stepOf({ sentAt: '2026-08-08' }), 'บันทึกคำตอบ');
  assert.equal(stepOf({}), 'รับเรื่อง');
  // "ส่งงาน" คำเดียวทุกสาย (2026-08-15) — เดิมสายพัฒนา "ส่งของ" สายเอกสาร "ส่งเอกสาร"
  assert.equal(stepOf({ ackAt: '2026-08-08' }), 'ส่งงาน');
  assert.equal(stepOf({ ackAt: '2026-08-08', lineKind: 'document' }), 'ส่งงาน');
  assert.equal(stepOf({ readyAt: '2026-08-08' }), 'รับของ');
  assert.equal(stepOf({ pickedUpAt: '2026-08-08' }), 'ส่งให้ลูกค้า');
  assert.equal(stepOf({ outcome: 'confirmed' }), 'ใส่ราคา');
});

test('⭐ D · ก้าวถัดไปของใบ — ห้ามต่อจำนวนท้ายป้าย', () => {
  const next = (request) => requestNextStep(request)?.label;
  assert.equal(next({ status: 'draft' }), 'ยังไม่ได้ส่ง');
  assert.equal(next({ status: 'pending', items: [] }), 'รอรับเรื่อง');
  /* ⚠️ ใบที่รับเรื่องแล้วต้องมี `committedDueDate` ในกรณีทดสอบพวกนี้ (มติผู้ใช้
     2026-08-19) — ใบที่ยังไม่แจ้งวันมีป้ายของตัวเองคือ "รอกำหนดส่ง" ซึ่งทับป้ายงาน
     ทุกป้ายที่เป็นตาของฝ่าย (ทดสอบไว้ท้ายเทสต์นี้)
     ⚠️ **ป้ายพูดชื่อฝ่ายจริงแล้ว** (มติผู้ใช้ 2026-08-20: *"ฝ่ายคืออะไร ไม่สวยเลย"*)
     ⇒ ใบตัวอย่างต้องมี `dept`/`kind` ครบเหมือนของจริง · `scent_dev` = หัวข้อที่ฝ่าย
     สร้างแถวเองตอนส่งงาน (ไม่ใช่เธรดล้วน) จึงยังเดินป้ายชุด "เริ่ม/ทำต่อ" ตามเดิม */
  const acked = {
    status: 'acknowledged', kind: 'scent_dev', dept: 'RD', requesterDept: 'SA',
    committedDueDate: '2026-08-25',
  };
  assert.equal(next({ ...acked, items: [] }), 'รอ RD เริ่ม');
  assert.equal(next({ ...acked, items: [{}] }), 'รอ RD ทำต่อ');
  assert.equal(next({ ...acked, items: [{ readyAt: '2026-08-08' }] }), 'รอ SA ทำต่อ');
  assert.equal(next({ ...acked, items: [{ answerStatus: 'done' }] }), 'รอปิดเรื่อง');
  // ⚠️ ใบเก่าที่ไม่มี `requesterDept` ยังต้องอ่านออก — ถอยไปใช้คำว่า "ผู้ขอ" (ไม่เว้นวรรค)
  assert.equal(
    next({ ...acked, requesterDept: null, items: [{ readyAt: '2026-08-08' }] }),
    'รอผู้ขอทำต่อ',
  );

  /* ⭐ **หัวข้อเธรดล้วน (สอบถามข้อมูล) — ป้ายพลิกตามคนโพสต์ล่าสุด** (มติผู้ใช้
     2026-08-20) · ยังไม่มีใครพิมพ์ = ตาฝ่าย เพราะคำถามอยู่ในใบตั้งแต่เปิดแล้ว */
  const asked = { ...acked, kind: 'info', items: [] };
  assert.equal(next(asked), 'รอ RD ตอบ');
  assert.equal(next({ ...asked, lastReplySide: 'requester' }), 'รอ RD ตอบ');
  assert.equal(next({ ...asked, lastReplySide: 'dept' }), 'รอ SA ตอบ');

  // ⭐ รับเรื่องแล้วยังไม่แจ้งวัน = ก้าวที่ค้างอยู่จริงของฝ่าย — ทับป้ายงานของฝ่าย
  assert.equal(next({ ...acked, committedDueDate: null, items: [] }), 'รอกำหนดส่ง');
  assert.equal(next({ ...acked, committedDueDate: null, items: [{}] }), 'รอกำหนดส่ง');
  // ⚠️ แต่ห้ามทับก้าวของ **ผู้ขอ** — ใบที่ฝ่ายส่งครบแล้วรอผู้ขอปิด ไม่ได้ค้างที่ฝ่าย
  assert.equal(
    next({ ...acked, committedDueDate: null, items: [{ answerStatus: 'done' }] }),
    'รอปิดเรื่อง',
  );
  // ⚠️ คิวมีคอลัมน์ "คืบหน้า" ที่บอก `2 / 3` อยู่แล้ว — ป้ายที่ต่อจำนวนคือพูดซ้ำ
  // และกินไป 50px · ป้ายตอบว่า "ใครค้าง" ตัวเลขตอบว่า "ค้างเท่าไร" คนละคำถาม
  for (const items of [[{}], [{ readyAt: '2026-08-08' }]]) {
    const label = next({ status: 'acknowledged', items });
    assert.ok(!/\d/.test(label), `ป้ายก้าวถัดไปห้ามมีตัวเลข: "${label}"`);
  }
});

test('⭐ E · สถานะกลิ่นกับสถานะสูตรต้องสะกดตรงกันทุกตัว', () => {
  // สองจอที่ RD สลับไปมาทั้งวัน — คำต่างกันเมื่อไรคนจะคิดว่าสถานะคนละความหมาย
  assert.deepEqual(SCENT_STATUS_LABELS, FORMULA_STATUS_LABELS);
  assert.equal(SCENT_STATUS_LABELS.draft, 'รอเข้าทะเบียน'); // เดิม 156px = 2× ตัวถัดไป
});

test('⭐ ชุดป้ายขั้นต้องมีแหล่งเดียว — ห้ามก๊อปไปประกาศซ้ำ', async () => {
  // 🐞 `hops.js` เคยประกาศ ROW_STAGE_TEXT ของตัวเองแล้วคอมเมนต์ว่า "คนละชุดกับป้าย
  // บนจอ" ทั้งที่สะกดตรงกันเป๊ะทั้ง 9 ค่า ⇒ แก้ที่เดียวแล้วอีกที่พูดคำเก่า
  const { readFileSync } = await import('node:fs');
  const src = readFileSync('src/lib/requests/hops.js', 'utf8');
  assert.match(src, /ROW_STAGE_TEXT = ROW_STAGE_LABELS/,
    'hops.js ต้องอ้าง ROW_STAGE_LABELS ไม่ใช่ประกาศชุดของตัวเอง');
});
