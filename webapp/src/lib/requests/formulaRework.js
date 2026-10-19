// ── ส่งสูตรของแถวพัฒนาสูตร: ทุกการส่ง = สูตรใหม่ "กำลังพัฒนา" จนลูกค้าคอนเฟิร์ม (ม-157 · ทับวิธีเก็บของ ม-147) ──
//
// ⭐ **มติ ม-8 "แก้ = รายการใหม่ ไม่ใช่ Rev."** — ลูกค้าขอแก้แล้วได้สูตรตัวใหม่ มีรหัส ชื่อ วันที่ของตัวเอง และชี้กลับ
//    ว่าแก้มาจากตัวไหน (`derivedFromFormulaId`) · ฝั่งกลิ่นทำแบบนี้มาตั้งแต่แรก (`reworkSlotFrom`)
//
// ⭐ **ม-157 (มติเจ้าของ 2026-10-19 · IS-26100002)** — RD ส่งได้หลาย direction ต่อกลิ่น ทุกรอบ ⇒ สูตรที่ส่งเป็น
//    `developing` (ไม่จองตัวตน หมวด × กลิ่น — mig 0411) · **ตัวเดิมยังใช้งานอยู่ระหว่างรอลูกค้า** · ลูกค้าคอนเฟิร์มแล้ว
//    ตัวที่ได้ = ใช้งาน ตัวเดิม + direction อื่น = เลิกใช้ (`formulaConfirmPlan` ใน `formulaDirections.js`)
//    · เดิม (ม-147) รอบแก้เก็บตัวเดิมเป็นเลิกใช้ **ตอนส่ง** ⇒ direction ที่สองไม่มีที่ยืน (ดัชนีตัวตนนับตัวที่เพิ่งส่ง)
//    · แถวที่ส่งไปก่อน ม-157 (สูตร active · ต้นทางเลิกใช้แล้ว · บันทึก `revise`) ยังถอยด้วย `reworkUndoDecision` ได้เหมือนเดิม
//
// ⚠️ ไฟล์นี้ **ล้วน ไม่แตะ DB** — server (route ของแถว) กับจอ (โมดัลส่งงาน) ถามตัวเดียวกัน ⇒ ประโยคก่อนกดตรงกับที่เกิดจริง
import { findFormulaByIdentity } from '@/lib/master/formulas';

/** สูตรที่แถวต้นทางของรอบแก้นี้ส่งไว้ — null = ไม่ใช่รอบแก้ หรือแถวต้นทางไม่มีสูตร (ข้อมูลเก่า) */
export function reworkParentFormulaId(row, items = []) {
  if (!row?.derivedFromItemId) return null;
  const source = (items || []).find((i) => i?.id === row.derivedFromItemId);
  return source?.producedFormulaId || null;
}

export const formulaName = (f, fallback = 'สูตรเดิม') => f?.code || f?.name || fallback;

const foreignTo = (formula, customerId) => !!(customerId && formula?.customerId && formula.customerId !== customerId);

/**
 * แผนการส่งสูตรของแถว product_dev หนึ่งแถว (รวมแถว direction เพิ่มที่กำลังจะเกิด)
 * @param existing สูตรที่ **จองตัวตน** ของคู่ หมวด × กลิ่น (`findFormulaByIdentity` — ใช้งาน/ร่าง) หรือ null
 * @param clientDerivedFrom ค่า "แก้มาจากสูตร" ที่ฟอร์มส่งมา — ใช้เฉพาะแถวที่ไม่ใช่รอบแก้
 * @returns
 *  · `{ kind: 'create', derivedFromFormulaId, replaces }` — สร้างสูตรใหม่สถานะกำลังพัฒนา · `replaces` = ตัวที่ใช้งานอยู่
 *    ซึ่งจะเลิกใช้เมื่อลูกค้าคอนเฟิร์มตัวนี้ (null = คู่นี้ยังไม่มีตัวใช้งาน)
 *  · `{ kind: 'bind', formulaId, warn: true }` — สูตรของคู่นี้เป็นของลูกค้ารายอื่น (แชร์มา · ม-150) ⇒ ผูก + แชร์ ไม่สร้าง
 *  · `{ kind: 'blocked', error }` — ส่งไม่ได้จนกว่าจะแก้ที่ทะเบียน (ตีกลับก่อนเขียนอะไร)
 */
