// ── เหตุการณ์ของใบเสนอราคา / ใบสั่งขาย → เธรดของ "ดีลแม่" ────────────────
//
// แพตเทิร์นเดียวกับ lib/costingUpdates.js: ไฟล์นี้ตอบแค่ "ควรบันทึกอะไรลงเธรด"
// เป็นตรรกะล้วนที่เทสต์ได้ ส่วน I/O เป็นของ lib/master/updates.js
//
// ⭐ **ใบไม่มีเธรดของตัวเองแล้ว** (มติผู้ใช้ 2026-08-04) — ของเดิมทุก action ลงสองที่
// คือเธรดของใบและเงาบนดีล แต่ตรวจของจริงแล้วพบว่า **ไม่มีใครพิมพ์ในเธรดของใบเลย
// สักข้อความ** (QT 21 เหตุการณ์ · SO 1 · ข้อความคน 0) ขณะที่เงาบนดีลถูกอ่านจริง
// ทั้งบนหน้าดีลและไหลต่อขึ้นหน้าโครงการ ⇒ เหลือที่เดียวคือดีล
//
// 🔴 **ดังนั้นที่นี่คือที่เดียวที่เหตุผลของ QT/SO ถูกเก็บให้คนอ่าน** — เหตุผลทุกอัน
// ที่ระบบบังคับกรอก (ดึงกลับ · ตีกลับ · ออก Rev. · ย้อนการรับ · ย้อนการอนุมัติ ·
// ยกเลิก · override ของ admin) ลงคอลัมน์เดียวของใบซึ่งรอบถัดไปเขียนทับทันที:
//   · `rejectionReason` ถูกล้างตอน restore/submit ใหม่
//   · `revisionReason` เก็บได้รอบเดียว — ใบที่ออก Rev. สามรอบเหลือเหตุผลรอบสุดท้าย
//   · ที่เหลือลงแต่ audit log ซึ่งเปิดได้เฉพาะ supervisor และไม่มีลิงก์จากหน้าใบ
// ตกหล่นที่นี่ = หายถาวร ไม่มีที่สำรองอีกแล้ว
//
// ⚠️ ทุกฟังก์ชันต้องทนของไม่ครบ (คืน null) — ผู้เรียกอยู่หลังจุดที่ DB เขียนสำเร็จ
// แล้ว การโยน error ตรงนั้นจะทำให้ action ที่สำเร็จแล้วตอบ 500

const clip = (s, n = 1000) => String(s ?? '').trim().slice(0, n) || null;

// คำศัพท์ล็อกตามมติผู้ใช้ (ดู [[qt-so-workflow-vocabulary]]): **ตีกลับ** = ผู้อนุมัติ
// ส่งคืนให้แก้ · **ดึงกลับ** = ผู้ยื่นเอาคืนเอง · **ออก Rev.** = ออกฉบับใหม่แทนฉบับเดิม
// ห้ามใช้คำว่า "ถอน/ถอด" ที่ไหนในไฟล์นี้
const REASON_SUFFIX = (reason) => (clip(reason) ? ` — ${clip(reason)}` : ' — ไม่ระบุเหตุผล');

