// ── ส่งสูตรของแถวพัฒนาสูตร: รอบแก้ = สูตรใหม่ที่ชี้กลับสูตรเดิม (ม-147 · มติผู้ใช้ 2026-09-14 "ก") ──
//
// ⭐ **มติ ม-8 "แก้ = รายการใหม่ ไม่ใช่ Rev."** — ลูกค้าขอแก้แล้วได้สูตรตัวใหม่ มีรหัส ชื่อ วันที่ของตัวเอง และชี้กลับ
//    ว่าแก้มาจากตัวไหน (`derivedFromFormulaId`) · ฝั่งกลิ่นทำแบบนี้มาตั้งแต่แรก (`reworkSlotFrom`)
//
// 🐞 **ของเดิมฝั่งสูตรทำไม่ได้เลย** — ตัวตนของสูตรคือ หมวด × กลิ่น (mig 0207 · `formulas_identity_uk` ไม่นับสูตร
//    ที่เลิกใช้) และแถวรอบแก้ใช้คู่เดียวกับแถวต้นทาง ⇒ ตัวส่งเจอสูตรเดิมแล้ว **ผูกรายการรอบแก้เข้าสูตรเดิมเงียบ ๆ**
//    รหัส/ชื่อ/หมายเหตุที่ RD กรอกถูกทิ้งทั้งหมด (prod 2026-09-14: รอบแก้ที่ส่งแล้ว 2 จาก 2 ผูกสูตรเดียวกับต้นทาง)
//
// ⇒ **สูตรใหม่ + เก็บสูตรเดิมเป็น "เลิกใช้"** — คู่ หมวด × กลิ่น ยังมีสูตรใช้งานได้ตัวเดียวตามกฎ 0207 · สายพันธุ์
//    ชี้กลับได้ครบ · ลูกค้าขอกลับไปใช้สูตรเดิม = ทะเบียนสูตร: เลิกใช้ตัวรอบแก้ แล้วเปิดใช้ตัวเดิม (ไม่มีทางลัดในคำร้อง)
//
// ⚠️ ไฟล์นี้ **ล้วน ไม่แตะ DB** — server (route ของแถว) กับจอ (โมดัลส่งงาน) ถามตัวเดียวกัน ⇒ ประโยคก่อนกดตรงกับที่เกิดจริง
import { archiveFormulaError, findFormulaByIdentity } from '@/lib/master/formulas';

/** สูตรที่แถวต้นทางของรอบแก้นี้ส่งไว้ — null = ไม่ใช่รอบแก้ หรือแถวต้นทางไม่มีสูตร (ข้อมูลเก่า) */
export function reworkParentFormulaId(row, items = []) {
  if (!row?.derivedFromItemId) return null;
  const source = (items || []).find((i) => i?.id === row.derivedFromItemId);
  return source?.producedFormulaId || null;
}

const formulaName = (f, fallback = 'สูตรเดิม') => f?.code || f?.name || fallback;

/**
 * แผนการส่งสูตรของแถว product_dev หนึ่งแถว
 * @param existing สูตรที่ยังไม่เลิกใช้ของคู่ หมวด × กลิ่น (`findFormulaByIdentity`) หรือ null
 * @param clientDerivedFrom ค่า "แก้มาจากสูตร" ที่ฟอร์มส่งมา — ใช้เฉพาะแถวที่ไม่ใช่รอบแก้
 * @returns
 *  · `{ kind: 'create', derivedFromFormulaId }` — สร้างสูตรใหม่
 *  · `{ kind: 'revise', derivedFromFormulaId, archiveId }` — เก็บสูตรต้นทางเป็นเลิกใช้ แล้วสร้างสูตรใหม่ที่ชี้กลับ
 *  · `{ kind: 'bind', formulaId, warn }` — ผูกกับสูตรที่มีอยู่ (`warn` = ฟอร์มที่กรอกไม่ได้ใช้ ต้องบอกผู้ใช้)
 *  · `{ kind: 'blocked', error }` — ส่งไม่ได้จนกว่าจะแก้ที่ทะเบียน (ตีกลับก่อนเขียนอะไร)
 */
