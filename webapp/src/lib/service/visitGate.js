// ── ด่านเข้าไซต์ (mig 0302) — ตัวตัดสินเดียวของทั้งระบบ ──────────────────
//
// ⭐ **มติผู้ใช้ 2026-08-28**: *"TS จะไม่สามารถสร้างการเข้าบริการได้เอง จนกว่าจะผ่านด่าน"*
//   นัดเกิดจากรอบบริการของไซต์ หรือจากงานนอกรอบที่มีต้นเรื่อง — ทุกใบเกิดเป็น **ร่าง**
//   และไม่ขึ้นตาราง ไม่นับภาระ ไม่โผล่ในงานวันนี้ของเจ้าหน้าที่ จนผ่านด่าน
//
// ⭐ ที่มาของด่าน (docs/service-business-system-plan.md §0) — ตัวเลขจากชีตที่ทีมใช้จริง:
//   วันนี้บริษัทส่งเจ้าหน้าที่ไปที่ที่หมดสัญญา **25 จุด** *และ* ไม่ได้ไปที่ที่จ่ายเงินแล้ว
//   **102 จุด** พร้อมกัน เพราะตารางเจ้าหน้าที่กับทะเบียนสัญญาไม่มีอะไรเชื่อมกันเลย
//   ⇒ "ไม่จ่ายห้ามออกไปให้บริการ" ต้องเป็น**ด่านในระบบ ไม่ใช่วินัยของคน**
//
// ⚠️ **ไม่เก็บผลการตรวจลง DB** — คำนวณสดเสมอจากข้อมูลจริง (กติกาเดียวกับ
//    serviceStatus ที่ห้ามเก็บ) · ที่เก็บคือร่องรอยการตัดสินใจของคนเท่านั้น
//
// ⚠️ **ตัวเดียวกับที่ server ใช้ปฏิเสธจริง** — ปุ่มบนจอต้องอ่านจากที่นี่ ห้ามคิด
//    เงื่อนไขเองตรงจุดที่วางปุ่ม ไม่งั้นวันหนึ่งปุ่มกับด่านจะพูดคนละเรื่อง
//    (กติกาเดียวกับ `quotationDealBlocker` ที่ GatedAction เขียนไว้)
import { accessConflict } from './sites';
import { termIsActive } from './terms';
import { coversDate, hasOverdueUnconfirmed } from '@/lib/sales/paymentCoverage';
import { contractInForce } from '@/lib/sales/contracts';

/* สถานะของแต่ละข้อ
   · ok      — ผ่าน
   · blocked — ไม่ผ่าน และแก้ได้ (บอกว่าใครแก้)
   · parked  — ระบบยังตรวจให้ไม่ได้ (เฟสสัญญายังไม่ทำ)
     ⚠️ **ต้องไม่ติ๊กผ่านเงียบ ๆ** — ด่านที่แกล้งผ่านคือด่านที่โกหกว่าตรวจแล้ว */
export const GATE_STATES = ['ok', 'blocked', 'parked'];

/* ⭐ **ปลดด่าน ①② แล้ว 2026-08-31 (PR-C)** — ค่าคงที่ `CONTRACT_PHASE_READY` ถูกถอดทิ้ง
   ทั้งสองข้อตรวจจากข้อมูลจริงแล้ว ไม่มีสถานะ `parked` เหลืออยู่ในสองข้อนี้อีก

   ⚠️ **นัดที่ข้ามด่าน ①② ได้** (มติผู้ใช้ 2026-08-31):
   · `survey` (สำรวจพื้นที่) — เกิด **ก่อนขาย** จึงยังไม่มีสัญญาและยังไม่มีเงินให้ตรวจ
   · `retrieve` (ถอนเครื่อง) — เกิด **ตอนสัญญาหมดหรือลูกค้าเลิก** จึงไม่มีทางผ่านด่านได้เลย
     🔴 ไม่ข้าม = เครื่องของบริษัทค้างอยู่ที่ลูกค้าตลอดกาล เพราะด่านที่ออกแบบมากันการ
     *ให้บริการฟรี* จะไปกันการ *เอาของกลับ* ด้วย
   ⇒ สองชนิดนี้ยังต้องผ่าน ③④ (มีคนรับผิดชอบ · เข้าไซต์ได้) ตามปกติ */
