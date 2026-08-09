// ── แท็บของฟอร์มคำร้อง + เกจวัดความครบ (logic ล้วน) ─────────────────────
//
// ⭐ มติผู้ใช้ 2026-08-09 ("แบบ A"): ฟอร์มยาว 52 ช่องแบ่งเป็นแท็บ และแต่ละแท็บ
// ต้องบอกได้ว่า **ส่งได้ยัง** โดยไม่ต้องเปิดเข้าไปดู
//
// ⚠️ **เกจมีสองความหมาย ห้ามยุบเป็น % เดียว** — ช่องบังคับจริงมีแค่ 3–4 ช่องต่อ
// หัวข้อ ส่วนแบบฟอร์ม PDR **41 ช่องไม่บังคับสักช่อง** ⇒ "% ของทั้งฟอร์ม" จะขึ้น
// ~12% ทั้งที่กรอกครบทุกช่องที่ระบบต้องการแล้ว ซึ่งอ่านเหมือนยังทำอะไรผิดอยู่
//   · `required` = ด่านส่ง (ต้องตรงกับ `requestFormBlocker`)
//   · `optional` = กรอกไปเท่าไร (ข้อมูลเฉย ๆ ไม่กันการส่ง)
//
// ⚠️ **ห้ามเขียนกฎบังคับใหม่ที่นี่** — ช่องบังคับต้องเป็นชุดเดียวกับ
// `requestShapeError`/`requestFormBlocker` ที่ server ใช้ · เทสต์ผูกไว้ว่า
// "ไม่มีแท็บไหนขาด ⟺ requestFormBlocker ผ่าน" ถ้าใครเพิ่มกฎข้างเดียวเทสต์จะแตก
import {
  requestHasItems, requestHasPdr, requestNeedsRef,
} from '@/lib/master/requestTypes';
import { PDR_SECTIONS, pdrFormProgress } from '@/lib/requests/pdrFields';

export const REQUEST_TAB_KEYS = ['work', 'subject', 'pdr', 'due'];

const TAB_LABELS = {
  work: 'งาน',
  subject: 'เรื่องที่ขอ',
  pdr: 'ฟอร์ม PDR',
  due: 'กำหนดและไฟล์',
};

const filled = (v) => v != null && String(v).trim() !== '';

/**
 * ช่องบังคับทั้งหมดของหัวข้อนี้ — `[{ tab, label, applies, ok }]`
 *
 * ⚠️ `applies` แยกจาก `ok` เพราะช่องบังคับบางตัว **มีเงื่อนไข**: เหตุผลงานด่วน
 * บังคับเฉพาะตอนติ๊กด่วน · โครงการบังคับเฉพาะเมื่อเลือกดีลแล้ว (ก่อนหน้านั้น
 * ของที่ขาดคือ "ดีล" ไม่ใช่ "โครงการ") ⇒ ตัวหารของเกจต้องนับเฉพาะตัวที่ applies
 * ไม่งั้นแท็บจะขึ้น 1/2 ค้างตลอดโดยไม่มีช่องที่สองให้กรอก
 */
export function requiredChecks(form = {}) {
  const kind = form.kind;
  if (!kind) return [];
  const hasDeal = filled(form.dealId);
  return [
    // ── แท็บ "งาน": ของที่หัวข้อนั้นต้องอ้าง (มาจากธง `needs` ที่เดียว) ────
    {
      tab: 'work', label: 'ใบสั่งขาย',
      applies: requestNeedsRef(kind, 'salesOrder'), ok: filled(form.salesOrderId),
    },
    {
      tab: 'work', label: 'ดีล',
      applies: requestNeedsRef(kind, 'deal'), ok: hasDeal,
    },
    // โครงการไม่มีช่องให้เลือก — มันมาจากดีล (มติ 2026-08-06) · ดีลที่ยังไม่ผูก
    // โครงการจึงเป็นของที่ขาดของแท็บนี้ (ข้อความเต็มอยู่ที่ `requestFormBlocker`)
    {
      tab: 'work', label: 'โครงการของดีล',
      applies: requestNeedsRef(kind, 'project') && hasDeal, ok: filled(form.projectId),
    },
    // ── แท็บ "เรื่องที่ขอ" ──────────────────────────────────────────────
    { tab: 'subject', label: 'ชื่อเรื่อง', applies: true, ok: filled(form.title) },
    {
      tab: 'subject', label: 'รายการอย่างน้อย 1 รายการ',
      applies: requestHasItems(kind), ok: (form.items || []).length > 0,
    },
    // ── แท็บ "กำหนดและไฟล์" ─────────────────────────────────────────────
    {
      tab: 'due', label: 'วันที่ต้องการคำตอบ',
      applies: true, ok: filled(form.requestedDueDate),
    },
    {
      tab: 'due', label: 'เหตุผลที่เป็นงานด่วน',
      applies: !!form.urgent, ok: filled(form.urgentReason),
    },
  ].filter((c) => c.applies);
}

