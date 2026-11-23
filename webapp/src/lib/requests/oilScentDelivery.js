// ── พัฒนาสูตรหมวดหัวน้ำหอม (02-020) ส่งแล้วได้ "กลิ่น" ไม่ใช่ "สูตร" (ม-166 · มติเจ้าของ 23/11/2026) — logic ล้วน ไม่แตะ DB ──
//
// ⭐ **ที่มา** — เจ้าของ: *"PF85901010301 · THE MOMENT OF TEA TIME #3.1 REV1 · 10/09/2026 มันคือกลิ่นนะ"*
//   คำร้องพัฒนาสูตร RQ-FD-26090085 ขอ "หัวน้ำหอม 200 ml กลิ่น #3 เพิ่มความฟุ้ง 1.5%" · RD ส่งงานแล้วระบบสร้าง **สูตร**
//   หมวด 02-020 (ม-148 มองว่าเป็น "หัวน้ำหอมของกลิ่นแม่ตัวเดิม") ⇒ ราคา F ไปลงที่กลิ่นแม่ #3 · ตัว REV1 ไม่อยู่ในทะเบียนกลิ่น
//   ⇒ FG หัวน้ำหอม (ผูกกลิ่นอย่างเดียว · มติ 02/11) เลือก REV1 ไม่ได้ · ของจริงบน prod 23/11: สูตร 02-020 ทั้งหมด 17 ตัว
//
// ⭐ **กติกา**
//   · แถวพัฒนาสูตรหมวด 02-020 ส่งงาน = **กลิ่นลูก** เข้าทะเบียนกลิ่น (`producedScentId`) · ไม่มีสูตรเกิด (`producedFormulaId` ว่าง)
//   · กลิ่นลูกชี้กลับ (`derivedFromScentId`) = กลิ่นที่รอบก่อนส่งไว้ (รอบแก้) ไม่งั้น = กลิ่นที่แถวขอ (แบบเดียวกับสูตรรอบแก้ ม-147)
//   · RD ใส่รหัสเดียวกับกลิ่นที่ขอ = **ส่งกลิ่นเดิมไม่ปรับ** ⇒ ผูกกลิ่นนั้น ไม่สร้างใหม่ (ของจริง: MARIGOLD สองตัว RQ-FD-26100432)
//     · เฉพาะแถวรอบแรกที่ไม่ใช่ direction เพิ่ม — รอบแก้/direction เพิ่มคือของใหม่เสมอ
//   · ราคา F ลงกลิ่นลูก (ตัวตัดสินช่องราคาเดิม `rowPriceSlots` ใช้ `producedScentId` อยู่แล้ว)
//   · ลูกค้าคอนเฟิร์ม = กลิ่นลูกใช้งานได้ (บล็อกกลางของ route) · กลิ่นลูกตัวอื่นของคู่นี้ที่ใบนี้สร้าง = เลิกใช้ · แถวที่ค้าง = "ไม่ถูกเลือก"
//     (กติกาเดียวกับ ม-157 ฝั่งสูตร) · **กลิ่นแม่ไม่ถูกแตะ** — มันเป็นกลิ่นของตัวเอง ไม่ใช่ "ตัวเดิมของคู่" แบบสูตร
//
// ⚠️ แถวที่ส่งไปก่อน ม-166 (สูตร 02-020) ยังเดินทางเดิม — ทางนี้ตัดสินจาก "แถวยังไม่มีของที่ส่ง" เท่านั้น
// ⚠️ จอกับ server ถามตัวเดียวกันทุกข้อ (กติกาเดียวกับ `formulaRework.js`)
import { isFragranceOilCategory } from '@/lib/master/fragranceOilScent';
import { isConfirmedOpenRow, isRowSettled } from '@/lib/requests/rowStage';

const text = (v) => String(v ?? '').trim();
const sameCode = (a, b) => !!text(a) && text(a).toLowerCase() === text(b).toLowerCase();

/** ชื่อสั้นของกลิ่นในประโยค — รหัสก่อน ไม่มีรหัสใช้ชื่อ */
export const scentName = (s, fallback = 'กลิ่นเดิม') => s?.code || s?.name || fallback;

/** แถวพัฒนาสูตรที่ส่งงานเป็นกลิ่น (หมวดหัวน้ำหอม) — แถวเก่าที่ส่งเป็นสูตรไปแล้วไม่นับ (เดินทางเดิม) */
export function isOilScentRow(row) {
  return row?.lineKind === 'product_dev' && isFragranceOilCategory(row?.categoryCode) && !row?.producedFormulaId;
}

