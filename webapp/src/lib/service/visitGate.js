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
import { coversDate, hasOverdueUnconfirmed, paidThrough } from '@/lib/sales/paymentCoverage';
import { contractInForce } from '@/lib/sales/contracts';
import { contractSpanAt } from '@/lib/sales/serviceContractLink';
// ใบยอด 0 ไม่มีงวดให้เก็บ — ตัวตัดสินเดียวกับงวดชำระ (ไฟล์ logic ล้วน ฝั่ง client ใช้ได้)
import { paymentNotRequired } from '@/lib/sales/salesOrderPayments';

/* สถานะของแต่ละข้อ
   · ok      — ผ่าน
   · blocked — ไม่ผ่าน และแก้ได้ (บอกว่าใครแก้)
   · parked  — ระบบยังตรวจให้ไม่ได้ (เฟสสัญญายังไม่ทำ)
     ⚠️ **ต้องไม่ติ๊กผ่านเงียบ ๆ** — ด่านที่แกล้งผ่านคือด่านที่โกหกว่าตรวจแล้ว */
export const GATE_STATES = ['ok', 'blocked', 'parked'];

/* เจ้าของข้อที่ติด — ใครต้องไปแก้ (ค่าที่จอโชว์เป็นป้ายตรง ๆ)
   ⭐ ประกาศที่เดียวเพราะรายการงานบน /service/schedule แยกร่างที่ติดด่านเป็น
      "TS แก้ได้เอง" กับ "รอฝ่ายอื่น" จากค่านี้ (`gateNeedsOthers`) — ถ้าข้อไหนเขียนสตริงเอง
      แล้วสะกดต่างไปตัวเดียว ร่างที่ TS แก้ได้จะไปจมในกลุ่มรอฝ่ายอื่นที่พับไว้ */
export const GATE_OWNERS = Object.freeze({ SA: 'SA', FN: 'SA → FN', TS: 'TS' });

/* ⭐ **ปลดด่าน ①② แล้ว 2026-08-31 (PR-C)** — ค่าคงที่ `CONTRACT_PHASE_READY` ถูกถอดทิ้ง
   ทั้งสองข้อตรวจจากข้อมูลจริงแล้ว ไม่มีสถานะ `parked` เหลืออยู่ในสองข้อนี้อีก

   ⚠️ **นัดที่ข้ามด่าน ①② ได้** (มติผู้ใช้ 2026-08-31):
   · `survey` (สำรวจพื้นที่) — เกิด **ก่อนขาย** จึงยังไม่มีสัญญาและยังไม่มีเงินให้ตรวจ
   · `remove` (ถอนเครื่อง) — เกิด **ตอนสัญญาหมดหรือลูกค้าเลิก** จึงไม่มีทางผ่านด่านได้เลย
     ⚠️ ใช้ชนิด `remove` ที่มีอยู่ ไม่เพิ่ม `retrieve` ใหม่ (มติผู้ใช้ 2026-08-31) —
     "ถอด" กับ "ถอน" ต่างกันตัวเดียวจนคนเลือกผิดแน่ · เปลี่ยนแค่ป้ายเป็น "ถอนเครื่อง"
     🔴 ไม่ข้าม = เครื่องของบริษัทค้างอยู่ที่ลูกค้าตลอดกาล เพราะด่านที่ออกแบบมากันการ
     *ให้บริการฟรี* จะไปกันการ *เอาของกลับ* ด้วย
   ⇒ สองชนิดนี้ยังต้องผ่าน ③④ (มีคนรับผิดชอบ · เข้าไซต์ได้) ตามปกติ */
export const GATE_EXEMPT_KINDS = Object.freeze(['survey', 'remove']);

export const visitSkipsContractGates = (visit) => GATE_EXEMPT_KINDS.includes(visit?.kind);