/** ช่องบังคับที่ยังขาด เรียงตามลำดับที่ฟอร์มถาม — `[{ tab, label }]` */
export function missingRequiredByTab(form = {}) {
  return requiredChecks(form).filter((c) => !c.ok).map(({ tab, label }) => ({ tab, label }));
}

/* ช่องไม่บังคับของแต่ละแท็บ — นับเพื่อบอก "กรอกไปเท่าไร" เท่านั้น
   ⚠️ นับเฉพาะช่องที่ **หัวข้อนั้นมีจริงบนจอ** ไม่งั้นตัวหารจะโตกว่าที่เห็น */
function optionalCounts(form, kind, optionalRefs) {
  const counts = {
    work: { total: 0, filled: 0 },
    subject: { total: 0, filled: 0 },
    pdr: { total: 0, filled: 0 },
    due: { total: 0, filled: 0 },
  };
  const add = (tab, has, isFilled) => {
    if (!has) return;
    counts[tab].total += 1;
    if (isFilled) counts[tab].filled += 1;
  };

  add('work', optionalRefs.includes('quotation'), filled(form.quotationId));
  add('work', optionalRefs.includes('salesOrder') && !requestNeedsRef(kind, 'salesOrder'), filled(form.salesOrderId));
  add('work', optionalRefs.includes('product'), (form.productIds || []).length > 0);

  // หัวข้อที่ใช้ PDR ไม่มีช่อง "รายละเอียด" ธรรมดา — แบบฟอร์มแทนที่มันไปแล้ว
  add('subject', !requestHasPdr(kind), filled(form.body));
  add('subject', requestNeedsRef(kind, 'scent'), filled(form.scentId));
  add('subject', requestNeedsRef(kind, 'formula'), filled(form.formulaId));

  if (requestHasPdr(kind)) {
    const values = form.pdr || {};
    for (const section of PDR_SECTIONS) {
      const p = pdrFormProgress(section, values);
      counts.pdr.total += p.total;
      counts.pdr.filled += p.filled;
    }
    // บรีฟรายกลิ่น — จำนวนก้อนมาจากใบสั่งขาย ก้อนที่เขียนชื่อแล้วถือว่ากรอก
    for (const brief of form.briefs || []) {
      counts.pdr.total += 1;
      if (filled(brief?.label)) counts.pdr.filled += 1;
    }
  }

  add('due', true, (form.files || []).length > 0);
  return counts;
}

/**
 * แท็บทั้งหมดของหัวข้อนี้ พร้อมเกจ — ผู้เรียกเอาไปวาดตรง ๆ ได้เลย
 *
 * คืน `[{ key, label, required: {total, filled, missing[]}, optional: {total, filled} }]`
 * · แท็บ PDR โผล่เฉพาะหัวข้อที่ประกาศ `hasPdr`
 * · `optionalRefs` ส่งเข้ามาเพราะมันเป็นของหัวข้อ (ดู `requestOptionalRefs`)
 *   แต่ผู้เรียกรู้อยู่แล้ว — รับเป็น argument ดีกว่า import วนกันไปมา
 */
export function requestFormTabs(form = {}, { optionalRefs = [] } = {}) {
  const kind = form.kind;
  const checks = requiredChecks(form);
  const optional = optionalCounts(form, kind, optionalRefs);
  return REQUEST_TAB_KEYS
    .filter((key) => (key === 'pdr' ? requestHasPdr(kind) : true))
    .map((key) => {
      const mine = checks.filter((c) => c.tab === key);
      return {
        key,
        label: TAB_LABELS[key],
        required: {
          total: mine.length,
          filled: mine.filter((c) => c.ok).length,
          missing: mine.filter((c) => !c.ok).map(({ tab, label }) => ({ tab, label })),
        },
        optional: optional[key],
      };
    });
}
