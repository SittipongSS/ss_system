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
  lineShapeForKind, requestHasItems, requestHasPdr, requestNeedsRef,
} from '@/lib/master/requestTypes';
import { normalizeLinesFor } from '@/lib/requests/kinds/lineShapes';
import { PDR_SECTIONS, pdrArtworkError, pdrFormProgress } from '@/lib/requests/pdrFields';

/* ⚠️ **ทุกหัวข้อใช้แท็บ ไม่มีข้อยกเว้นสำหรับหัวข้อเล็ก** (มติผู้ใช้ 2026-08-09)
   วัดแล้ว: สอบถามข้อมูล 8 ช่อง (3/2/3 ต่อแท็บ) ความสูงหน้าเท่ากันทุกแท็บที่ 934px
   บนจอ 837px ⇒ แท็บไม่ได้ช่วยลดการเลื่อนของหัวข้อเล็กเลย · ผู้ใช้เลือกความคงเส้น
   คงวาแทน "ทุกหัวข้อหน้าตาเหมือนกันหมด แลกกับคลิกเพิ่มในหัวข้อเล็ก"
   ⛔ ห้ามใส่เงื่อนไข "หัวข้อเล็กไม่ต้องมีแท็บ" กลับมาโดยไม่ถามเจ้าของงานก่อน —
   มันคือสองเลย์เอาต์ที่ต้องดูแลคู่กันไปตลอด ซึ่งเป็นสิ่งที่มติข้อนี้ปฏิเสธ */
export const REQUEST_TAB_KEYS = ['work', 'subject', 'due'];

/* ⭐ **สามแท็บเท่ากันทุกหัวข้อ** (มติผู้ใช้ 2026-08-09) — เดิมหัวข้อที่มีแบบฟอร์ม PDR
   ได้แท็บที่สี่ ทำให้จำนวนแท็บไม่เท่ากันระหว่างหัวข้อ · ตอนนี้ PDR ไปอยู่ใน
   "รายละเอียด" ซึ่งเป็นที่ของ *เนื้อคำร้อง* อยู่แล้ว (ชื่อเรื่อง · บรีฟ · รายการที่ขอ)
   ⚠️ ชื่อ "รายละเอียด" ไม่ใช่ "เรื่องที่ขอ" อีกแล้ว — พอ PDR เข้ามาอยู่ด้วย
   แท็บนี้ไม่ได้ถามแค่ "ขออะไร" แต่เป็นรายละเอียดทั้งหมดของสิ่งที่ขอ */
const TAB_LABELS = {
  work: 'งาน',
  subject: 'รายละเอียด',
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
    // ⭐ ใบเสนอราคาเป็น **ต้นทาง** ของขอเอกสารการเงิน (ม-ค) — หัวข้อนั้นไม่มีช่องดีล
    // เพราะดีลเติมมาจากใบที่เลือก · หัวข้อที่อ้าง QT แบบ "ถ้ามี" ไม่เข้าข้อนี้
    {
      tab: 'work', label: 'ใบเสนอราคา',
      applies: requestNeedsRef(kind, 'quotation'), ok: filled(form.quotationId),
    },
    // ⚠️ ยอดที่ขอนับเป็นช่องบังคับของแท็บนี้ด้วย — ไม่งั้นเกจเต็มทั้งที่ยังกรอกยอด
    // ไม่ครบ แล้วปุ่มบันทึกจางโดยไม่มีอะไรบนจอชี้ว่าติดตรงไหน
    {
      tab: 'work', label: 'ยอดที่ขอวางบิล',
      applies: requestNeedsRef(kind, 'quotation'), ok: Number(form.billAmount) > 0,
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
      // ⚠️ **แถวเปล่าไม่นับ** — ใช้ตัวตรวจรายแถวตัวเดียวกับ server/ด่านส่ง
      // (`normalizeLinesFor`) ไม่ใช่นับความยาวอาเรย์ · กด "เพิ่มรายการ" เฉย ๆ
      // แล้วไม่เลือกอะไรต้องยังขึ้นว่าขาดอยู่
      tab: 'subject', label: 'รายการที่กรอกครบอย่างน้อย 1 รายการ',
      applies: requestHasItems(kind),
      ok: !normalizeLinesFor(lineShapeForKind(kind), form.items).error,
    },
    // ── แท็บ "กำหนดและไฟล์" ─────────────────────────────────────────────
    {
      tab: 'due', label: 'วันที่ต้องการรับงาน',
      applies: true, ok: filled(form.requestedDueDate),
    },
    {
      tab: 'due', label: 'เหตุผลที่เป็นงานด่วน',
      applies: !!form.urgent, ok: filled(form.urgentReason),
    },
    {
      // ติ๊กว่ามีภาพประกอบแล้วต้องแนบจริง — ไฟล์อยู่แท็บ "กำหนดและไฟล์"
      // ⚠️ ใช้ `pdrArtworkError` ตัวเดียวกับด่านส่ง/server ไม่ใช่เขียนเงื่อนไขใหม่
      tab: 'due', label: 'ไฟล์ภาพประกอบบรรจุภัณฑ์',
      applies: requestHasPdr(kind) && (form.pdr || {}).packagingArtwork === 'has',
      ok: !pdrArtworkError(form.pdr || {}, { attachmentCount: (form.files || []).length, stage: 'submit' }),
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

  // แบบฟอร์ม PDR นับรวมอยู่ใน "รายละเอียด" — มันคือเนื้อของสิ่งที่ขอ ไม่ใช่คนละเรื่อง
  if (requestHasPdr(kind)) {
    const values = form.pdr || {};
    for (const section of PDR_SECTIONS) {
      const p = pdrFormProgress(section, values);
      counts.subject.total += p.total;
      counts.subject.filled += p.filled;
    }
    // บรีฟรายกลิ่น — จำนวนก้อนมาจากใบสั่งขาย ก้อนที่เขียนเนื้อบรีฟแล้วถือว่ากรอก
    // ⚠️ ไม่นับ "ชื่อเรียก" — ชื่อที่เว้นว่างจะถูกเติม "กลิ่นที่ N" ให้ตอนบันทึก
    // (scentBriefs.js) ⇒ นับชื่อแล้วเกจจะเต็มเองโดยที่ยังไม่มีใครเขียนบรีฟ
    for (const brief of form.briefs || []) {
      counts.subject.total += 1;
      if (filled(brief?.brief)) counts.subject.filled += 1;
    }
  }

  add('due', true, (form.files || []).length > 0);
  return counts;
}

/**
 * แท็บทั้งหมดของหัวข้อนี้ พร้อมเกจ — ผู้เรียกเอาไปวาดตรง ๆ ได้เลย
 *
 * คืน `[{ key, label, required: {total, filled, missing[]}, optional: {total, filled} }]`
 * · `optionalRefs` ส่งเข้ามาเพราะมันเป็นของหัวข้อ (ดู `requestOptionalRefs`)
 *   แต่ผู้เรียกรู้อยู่แล้ว — รับเป็น argument ดีกว่า import วนกันไปมา
 */
export function requestFormTabs(form = {}, { optionalRefs = [] } = {}) {
  const kind = form.kind;
  const checks = requiredChecks(form);
  const optional = optionalCounts(form, kind, optionalRefs);
  return REQUEST_TAB_KEYS
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
