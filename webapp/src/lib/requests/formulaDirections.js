// ── พัฒนาสูตรหลาย direction ต่อกลิ่น (ม-157 · IS-26100002 · mig 0411) — logic ล้วน ──────────────────────
//
// ⭐ **มติเจ้าของ 2026-10-19** (ถามทีละข้อ):
//   1 ส่งหลาย direction ได้ **ทุกรอบ** (รอบแรกและรอบแก้)
//   2 สูตรที่ส่งเป็น "กำลังพัฒนา" จน **ลูกค้าคอนเฟิร์ม** — ตัวเดิมยังใช้งานอยู่ระหว่างรอ · คอนเฟิร์มแล้วตัวที่ได้ = ใช้งาน
//     ตัวเดิม + direction อื่น = เลิกใช้พร้อมกัน
//   3 direction อื่นของกลิ่นเดียวกันที่ยังค้าง (ยังไม่มีผล · รอบแก้ที่ยังไม่ส่ง) **ปิดให้เอง** เป็น "ไม่ถูกเลือก"
//     · โมดัลคอนเฟิร์มบอกก่อนกดว่าตัวไหนจะถูกปิด (`formulaConfirmPlan().note`)
//
// ⭐ **direction เพิ่ม = แถวพี่น้อง** ไม่ใช่สูตรสองตัวในแถวเดียว — แต่ละ direction มีราง (รับของ · ส่งลูกค้า · ผลลูกค้า)
//   และราคาของตัวเอง ⇒ ใช้ก้าวรายแถวชุดเดิมได้ทั้งหมด · แถวเพิ่มชี้ **แถวแรกของชุด** (`directionOfItemId`) และยก
//   สายพันธุ์รอบแก้ (`derivedFromItemId`) ของแถวแรกมาด้วย ⇒ แผนส่งสูตรเห็นต้นทางตัวเดียวกัน
//
// ⚠️ จอกับ server ถามตัวเดียวกันทุกข้อ (กติกาเดียวกับ `formulaRework.js`) — ประโยคก่อนกดต้องตรงกับที่เกิดจริง
import { findFormulaByIdentity } from '@/lib/master/formulas';
import { REQUEST_OPEN_STATUSES } from '@/lib/requests/statuses';
import { isRowSettled, rowStage } from '@/lib/requests/rowStage';
import { requestedLabel } from '@/lib/requests/rowLabel';
import { formulaHeldByText, formulaName } from '@/lib/requests/formulaRework';

/** แถวแรกของชุด direction (แถวที่มีอยู่ก่อน) — แถวเพิ่มชี้มันผ่าน `directionOfItemId` */
export const directionRootId = (row) => row?.directionOfItemId || row?.id || null;

const samePair = (a, b) => !!a && !!b && a.lineKind === 'product_dev' && b.lineKind === 'product_dev'
  && a.categoryCode === b.categoryCode && a.scentId === b.scentId;

/** ทุกแถวของคู่ หมวด × กลิ่น เดียวกันในใบ (ทุกรอบ ทุก direction) — ไม่รวมตัวเอง */
export function pairSiblings(row, items = []) {
  return (items || []).filter((i) => i && i.id !== row?.id && samePair(i, row));
}

/** แถวที่ลูกค้าคอนเฟิร์มแล้วของคู่นี้ (ถึงขั้นรอราคา/จบแล้ว) — คู่หนึ่งคอนเฟิร์มได้ครั้งเดียว */
const confirmedSibling = (row, items) => pairSiblings(row, items)
  .find((i) => i.outcome === 'confirmed' || i.answerStatus === 'done') || null;

/**
 * ส่ง direction เพิ่มจากแถวนี้ได้ไหม — null = ได้ · ข้อความ = เหตุ (จอโชว์ตอนกด · server ตีกลับ 409)
 *
 * ⚠️ แถวแรกต้อง **ส่งงานแล้ว** — แถวที่ยังไม่ส่งเพิ่ม direction ในโมดัลส่งงานของมันเอง (แท็บ) ⇒ ชุดเริ่มที่ direction 1 เสมอ
 * ⚠️ แถวที่ลูกค้าตอบแล้วรับ direction เพิ่มไม่ได้ — ของใหม่หลังลูกค้าตอบคือรอบแก้ ("ลูกค้าขอให้แก้" เปิดแถวให้เอง)
 */
