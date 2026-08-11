// ── ของเข้า PM/RM ระดับโครงการ (mig 0176) — logic ล้วน ────────────────────
//
// ⭐ ที่มา (คำขอตั้งต้นของผู้ใช้): "ขอเช็คสถานะติดตามการเข้าของ PM และ RM เพื่อ
// ติดตามกำหนดการผลิต" · ก่อนหน้านี้งานทั่วไปมีแค่ task เดียวในไทม์ไลน์
// "สั่งซื้อสารและบรรจุภัณฑ์ — กำหนดของเข้าทั้งหมด" (45 วัน) ที่**ไม่มีอะไรอยู่ข้างใน**
// → SA ถาม PC ทีไรก็ต้องไล่ถามเป็นรายตัวนอกระบบ (มีของจริงเฉพาะสายสหมิตร)
import { MATERIAL_KINDS, canQuoteMaterial } from '@/lib/materialPrices';
import { can, inScope, pmEditScope } from '@/lib/permissions';
import { fmtNumber } from '@/lib/format';

export const DELIVERY_SOURCES = ['manual', 'costing'];

// ขั้นในไทม์ไลน์ที่ของเข้าสรุปขึ้นไป — ชื่อขั้นเดียวกันทั้งสองแม่แบบ
// ("สั่งซื้อสารและบรรจุภัณฑ์ — กำหนดของเข้าทั้งหมด" 45 วัน · เป็น milestone ทั้งคู่)
// ยืนยันกับ prod แล้วว่า `npd-38` มีจริง 3 task (ดู lib/pm/templates.js)
export const DELIVERY_STEP_KEYS = ['npd-38', 're-order-11'];

// ── สิทธิ์ ───────────────────────────────────────────────────────────────
// อ่าน = ใครที่เห็นโครงการ (ของเข้าเป็นข้อมูลกำหนดการ ไม่ใช่ต้นทุน)
export function canViewDeliveries(user) {
  return can(user?.role, 'pm:view');
}

// ⚠️ แก้ไขต้องเปิดให้ **ฝ่ายจัดซื้อ (PC)** ด้วย ไม่ใช่แค่ scope ของ PM
// PC เป็น role `staff` ซึ่ง `pmEditScope` = 'none' → ถ้ากั้นด้วย scope อย่างเดียว
// **คนที่รู้กำหนดของเข้าจริงจะเป็นคนเดียวที่อัปเดตไม่ได้** ซึ่งทำให้ฟีเจอร์นี้ไร้ค่า
// (บทเรียนตรงจาก /api/pm/my-work ที่กั้นด้วย `inquiries:respond` แล้ว PC ไม่เคย
//  เห็นคิวของตัวเองเลย — แก้ไปใน #790)
export function canEditDeliveries(user, project) {
  if (canQuoteMaterial(user, 'PC')) return true;
  return inScope(pmEditScope(user?.role), user, project);
}

// ── ตรวจข้อมูลก่อนแตะ DB — คืนข้อความไทย หรือ null ถ้าผ่าน ───────────────
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// ปีนอกช่วงนี้ = พิมพ์ผิดแน่ ๆ (ของจริงบน prod เคยมี formulaDate = '2202-08-06')
// ต้องตรงกับ CHECK material_deliveries_dates_sane ใน mig 0176
function dateError(value, label) {
  if (!value) return null;
  const text = String(value);
  if (!ISO_DATE.test(text)) return `${label}ไม่ถูกต้อง`;
  const year = Number(text.slice(0, 4));
  if (year < 2000 || year > 2100) return `${label}อยู่นอกช่วงปีที่เป็นไปได้ (${year})`;
  return null;
}