/** กลิ่นที่แถวต้นทางของรอบแก้ส่งไว้ — null = ไม่ใช่รอบแก้ / ต้นทางยังไม่มีกลิ่น (ส่งเป็นสูตรก่อน ม-166) */
export function oilReworkParentScentId(row, items = []) {
  if (!row?.derivedFromItemId) return null;
  const source = (items || []).find((i) => i?.id === row.derivedFromItemId);
  return source?.producedScentId || null;
}

/**
 * แผนการส่งของแถวหัวน้ำหอม
 * @param requested กลิ่นที่แถวขอ (`row.scentId`) — แถวทะเบียน หรือ null
 * @param code รหัสที่ RD กรอก
 * @returns `{ kind: 'create', derivedFromScentId }` · `{ kind: 'bind', scentId }` · `{ kind: 'blocked', error }`
 */
export function planOilScentDelivery({ row, items = [], requested = null, code = '' }) {
  if (!row?.scentId) return { kind: 'blocked', error: 'รายการนี้ไม่ได้ระบุกลิ่นที่ขอ — ส่งเป็นกลิ่นลูกไม่ได้' };
  const parentId = oilReworkParentScentId(row, items);
  const fresh = !row.derivedFromItemId && !row.directionOfItemId;
  if (requested && sameCode(code, requested.code)) {
    if (!fresh) {
      return {
        kind: 'blocked',
        error: `รหัส ${requested.code} เป็นของกลิ่นที่ขอ — ${row.derivedFromItemId ? 'รอบแก้' : 'direction เพิ่ม'}ต้องเป็นกลิ่นตัวใหม่ (ใส่รหัสใหม่)`,
      };
    }
    return { kind: 'bind', scentId: requested.id };
  }
  return { kind: 'create', derivedFromScentId: parentId || row.scentId };
}

/**
 * ประโยคก่อนกดของโมดัลส่งงาน — ตัวเดียวกับแผนของ server
 * @param scents ทะเบียนกลิ่นที่จอโหลดไว้ (หา "กลิ่นที่ขอ" กับ "กลิ่นรอบก่อน")
 * @returns `{ plan, parentId, parent, note }` — `parentId` = กลิ่นที่ช่อง "แก้มาจากกลิ่น" ล็อกไว้
 */
export function oilScentDeliveryPreview({ row, items = [], scents = [], code = '' }) {
  const byId = (id) => (scents || []).find((s) => s.id === id) || null;
  const requested = byId(row?.scentId);
  const plan = planOilScentDelivery({ row, items, requested, code });
  const parentId = plan.kind === 'create' ? plan.derivedFromScentId : null;
  const parent = parentId ? byId(parentId) : null;
  let note = null;
  if (plan.kind === 'create') {
    const lineage = oilReworkParentScentId(row, items) ? 'รอบแก้ — ' : '';
    note = `${lineage}หัวน้ำหอมส่งเป็นกลิ่น — บันทึกแล้วได้กลิ่นใหม่ในทะเบียนกลิ่น (กำลังพัฒนา) ที่แก้มาจาก ${scentName(parent, 'กลิ่นที่ขอ')}`
      + ' · ราคา F ลงที่กลิ่นใหม่ · ลูกค้าคอนเฟิร์มแล้วใช้งานได้'
      + (requested?.code && !row?.derivedFromItemId && !row?.directionOfItemId
        ? ` · ส่งกลิ่น ${requested.code} เดิมไม่ปรับ = ใส่รหัส ${requested.code}`
        : '');
  } else if (plan.kind === 'bind') {
    note = `รหัสตรงกับกลิ่นที่ขอ — ผูกรายการกับกลิ่น ${scentName(requested)} เดิม ไม่สร้างกลิ่นใหม่ (ชื่อ/วันที่ที่กรอกไม่ได้ใช้)`;
  } else {
    note = plan.error;
  }
  return { plan, parentId, parent, note };
}

const samePair = (a, b) => !!a && !!b && a.lineKind === 'product_dev' && b.lineKind === 'product_dev'
  && a.categoryCode === b.categoryCode && a.scentId === b.scentId;