export function addDirectionError(request, row, items = []) {
  if (!row) return 'ไม่พบรายการ';
  if (row.lineKind !== 'product_dev') return 'ส่ง direction เพิ่มได้เฉพาะรายการพัฒนาสูตร';
  if (request && !REQUEST_OPEN_STATUSES.includes(request.status)) return 'คำร้องนี้ไม่ได้เปิดอยู่ — ส่ง direction เพิ่มไม่ได้';
  if (!row.readyAt) return 'ส่งงานรายการนี้ก่อน — direction เพิ่มเติมในหน้าต่างส่งงานได้เลย';
  if (row.outcome || ['done', 'declined'].includes(row.answerStatus)) {
    return 'รายการนี้ลูกค้าตอบแล้ว — สูตรใหม่หลังจากนี้คือรอบแก้ (บันทึก "ลูกค้าขอให้แก้")';
  }
  const confirmed = confirmedSibling(row, items);
  if (confirmed) return 'ลูกค้าคอนเฟิร์มสูตรของกลิ่นนี้ในใบนี้ไปแล้ว — ส่ง direction เพิ่มไม่ได้';
  return null;
}

/**
 * แถว direction เพิ่มที่จะเกิด — ยก "สิ่งที่ขอ" + สายพันธุ์รอบแก้ + ตรารับเรื่องจากแถวแรก · ช่องก้าว/ผลลัพธ์ผู้เรียกใส่เอง
 * ⚠️ แบบเดียวกับ `followUpRowFrom` (hops.js) แต่ **ไม่ใช่รอบแก้** — `derivedFromItemId` ยกของแถวแรก (ต้นทางเดียวกัน)
 *    ไม่ใช่ชี้แถวแรก · ชี้แถวแรกเมื่อไร แผนส่งสูตรจะคิดว่า direction 1 คือต้นทางที่ต้องแก้
 */
export function directionRowFrom(anchor, { sortOrder = 0 } = {}) {
  return {
    requestId: anchor.requestId,
    lineKind: 'product_dev',
    sortOrder,
    kind: anchor.kind ?? null,
    label: requestedLabel(anchor.label),
    spec: anchor.spec ?? null,
    categoryCode: anchor.categoryCode ?? null,
    scentId: anchor.scentId ?? null,
    briefId: anchor.briefId ?? null,
    qty: anchor.qty ?? null,
    unit: anchor.unit ?? null,
    derivedFromItemId: anchor.derivedFromItemId ?? null,
    directionOfItemId: directionRootId(anchor),
    answerStatus: 'pending',
    // ใต้รอบรับเรื่องเดียวกับแถวแรก — ไม่ใช่วันนี้ (เส้นวัด lead time)
    ackAt: anchor.ackAt ?? null,
    ackById: anchor.ackById ?? null,
    ackByName: anchor.ackByName ?? null,
    dueAt: anchor.dueAt ?? null,
  };
}

/**
 * ลูกค้าคอนเฟิร์มแถวพัฒนาสูตร — ทะเบียนกับแถวพี่น้องต้องเปลี่ยนอย่างไร
 *
 * @param formulas ทะเบียนสูตร (ทุกสถานะ — อย่างน้อยตัวที่แถวของคู่นี้ถือ + ตัวที่จองตัวตน)
 * @param customerId ลูกค้าของใบ — สูตรของลูกค้าอื่น (แชร์มา) ห้ามถูกเลิกใช้จากใบนี้
 * @returns
 *  · `{ kind: 'none' }` — ไม่ใช่แถวพัฒนาสูตร/ไม่มีสูตร (ไม่แตะทะเบียน · ไม่ปิดแถวอื่น)
 *  · `{ kind: 'blocked', error }` — บันทึกคอนเฟิร์มไม่ได้ (ตีกลับก่อนเขียนอะไร)
 *  · `{ kind: 'apply', chosen, activate, archive, close, note }`
 *      activate — พลิกตัวที่ได้ developing → active (แถวที่ส่งก่อน ม-157 สูตร active อยู่แล้ว = false)
 *      archive  — สูตรที่ต้องเลิกใช้ **ตัวที่จองตัวตนอยู่ก่อน** (ต้องเลิกก่อนพลิก — ดัชนีตัวตน) แล้วตามด้วย direction อื่น
 *      replaced — ตัวที่จองตัวตนอยู่ (ตัวเดิม) — พลิกตัวที่ได้ไม่สำเร็จต้องคืนตัวนี้ ไม่งั้นคู่นี้ไม่มีสูตรใช้งานเลย
 *      close    — แถวของคู่นี้ที่ยังค้าง → "ไม่ถูกเลือก"
 */
