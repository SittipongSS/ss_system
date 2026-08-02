// ── เหตุการณ์ระบบในเธรดของใบเสนอราคา / ใบสั่งขาย (entity_updates, mig 0163) ──
//
// แพตเทิร์นเดียวกับ lib/costingUpdates.js: ไฟล์นี้ตอบแค่ "ควรบันทึกอะไรลงเธรด"
// เป็นตรรกะล้วนที่เทสต์ได้ ส่วน I/O เป็นของ lib/master/updates.js
//
// ⭐ **เหตุผลที่ต้องมีเธรดที่นี่จริง ๆ** — QT/SO บังคับกรอกเหตุผลรวม 8 จุด
// (ดึงกลับ · ตีกลับ · ออก Rev. · ย้อนการรับ · ยกเลิกอนุมัติ · ยกเลิก · override ของ admin)
// แต่เหตุผลพวกนั้นถูกเก็บลง**คอลัมน์เดียวของใบ** ซึ่งรอบถัดไปเขียนทับทันที:
//   · `rejectionReason` ถูกล้างตอน restore/submit ใหม่
//   · `revisionReason` เก็บได้รอบเดียว — ใบที่ออก Rev. สามรอบเหลือเหตุผลรอบสุดท้าย
//   · ที่เหลือลงแต่ audit log ซึ่งเปิดได้เฉพาะ supervisor และไม่มีลิงก์จากหน้าใบ
// ⇒ คนที่ต้องอ่าน (คนทำใบรอบถัดไป) **ไม่เคยได้อ่านเลยสักครั้ง**
// เขียนลงเธรดด้วยทำให้เหตุผลอยู่ครบทุกรอบ บนหน้าใบ · คอลัมน์เดิมยังอยู่เพราะ
// หน้าจอใช้แสดง "รอบนี้ติดอะไร" ซึ่งเป็นคนละคำถามกับ "เคยติดอะไรมาบ้าง"
//
// ⚠️ ทุกฟังก์ชันต้องทนของไม่ครบ (คืน null) — ผู้เรียกอยู่หลังจุดที่ DB เขียนสำเร็จ
// แล้ว การโยน error ตรงนั้นจะทำให้ action ที่สำเร็จแล้วตอบ 500

const clip = (s, n = 1000) => String(s ?? '').trim().slice(0, n) || null;

// คำศัพท์ล็อกตามมติผู้ใช้ (ดู [[qt-so-workflow-vocabulary]]): **ตีกลับ** = ผู้อนุมัติ
// ส่งคืนให้แก้ · **ดึงกลับ** = ผู้ยื่นเอาคืนเอง · **ออก Rev.** = ออกฉบับใหม่แทนฉบับเดิม
// ห้ามใช้คำว่า "ถอน/ถอด" ที่ไหนในไฟล์นี้
const REASON_SUFFIX = (reason) => (clip(reason) ? ` — ${clip(reason)}` : ' — ไม่ระบุเหตุผล');

// ── ใบเสนอราคา ───────────────────────────────────────────────────────────
// ชุด kind ต้องตรงกับ UPDATE_KINDS.quotation ใน lib/master/updateTypes.js
export function quotationActionUpdate(action, quote, { reason = null, note = null, toRevisionNo = null } = {}) {
  if (!quote) return null;
  const meta = { quoteNumber: quote.quoteNumber || null, revisionNo: quote.revisionNo ?? null };
  if (action === 'submit') {
    return { kind: 'submit', body: 'ยื่นขออนุมัติใบเสนอราคา', meta };
  }
  if (action === 'approve') {
    // note ของผู้อนุมัติไม่บังคับ — มีก็เอาลงเธรด ไม่มีก็บอกแค่ว่าอนุมัติแล้ว
    return {
      kind: 'approve',
      body: clip(note) ? `อนุมัติใบเสนอราคา — ${clip(note)}` : 'อนุมัติใบเสนอราคา',
      meta,
    };
  }
  if (action === 'reject') {
    return { kind: 'returned', body: `ตีกลับให้แก้ไข${REASON_SUFFIX(reason)}`, meta };
  }
  if (action === 'withdraw') {
    return { kind: 'withdraw', body: `ดึงกลับมาแก้ไข${REASON_SUFFIX(reason)}`, meta };
  }
  if (action === 'revise') {
    // ⚠️ Rev. ใหม่เป็น **ใบคนละใบ** (id ใหม่) — เหตุการณ์นี้จึงต้องลงเธรดของ
    // ใบเดิม ไม่ใช่ใบใหม่ ไม่งั้นใบเดิมจะจบห้วน ๆ โดยไม่บอกว่าไปต่อที่ไหน
    const to = toRevisionNo == null ? '' : ` (Rev.${toRevisionNo})`;
    return { kind: 'revise', body: `ออก Rev. ใหม่${to}${REASON_SUFFIX(reason)}`, meta };
  }
  if (action === 'accept') {
    return { kind: 'accept', body: 'ลูกค้ารับใบเสนอราคา', meta };
  }
  if (action === 'unaccept') {
    return { kind: 'unaccept', body: `ย้อนการรับใบเสนอราคา${REASON_SUFFIX(reason)}`, meta };
  }
  return null;
}