export function planFormulaDelivery({ row, items = [], existing = null, clientDerivedFrom = null, customerId = null }) {
  const parentId = reworkParentFormulaId(row, items);
  // ⚠️ รอบแก้: ต้นทางมาจากแถว **ไม่เชื่อ client** — ให้เลือกเองเมื่อไรก็ชี้ผิดตัวได้ทั้งที่คำตอบมีตัวเดียว
  const derivedFromFormulaId = parentId || clientDerivedFrom || null;
  if (!existing) return { kind: 'create', derivedFromFormulaId, replaces: null };
  /* ⚠️ **ร่างจองตัวตนอยู่** — คอนเฟิร์มทีหลังต้องเลิกใช้ตัวที่จองไว้ แต่ร่างเลิกใช้ไม่ได้ตามกติกาทะเบียน ("ลบทิ้งแทน")
     และร่างไม่มีรหัสชน CHECK ตอนเปลี่ยนสถานะ ⇒ บอกทางออกตั้งแต่ตอนส่ง ไม่ใช่ไปตันตอนลูกค้าคอนเฟิร์ม */
  if (existing.status === 'draft') {
    return {
      kind: 'blocked',
      error: `${parentId && existing.id === parentId ? 'สูตรต้นทาง' : 'หมวด × กลิ่นนี้มีสูตร'} ${formulaName(existing)} ยังเป็นร่างในทะเบียน `
        + '— รับเข้าทะเบียน (ใส่รหัส) หรือลบร่างที่ทะเบียนสูตรก่อน แล้วส่งงานใหม่',
    };
  }
  /* ⭐ สูตรที่ใช้งานอยู่ของคู่นี้เป็นของลูกค้ารายอื่น (แชร์มา · ม-150) — คอนเฟิร์มตัวใหม่ = เลิกใช้สูตรของลูกค้าอื่น ⇒ ห้าม
     · แถวปกติ: ผูก + แชร์เหมือนเดิม (ใบนี้ใช้สูตรนั้นต่อ) · รอบแก้/direction เพิ่ม: ไม่มีทางสร้างของตัวเองคู่เดียวกัน */
  if (foreignTo(existing, customerId)) {
    if (parentId || row?.directionOfItemId) {
      return {
        kind: 'blocked',
        error: `สูตร ${formulaName(existing)} ของกลิ่นนี้เป็นของ ${existing.customerName || 'ลูกค้ารายอื่น'} (แชร์มา) — ส่งสูตรใหม่ทับสูตรของลูกค้าอื่นไม่ได้ `
          + '· หมวดเดียวกับกลิ่นเดียวใช้งานได้สูตรเดียว ให้ RD ตกลงกับเจ้าของสูตรก่อน',
      };
    }
    return { kind: 'bind', formulaId: existing.id, warn: true };
  }
  return { kind: 'create', derivedFromFormulaId, replaces: existing };
}

/** คำเตือนเมื่อผูกกับสูตรที่มีอยู่แล้วแทนการสร้าง — ฟอร์มที่กรอกไม่ถูกใช้ ต้องไม่เงียบ */
export function formulaBindWarning(formula) {
  return `หมวด × กลิ่นนี้ใช้สูตร ${formulaName(formula)} ของ ${formula?.customerName || 'ลูกค้ารายอื่น'} อยู่ — ผูกรายการกับสูตรนั้น`
    + ' (แชร์ให้ลูกค้าของใบนี้) รหัส/ชื่อที่กรอกในฟอร์มไม่ได้ใช้';
}

/** "สินค้า FG-1, FG-2 ผูกสูตรนี้อยู่" — `usedByProducts` = `[{ id, fgCode }]` (`attachFormulaUsage` · 1 สูตรหลาย FG — ม-150) */
export function formulaHeldByText(formula) {
  const heldBy = formula?.usedByProducts || [];
  if (!heldBy.length) return '';
  const codes = heldBy.map((p) => p.fgCode).filter(Boolean);
  return ` (สินค้า${codes.length ? ` ${codes.slice(0, 3).join(', ')}${codes.length > 3 ? ` +${codes.length - 3}` : ''}` : ` ${heldBy.length} รายการ`}`
    + ` ผูกสูตรนี้อยู่ — ขอราคา FB ของสินค้า${heldBy.length > 1 ? 'เหล่านั้น' : 'นั้น'}ต้องย้ายไปสูตรใหม่)`;
}

/**
 * สิ่งที่โมดัลส่งสูตรต้องรู้ก่อนกด — แผนตัวเดียวกับ server (รีวิว ม-147: ประโยคเดิมเดาจาก "เป็นรอบแก้ไหม" อย่างเดียว
 * ⇒ หลังคืนสูตรเดิมด้วยมือ จอสัญญาว่าจะได้สูตรใหม่ แต่ server ผูกเข้าสูตรที่ใช้งานอยู่แล้วทิ้งฟอร์ม)
 * @param row แถวที่จะส่ง หรือแถว direction เพิ่มที่กำลังจะเกิด (`directionRowFrom`)
 * @param formulas ทะเบียนสูตรทุกสถานะที่จอโหลดไว้
 * @returns `{ plan, parent, parentId, note, lockLineage }` — `note` = ประโยคบอกผลก่อนกด
 */
