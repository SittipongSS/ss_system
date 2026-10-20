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
  requestLineShape, requestUsesItems, requestUsesPdr, requestKindMeta, requestNeedsRef,
  requestUsesScentBriefs, requestFormCopy, requestRequiredFiles, requestResultDateOnly,
  requestVariantChosen, requestVariantFieldLabel, requestVariantRequired,
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
 *
 * ⭐ `requiredFileCount` (ประเมินจากแบบ งวด 4 · S4 B-5) — จำนวนไฟล์ในช่องไฟล์บังคับของรูปแบบ **สามสถานะ**:
 *    · ไม่ส่ง (`undefined`) = โหมดสร้าง ⇒ นับตะกร้า `form.requiredFiles`
 *    · `null` = โหมดแก้ที่รายการไฟล์ยังโหลดไม่เสร็จ/โหลดพัง ⇒ **ยังไม่รู้ = ไม่ถือว่าขาด**
 *    · ตัวเลข = โหมดแก้ที่โหลดรายการแล้ว ⇒ เทียบตรง ๆ
 *    🔴 ห้ามเขียน `?? ` — `null` ต้องไม่ตกไปนับตะกร้า (โหมดแก้ตะกร้าว่างเสมอ ⇒ ใบที่มีแบบสามไฟล์จะขึ้น "ยังขาด")
 */