/**
 * ด่านเข้าไซต์ของนัดหนึ่งใบ — คำนวณสดจากข้อมูลจริงเสมอ
 *
 * @param ctx.site                 ไซต์ของนัด (ข้อ ④)
 * @param ctx.zones                โซนของไซต์นั้น — ใช้บอกว่าติดโซนไหนบ้าง
 * @param ctx.terms                รอบขายของโซน (`service_zone_terms`) ของไซต์นั้น
 * @param ctx.ordersById           ใบสั่งขายของ term (Map/object id → order) — ข้อ② อ่าน `totalAmount`
 *                                 (ใบยอด 0 ผ่านเอง · ไม่ส่งมา = ไม่รู้ยอด = เดินตามงวด)
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
        zoneId: zone.id, zoneName: zone.name || null, state: 'blocked', owner: GATE_OWNERS.SA,
        reason: zoneTerms.length
          ? 'รอบขายของโซนนี้ไม่มีผล ณ วันนัด — ตรวจใบสั่งขายและช่วงวันของรอบ'
          : 'โซนนี้ยังไม่ถูกจัดสรรจากใบสั่งขาย — ฝ่ายขายต้องผูกงานเข้าโซนก่อน',
      };
    }

    /* ── ข้อ① สัญญา — ใบแม่ของ term ต้องผูกสัญญาที่มีผลแล้ว ────────────
       ⚠️ **อ่านสัญญาจากใบ ไม่ใช่จาก term** (mig 0324) — แผนเดิมเขียนว่า
       `term.serviceContractId` แต่แหล่งความจริงย้ายมาอยู่ที่ `sales_orders`
       เพราะ term เกิดตอน TS จัดสรรเท่านั้น ⇒ ผูกสัญญาก่อนจัดสรรไม่ได้ */
    const contractOf = (t) => {
      const order = pick(ordersById, t.salesOrderId);
      return order?.serviceContractId ? pick(contractsById, order.serviceContractId) : null;
    };
    const linked = live.filter((t) => contractInForce(contractOf(t)));
    if (!linked.length) {
      return {
        zoneId: zone.id, zoneName: zone.name || null, state: 'blocked', owner: GATE_OWNERS.SA,
        reason: 'ใบสั่งขายที่ครอบโซนนี้ยังไม่ผูกสัญญาที่มีผล — ผูกที่หน้าใบสั่งขาย',
      };
    }

    /* 🔴 **"มีผล" ต้องหมายถึง "มีผล ณ วันนัด" จริง ๆ** (แก้ 2026-09-03) —
       ป้ายของข้อนี้เขียนว่า *"ไซต์ผูกสัญญาที่ยังมีผล ณ วันนัด"* มาตลอด แต่ตรรกะเป็น
       `contractInForce` ซึ่งดูแค่ `status === 'signed'` **ไม่เทียบวันเลย**
       ⇒ นัดที่อยู่ก่อนวันเริ่มมีผล หรือหลังวันหมดอายุ ผ่านด่านไปได้ทั้งคู่
       ⇒ ตรงกับตัวเลขที่ทำให้ด่านนี้เกิด: ส่งเจ้าหน้าที่ไปที่ที่ **หมดสัญญา 25 จุด**
     ⚠️ **`contractInForce` ยังต้องอยู่ และห้ามยุบรวมกับตัวนี้** — มันตอบคนละคำถาม:
        "เอกสารผูกพันแล้วหรือยัง" (ผูกกับใบล่วงหน้าได้) vs "ครอบวันนัดไหม"
     ⚠️ **ไม่ระบุช่วงวัน = ไม่บล็อก** — `contractSpanAt` คืน `null` แปลว่า "ไม่รู้"
        กติกาเดียวกับ `termInWindow` ("ไม่ระบุวัน = ยังไม่รู้ ไม่ใช่หมดอายุ") ·
        ของจริงกรอกวันทีหลังเสมอ ⇒ บล็อกไว้ก่อนคือหยุดงานที่ทำได้
     ⚠️ เหตุต้องแยก **ยังไม่เริ่ม** ออกจาก **หมดอายุ** — คนละทางแก้กันคนละเรื่อง
        (เลื่อนนัด vs ต่อสัญญา) และไฟล์นี้เขียนกฎไว้เองว่าเหตุที่บอกผิดแย่กว่าไม่บอก */
    const spans = linked.map((t) => contractSpanAt(contractOf(t), visitDate));
    const covered = linked.filter((t, i) => spans[i] !== 'before' && spans[i] !== 'after');
    if (!covered.length) {
      const notYet = spans.includes('before');
      return {
        zoneId: zone.id, zoneName: zone.name || null, state: 'blocked', owner: GATE_OWNERS.SA,
        reason: notYet
          ? 'สัญญาที่ครอบโซนนี้ยังไม่ถึงวันเริ่มมีผล ณ วันนัด — เลื่อนนัด หรือแก้วันเริ่มที่หน้าสัญญา'
          : 'สัญญาที่ครอบโซนนี้หมดอายุก่อนวันนัด — ต่อสัญญาก่อนจึงจะส่งเจ้าหน้าที่ไปได้',
      };
    }

    /* ── ข้อ② เงิน — วันนัดต้องอยู่ในช่วงที่ "จ่ายถึง" แล้ว ────────────
       ⚠️ **"แจ้งแล้ว" ไม่ปลดด่าน** — `coversDate` นับเฉพาะงวดที่บัญชีรับรอง
       ⚠️ งวดเลยกำหนดที่ยังไม่รับรอง = ติดด้วย แม้วันนัดจะอยู่ในช่วงที่จ่ายแล้ว
          (ค้างชำระอยู่ = ยังไม่ควรส่งคนไปเพิ่ม) */
    /* ⭐ **ใบยอด 0 = ไม่มีเงินให้เก็บ ⇒ ผ่านข้อ② เอง** (มติ 22/09 · mig 0374) — ตัวตัดสินเดียวกับงวดชำระ
       (`paymentNotRequired` · มติ 2026-08-18 "ยอด 0 = จบที่อนุมัติใบ ไม่มีงวด") ใช้กับทุกใบ ไม่ใช่เฉพาะใบย้อนหลัง
       🔄 แทนสวิตช์ยกเว้นด่านเงินรายใบของใบย้อนหลัง (มติข้อ 13 · 0360) ที่ถอดแล้ว — เงินที่เก็บก่อนเข้าระบบ
          คีย์เป็น "งวดยกมา" ให้บัญชีรับรอง ⇒ ใบย้อนหลังที่มียอดเดินข้อ② ด้วยงวดจริงเหมือนใบปกติ
          (ร่องรอย `paymentGateExemptAt` ที่ค้างในแถวไม่มีใครอ่านแล้ว — ปลอมมาก็ไม่ปลดด่าน)
       ⚠️ ถาม **ยอดของใบ** ไม่ใช่ "ไม่มีแถว" — ใบยอดจริงที่ยังไม่มีงวดต้องติด (fail-closed ของ `coversDate`)
          และไม่รู้ยอด (ไม่ได้ select มา) ≠ ยอด 0 — `paymentNotRequired` ตอบ false ให้เอง
       ⚠️ ปลดข้อนี้ข้อเดียว — ข้อ① สัญญาตัดไปแล้วข้างบน ใบ ฿0 ก็ต้องผูกสัญญาที่ครอบวันนัด */
    const noPaymentStep = (t) => paymentNotRequired(pick(ordersById, t.salesOrderId)?.totalAmount);
    const paid = covered.filter((t) => {
      if (noPaymentStep(t)) return true;
      const rows = pick(installmentsByOrderId, t.salesOrderId) || [];
      return coversDate(rows, visitDate) && !hasOverdueUnconfirmed(rows, visitDate);
    });
    if (!paid.length) {
      return {
        zoneId: zone.id, zoneName: zone.name || null, state: 'blocked', owner: GATE_OWNERS.FN,
        reason: moneyStopReason(covered, installmentsByOrderId, visitDate),
      };
    }
    /* ⚠️ ผ่านเพราะไม่มีเงินให้เก็บล้วน ๆ ต้องบอก — ด่านที่แกล้งผ่านคือด่านที่โกหกว่าตรวจแล้ว (กติกาหัวไฟล์)
       ติดธงเฉพาะตอนเป็นจริง เพื่อไม่ขยับรูปผลของโซนปกติ */
    const zeroValueOnly = paid.every(noPaymentStep);
    return {
      zoneId: zone.id, zoneName: zone.name || null, state: 'ok', owner: null, reason: null,
      ...(zeroValueOnly ? { paymentNotRequired: true } : {}),
    };
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
  const moneyStop = exempt ? null : blockedBy(GATE_OWNERS.FN);
  /* 🔴 **ไซต์ที่ไม่มีโซนเลย = ติด ไม่ใช่ผ่าน** — ไม่มีโซนแปลว่าไม่มีอะไรที่ได้รับอนุญาต
     ให้ไปทำ · เคยเขียนพลาดให้ตกไปเป็น "ผ่าน" เพราะ `blockedZones` ว่างพร้อมกัน
     ⇒ นัดที่ไม่มีบริบทอะไรเลยจะหลุดด่านทั้งหมด ซึ่งคือรูที่ด่านนี้เกิดมาเพื่ออุด */
  /* ⚠️ ลำดับสำคัญ: หาเหตุฝั่งสัญญาก่อน · ถ้าไม่มีโซนติดเลยแต่ก็ไม่มีโซนผ่าน แปลว่า
     **ไม่มีโซนอยู่เลย** ⇒ ติดที่ข้อสัญญา · ถ้ามีแต่โซนที่ติดเรื่องเงิน ข้อสัญญาต้อง `ok`
     (เหตุที่บอกผิดฝ่ายแย่กว่าไม่บอกเลย) */
  const contractStop = exempt ? null : (blockedBy(GATE_OWNERS.SA) || (allBlocked && !blockedZones.length ? {
    reason: 'ไซต์นี้ยังไม่มีโซนที่ผูกกับใบสั่งขาย — ฝ่ายขายต้องจัดสรรงานลงโซนก่อน',
  } : null));

  items.push({
    key: 'contract', state: contractStop ? 'blocked' : 'ok', owner: GATE_OWNERS.SA,
    label: 'ไซต์ผูกสัญญาที่ยังมีผล ณ วันนัด',
    detail: exempt
      ? 'งานสำรวจ/ถอนเครื่องไม่ต้องมีสัญญา (มติผู้ใช้ 2026-08-31)'
      : contractStop
        ? contractStop.reason
        : (blockedZones.length ? `งดบริการ ${blockedZones.length} โซน` : null),
  });

  const zeroValueZones = okZones.filter((z) => z.paymentNotRequired).length;
  items.push({
    key: 'payment', state: moneyStop ? 'blocked' : 'ok', owner: GATE_OWNERS.FN,
    label: 'ไม่มีงวดเลยกำหนดที่บัญชียังไม่รับรอง',
    detail: exempt
      ? 'งานสำรวจ/ถอนเครื่องไม่ต้องผ่านด่านเงิน (มติผู้ใช้ 2026-08-31)'
      : moneyStop
        ? moneyStop.reason
        : (zeroValueZones ? `ไม่มีเงินให้เก็บ ${zeroValueZones} โซน — ใบยอด 0 บาท` : null),
  });

  // ผลรายโซนติดไปกับด่านเสมอ — ใบส่งงาน/ปิดงานอ่านจากตรงนี้ ไม่คิดเงื่อนไขเอง
  items.zoneGates = zoneGates;

  // ── 3. มีเจ้าหน้าที่ผู้รับผิดชอบ ───────────────────────────────────────────
  const hasAssignee = !!String(visit?.assigneeId ?? '').trim();
  items.push({
    key: 'assignee', state: hasAssignee ? 'ok' : 'blocked', owner: GATE_OWNERS.TS,
    label: 'มีเจ้าหน้าที่ผู้รับผิดชอบ',
    detail: hasAssignee ? (visit.assigneeName || null) : 'ยังไม่มอบหมาย — เลือกเจ้าหน้าที่บริการก่อนปล่อยขึ้นตาราง',
    fix: hasAssignee ? null : 'assignee',
  });

  // ── 4. วันนัดอยู่ในช่วงที่ไซต์ยอมให้เข้า ────────────────────────────
  const conflict = site ? accessConflict(site, {
    date: visit?.scheduledDate, startTime: visit?.startTime, endTime: visit?.endTime,
  }) : null;
  items.push({
    key: 'access', state: conflict ? 'blocked' : 'ok', owner: GATE_OWNERS.TS,
    label: 'วันนัดอยู่ในช่วงที่ไซต์ยอมให้เข้า',
    detail: conflict ? conflict.message : null,
    fix: conflict ? 'schedule' : null,
  });

  return items;
}

