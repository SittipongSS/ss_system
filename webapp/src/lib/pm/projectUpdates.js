// ── เหตุการณ์ระบบของเธรดโครงการ (entity 'project') — ตรรกะล้วน ────────────
//
// ⭐ เธรดโครงการเป็น "เส้นเรื่อง" ของงานหนึ่งงาน: เปิดอ่านย้อนหลังแล้วต้องรู้ว่า
// เกิดอะไรขึ้นบ้าง โดยไม่ต้องไล่เปิด audit log · ไฟล์นี้ตัดสินแค่ว่า **เหตุการณ์ไหน
// ควรถูกบันทึก และเขียนว่าอย่างไร** ส่วน I/O อยู่ที่ lib/master/updates.js
//
// ⚠️ **เลือกให้พอดี ไม่ใช่ยัดทุกอย่าง** — เธรดงานส่วนบุคคลเป็นตัวอย่างของการยัดเกิน:
// 92% ของแถวเป็นเหตุการณ์ระบบ และ 305 จาก 338 งานไม่มีบทสนทนามนุษย์เลยสักคำ
// ที่นี่จึงเอาเฉพาะเหตุการณ์ที่ **เปลี่ยนทิศทางของโครงการ**:
//   · ผูก/ถอดดีล        — องค์ประกอบของโครงการเปลี่ยน (เส้นเรื่องเป็นรูถ้าไม่บันทึก)
//   · ของเข้าครบทุกชิ้น  — ปลดล็อกการผลิต (ไม่ใช่ทุกครั้งที่ติ๊กรับของรายชิ้น)
//   · ขั้นตอน milestone  — หมุดหมายที่แม่แบบตั้งใจให้เป็นหมุด (ไม่ใช่ทุกขั้นที่เสร็จ)
//   · ปิด/เปิดโครงการ    — จุดจบและจุดกลับมาของเส้นเรื่อง
//
// ทุกฟังก์ชันคืน `{ kind, body, meta }` หรือ **null** เมื่อไม่มีอะไรต้องเล่า —
// ผู้เรียกเช็ค null เองแล้วค่อย appendUpdate (แพตเทิร์นเดียวกับ documentUpdates.js)
import { PROJECT_CLOSE_TYPE_LABELS } from '@/lib/pm/projectClose';

// ป้ายของชนิดเหล่านี้ประกาศไว้ที่ทะเบียนกลาง (lib/master/updateTypes.js) —
// ที่นี่เขียนแค่ "เนื้อความ" ที่คนอ่านเห็น
export const PROJECT_UPDATE_KINDS = ['deal_link', 'deal_unlink', 'delivery', 'milestone', 'close'];

const dealLabel = (deal) => {
  const code = String(deal?.code || '').trim();
  const title = String(deal?.title || '').trim();
  return [code, title].filter(Boolean).join(' · ') || String(deal?.id || 'ดีล');
};

// ── ผูกดีลเข้าโครงการ ────────────────────────────────────────────────────
// `how`: 'link' = เอาดีลที่มีอยู่มาผูก · 'create' = สร้างโครงการจากดีลใบนั้น
export function dealLinkedUpdate(deal, { how = 'link' } = {}) {
  if (!deal) return null;
  const verb = how === 'create' ? 'สร้างโครงการจากดีล' : 'ผูกดีลเข้าโครงการ';
  return {
    kind: 'deal_link',
    body: `${verb}: ${dealLabel(deal)}`,
    meta: { dealId: deal.id || null, how },
  };
}

// ── ดีลหลุดออกจากโครงการ ─────────────────────────────────────────────────
// ⚠️ ต้องบันทึก ไม่งั้นเส้นเรื่องเป็นรู: ความเคลื่อนไหวของดีลใบนั้นที่เคยไหลเข้ามา
// แสดงบนหน้าโครงการจะหายไปทั้งชุดพร้อมกัน โดยไม่มีอะไรอธิบายว่าทำไม
export function dealUnlinkedUpdate(deal, { reason = 'ลบดีล' } = {}) {
  if (!deal) return null;
  return {
    kind: 'deal_unlink',
    body: `ดีลหลุดจากโครงการ (${reason}): ${dealLabel(deal)}`,
    meta: { dealId: deal.id || null, reason },
  };
}