// ── ทุกเหตุการณ์ของใบ ลงเธรดของดีลแม่ ────────────────────────────────────
//
// ⭐ **จุดประสงค์ของเธรดดีลคือสมุดบันทึกความเคลื่อนไหวของดีล** (มติผู้ใช้) — และ
// ความเคลื่อนไหวที่มีค่าที่สุดของดีล (ราคาที่เสนอไป · ลูกค้ารับหรือตีกลับ) เกิดบน
// *ใบ* ทั้งหมด คนเปิดดีลย้อนหลังจึงไม่เห็นอะไรเลยนอกจากที่ AE พิมพ์เอง
//
// ⚠️ **ครบทุก action โดยเจตนา** — เดิม `withdraw`/`restore` ไม่ส่งขึ้นดีลเพราะถือว่า
// เป็นการบ้านภายในของคนทำใบ (ดีลยังอยู่ที่เดิม) และเหตุผลของมันยังอ่านได้ในเธรด
// ของใบ · พอใบไม่มีเธรดแล้ว การไม่ส่งขึ้น = **เหตุผลตอนดึงกลับหายถาวร** ซึ่งเป็น
// ของที่กรอกจริง (3 ครั้งในเดือนแรก) ⇒ ส่งขึ้นทั้งคู่
//
// ⚠️ ทั้งสองตัวใช้ kind `doc_withdraw` ที่แยกจาก `doc_return` (ตีกลับ) เพราะสีของ
// ชนิดคือสิ่งที่ช่วยกวาดตาแล้วรู้ว่า "อันไหนคือปัญหา" — ผู้ยื่นเอาใบคืนเองไม่ใช่
// ปัญหาแบบเดียวกับผู้อนุมัติตีกลับ (คำศัพท์ล็อกตามมติ: ดึงกลับ ≠ ตีกลับ)
//
// เลขที่ใบอยู่ในเนื้อความเสมอ — `RichText` แปลงเป็นลิงก์ `/go/<รหัส>` ให้เอง
const DEAL_MIRROR_KIND = {
  submit: 'doc_submit',
  approve: 'doc_approve',
  reject: 'doc_return',
  accept: 'doc_accept',
  revise: 'doc_revise',
  cancel: 'doc_cancel',
  revoke: 'doc_cancel',
  unaccept: 'doc_cancel',
  withdraw: 'doc_withdraw',
  restore: 'doc_withdraw',
};
const DOC_LABEL = { quotation: 'ใบเสนอราคา', sales_order: 'ใบสั่งขาย' };

export function dealDocumentUpdate(docType, action, doc, opts = {}) {
  const kind = DEAL_MIRROR_KIND[action];
  const label = DOC_LABEL[docType];
  if (!kind || !label || !doc) return null;

  const number = clip(doc.quoteNumber || doc.orderNumber) || '';
  const head = `${label}${number ? ` ${number}` : ''}`;
  const { reason = null, note = null, overrideReason = null, toRevisionNo = null } = opts;
  // ⚠️ `withdraw` อยู่ในชุดนี้ด้วย — เหตุผลตอนดึงกลับไม่มีที่เก็บอื่นแล้ว
  const tail = ['reject', 'revise', 'cancel', 'revoke', 'unaccept', 'withdraw'].includes(action)
    ? REASON_SUFFIX(reason)
    : '';

  // หมายเหตุของผู้อนุมัติไม่บังคับกรอก — มีก็ต้องไม่ตกหล่น (เดิมอยู่แต่ในเธรดของใบ)
  const approveNote = clip(overrideReason)
    ? ` (แอดมินอนุมัติแทน) — ${clip(overrideReason)}`
    : (clip(note) ? ` — ${clip(note)}` : '');

  const text = {
    submit: `ยื่นขออนุมัติ${head ? ` ${head}` : ''}`,
    approve: `อนุมัติ ${head}${approveNote}`,
    reject: `${head} ถูกตีกลับให้แก้ไข`,
    accept: `ลูกค้ารับ ${head}`,
    revise: `${head} ออก Rev. ใหม่${toRevisionNo == null ? '' : ` (Rev.${toRevisionNo})`}`,
    cancel: `ยกเลิก ${head}`,
    revoke: `ย้อนการอนุมัติ ${head} — ยอดหลุดจาก Actual`,
    unaccept: `ย้อนการรับ ${head} — ดีลหลุดจาก Won`,
    withdraw: `${head} ถูกดึงกลับมาแก้ไข`,
    // กู้คืน = ล้าง rejectionReason/cancelReason ทิ้งทั้งชุด → **จุดที่เหตุผลรอบก่อน
    // หายถาวร** แถวนี้จึงเป็นรอยเดียวที่บอกว่าเคยมีของที่ถูกล้างไป
    restore: `${head} ถูกกู้คืนกลับเป็นร่าง`,
  }[action];

  return {
    kind,
    body: `${text}${tail}`,
    meta: {
      docType,
      docId: doc.id || null,
      docNumber: number || null,
      action,
      // ธงอ่านด้วยเครื่องได้ ไม่ต้อง parse ข้อความ (รายงาน "อนุมัติแบบ override" ในอนาคต)
      ...(action === 'approve' ? { override: !!clip(overrideReason) } : {}),
    },
  };
}