/* ผ่านด่านไหม — **`parked` ไม่บล็อก** เพราะระบบยังตรวจให้ไม่ได้
   ⚠️ ตั้งแต่ PR-C ไม่มีข้อไหนเป็น `parked` แล้ว แต่คงตรรกะไว้เผื่อข้อใหม่ในอนาคต */
export const gatePassed = (items = []) => !items.some((i) => i.state === 'blocked');

/* รายการเหตุที่ยังไม่ผ่าน — ใช้ตรงจุดที่บริบท "ยังขึ้นตารางไม่ได้" ชัดอยู่แล้ว
   (แถวในกลุ่มรอจัด) จะได้ไม่อ่านเป็น "ยังขึ้นตารางไม่ได้ — ยังไม่มอบหมาย — เลือกเจ้าหน้าที่บริการ…"
   ที่มีขีดคั่นซ้อนกันสามชั้น */
export const gateReasons = (items = []) =>
  items.filter((i) => i.state === 'blocked').map((i) => i.detail || i.label);

/* เหตุพร้อม **เจ้าของ** — คิวรอจัดต้องบอกว่าใครต้องไปแก้ ไม่ใช่แค่ว่าติดอะไร
   ⭐ คนจัดคิวไม่ใช่คนแก้เกือบทุกข้อ (สัญญา=SA · เงิน=SA→FN) ⇒ ไม่บอกเจ้าของ
      เท่ากับโยนงานให้คนที่ทำอะไรไม่ได้ แล้วใบจะค้างอยู่ในคิวเงียบ ๆ
   ⭐ `fix` ติดไปด้วย ('assignee' | 'schedule' | null) — ข้อที่ TS แก้เองได้ แถวต้องมีปุ่มพาไป
      ช่องนั้นตรง ๆ ("เลือกเจ้าหน้าที่" · "แก้วัน/เวลา") ไม่ใช่ให้คนเปิดโมดัลแล้วหาเอง */