export function planFormulaDelivery({ row, items = [], existing = null, clientDerivedFrom = null, customerId = null }) {
  const parentId = reworkParentFormulaId(row, items);
  // ⚠️ รอบแก้: ต้นทางมาจากแถว **ไม่เชื่อ client** — ให้เลือกเองเมื่อไรก็ชี้ผิดตัวได้ทั้งที่คำตอบมีตัวเดียว
  const derivedFromFormulaId = parentId || clientDerivedFrom || null;
  if (!existing) return { kind: 'create', derivedFromFormulaId };
  if (parentId && existing.id === parentId) {
    /* ⚠️ **ต้นทางที่ยังเป็นร่างเก็บไม่ได้** (รีวิว ม-147) — ร่างที่ไม่มีรหัสชน CHECK `formulas_code_required_when_accepted`
       ตอนเปลี่ยนสถานะ (500 ทุกครั้งที่กดซ้ำ = แถวค้างถาวร) · ร่างที่มีรหัสก็ห้ามเก็บตามกติกาทะเบียน ("ลบทิ้งแทน")
       ⇒ ใช้ด่านตัวเดียวกับปุ่มเลิกใช้ของทะเบียน แล้วบอกทางออก: รับร่างเข้าทะเบียนก่อน */
    const archiveError = archiveFormulaError(existing);
    if (archiveError) {
      return {
        kind: 'blocked',
        error: `สูตรต้นทาง ${formulaName(existing)} ยังเป็นร่างในทะเบียน — รับเข้าทะเบียน (ใส่รหัส) ที่ทะเบียนสูตรก่อน แล้วส่งงานใหม่`,
      };
    }
    /* ⭐ สูตรต้นทางเป็นของลูกค้ารายอื่น (แชร์มา · ม-150) — รอบแก้ = เลิกใช้สูตรต้นทาง ⇒ ใบของลูกค้ารายนี้ห้ามแตะสูตรของลูกค้าอื่น
       · หมวดเดียวกับกลิ่นเดียวมีสูตรได้ตัวเดียว ⇒ ไม่มีทาง "สร้างของตัวเอง" คู่เดียวกัน · บอกทางออกตั้งแต่พรีวิว ไม่ใช่ 409 ตอนกดส่ง */
    if (customerId && existing.customerId && existing.customerId !== customerId) {
      return {
        kind: 'blocked',
        error: `สูตรต้นทาง ${formulaName(existing)} เป็นของ ${existing.customerName || 'ลูกค้ารายอื่น'} (แชร์มา) — ส่งรอบแก้ทับสูตรของลูกค้าอื่นไม่ได้ `
          + '· หมวดเดียวกับกลิ่นเดียวมีสูตรได้ตัวเดียว ให้ RD ตกลงกับเจ้าของสูตรก่อน',
      };
    }
    return { kind: 'revise', derivedFromFormulaId: parentId, archiveId: parentId };
  }
  /* สูตรที่ใช้งานอยู่ **คือรอบแก้ของต้นทางนี้ที่ใบนี้สร้างเอง** — ส่งรอบก่อนสร้างสูตรได้แต่เขียนรายการไม่ได้ (สูตรกำพร้า ไม่มี
     รายการไหนถือ) แล้วกดส่งซ้ำ ⇒ ผูกเงียบ ๆ ถูกแล้ว (ของที่กรอกรอบแรกลงทะเบียนไปแล้ว)
     ⚠️ สายพันธุ์ตรงกันอย่างเดียวไม่พอ (รีวิว ม-147) — ตัวตนสูตรเป็นแค่ หมวด × กลิ่น ⇒ **อีกใบ**ของคู่เดียวกันทำรอบแก้ไว้ก็
     สายพันธุ์ตรงเหมือนกัน ⇒ ต้องไม่มีใบอื่นถือสูตรนั้น (`sourceRequest` จาก `loadFormulas` — จอกับ server ได้ค่าชุดเดียวกัน)
     ⚠️ ไม่ใช่ "ส่งซ้ำหลังดึงกลับ" — ดึงกลับใช้ได้เฉพาะแถวขอเอกสาร */
  if (parentId && existing.derivedFromFormulaId === parentId
      && (!existing.sourceRequest || existing.sourceRequest.id === row?.requestId)) {
    return { kind: 'bind', formulaId: existing.id, warn: false };
  }
  return { kind: 'bind', formulaId: existing.id, warn: true };
}

