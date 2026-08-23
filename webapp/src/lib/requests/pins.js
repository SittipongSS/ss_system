// ── หมุดไทม์ไลน์ (มติ 3 + 6 ของ cross-department-requests-plan) ─────────────
// คำร้องบางหัวข้อไม่ใช่งานลอย ๆ แต่เป็น "วิธีทำ" ของขั้นตอนที่มีอยู่แล้วในไทม์ไลน์:
// บรีฟกลิ่น = ขั้นออกแบบกลิ่น · ขอ mockup = ขั้นขึ้น Mock-up · ขอราคา PM = ขั้นหา
// บรรจุภัณฑ์ · ติดตามของเข้า = ขั้นสั่งซื้อสารและบรรจุภัณฑ์ · หัวข้อพวกนี้จึงแปะหมุด
// กลับไปที่ task เดิม ไม่สร้าง task ใหม่ซ้อน
//
// ⚠️ จับคู่ด้วย `stepKey` ไม่ใช่ `projectTaskId` — `mergeTemplateTasks` ลบ/สร้าง task
// ใหม่ตอน resync แม่แบบ ผูก id ตรง ๆ แล้วหมุดหลุดเงียบ (ดู lib/pm/schedule.js)
import { REQUEST_OPEN_STATUSES } from '@/lib/requests/statuses';

// คืน Map(stepKey → คำร้อง[]) · เรียงเรื่องที่ยังค้างขึ้นก่อนเสมอ เพราะหมุดมีไว้
// เตือนว่า "ขั้นนี้มีเรื่องรออยู่" ไม่ใช่ไว้ดูประวัติ
//
// ⚠️ **ไม่กรองที่นี่แล้ว** (2026-08-24) — ของเดิมกรองด้วย `projectId` ซึ่งเป็นคีย์ผิด:
// โครงการหนึ่งมีหลายดีล และทุก segment มี `stepKey` ชุดเดียวกัน ⇒ คำร้องของดีลหนึ่ง
// ไปโผล่บนขั้นเดียวกันของดีลพี่น้องด้วย (prod มีโครงการที่มีดีล SCENT 2 ใบ)
// การจับคู่ที่ถูกคือ **ดีลของ task** ซึ่งรู้ได้ตอนอ่านเท่านั้น ⇒ ไปกรองที่ `stepPinSummary`
export function requestsByStepKey(requests = []) {
  const byStep = new Map();
  for (const r of requests) {
    if (!r?.stepKey) continue;
    // คำร้องร่างยังไม่ถูกส่ง = ยังไม่ใช่งานของใคร ไม่ควรโผล่บนไทม์ไลน์ของทีม
    if (r.status === 'draft') continue;
    const list = byStep.get(r.stepKey) || [];
    list.push(r);
    byStep.set(r.stepKey, list);
  }
  for (const list of byStep.values()) {
    list.sort((a, b) => {
      const open = (r) => (REQUEST_OPEN_STATUSES.includes(r.status) ? 0 : 1);
      if (open(a) !== open(b)) return open(a) - open(b);
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });
  }
  return byStep;
}

// สรุปหมุดของขั้นเดียว → { total, open, first } หรือ null ถ้าไม่มีอะไรผูกอยู่
// UI ใช้ `open` ตัดสินสี: มีเรื่องค้าง = เตือน, ปิดครบแล้ว = เงียบ ๆ
//
// `taskDealId` = ดีลของขั้นที่กำลังวาด (task ติดป้าย `dealId` ตั้งแต่ mig 0090):
//   · คำร้องมีดีล + ขั้นมีดีล → ต้องเป็นดีลเดียวกัน (กันหมุดข้าม segment)
//   · คำร้อง **ไม่มีดีล** (หัวข้อของกลางอย่างติดตามของเข้า) → ขึ้นทุกขั้นเหมือนเดิม
//   · ขั้นไม่มีดีล (task กลางของโครงการ) → ไม่รับหมุดที่เป็นของดีลใดดีลหนึ่ง
export function stepPinSummary(byStep, stepKey, taskDealId = null) {
  const all = stepKey ? byStep?.get(stepKey) : null;
  const list = (all || []).filter((r) => !r.dealId || r.dealId === taskDealId);
  if (!list.length) return null;
  const open = list.filter((r) => REQUEST_OPEN_STATUSES.includes(r.status)).length;
  return { total: list.length, open, first: list[0] };
}