export function formulaConfirmPlan({ row, items = [], formulas = [], customerId = null }) {
  if (row?.lineKind !== 'product_dev' || !row.producedFormulaId) return { kind: 'none' };
  const byId = new Map((formulas || []).map((f) => [f.id, f]));
  const chosen = byId.get(row.producedFormulaId) || null;
  if (!chosen) return { kind: 'none' };
  if (chosen.status === 'archived') {
    return {
      kind: 'blocked',
      error: `สูตร ${formulaName(chosen)} ถูกเลิกใช้ในทะเบียนไปแล้ว — ให้ RD เปิดใช้ที่ทะเบียนสูตรก่อน แล้วค่อยบันทึกคอนเฟิร์ม`,
    };
  }
  const confirmed = confirmedSibling(row, items);
  if (confirmed) {
    const held = byId.get(confirmed.producedFormulaId);
    return {
      kind: 'blocked',
      error: `ลูกค้าคอนเฟิร์มสูตร${held ? ` ${formulaName(held)} ` : ''}ของกลิ่นนี้ในใบนี้ไปแล้ว — หมวดเดียวกับกลิ่นเดียวใช้งานได้สูตรเดียว`,
    };
  }

  const foreign = (f) => !!(customerId && f?.customerId && f.customerId !== customerId);
  /* ⚠️ **ไม่ปลุกสูตรที่แถวแค่ผูกไว้ / สูตรของลูกค้าอื่น** (รีวิว ม-157) — แถวเก่าผูกสูตรกำลังพัฒนาของคนอื่นได้ (ก่อน 0411
     ตัวตนนับ developing: สูตรจากพัฒนากลิ่น ม-148 · สูตรที่ RD ถอยกลับไปพัฒนา) · ปลุกให้เอง = เปลี่ยนทะเบียนของคนที่ตั้งใจพักไว้ */
  const activate = chosen.status === 'developing' && row.producedFormulaAction !== 'bind' && !foreign(chosen);
  const archive = [];
  let replaced = null;
  const holder = findFormulaByIdentity(formulas, { categoryCode: row.categoryCode, scentId: row.scentId });
  if (activate && holder && holder.id !== chosen.id) {
    if (holder.status === 'draft') {
      return {
        kind: 'blocked',
        error: `หมวด × กลิ่นนี้มีสูตร ${formulaName(holder)} เป็นร่างในทะเบียน — รับเข้าทะเบียนหรือลบร่างก่อน แล้วค่อยบันทึกคอนเฟิร์ม`,
      };
    }
    if (foreign(holder)) {
      return {
        kind: 'blocked',
        error: `สูตรที่ใช้งานอยู่ของกลิ่นนี้ (${formulaName(holder)}) เป็นของ ${holder.customerName || 'ลูกค้ารายอื่น'} — `
          + 'คอนเฟิร์มสูตรใหม่แทนตัวนั้นไม่ได้ ให้ RD ตกลงกับเจ้าของสูตรก่อน',
      };
    }
    archive.push(holder);
    replaced = holder;
  }
  /* direction อื่น/รอบก่อนที่ **ใบนี้สร้าง** — ไม่ใช่ตัวที่ผูกของเดิม (bind = สูตรที่มีอยู่ก่อน อาจเป็นของลูกค้าอื่น)
     · ร่าง/เลิกใช้แล้ว/ของลูกค้าอื่น ข้าม */
  const pair = pairSiblings(row, items);
  for (const sibling of pair) {
    if (!sibling.producedFormulaId || sibling.producedFormulaAction === 'bind') continue;
    const f = byId.get(sibling.producedFormulaId);
    if (!f || f.id === chosen.id || ['archived', 'draft'].includes(f.status) || foreign(f)) continue;
    if (!archive.some((a) => a.id === f.id)) archive.push(f);
  }
  const close = pair.filter((i) => !isRowSettled(i) && rowStage(i) !== 'awaiting_price');

  const parts = [];
  if (activate) parts.push(`สูตร ${formulaName(chosen)} เปลี่ยนเป็น "ใช้งานได้"`);
  if (archive.length) {
    parts.push(`${archive.map((f) => formulaName(f)).join(', ')} เปลี่ยนเป็น "เลิกใช้"`
      + archive.map((f) => formulaHeldByText(f)).join(''));
  }
  if (close.length) {
    const codes = close.map((i) => byId.get(i.producedFormulaId)).filter(Boolean).map((f) => formulaName(f));
    parts.push(`ปิดรายการอื่นของกลิ่นนี้ที่ยังค้าง ${close.length} รายการ เป็น "ไม่ถูกเลือก"`
      + (codes.length ? ` (${codes.join(', ')})` : ''));
  }
  return {
    kind: 'apply', chosen, activate, archive, close, replaced,
    note: parts.length ? `บันทึกแล้ว: ${parts.join(' · ')}` : null,
  };
}