// ── ของเข้า PM/RM ────────────────────────────────────────────────────────
// บันทึกเฉพาะจังหวะที่ "ของมาครบทุกรายการ" เท่านั้น — ติ๊กรับของรายชิ้นเป็นงานประจำ
// วันของ PC ซึ่งถ้าลงเธรดทุกครั้งจะกลบบทสนทนาจนหมด · จังหวะที่ระดับโครงการสนใจคือ
// **ปลดล็อกการผลิต** ซึ่งเกิดครั้งเดียว
//
// `before`/`after` = รายการของเข้าทั้งชุดก่อน/หลังแก้ (คนละแถวกันได้ เช่นเพิ่มของใหม่)
export function deliveriesCompletedUpdate(before = [], after = []) {
  const done = (rows) => rows.length > 0 && rows.every((row) => row?.arrivedAt);
  if (!after.length || done(before) || !done(after)) return null;
  const last = after
    .map((row) => String(row.arrivedAt || ''))
    .sort()
    .at(-1) || null;
  return {
    kind: 'delivery',
    body: `ของเข้าครบทุกรายการแล้ว (${after.length} รายการ)`,
    meta: { count: after.length, lastArrivedAt: last },
  };
}

// ── ขั้นตอนไทม์ไลน์ที่เป็นหมุดหมาย ───────────────────────────────────────
// ⚠️ เฉพาะขั้นที่ติดธง `isMilestone` — โครงการหนึ่งมี 20–40 ขั้น ถ้าเอาทุกขั้นที่
// เปลี่ยนสถานะ เธรดจะกลายเป็น log ของระบบงาน ไม่ใช่เส้นเรื่องของโครงการอีกต่อไป
export function milestoneDoneUpdate(before, after) {
  if (!after?.isMilestone) return null;
  if (after.status !== 'Completed' || before?.status === 'Completed') return null;
  const name = String(after.name || '').trim() || 'ขั้นตอน';
  const when = after.actualFinishDate || after.finishDate || null;
  return {
    kind: 'milestone',
    body: `ผ่านหมุดหมาย: ${name}${when ? ` (เสร็จ ${when})` : ''}`,
    meta: { taskId: after.id || null, phase: after.phase || null, finishedAt: when },
  };
}

// ── ปิด / เปิดโครงการ ────────────────────────────────────────────────────
// คำต้องตรงกับปุ่มบนหน้าจอ (PROJECT_CLOSE_STATUS_LABELS) — ผู้ใช้ต้องอ่านเธรดแล้ว
// เห็นคำเดียวกับที่ตัวเองกด ไม่ใช่ศัพท์ของ enum
const CLOSE_TEXT = {
  request: (type) => `ขอปิดโครงการ (${PROJECT_CLOSE_TYPE_LABELS[type] || type || 'ไม่ระบุประเภท'})`,
  cancel_request: () => 'ถอนคำขอปิดโครงการ',
  approve: (type) => `ปิดโครงการแล้ว (${PROJECT_CLOSE_TYPE_LABELS[type] || type || 'ไม่ระบุประเภท'})`,
  reject: () => 'ตีกลับคำขอปิดโครงการ',
  reopen: () => 'เปิดโครงการใหม่',
};

export function projectCloseUpdate(action, { closeType = null, reason = '' } = {}) {
  const text = CLOSE_TEXT[action];
  if (!text) return null;
  // ⚠️ เหตุผลต้องอยู่ใน**ข้อความที่คนอ่านเห็น** ไม่ใช่ซ่อนใน meta — บทเรียนจาก QT/SO
  // ที่เหตุผลการตีกลับลงคอลัมน์เดียวแล้วถูกเขียนทับรอบถัดไป ไม่มีใครได้อ่าน
  const note = String(reason || '').trim();
  return {
    kind: 'close',
    body: `${text(closeType)}${note ? ` — ${note}` : ''}`,
    meta: { action, closeType: closeType || null, reason: note || null },
  };
}