export const gateBlockedItems = (items = []) =>
  items.filter((i) => i.state === 'blocked').map((i) => ({
    key: i.key, owner: i.owner || null, reason: i.detail || i.label, fix: i.fix || null,
  }));

/* ติดข้อที่ **ฝ่ายอื่น** ต้องแก้อยู่ไหม — แยกกลุ่ม "ติดด่าน · ฝ่าย TS แก้ได้เอง" ออกจาก
   "ติดด่าน · รอฝ่ายอื่น" บนรายการงาน
   ⚠️ เทียบกับ `GATE_OWNERS.TS` เท่านั้น — ข้อที่ไม่มีเจ้าของ (owner ว่าง) นับเป็นของฝ่ายอื่น
      เพราะ TS ไม่รู้จะแก้อะไร · เดาว่า TS แก้ได้ = ใบค้างในกลุ่มที่ TS เปิดมาแล้วทำอะไรไม่ได้
   ⚠️ ผ่านครบ (ไม่มีข้อติด) = false — ผู้เรียกต้องถาม `gatePassed` ก่อน ไม่ใช่อ่าน false เป็น "TS แก้ได้" */
export const gateNeedsOthers = (items = []) =>
  items.some((i) => i.state === 'blocked' && i.owner !== GATE_OWNERS.TS);