export function normalizeDeliveryInput(body = {}) {
  if (!MATERIAL_KINDS.includes(body.kind)) return { value: null, error: 'ชนิดวัสดุไม่ถูกต้อง' };

  const label = String(body.label ?? '').trim().replace(/\s+/g, ' ');
  if (!label) return { value: null, error: 'ต้องระบุชื่อวัสดุ' };
  if (label.length > 200) return { value: null, error: 'ชื่อวัสดุยาวเกิน 200 ตัวอักษร' };

  // จำนวนเป็นตัวเลือก — บางทีรู้แค่ว่า "ของชิ้นนี้ต้องมา" ยังไม่รู้ยอด
  // ⚠️ ห้ามใช้ Number(null) = 0 เป็น "ไม่ระบุ" (บทเรียนต้นทุน: 0 อ่านว่า "ฟรี")
  let qty = null;
  if (body.qty !== undefined && body.qty !== null && String(body.qty).trim() !== '') {
    qty = Number(body.qty);
    if (!Number.isFinite(qty) || qty <= 0) return { value: null, error: 'จำนวนต้องเป็นตัวเลขมากกว่า 0' };
  }

  for (const [field, label2] of [['dueDate', 'กำหนดถึง'], ['arrivedAt', 'วันที่ของมาถึง']]) {
    const err = dateError(body[field], label2);
    if (err) return { value: null, error: err };
  }

  const note = String(body.note ?? '').trim();
  if (note.length > 1000) return { value: null, error: 'หมายเหตุยาวเกิน 1000 ตัวอักษร' };
  const poRef = String(body.poRef ?? '').trim();
  if (poRef.length > 100) return { value: null, error: 'เลข PR/PO ยาวเกิน 100 ตัวอักษร' };
  const unit = String(body.unit ?? '').trim();
  if (unit.length > 30) return { value: null, error: 'หน่วยยาวเกิน 30 ตัวอักษร' };

  return {
    value: {
      kind: body.kind,
      label,
      qty,
      unit: unit || null,
      poRef: poRef || null,
      dueDate: body.dueDate || null,
      arrivedAt: body.arrivedAt || null,
      materialId: body.materialId || null,
      // ใบสั่งขายที่ของชุดนี้สั่งเพื่อไปผลิต (มติผู้ใช้ 2026-07-29) — ไม่บังคับ
      // เพราะของ long-lead สั่งก่อนออก SO ได้จริง (NPD step 25 เริ่มขนานตั้งแต่ต้น)
      salesOrderId: body.salesOrderId || null,
      ownerId: body.ownerId || null,
      ownerName: body.ownerName || null,
      note: note || null,
    },
    error: null,
  };
}

// ── สรุปขึ้นขั้นไทม์ไลน์ (npd-38 / re-order-11) ──────────────────────────
// milestone "สั่งซื้อสารและบรรจุภัณฑ์ — กำหนดของเข้าทั้งหมด" จะได้มีของจริงข้างใน
// แทนที่จะเป็นกล่องเปล่าที่ทุกคนต้องเดาว่าคืบไปแค่ไหน
//
// `late` = ยังไม่มาและเลยกำหนดแล้ว — ตัวเลขที่ SA ต้องเห็นก่อนใคร
export function deliveryRollup(rows = [], todayIso = null) {
  const total = rows.length;
  const arrived = rows.filter((r) => r.arrivedAt).length;
  const open = rows.filter((r) => !r.arrivedAt);
  const late = todayIso
    ? open.filter((r) => r.dueDate && String(r.dueDate) < String(todayIso)).length
    : 0;
  // กำหนดถึงที่ช้าที่สุดของ "ของที่ยังไม่มา" = วันที่เร็วที่สุดที่ผลิตได้จริง
  const dueDates = open.map((r) => r.dueDate).filter(Boolean).sort();
  return {
    total,
    arrived,
    open: open.length,
    late,
    complete: total > 0 && arrived === total,
    lastDue: dueDates.length ? dueDates[dueDates.length - 1] : null,
  };
}

// ── ของเข้าของใบสั่งขายใบหนึ่ง (มติผู้ใช้ 2026-07-29) ────────────────────
// "ติดตามเพื่อสู่การผลิต" — คำถามจริงที่หน้า SO ต้องตอบคือ **ผลิตได้เมื่อไหร่**
// ซึ่งคือ "ของครบเมื่อไหร่" ไม่ใช่ "ของมาถึงกี่ชิ้นแล้ว" เฉย ๆ
//
// ⚠️ แถวที่ยังไม่ผูก SO ถือว่า "ไม่ใช่ของใบนี้" — ไม่เดาให้ เพราะโครงการหนึ่งมี SO
// ได้หลายใบ (re-order) เดาผิดแล้วใบที่ยังไม่พร้อมจะดูเหมือนพร้อมผลิต
export function deliveriesForSalesOrder(rows = [], salesOrderId) {
  if (!salesOrderId) return [];
  return rows.filter((r) => r.salesOrderId === salesOrderId);
}