// ── ใบสั่งขาย ────────────────────────────────────────────────────────────
// ชุด kind ต้องตรงกับ UPDATE_KINDS.sales_order
export function salesOrderActionUpdate(action, order, { reason = null, overrideReason = null, toRevisionNo = null } = {}) {
  if (!order) return null;
  const meta = { orderNumber: order.orderNumber || null, revisionNo: order.revisionNo ?? null };
  if (action === 'submit') {
    return { kind: 'submit', body: 'ยื่นขออนุมัติใบสั่งขาย', meta };
  }
  if (action === 'approve') {
    // override = admin อนุมัติแทนทั้งที่ไม่ใช่ผู้อนุมัติตามสาย — ต้องเห็นชัดในเธรด
    // ไม่ใช่ซ่อนอยู่ใน audit log ที่เปิดได้เฉพาะ supervisor
    return {
      kind: 'approve',
      body: clip(overrideReason)
        ? `อนุมัติใบสั่งขาย (แอดมินอนุมัติแทน) — ${clip(overrideReason)}`
        : 'อนุมัติใบสั่งขาย',
      meta: { ...meta, override: !!clip(overrideReason) },
    };
  }
  if (action === 'reject') {
    return { kind: 'returned', body: `ตีกลับให้แก้ไข${REASON_SUFFIX(reason)}`, meta };
  }
  if (action === 'withdraw') {
    return { kind: 'withdraw', body: `ดึงกลับมาแก้ไข${REASON_SUFFIX(reason)}`, meta };
  }
  if (action === 'revoke') {
    // ป้ายต้องตรงกับปุ่มบนหน้าใบ ซึ่งเขียนว่า "ยกเลิกอนุมัติ" (ไม่ใช่ "เพิกถอน")
    return { kind: 'revoke', body: `ยกเลิกอนุมัติ — ยอดหลุดจาก Actual${REASON_SUFFIX(reason)}`, meta };
  }
  if (action === 'revise') {
    const to = toRevisionNo == null ? '' : ` (Rev.${toRevisionNo})`;
    return { kind: 'revise', body: `ออก Rev. ใหม่${to}${REASON_SUFFIX(reason)}`, meta };
  }
  if (action === 'cancel') {
    return { kind: 'cancel', body: `ยกเลิกใบสั่งขาย${REASON_SUFFIX(reason)}`, meta };
  }
  if (action === 'restore') {
    // กู้คืน = ล้าง rejectionReason/cancelReason ทิ้งทั้งชุด → **นี่คือจุดที่เหตุผล
    // เดิมหายถาวร** ถ้าไม่มีเธรด · แถวนี้จึงสำคัญกว่าที่ดูเผิน ๆ
    return { kind: 'restore', body: 'กู้คืนกลับเป็นร่าง', meta };
  }
  return null;
}

// ── เงาของเหตุการณ์เอกสารบน "เธรดของดีลแม่" ─────────────────────────────
//
// ⭐ **จุดประสงค์ของเธรดดีลคือสมุดบันทึกความเคลื่อนไหวของดีล** (มติผู้ใช้) — แต่
// ความเคลื่อนไหวที่มีค่าที่สุดของดีล (ราคาที่เสนอไป · ลูกค้ารับหรือตีกลับ) เกิดบน
// *ใบ* ทั้งหมด คนเปิดดีลย้อนหลังจึงไม่เห็นอะไรเลยนอกจากที่ AE พิมพ์เอง
//
// ⚠️ **ไม่ใช่ทุก action ที่ขึ้นดีล** — ดีลสนใจเฉพาะจังหวะที่ *ทิศทางการขายเปลี่ยน*:
//   · `withdraw` (ผู้ยื่นดึงกลับเอง) และ `restore` (กู้ร่าง) = การบ้านภายในของคนทำใบ
//     ดีลยังอยู่ที่เดิม → ไม่ส่งขึ้น ไม่งั้นเธรดดีลจะเต็มไปด้วยการแก้ใบไปมา
//   · `unaccept` / `revoke` ส่งขึ้นเพราะ **ยอดหลุดจาก Actual / ดีลหลุด Won**
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
};
const DOC_LABEL = { quotation: 'ใบเสนอราคา', sales_order: 'ใบสั่งขาย' };

export function dealDocumentUpdate(docType, action, doc, opts = {}) {
  const kind = DEAL_MIRROR_KIND[action];
  const label = DOC_LABEL[docType];
  if (!kind || !label || !doc) return null;

  const number = clip(doc.quoteNumber || doc.orderNumber) || '';
  const head = `${label}${number ? ` ${number}` : ''}`;
  const { reason = null, overrideReason = null, toRevisionNo = null } = opts;
  const tail = ['reject', 'revise', 'cancel', 'revoke', 'unaccept'].includes(action)
    ? REASON_SUFFIX(reason)
    : '';

  const text = {
    submit: `ยื่นขออนุมัติ${head ? ` ${head}` : ''}`,
    approve: clip(overrideReason)
      ? `อนุมัติ ${head} (แอดมินอนุมัติแทน) — ${clip(overrideReason)}`
      : `อนุมัติ ${head}`,
    reject: `${head} ถูกตีกลับให้แก้ไข`,
    accept: `ลูกค้ารับ ${head}`,
    revise: `${head} ออก Rev. ใหม่${toRevisionNo == null ? '' : ` (Rev.${toRevisionNo})`}`,
    cancel: `ยกเลิก ${head}`,
    revoke: `ยกเลิกอนุมัติ ${head} — ยอดหลุดจาก Actual`,
    unaccept: `ย้อนการรับ ${head} — ดีลหลุดจาก Won`,
  }[action];

  return {
    kind,
    body: `${text}${tail}`,
    meta: { docType, docId: doc.id || null, docNumber: number || null, action },
  };
}
