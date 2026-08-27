// ── ด่านเข้าไซต์ (mig 0302) — ตัวตัดสินเดียวของทั้งระบบ ──────────────────
//
// ⭐ **มติผู้ใช้ 2026-08-28**: *"TS จะไม่สามารถสร้างการเข้าบริการได้เอง จนกว่าจะผ่านด่าน"*
//   นัดเกิดจากรอบบริการของไซต์ หรือจากงานนอกรอบที่มีต้นเรื่อง — ทุกใบเกิดเป็น **ร่าง**
//   และไม่ขึ้นตาราง ไม่นับภาระ ไม่โผล่ในงานวันนี้ของช่าง จนผ่านด่าน
//
// ⭐ ที่มาของด่าน (docs/service-business-system-plan.md §0) — ตัวเลขจากชีตที่ทีมใช้จริง:
//   วันนี้บริษัทส่งช่างไปที่ที่หมดสัญญา **25 จุด** *และ* ไม่ได้ไปที่ที่จ่ายเงินแล้ว
//   **102 จุด** พร้อมกัน เพราะตารางช่างกับทะเบียนสัญญาไม่มีอะไรเชื่อมกันเลย
//   ⇒ "ไม่จ่ายห้ามออกไปให้บริการ" ต้องเป็น**ด่านในระบบ ไม่ใช่วินัยของคน**
//
// ⚠️ **ไม่เก็บผลการตรวจลง DB** — คำนวณสดเสมอจากข้อมูลจริง (กติกาเดียวกับ
//    serviceStatus ที่ห้ามเก็บ) · ที่เก็บคือร่องรอยการตัดสินใจของคนเท่านั้น
//
// ⚠️ **ตัวเดียวกับที่ server ใช้ปฏิเสธจริง** — ปุ่มบนจอต้องอ่านจากที่นี่ ห้ามคิด
//    เงื่อนไขเองตรงจุดที่วางปุ่ม ไม่งั้นวันหนึ่งปุ่มกับด่านจะพูดคนละเรื่อง
//    (กติกาเดียวกับ `quotationDealBlocker` ที่ GatedAction เขียนไว้)
import { accessConflict } from './sites';

/* สถานะของแต่ละข้อ
   · ok      — ผ่าน
   · blocked — ไม่ผ่าน และแก้ได้ (บอกว่าใครแก้)
   · parked  — ระบบยังตรวจให้ไม่ได้ (เฟสสัญญายังไม่ทำ)
     ⚠️ **ต้องไม่ติ๊กผ่านเงียบ ๆ** — ด่านที่แกล้งผ่านคือด่านที่โกหกว่าตรวจแล้ว */
export const GATE_STATES = ['ok', 'blocked', 'parked'];

/* 🅿 เฟสสัญญา/งวดชำระยังไม่ทำ (รอต้นฉบับสัญญาจ้างบริการ — contractTemplates service:null)
   ตั้งเป็นค่าคงที่ไว้ตรงนี้ที่เดียว เพื่อให้วันที่ unpark แก้ไฟล์เดียวจบ */
export const CONTRACT_PHASE_READY = false;