export function requiredChecks(form = {}, opts = {}) {
  const kind = form.kind;
  if (!kind) return [];
  const hasDeal = filled(form.dealId);
  // ⭐ ข้อความของ **ทั้งใบ** (หัวข้อ ทับด้วยรูปแบบที่เลือก) — ตัวเดียวกับที่ช่องจริงอ่าน
  const copy = requestFormCopy(form);
  const requiredFiles = requestRequiredFiles(form);
  const fileCount = requiredFileCountOf(form, opts);
  return [
    /* ⭐ **วิธีประเมินเป็นคำถามแรกของแท็บแรก** (ประเมินจากแบบ งวด 4) — หัวข้อที่ทะเบียนสั่งให้ "ต้องเลือก"
       ไม่มีค่าที่เลือกไว้ให้ ⇒ ฟอร์มใหม่ขึ้น "ยังขาด: วิธีประเมิน" จนกว่าจะกด
       ⚠️ ถาม `requestVariantChosen` ไม่ใช่ `requestVariantKey` (ตัวหลังเติมค่าตั้งต้นให้ ⇒ ไม่มีวันขาด)
       ป้ายมาจากทะเบียน (`variantLabel`) — พัฒนาสูตรไม่บังคับเลือก จึงไม่มีบรรทัดนี้ */
    {
      tab: 'work', label: requestVariantFieldLabel(kind),
      applies: requestVariantRequired(kind), ok: !!requestVariantChosen(form),
    },
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
    // ⚠️ ยอดที่ขอนับเป็นช่องบังคับด้วย — ไม่งั้นเกจเต็มทั้งที่ยังกรอกยอดไม่ครบ
    // แล้วปุ่มบันทึกจางโดยไม่มีอะไรบนจอชี้ว่าติดตรงไหน
    // ⚠️ **แท็บ `subject` ไม่ใช่ `work`** (มติผู้ใช้ 2026-08-24) — ช่องยอดย้ายไปอยู่ใน
    // เนื้อของบรรทัดแล้ว · แท็บที่เกจชี้ต้องเป็นแท็บที่ช่องอยู่จริง ไม่งั้นปุ่ม
    // "ยังขาด: ยอดที่ขอวางบิล" จะพาไปเปิดแท็บที่ไม่มีช่องนั้น
    {
      tab: 'subject', label: 'ยอดที่ขอวางบิล',
      applies: requestNeedsRef(kind, 'quotation'), ok: Number(form.billAmount) > 0,
    },
    // โครงการไม่มีช่องให้เลือก — มันมาจากดีล (มติ 2026-08-06) · ดีลที่ยังไม่ผูก
    // โครงการจึงเป็นของที่ขาดของแท็บนี้ (ข้อความเต็มอยู่ที่ `requestFormBlocker`)
    {
      tab: 'work', label: 'โครงการของดีล',
      applies: requestNeedsRef(kind, 'project') && hasDeal, ok: filled(form.projectId),
    },
    /* ประเมินพื้นที่ (mig 0314) — สถานที่กับพื้นที่เป็นคนละช่อง ต้องขึ้น "ยังขาด"
       แยกกัน · รวมเป็นข้อเดียวแล้วคนเลือกสถานที่แล้วยังเห็นข้อเดิมค้าง ไม่รู้ว่าขาดอะไร
       ⚠️ **แท็บ `subject` ไม่ใช่ `work`** (มติผู้ใช้ 2026-09-02) — ไซต์กับพื้นที่ย้ายไป
       อยู่โซน ② แล้ว เพราะมันคือ "ขออะไร" (ไปวัดที่นี่ พื้นที่เหล่านี้) ไม่ใช่ "งานไหน"
       · แถวพื้นที่เป็น "รายการที่ขอ" ของหัวข้อนี้ด้วย (`lineNoun: 'พื้นที่'`)
       🪤 เกจพาไปเปิดแท็บที่ระบุตรงนี้ ⇒ ปล่อยเป็น `work` ไว้ ปุ่ม "ยังขาด: สถานที่…"
       จะพาไปแท็บที่ไม่มีช่องนั้น (กับดักตัวเดียวกับยอดวางบิลข้างบน)
       ⭐ ป้ายเดียวทั้งสองวิธี "สถานที่ที่จะให้ประเมิน" (มติเจ้าของ 12/10 · S4 O1) — ใบจากแบบไม่มีใคร "เข้าไป" */
    {
      tab: 'subject', label: 'สถานที่ที่จะให้ประเมิน',
      applies: requestNeedsRef(kind, 'site'), ok: filled(form.siteId),
    },
    {
      tab: 'subject', label: 'พื้นที่ที่ต้องประเมินอย่างน้อย 1 รายการ',
      applies: requestNeedsRef(kind, 'site') && filled(form.siteId),
      ok: (form.zones || []).length > 0,
    },
    /* ⭐ **ช่องไฟล์บังคับของรูปแบบ** (ประเมินจากแบบ = แบบ/ผังพื้นที่ · S4 B-3) — อยู่แท็บ `subject` ใต้บล็อกไซต์
       ⚠️ ด่านจริงคือ `requestRequiredFilesError` ตัวเดียวกับ `requestFormBlocker` และ route ส่งคำร้อง */
    {
      tab: 'subject', label: requiredFiles?.label,
      applies: !!requiredFiles, ok: fileCount == null || fileCount > 0,
    },
    // ── แท็บ "เรื่องที่ขอ" ──────────────────────────────────────────────
    { tab: 'subject', label: 'ชื่อเรื่อง', applies: true, ok: filled(form.title) },
    {
      /* ⭐ **รายละเอียดบังคับเฉพาะหัวข้อที่ทะเบียนสั่ง** (มติผู้ใช้ 2026-09-21) —
         ประเมินพื้นที่ไม่มีตารางรายการและไม่มีแบบฟอร์ม PDR ⇒ ช่องนี้คือที่เดียวที่
         บริบทของงานอยู่ · หัวข้ออื่นยังไม่บังคับเหมือนเดิม
         ⚠️ หัวข้อที่ใช้ PDR ไม่มีช่องนี้บนจอ — แบบฟอร์มแทนที่ไปแล้ว ⇒ ต้องไม่ applies
            ไม่งั้นเกจจะค้าง "ยังขาด" โดยไม่มีช่องให้กรอก */
      tab: 'subject', label: copy.bodyLabel || 'รายละเอียด',
      applies: !!copy.bodyRequired && !requestUsesPdr(form),
      ok: filled(form.body),
    },
    {
      // ⚠️ **แถวเปล่าไม่นับ** — ใช้ตัวตรวจรายแถวตัวเดียวกับ server/ด่านส่ง
      // (`normalizeLinesFor`) ไม่ใช่นับความยาวอาเรย์ · กด "เพิ่มรายการ" เฉย ๆ
      // แล้วไม่เลือกอะไรต้องยังขึ้นว่าขาดอยู่
      tab: 'subject', label: 'รายการที่กรอกครบอย่างน้อย 1 รายการ',
      // ⚠️ ส่ง **ทั้งฟอร์ม** ไม่ใช่ `kind` — รูปแบบ NPD ของพัฒนาสูตรไม่มีตารางแถว
      applies: requestUsesItems(form),
      ok: !normalizeLinesFor(requestLineShape(form), form.items).error,
    },
    // ── แท็บ "กำหนดและไฟล์" ─────────────────────────────────────────────
    {
      // ป้ายเดินตามทะเบียนหัวข้อ — งานที่ฝ่ายต้องเดินทางไปทำเองไม่ได้ "รับงาน" ที่ไหน
      // (ตัวเดียวกับป้ายบนช่องจริง — `RequestDueUrgentFields` อ่าน `copy.dueLabel`)
      /* ⭐ **รูปแบบที่มีแต่วันรับผล** (ประเมินจากแบบ) ไม่มีช่องนี้บนจอ — ไม่มีการนัดเข้าพื้นที่
         (server เขียนกระจกของวันรับผลลงคอลัมน์นี้เอง · `requestNormalizeDates`)
         ⭐ **หัวข้อที่บังคับเลือกวิธี แต่ยังไม่เลือก = ยังไม่นับ** (UAT S4 รอบ 4 ข้อ 12) — วิธีเป็นตัวตัดสินว่าช่องนี้มีไหม
            (จากแบบไม่มี) ⇒ ก่อนเลือก ของที่ขาดจริงมีข้อเดียวคือวิธี · เดิมเกจขึ้น 0/7 พร้อม "วันที่ต้องการให้เข้าพื้นที่"
            ทั้งที่ยังไม่รู้ว่าจะมีช่องนั้น · ช่องยังโชว์ให้กรอกได้ (วันที่พิมพ์ก่อนเลือกถูกเก็บไว้ · O7 ถามก่อนล้าง)
         ⚠️ ด่าน server ไม่เปลี่ยน — `requestShapeError` ตอบ "ต้องเลือกวิธีประเมิน…" ก่อนถึงข้อวันอยู่แล้ว
            (ตาราง "ไม่มีแท็บไหนขาด ⟺ ด่านผ่าน" ยังจริง: ยังไม่เลือก = แท็บงานขาด "วิธีประเมิน") */
      tab: 'due', label: copy.dueLabel || 'วันที่ต้องการรับงาน',
      applies: !requestResultDateOnly(form) && !(requestVariantRequired(kind) && !requestVariantChosen(form)),
      ok: filled(form.requestedDueDate),
    },
    {
      /* ⭐ **วันที่สอง: วันส่งผล** (มติผู้ใช้ 2026-09-21 · mig 0368) — มีเฉพาะหัวข้อที่
         ทะเบียนประกาศป้ายไว้ · บังคับเท่ากับวันแรก (ใบที่ไม่บอกว่าต้องใช้ตัวเลขวันไหน
         ทำให้ฝ่ายปลายทางจัดลำดับงานไม่ได้) */
      tab: 'due', label: copy.resultDueLabel || 'วันที่ต้องการรับผล',
      applies: !!copy.resultDueLabel,
      ok: filled(form.requestedResultDate),
    },
    {
      tab: 'due', label: 'เหตุผลที่เป็นงานด่วน',
      applies: !!form.urgent, ok: filled(form.urgentReason),
    },
    {
      // ติ๊กว่ามีภาพประกอบแล้วต้องแนบจริง — ไฟล์อยู่แท็บ "กำหนดและไฟล์"
      // ⚠️ ใช้ `pdrArtworkError` ตัวเดียวกับด่านส่ง/server ไม่ใช่เขียนเงื่อนไขใหม่
      tab: 'due', label: 'ไฟล์ภาพประกอบบรรจุภัณฑ์',
      applies: requestUsesPdr(form) && (form.pdr || {}).packagingArtwork === 'has',
      ok: !pdrArtworkError(form.pdr || {}, { attachmentCount: (form.files || []).length, stage: 'submit' }),
    },
  ].filter((c) => c.applies);
}