// พร้อมผลิตหรือยัง + ถ้ายัง ติดที่อะไร → ใช้บนหน้า SO โดยตรง
export function productionReadiness(rows = [], todayIso = null) {
  const sum = deliveryRollup(rows, todayIso);
  if (!sum.total) {
    return { ...sum, state: 'unknown', label: 'ยังไม่มีรายการของเข้า', tone: 'neutral' };
  }
  if (sum.complete) {
    return { ...sum, state: 'ready', label: 'ของครบแล้ว — เริ่มผลิตได้', tone: 'success' };
  }
  if (sum.late) {
    return {
      ...sum,
      state: 'blocked',
      label: `ของยังไม่ครบ · เลยกำหนดแล้ว ${sum.late} รายการ`,
      tone: 'danger',
    };
  }
  return {
    ...sum,
    state: 'waiting',
    label: sum.lastDue ? `รอของ — ครบเมื่อ ${sum.lastDue}` : 'รอของ — ยังไม่มีกำหนด',
    tone: 'warning',
  };
}

// ── ของเข้า "ของรอบไหน" (มติผู้ใช้ 2026-07-29) ───────────────────────────
// ⭐ คอนเซป: **โครงการคือศูนย์รวมข้อมูลดีล** — สินค้าตัวหนึ่งมีดีลได้หลายรอบ
// (SCENT → NPD → RE-ORDER × N) โดยของที่ทำครั้งเดียวต่อสินค้า (สูตร/กลิ่น/ทะเบียน
// สรรพสามิต/BOM/Code) อยู่ที่โครงการ ส่วนของที่เป็น "ของรอบ" (จำนวน/กำหนดส่ง/
// ของเข้า/ไทม์ไลน์รอบนั้น) อยู่ที่ดีลกับ SO
//
// ⚠️ **ตัวสรุปจึงต้องแยกตามรอบ** ไม่งั้นพอ RE-ORDER สะสม ของรอบ 1 จะถูกนับรวมกับ
// รอบ 5 แล้วบอกว่า "ยังไม่ครบ" ทั้งที่รอบ 5 ครบแล้ว (ป้ายบน milestone อ่านผิด)
// แต่ **พาเนลระดับโครงการยังต้องเห็นทุกรอบ** ตามคอนเซปศูนย์รวม
export function deliveriesForDeal(rows = [], dealId) {
  if (!dealId) return [];
  return rows.filter((r) => r.dealId === dealId);
}

// ป้ายสรุปที่แปะบนขั้น milestone ของไทม์ไลน์ — คืน null เมื่อยังไม่มีรายการเลย
// (ขั้นที่ไม่มีของให้ติดตามไม่ควรมีป้ายเปล่าห้อยอยู่)
//
// `scope` ใช้บอกผู้อ่านว่าตัวเลขนี้เป็นของรอบไหน — ป้ายบนไทม์ไลน์เป็นของ "ดีลนั้น"
// ส่วนพาเนลโครงการเป็นของ "ทั้งโครงการ"
export function deliveryStepBadge(rows = [], todayIso = null, { scope = 'deal' } = {}) {
  const sum = deliveryRollup(rows, todayIso);
  if (!sum.total) return null;
  return {
    tone: sum.complete ? 'success' : sum.late ? 'danger' : 'info',
    label: `ของเข้า ${sum.arrived}/${sum.total}`,
    title: [
      scope === 'project' ? 'รวมทุกรอบของโครงการ' : 'เฉพาะรอบ (ดีล) นี้',
      `มาแล้ว ${sum.arrived} จาก ${sum.total} รายการ`,
      sum.late ? `เลยกำหนดแล้ว ${sum.late} รายการ` : null,
      sum.lastDue ? `ของชิ้นสุดท้ายกำหนดถึง ${sum.lastDue}` : null,
    ].filter(Boolean).join(' · '),
  };
}