export const GATE_EXEMPT_KINDS = Object.freeze(['survey', 'retrieve']);

export const visitSkipsContractGates = (visit) => GATE_EXEMPT_KINDS.includes(visit?.kind);

/**
 * ด่านเข้าไซต์ของนัดหนึ่งใบ — คำนวณสดจากข้อมูลจริงเสมอ
 *
 * @param ctx.site                 ไซต์ของนัด (ข้อ ④)
 * @param ctx.zones                โซนของไซต์นั้น — ใช้บอกว่าติดโซนไหนบ้าง
 * @param ctx.terms                รอบขายของโซน (`service_zone_terms`) ของไซต์นั้น
 * @param ctx.ordersById           ใบสั่งขายของ term (Map/object id → order)
 * @param ctx.installmentsByOrderId งวดชำระราย SO (id → installments[])
 * @param ctx.contractsById        สัญญา (id → contract)
 * @param ctx.todayIso             วันอ้างอิง (ทดสอบส่งเข้ามาได้)
 */
export function evaluateVisitGate(visit, {
  site = null,
  zones = [],
  terms = [],
  ordersById = {},
  installmentsByOrderId = {},
  contractsById = {},
  todayIso = null,
} = {}) {
  const items = [];
  const pick = (map, key) => (map instanceof Map ? map.get(key) : map?.[key]) || null;
  const visitDate = visit?.scheduledDate || todayIso || null;
  const exempt = visitSkipsContractGates(visit);

  /* ── ประเมิน **ราย (นัด × โซน)** ────────────────────────────────────────
     ไซต์เดียวโดนหลาย SO ครอบได้ (มติผู้ใช้ 2026-08-27: *"ถ้าแยกจ่าย แล้วจ่ายมา
     บาง SO ก็ไปเฉพาะที่ครอบคลุม SO นั้น"*) ⇒ ตอบเป็นราย **โซน** ไม่ใช่รายนัด
     ⚠️ ติดบางโซน = **นัดยังไปได้** แต่ใบส่งงานต้องตัดโซนนั้นเป็น "งดบริการ"
     ⇒ ผลรายโซนติดไปกับ item เสมอ (`zoneGates`) ไม่ใช่ยุบเหลือ ผ่าน/ไม่ผ่าน */
  const zoneList = (zones || []).filter(Boolean);
  const zoneGates = zoneList.map((zone) => {
    const zoneTerms = (terms || []).filter((t) => t.zoneId === zone.id);
    /* term ที่ "มีผล ณ วันนัด" — ตัวตัดสินเดิมของ `terms.js` ตัวเดียวกับทั้งระบบ
       ⚠️ ต้องส่งใบแม่มาด้วยเสมอ ไม่ส่ง = ตอบ false (ไม่เดาว่าใช่) */
    const live = zoneTerms.filter((t) => termIsActive(t, pick(ordersById, t.salesOrderId), visitDate));

    if (!live.length) {
      return {
        zoneId: zone.id, zoneName: zone.name || null, state: 'blocked', owner: 'SA',
        reason: zoneTerms.length
          ? 'รอบขายของโซนนี้ไม่มีผล ณ วันนัด — ตรวจใบสั่งขายและช่วงวันของรอบ'
          : 'โซนนี้ยังไม่ถูกจัดสรรจากใบสั่งขาย — ฝ่ายขายต้องผูกงานเข้าโซนก่อน',
      };
    }

    /* ── ข้อ① สัญญา — ใบแม่ของ term ต้องผูกสัญญาที่มีผลแล้ว ────────────
       ⚠️ **อ่านสัญญาจากใบ ไม่ใช่จาก term** (mig 0324) — แผนเดิมเขียนว่า
       `term.serviceContractId` แต่แหล่งความจริงย้ายมาอยู่ที่ `sales_orders`
       เพราะ term เกิดตอน TS จัดสรรเท่านั้น ⇒ ผูกสัญญาก่อนจัดสรรไม่ได้ */
    const covered = live.filter((t) => {
      const order = pick(ordersById, t.salesOrderId);
      const contract = order?.serviceContractId ? pick(contractsById, order.serviceContractId) : null;
      return contractInForce(contract);
    });
    if (!covered.length) {
      return {
        zoneId: zone.id, zoneName: zone.name || null, state: 'blocked', owner: 'SA',
        reason: 'ใบสั่งขายที่ครอบโซนนี้ยังไม่ผูกสัญญาที่มีผล — ผูกที่หน้าใบสั่งขาย',
      };
    }

    /* ── ข้อ② เงิน — วันนัดต้องอยู่ในช่วงที่ "จ่ายถึง" แล้ว ────────────
       ⚠️ **"แจ้งแล้ว" ไม่ปลดด่าน** — `coversDate` นับเฉพาะงวดที่บัญชีรับรอง
       ⚠️ งวดเลยกำหนดที่ยังไม่รับรอง = ติดด้วย แม้วันนัดจะอยู่ในช่วงที่จ่ายแล้ว
          (ค้างชำระอยู่ = ยังไม่ควรส่งคนไปเพิ่ม) */
    const paid = covered.filter((t) => {
      const rows = pick(installmentsByOrderId, t.salesOrderId) || [];
      return coversDate(rows, visitDate) && !hasOverdueUnconfirmed(rows, visitDate);
    });
    if (!paid.length) {
      return {
        zoneId: zone.id, zoneName: zone.name || null, state: 'blocked', owner: 'SA → FN',
        reason: 'วันนัดเกินช่วงที่เก็บเงินแล้ว หรือมีงวดเลยกำหนดที่บัญชียังไม่รับรอง',
      };
    }
    return { zoneId: zone.id, zoneName: zone.name || null, state: 'ok', owner: null, reason: null };
  });

  const blockedZones = zoneGates.filter((z) => z.state === 'blocked');
  const okZones = zoneGates.filter((z) => z.state === 'ok');
  /* 🔴 **ทุกโซนติด = ทั้งใบติด · ติดบางโซน = ใบผ่าน** (สเปก §3.3)
     ไซต์ที่ไม่มีโซนเลยถือว่าติด — ไม่มีโซน = ไม่มีอะไรให้บริการ */
  const allBlocked = !okZones.length;

  /* ⚠️ **แต่ละข้อบล็อกด้วยเหตุของตัวเองเท่านั้น** — เคยเขียนให้ทั้งสองข้อบล็อกพร้อมกัน
     เมื่อทุกโซนติด ผลคือนัดที่ติดเพราะ *เงิน* ขึ้นว่าติด *สัญญา* ด้วย ⇒ SA เปิดไปดู
     สัญญาแล้วไม่เจออะไรผิด · เหตุที่บอกผิดฝ่ายแย่กว่าไม่บอกเลย
     ⚠️ บล็อกเฉพาะตอน **ทุกโซนติด** — ติดบางโซนแปลว่านัดยังไปได้ (ตัดโซนนั้นบนใบส่งงาน) */
  const blockedBy = (owner) => (allBlocked ? blockedZones.find((z) => z.owner === owner) : null);
  const moneyStop = exempt ? null : blockedBy('SA → FN');
  /* 🔴 **ไซต์ที่ไม่มีโซนเลย = ติด ไม่ใช่ผ่าน** — ไม่มีโซนแปลว่าไม่มีอะไรที่ได้รับอนุญาต
     ให้ไปทำ · เคยเขียนพลาดให้ตกไปเป็น "ผ่าน" เพราะ `blockedZones` ว่างพร้อมกัน
     ⇒ นัดที่ไม่มีบริบทอะไรเลยจะหลุดด่านทั้งหมด ซึ่งคือรูที่ด่านนี้เกิดมาเพื่ออุด */
  /* ⚠️ ลำดับสำคัญ: หาเหตุฝั่งสัญญาก่อน · ถ้าไม่มีโซนติดเลยแต่ก็ไม่มีโซนผ่าน แปลว่า
     **ไม่มีโซนอยู่เลย** ⇒ ติดที่ข้อสัญญา · ถ้ามีแต่โซนที่ติดเรื่องเงิน ข้อสัญญาต้อง `ok`
     (เหตุที่บอกผิดฝ่ายแย่กว่าไม่บอกเลย) */
  const contractStop = exempt ? null : (blockedBy('SA') || (allBlocked && !blockedZones.length ? {
    reason: 'ไซต์นี้ยังไม่มีโซนที่ผูกกับใบสั่งขาย — ฝ่ายขายต้องจัดสรรงานลงโซนก่อน',
  } : null));

  items.push({
    key: 'contract', state: contractStop ? 'blocked' : 'ok', owner: 'SA',
    label: 'ไซต์ผูกสัญญาที่ยังมีผล ณ วันนัด',
    detail: exempt
      ? 'งานสำรวจ/ถอนเครื่องไม่ต้องมีสัญญา (มติผู้ใช้ 2026-08-31)'
      : contractStop
        ? contractStop.reason
        : (blockedZones.length ? `งดบริการ ${blockedZones.length} โซน` : null),
  });

  items.push({
    key: 'payment', state: moneyStop ? 'blocked' : 'ok', owner: 'SA → FN',
    label: 'ไม่มีงวดเลยกำหนดที่บัญชียังไม่รับรอง',
    detail: exempt
      ? 'งานสำรวจ/ถอนเครื่องไม่ต้องผ่านด่านเงิน (มติผู้ใช้ 2026-08-31)'
      : (moneyStop ? moneyStop.reason : null),
  });

  // ผลรายโซนติดไปกับด่านเสมอ — ใบส่งงาน/ปิดงานอ่านจากตรงนี้ ไม่คิดเงื่อนไขเอง
  items.zoneGates = zoneGates;

  // ── 3. มีเจ้าหน้าที่ผู้รับผิดชอบ ───────────────────────────────────────────
  const hasAssignee = !!String(visit?.assigneeId ?? '').trim();
  items.push({
    key: 'assignee', state: hasAssignee ? 'ok' : 'blocked', owner: 'TS',
    label: 'มีเจ้าหน้าที่ผู้รับผิดชอบ',
    detail: hasAssignee ? (visit.assigneeName || null) : 'ยังไม่มอบหมาย — เลือกเจ้าหน้าที่บริการก่อนปล่อยเข้าคิว',
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

/* ผ่านด่านไหม — **`parked` ไม่บล็อก** เพราะระบบยังตรวจให้ไม่ได้
   ⚠️ ตั้งแต่ PR-C ไม่มีข้อไหนเป็น `parked` แล้ว แต่คงตรรกะไว้เผื่อข้อใหม่ในอนาคต */
export const gatePassed = (items = []) => !items.some((i) => i.state === 'blocked');

/* รายการเหตุที่ยังไม่ผ่าน — ใช้ตรงจุดที่บริบท "ยังเข้าคิวไม่ได้" ชัดอยู่แล้ว
   (แถวในคิวรอจัด) จะได้ไม่อ่านเป็น "ยังเข้าคิวไม่ได้ — ยังไม่มอบหมาย — เลือกเจ้าหน้าที่บริการ…"
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
   ผ่านด่านตั้งแต่แรก (รอบบริการที่มีเจ้าหน้าที่ประจำและวันอยู่ในช่วงเข้าได้) ⇒ ขึ้นตารางเลย
   ไม่ต้องให้คนมากดปล่อยทีละใบ · ที่ไม่ผ่านจะจอดเป็นร่างรอคนจัดการ
   ⚠️ นี่คือจุดที่ทำให้กติกา "TS ไม่ใช่ต้นทางของงาน" ไม่กลายเป็นแรงเสียดทานรายวัน */
export function initialVisitStatus(visit, ctx = {}) {
  return gatePassed(evaluateVisitGate(visit, ctx)) ? 'scheduled' : 'draft';
}