/** ช่องบังคับที่ยังขาด เรียงตามลำดับที่ฟอร์มถาม — `[{ tab, label }]` · `opts` เหมือน `requiredChecks` */
export function missingRequiredByTab(form = {}, opts = {}) {
  return requiredChecks(form, opts).filter((c) => !c.ok).map(({ tab, label }) => ({ tab, label }));
}

/* จำนวนไฟล์ของช่องไฟล์บังคับ — กติกาสามสถานะเดียวกับ `requestFormBlocker` (ดูหัว `requiredChecks`)
   ⚠️ แยกเป็นฟังก์ชันเพื่อให้ไม่มีใครเผลอเขียน `opts.requiredFileCount ?? …` ที่กลืน `null` */
export function requiredFileCountOf(form = {}, opts = {}) {
  return opts.requiredFileCount === undefined ? (form.requiredFiles || []).length : opts.requiredFileCount;
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
  /* ⚠️ **ช่องบังคับห้ามถูกนับเป็นช่องไม่บังคับด้วย** — หัวข้อที่ทะเบียนสั่งให้
     "รายละเอียด" บังคับ ช่องนี้ขึ้นอยู่ในเกจ `required` แล้ว (ดู `requiredChecks`) */
  add('subject', !requestUsesPdr(form) && !requestKindMeta(kind)?.form?.bodyRequired, filled(form.body));
  add('subject', requestNeedsRef(kind, 'scent'), filled(form.scentId));
  add('subject', requestNeedsRef(kind, 'formula'), filled(form.formulaId));

  // แบบฟอร์ม PDR นับรวมอยู่ใน "รายละเอียด" — มันคือเนื้อของสิ่งที่ขอ ไม่ใช่คนละเรื่อง
  if (requestUsesPdr(form)) {
    const values = form.pdr || {};
    for (const section of PDR_SECTIONS) {
      const p = pdrFormProgress(section, values);
      counts.subject.total += p.total;
      counts.subject.filled += p.filled;
    }
    // บรีฟรายกลิ่น — จำนวนก้อนมาจากใบสั่งขาย ก้อนที่เขียนเนื้อบรีฟแล้วถือว่ากรอก
    // ⚠️ ไม่นับ "ชื่อเรียก" — ชื่อที่เว้นว่างจะถูกเติม "กลิ่นที่ N" ให้ตอนบันทึก
    // (scentBriefs.js) ⇒ นับชื่อแล้วเกจจะเต็มเองโดยที่ยังไม่มีใครเขียนบรีฟ
    // ⚠️ เฉพาะรูปทรงที่มีบรีฟ — ก้อนค้างของใบที่สลับหัวข้อมาต้องไม่นับเข้าเกจ NPD
    for (const brief of requestUsesScentBriefs(form) ? form.briefs || [] : []) {
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
 * · `requiredFileCount` = ตัวนับไฟล์ของโหมดแก้ (สามสถานะ — ดูหัว `requiredChecks`) · โหมดสร้างไม่ต้องส่ง
 */
export function requestFormTabs(form = {}, { optionalRefs = [], requiredFileCount } = {}) {
  const kind = form.kind;
  const checks = requiredChecks(form, { requiredFileCount });
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