/** เหตุที่ปิดแถวพี่น้อง — ลง `declineReason` (constraint answer_evidence บังคับ) และอ่านบนแถวเป็นคำตอบของลูกค้า */
export const notChosenReason = (chosen) => `ลูกค้าเลือก ${formulaName(chosen, 'direction อื่น')} แล้ว`;

/**
 * ลำดับแถวของตารางพัฒนาสูตร + ป้าย direction — แถวของกลิ่นเดียวกันอยู่ติดกัน (รอบแรก → รอบแก้ · direction 1 → 2)
 *
 * 🐞 เดิมเรียงตาม `sortOrder` ล้วน — รอบแก้กับ direction เพิ่มเกิดทีหลังได้เลขท้ายสุด ⇒ ไปอยู่ใต้กลิ่นอื่นทั้งใบ
 *    อ่านไม่ออกว่าเป็น direction ของกลิ่นไหน
 * @returns `{ order: Map<id, index>, direction: Map<id, { no, total }> }` — `direction` มีเฉพาะชุดที่มี ≥ 2 ตัว
 */
export function formulaDevRowOrder(items = []) {
  const rows = (items || []).filter((i) => i?.lineKind === 'product_dev');
  const byId = new Map(rows.map((r) => [r.id, r]));
  const sort = (r) => Number(r?.sortOrder) || 0;
  const pairKey = (r) => `${r.categoryCode}::${r.scentId}`;
  const depth = (r) => {
    let d = 0;
    let cur = r;
    const seen = new Set();
    while (cur?.derivedFromItemId && byId.has(cur.derivedFromItemId) && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = byId.get(cur.derivedFromItemId);
      d += 1;
    }
    return d;
  };
  const pairFirst = new Map();
  for (const r of rows) {
    const k = pairKey(r);
    pairFirst.set(k, Math.min(pairFirst.get(k) ?? Infinity, sort(r)));
  }
  const rootSort = (r) => sort(byId.get(directionRootId(r)) || r);
  const sorted = [...rows].sort((a, b) => (
    pairFirst.get(pairKey(a)) - pairFirst.get(pairKey(b))
    || depth(a) - depth(b)
    || rootSort(a) - rootSort(b)
    || (a.directionOfItemId ? 1 : 0) - (b.directionOfItemId ? 1 : 0)
    || sort(a) - sort(b)
  ));
  const order = new Map(sorted.map((r, i) => [r.id, i]));
  const sets = new Map();
  for (const r of sorted) {
    const root = directionRootId(r);
    if (!sets.has(root)) sets.set(root, []);
    sets.get(root).push(r.id);
  }
  const direction = new Map();
  for (const ids of sets.values()) {
    if (ids.length < 2) continue;
    ids.forEach((id, i) => direction.set(id, { no: i + 1, total: ids.length }));
  }
  return { order, direction };
}