export function formulaDeliveryPreview({ row, items = [], formulas = [], customerId = null }) {
  const parentId = reworkParentFormulaId(row, items);
  const existing = findFormulaByIdentity(formulas, { categoryCode: row?.categoryCode, scentId: row?.scentId });
  const plan = planFormulaDelivery({ row, items, existing, customerId });
  const parent = parentId ? (formulas || []).find((f) => f.id === parentId) || null : null;
  let note = null;
  if (plan.kind === 'create') {
    const lineage = parentId ? `รอบแก้ — ได้สูตรใหม่ที่ชี้กลับ ${formulaName(parent)} · ` : '';
    const replaces = plan.replaces
      ? ` · ${formulaName(plan.replaces)} ยังใช้งานอยู่ระหว่างรอ — ลูกค้าคอนเฟิร์มสูตรตัวนี้เมื่อไร ${formulaName(plan.replaces)} เปลี่ยนเป็นเลิกใช้`
        + formulaHeldByText(plan.replaces)
      : '';
    note = `${lineage}ส่งแล้วสูตรเข้าทะเบียนเป็น "กำลังพัฒนา" จนลูกค้าคอนเฟิร์ม${replaces}`;
  } else if (plan.kind === 'blocked') {
    note = plan.error;
  } else if (plan.kind === 'bind') {
    note = formulaBindWarning(existing);
  }
  // ล็อก "แก้มาจากสูตร" เฉพาะตอนที่ server จะใช้ต้นทางนั้นจริง — ผูกกับของเดิมไม่มีอะไรให้ล็อก
  const lockLineage = !!parentId && plan.kind === 'create';
  return { plan, parent, parentId, note, lockLineage };
}

/**
 * ค่า `producedFormulaAction` ที่จะบันทึกลงแถวตอนส่งสำเร็จ (mig 0358)
 *
 * ⚠️ **รอบก่อนประกาศเจตนา `revise` ไว้แล้ว = เก็บค่านั้น** (รีวิว ม-147 รอบสี่) — ทะเบียนถูกแก้ก่อนเขียนแถว (ไม่มี transaction)
 *    ⇒ เขียนแถวล้มหลังเก็บต้นทาง/สร้างสูตรใหม่แล้วกดส่งซ้ำ แผนรอบนี้ออกมาเป็น "ผูกเงียบ" (สูตรกำพร้าของตัวเอง) หรือ
 *    "สร้าง" (สร้างล้มและคืนต้นทางไม่สำเร็จ) · บันทึก `bind`/`create` ทับ = ลบรายการทีหลังถอยไม่ได้ สูตรต้นทางค้างเลิกใช้ถาวร
 */
export function formulaActionFor({ plan, row, items = [] }) {
  if (row?.producedFormulaAction === 'revise') {
    if (plan?.kind === 'bind' && !plan.warn) return 'revise';
    if (plan?.kind === 'create' && plan.derivedFromFormulaId && plan.derivedFromFormulaId === reworkParentFormulaId(row, items)) {
      return 'revise';
    }
  }
  return plan?.kind || null;
}

/**
 * ลบรายการรอบแก้ที่ส่งสูตรแล้ว — ถอยการส่งให้ครบไหม (ม-147 · mig 0358)
 *
 * ⭐ **ถอยเฉพาะแถวที่บันทึกไว้ว่าการส่งคือ `revise`** — สภาพทะเบียนอย่างเดียวบอกไม่ได้ว่าแถวนี้เป็นคนสร้าง/เก็บ
 *    (อีกใบของคู่เดียวกันทำรอบแก้ไว้ · ต้นทางถูกเลิกใช้ด้วยมือก่อนส่ง) — รีวิวรอบสาม
 * ⚠️ สูตรใหม่ถูกใช้ต่อแล้ว (อ้างอิงอื่นนอกจากแถวนี้ · สินค้าผูก · มีสูตรที่แก้ต่อจากมัน) = ตีกลับก่อนลบอะไร —
 *    ลบสูตรที่มีคนใช้ต่อ = ของปลายทางหลุดเงียบ (FK ของสินค้าและสายพันธุ์เป็น SET NULL)
 * @returns `{ kind: 'none' }` ลบตามกติกาเดิม · `{ kind: 'undo' }` ลบสูตรใหม่ + คืนต้นทาง · `{ kind: 'blocked', error }`
 */
export function reworkUndoDecision({ row, produced, parent, otherRefs = 0, productCount = 0, childCount = 0 }) {
  if (row?.producedFormulaAction !== 'revise') return { kind: 'none' };
  if (!produced || !parent || produced.id !== row.producedFormulaId) return { kind: 'none' };
  // ต้นทางถูกเปิดใช้กลับไปแล้ว (คืนด้วยมือ) หรือสูตรใหม่ถูกแก้สายพันธุ์ = การส่งนั้นไม่มีผลแล้ว ไม่มีอะไรให้ถอย
  if (produced.derivedFromFormulaId !== parent.id || parent.status !== 'archived') return { kind: 'none' };
  const uses = [
    otherRefs > 0 && 'ถูกอ้างในคำร้อง/ราคา',
    productCount > 0 && 'มีสินค้าผูก',
    childCount > 0 && 'มีสูตรที่แก้ต่อจากมัน',
  ].filter(Boolean);
  if (uses.length) {
    return {
      kind: 'blocked',
      error: `สูตรรอบแก้ ${formulaName(produced)} ถูกใช้ต่อแล้ว (${uses.join(' · ')}) — ลบรายการไม่ได้ `
        + `· ถ้าจะกลับไปใช้สูตรเดิม ${formulaName(parent)}: หน้ารายการทะเบียนสูตร เลิกใช้ตัวรอบแก้แล้วเปิดใช้ตัวเดิม`,
    };
  }
  return { kind: 'undo' };
}