export function evaluateVisitGate(visit, { site = null, contractPhaseReady = CONTRACT_PHASE_READY } = {}) {
  const items = [];

  // ── 1. สัญญายังมีผล ณ วันนัด ────────────────────────────────────────
  items.push(contractPhaseReady
    ? { key: 'contract', state: 'ok', owner: 'SA', label: 'ไซต์ผูกสัญญาที่ยังมีผล ณ วันนัด', detail: null }
    : {
      key: 'contract', state: 'parked', owner: 'SA',
      label: 'ไซต์ผูกสัญญาที่ยังมีผล ณ วันนัด',
      detail: 'รอระบบสัญญา — ยังไม่มีต้นฉบับสัญญาจ้างบริการในระบบ จึงยังตรวจให้ไม่ได้',
    });

  // ── 2. ไม่มีงวดเลยกำหนดที่บัญชียังไม่รับรอง ─────────────────────────
  items.push(contractPhaseReady
    ? { key: 'payment', state: 'ok', owner: 'SA → FN', label: 'ไม่มีงวดเลยกำหนดที่บัญชียังไม่รับรอง', detail: null }
    : {
      key: 'payment', state: 'parked', owner: 'SA → FN',
      label: 'ไม่มีงวดเลยกำหนดที่บัญชียังไม่รับรอง',
      detail: 'รอระบบสัญญา — “แจ้งแล้ว” ไม่ปลดด่าน ปลดเมื่อบัญชี “รับรองแล้ว” เท่านั้น',
    });

  // ── 3. มีช่างผู้รับผิดชอบ ───────────────────────────────────────────
  const hasAssignee = !!String(visit?.assigneeId ?? '').trim();
  items.push({
    key: 'assignee', state: hasAssignee ? 'ok' : 'blocked', owner: 'TS',
    label: 'มีช่างผู้รับผิดชอบ',
    detail: hasAssignee ? (visit.assigneeName || null) : 'ยังไม่มอบหมาย — เลือกช่างก่อนปล่อยเข้าคิว',
    fix: hasAssignee ? null : 'assignee',
  });

  // ── 4. วันนัดอยู่ในช่วงที่ไซต์ยอมให้เข้า ────────────────────────────
  const conflict = site ? accessConflict(site, {
    date: visit?.scheduledDate, startTime: visit?.startTime, endTime: visit?.endTime,
  }) : null;
  items.push({
    key: 'access', state: conflict ? 'blocked' : 'ok', owner: 'TS',
    label: 'วันนัดอยู่ในช่วงที่ไซต์ยอมให้เข้า',
    detail: conflict ? conflict.message : null,
    fix: conflict ? 'schedule' : null,
  });

  return items;
}

/* ผ่านด่านไหม — **`parked` ไม่บล็อก** เพราะระบบยังตรวจให้ไม่ได้ การบล็อกด้วยข้อที่
   ตัวเองยังทำไม่เสร็จ = หยุดงานทั้งบริษัทเพราะฟีเจอร์ของเรายังไม่พร้อม
   ⚠️ วันที่ unpark (`CONTRACT_PHASE_READY = true`) สองข้อนั้นจะเริ่มบล็อกจริงทันที
   โดยไม่ต้องแก้ตรรกะตรงนี้ */
export const gatePassed = (items = []) => !items.some((i) => i.state === 'blocked');

/* รายการเหตุที่ยังไม่ผ่าน — ใช้ตรงจุดที่บริบท "ยังเข้าคิวไม่ได้" ชัดอยู่แล้ว
   (แถวในคิวรอจัด) จะได้ไม่อ่านเป็น "ยังเข้าคิวไม่ได้ — ยังไม่มอบหมาย — เลือกช่าง…"
   ที่มีขีดคั่นซ้อนกันสามชั้น */
export const gateReasons = (items = []) =>
  items.filter((i) => i.state === 'blocked').map((i) => i.detail || i.label);

/* ข้อความบอกเหตุสำหรับปุ่มที่กดไม่ได้ (GatedAction) — ต้องบอก**ทุกข้อที่ขาดในครั้งเดียว**
   ไม่ใช่ทีละข้อให้แก้แล้วเจอข้อถัดไป (กฎฟอร์มของ repo) */
export function gateBlocker(items = []) {
  const reasons = gateReasons(items);
  if (!reasons.length) return '';
  return `ยังเข้าคิวไม่ได้ — ${reasons.join(' · ')}`;
}

export const gateSummary = (items = []) => ({
  ok: items.filter((i) => i.state === 'ok').length,
  blocked: items.filter((i) => i.state === 'blocked').length,
  parked: items.filter((i) => i.state === 'parked').length,
  total: items.length,
});

/* ⭐ สถานะตั้งต้นของนัดที่เพิ่งเกิด — **ไม่ใช่ `scheduled` เสมอไปอีกแล้ว**
   ผ่านด่านตั้งแต่แรก (รอบบริการที่มีช่างประจำและวันอยู่ในช่วงเข้าได้) ⇒ ขึ้นตารางเลย
   ไม่ต้องให้คนมากดปล่อยทีละใบ · ที่ไม่ผ่านจะจอดเป็นร่างรอคนจัดการ
   ⚠️ นี่คือจุดที่ทำให้กติกา "TS ไม่ใช่ต้นทางของงาน" ไม่กลายเป็นแรงเสียดทานรายวัน */
export function initialVisitStatus(visit, ctx = {}) {
  return gatePassed(evaluateVisitGate(visit, ctx)) ? 'scheduled' : 'draft';
}