// ── ขอให้ PC อัปเดตกำหนด (คำร้องชนิด material_eta) ───────────────────────
// แถวที่ควร "ตาม" = ยังไม่มา **และยังไม่มีคำร้องค้างอยู่**
//
// ⚠️ กันขอซ้ำเป็นเรื่องความอยู่รอดของคิว ไม่ใช่ความสวยงาม — ถ้า SA กดได้ทุกวัน
// คิวฝ่ายจัดซื้อจะเต็มไปด้วยเรื่องเดิม แล้วกลายเป็นคิวที่ไม่มีใครอ่าน (บทเรียน
// เดียวกับที่ตัดสินใจไม่ส่งแจ้งเตือน "ทุกคนในฝ่าย" ในมติ 14)
//
// dealId ที่ส่งมา = ขอเฉพาะรอบนั้น · ไม่ส่ง = ทั้งโครงการทุกรอบ
export function openDeliveriesToChase(rows = [], { dealId = null } = {}) {
  return rows.filter((r) => {
    if (r.arrivedAt) return false;      // มาแล้ว ไม่ต้องตาม
    if (r.requestId) return false;      // ขอไปแล้ว รอ PC ตอบ
    if (dealId && r.dealId !== dealId) return false;
    return true;
  });
}

// เนื้อคำร้อง — PC ต้องอ่านแล้วรู้ทันทีว่าต้องอัปเดตอะไรบ้าง โดยไม่ต้องเปิดโครงการ
export function chaseRequestBody(rows = []) {
  const lines = rows.map((r) => {
    const qty = r.qty == null ? '' : ` · ${fmtNumber(r.qty)}${r.unit ? ` ${r.unit}` : ''}`;
    const po = r.poRef ? ` · ${r.poRef}` : '';
    const due = r.dueDate ? ` · กำหนดเดิม ${r.dueDate}` : ' · ยังไม่มีกำหนด';
    return `• ${r.label}${qty}${po}${due}`;
  });
  return [
    `ขอให้ฝ่ายจัดซื้ออัปเดตกำหนดของเข้า ${rows.length} รายการ:`,
    ...lines,
    '',
    'อัปเดตได้ที่พาเนล "ของเข้า" ใต้ไทม์ไลน์ของโครงการ',
  ].join('\n');
}

// ── กางรายการจากใบขอราคาผลิต (มติ 13) ───────────────────────────────────
// บรรทัดวัสดุของใบที่อนุมัติแล้ว = รายการที่ "ต้องสั่งจริง" อยู่แล้ว ไม่ต้องพิมพ์ซ้ำ
//
// ⚠️ บรรทัด `labor` (ค่าดำเนินการ) ไม่ใช่ของที่ต้องรอเข้า — ตัดออกเสมอ
// ⚠️ กดซ้ำต้องไม่ได้แถวซ้ำ: กันด้วย unique (projectId, componentId) ที่ระดับ DB
//    ฟังก์ชันนี้จึงกรอง componentId ที่มีแถวแล้วออกก่อน เพื่อให้กดซ้ำได้เงียบ ๆ
//    (ไม่ใช่ตอบ error ให้ผู้ใช้งง) แล้วบอกจำนวนที่ข้ามไป
export function deliveriesFromComponents(components = [], { existingComponentIds = [] } = {}) {
  const seen = new Set(existingComponentIds);
  const rows = [];
  let skipped = 0;
  for (const c of components) {
    if (!MATERIAL_KINDS.includes(c?.kind)) continue; // labor / ชนิดแปลก ๆ
    if (!c.id) continue;
    if (seen.has(c.id)) { skipped += 1; continue; }
    seen.add(c.id);
    rows.push({
      kind: c.kind,
      label: String(c.label ?? '').trim() || 'วัสดุ',
      componentId: c.id,
      // หน่วยตามชนิด: RM คิดเป็นกิโล · PM คิดเป็นชิ้น (ตรงกับ unitBasis ของบรรทัด)
      unit: c.unitBasis === 'per_kg' ? 'กก.' : 'ชิ้น',
    });
  }
  return { rows, skipped };
}