/** คำเตือนเมื่อผูกกับสูตรที่มีอยู่แล้วแทนการสร้าง — ฟอร์มที่กรอกไม่ถูกใช้ ต้องไม่เงียบ */
export function formulaBindWarning(formula) {
  return `หมวด × กลิ่นนี้มีสูตร ${formulaName(formula)} ในทะเบียนอยู่แล้ว — ผูกรายการกับสูตรนั้น`
    + ' รหัส/ชื่อที่กรอกในฟอร์มไม่ได้ใช้ (ถ้าต้องเป็นสูตรใหม่ ให้เลิกใช้สูตรเดิมในทะเบียนก่อนแล้วส่งใหม่)';
}

/**
 * สิ่งที่โมดัลส่งสูตรต้องรู้ก่อนกด — แผนตัวเดียวกับ server (รีวิว ม-147: ประโยคเดิมเดาจาก "เป็นรอบแก้ไหม" อย่างเดียว
 * ⇒ หลังคืนสูตรเดิมด้วยมือ จอสัญญาว่าจะได้สูตรใหม่ แต่ server ผูกเข้าสูตรที่ใช้งานอยู่แล้วทิ้งฟอร์ม)
 * @param formulas ทะเบียนสูตรทุกสถานะที่จอโหลดไว้
 * @returns `{ plan, parent, note, lockLineage }` — `note` = ประโยคบอกผลก่อนกด (null = ไม่มีอะไรพิเศษ)
 */
export function formulaDeliveryPreview({ row, items = [], formulas = [], customerId = null }) {
  const parentId = reworkParentFormulaId(row, items);
  const existing = findFormulaByIdentity(formulas, { categoryCode: row?.categoryCode, scentId: row?.scentId });
  const plan = planFormulaDelivery({ row, items, existing, customerId });
  const parent = parentId ? (formulas || []).find((f) => f.id === parentId) || null : null;
  const parentName = formulaName(parent);
  let note = null;
  if (plan.kind === 'revise') {
    // `usedByProducts` = `[{ id, fgCode }]` (`attachFormulaUsage` · 1 สูตรผูกได้หลาย FG — ม-150)
    const heldBy = existing?.usedByProducts || [];
    const codes = heldBy.map((p) => p.fgCode).filter(Boolean);
    const heldText = !heldBy.length ? ''
      : ` (สินค้า${codes.length ? ` ${codes.slice(0, 3).join(', ')}${codes.length > 3 ? ` +${codes.length - 3}` : ''}` : ` ${heldBy.length} รายการ`}`
        + ` ผูกสูตรนี้อยู่ — ขอราคา FB ของสินค้า${heldBy.length > 1 ? 'เหล่านั้น' : 'นั้น'}ต้องย้ายไปสูตรใหม่)`;
    note = `รอบแก้ — ได้สูตรใหม่ที่ชี้กลับ ${parentName} · ส่งแล้ว ${parentName} เปลี่ยนเป็น "เลิกใช้"`
      + heldText
      + ' · ลูกค้าขอกลับไปใช้ตัวเดิม: หน้ารายการทะเบียนสูตร (เมนู ⋯) เลิกใช้ตัวใหม่ แล้วเปิดใช้ตัวเดิม';
  } else if (plan.kind === 'create' && parentId) {
    note = `รอบแก้ — ได้สูตรใหม่ที่ชี้กลับ ${parentName}`;
  } else if (plan.kind === 'blocked') {
    note = plan.error;
  } else if (plan.kind === 'bind' && plan.warn) {
    note = formulaBindWarning(existing);
  } else if (plan.kind === 'bind') {
    note = `รอบก่อนสร้างสูตร ${formulaName(existing)} ไว้แล้วแต่บันทึกรายการไม่สำเร็จ — ส่งครั้งนี้จะผูกกับสูตรตัวนั้น`;
  }
  // ล็อก "แก้มาจากสูตร" เฉพาะตอนที่ server จะใช้ต้นทางนั้นจริง (สร้าง/รอบแก้) — ผูกกับของเดิมไม่มีอะไรให้ล็อก
  const lockLineage = !!parentId && (plan.kind === 'create' || plan.kind === 'revise');
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