/**
 * ลูกค้าคอนเฟิร์มแถวหัวน้ำหอมที่ส่งเป็นกลิ่น — ทะเบียนกลิ่นกับแถวพี่น้องต้องเปลี่ยนอย่างไร (คู่ของ `formulaConfirmPlan`)
 * ⚠️ การพลิกตัวที่ได้เป็น "ใช้งานได้" อยู่ที่บล็อกกลางของ route (ทุกแถวที่มี `producedScentId`) — แผนนี้ไม่ทำซ้ำ
 * @param scents กลิ่นที่แถวของคู่นี้ถือ (ทุกสถานะ)
 * @returns `{ kind: 'none' }` · `{ kind: 'blocked', error }` · `{ kind: 'apply', registry: 'scent', chosen, archive, close, note }`
 */
export function oilScentConfirmPlan({ row, items = [], scents = [], customerId = null }) {
  if (row?.lineKind !== 'product_dev' || !isFragranceOilCategory(row.categoryCode)
    || !row.producedScentId || row.producedFormulaId) return { kind: 'none' };
  const byId = new Map((scents || []).map((s) => [s.id, s]));
  const chosen = byId.get(row.producedScentId) || null;
  if (!chosen) return { kind: 'none' };
  if (chosen.status === 'archived') {
    return {
      kind: 'blocked',
      error: `กลิ่น ${scentName(chosen)} ถูกเลิกใช้ในทะเบียนไปแล้ว — ให้ RD เปิดใช้ที่ทะเบียนกลิ่นก่อน แล้วค่อยบันทึกคอนเฟิร์ม`,
    };
  }
  const pair = (items || []).filter((i) => i && i.id !== row.id && samePair(i, row));
  const confirmed = pair.find((i) => i.outcome === 'confirmed' || i.answerStatus === 'done');
  if (confirmed) {
    const held = byId.get(confirmed.producedScentId);
    return {
      kind: 'blocked',
      error: `ลูกค้าคอนเฟิร์มกลิ่น${held ? ` ${scentName(held)} ` : ''}ของรายการนี้ในใบนี้ไปแล้ว — คอนเฟิร์มได้ตัวเดียว`,
    };
  }
  const foreign = (s) => !!(customerId && s?.customerId && s.customerId !== customerId);
  // กลิ่นลูกตัวอื่นที่ **ใบนี้สร้าง** (ไม่ใช่ตัวที่ผูกของเดิม) — ร่าง/เลิกใช้แล้ว/ของลูกค้าอื่น ข้าม · กลิ่นแม่ไม่อยู่ในชุดนี้เลย
  const archive = [];
  for (const sibling of pair) {
    if (!sibling.producedScentId || sibling.producedFormulaId || sibling.producedFormulaAction === 'bind') continue;
    const s = byId.get(sibling.producedScentId);
    if (!s || s.id === chosen.id || s.id === row.scentId || ['archived', 'draft'].includes(s.status) || foreign(s)) continue;
    if (!archive.some((a) => a.id === s.id)) archive.push(s);
  }
  const close = pair.filter((i) => !isRowSettled(i) && !isConfirmedOpenRow(i));
  const parts = [];
  if (chosen.status === 'developing') parts.push(`กลิ่น ${scentName(chosen)} เปลี่ยนเป็น "ใช้งานได้"`);
  if (archive.length) parts.push(`${archive.map((s) => scentName(s)).join(', ')} เปลี่ยนเป็น "เลิกใช้"`);
  if (close.length) {
    const codes = close.map((i) => byId.get(i.producedScentId)).filter(Boolean).map((s) => scentName(s));
    parts.push(`ปิดรายการอื่นของกลิ่นนี้ที่ยังค้าง ${close.length} รายการ เป็น "ไม่ถูกเลือก"`
      + (codes.length ? ` (${codes.join(', ')})` : ''));
  }
  return {
    kind: 'apply', registry: 'scent', chosen, archive, close,
    note: parts.length ? `บันทึกแล้ว: ${parts.join(' · ')}` : null,
  };
}

/** id กลิ่นทั้งหมดที่ route ต้องโหลดมาให้ `oilScentConfirmPlan` — ตัวที่แถวนี้ถือ + ตัวที่แถวพี่น้องถือ */
export function oilPairScentIds(row, items = []) {
  return [...new Set([row, ...(items || []).filter((i) => samePair(i, row))]
    .map((i) => i?.producedScentId).filter(Boolean))];
}