/* ข้อความบอกเหตุสำหรับปุ่มที่กดไม่ได้ (GatedAction) — ต้องบอก**ทุกข้อที่ขาดในครั้งเดียว**
   ไม่ใช่ทีละข้อให้แก้แล้วเจอข้อถัดไป (กฎฟอร์มของ repo)
   ⚠️ คำว่า "ขึ้นตาราง" ไม่ใช่ "เข้าคิว" (มติผู้ใช้ 2026-09-22) — "คิว" บนหน้าจัดคิวคือรายการงาน
      ทั้งก้อน ร่างก็อยู่ในรายการนั้นแล้ว ⇒ "ยังเข้าคิวไม่ได้" อ่านขัดกับสิ่งที่ตาเห็น */
export function gateBlocker(items = []) {
  const reasons = gateReasons(items);
  if (!reasons.length) return '';
  return `ยังขึ้นตารางไม่ได้ — ${reasons.join(' · ')}`;
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

/* ── ทำไมเงินถึงไม่ผ่าน — สามเหตุที่แก้คนละทาง ────────────────────────────
 * 🔴 **เหตุที่บอกผิดฝ่ายแย่กว่าไม่บอกเลย** (กติกาของไฟล์นี้เอง) — ข้อความเดียวว่า
 *   "วันนัดเกินช่วงที่เก็บเงินแล้ว" ทำให้ SA ไปไล่ทวงลูกค้า ทั้งที่ของจริงคือ
 *   **บัญชียังไม่รับรองสักงวด** ซึ่งเป็นงานของ FN ไม่ใช่ของลูกค้า
 * 🐞 เจอชัดที่สุดตอน **ใบเพิ่งออก Rev.** — งวดถูกยกมาแล้ว (mig 0346) แต่ยังไม่มีใคร
 *   รับรอง ⇒ `paidThrough` ยังเป็น null · เหตุจริงคือ "รอบัญชีรับรองรอบใหม่"
 *   ไม่ใช่ "ลูกค้าจ่ายไม่ถึง"
 */
function moneyStopReason(terms, installmentsByOrderId, visitDate) {
  // ⚠️ หยิบเองที่นี่ — `pick` เป็นตัวช่วยในสโคปของฟังก์ชันหลัก มองไม่เห็นจากตรงนี้
  const at = (key) => (installmentsByOrderId instanceof Map
    ? installmentsByOrderId.get(key)
    : installmentsByOrderId?.[key]) || [];
  const rows = terms.flatMap((t) => at(t.salesOrderId));
  if (!rows.length) {
    return 'ใบสั่งขายที่ครอบโซนนี้ยังไม่มีงวดชำระ — ฝ่ายขายต้องเริ่มติดตามการชำระก่อน';
  }
  if (rows.some((r) => hasOverdueUnconfirmed([r], visitDate))) {
    return 'มีงวดเลยกำหนดที่บัญชียังไม่รับรอง — ค้างชำระอยู่ ยังไม่ควรส่งคนไปเพิ่ม';
  }
  if (!paidThrough(rows)) {
    return 'ยังไม่มีงวดไหนที่บัญชีรับรอง — รอฝ่ายบัญชีรับรองการชำระก่อน'
      + ' (ใบที่เพิ่งออก Rev. ต้องให้บัญชีรับรองรอบใหม่)';
  }
  return 'วันนัดเกินช่วงที่เก็บเงินแล้ว — เก็บงวดถัดไปก่อนจึงจะส่งเจ้าหน้าที่ไปได้';
}
