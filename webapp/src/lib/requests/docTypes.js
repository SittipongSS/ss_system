// ── ชนิดเอกสารที่ขอได้ (P5) — ทะเบียนเดียวของระบบ ────────────────────────
//
// ⚠️ **ไม่เดาโครงสร้างล่วงหน้า** — ของจริงที่ผู้ใช้ระบุคือ IFRA · COA · MSDS ของ
// *สินค้า* และบอกไว้ว่าจริง ๆ ต้องอ้างใบเสนอราคา + ล็อตการผลิตด้วย ซึ่ง **ยังไม่มี
// ที่เก็บทั้งสองอย่าง** ⇒ รอบนี้เก็บแค่ชนิด + รายละเอียด แล้วค่อยออกแบบรอบถัดไป
// เพิ่มชนิดที่ผู้ใช้ไม่ได้พูดถึงเองตอนนี้ = เดาแทนเขา
export const REQUEST_DOC_TYPES = [
  { value: 'ifra', label: 'IFRA Certificate' },
  { value: 'coa', label: 'COA — Certificate of Analysis' },
  { value: 'msds', label: 'MSDS / SDS' },
  // ⭐ ทางออกที่ต้องมี — ชนิดที่ยังไม่อยู่ในลิสต์เกิดได้เสมอ และการไม่มีทางออก
  // แปลว่าคนจะเลือกชนิดที่ใกล้เคียงที่สุดแล้วอธิบายในรายละเอียด ซึ่งทำให้ตัวเลข
  // "ขอ IFRA กี่ครั้ง" ผิดไปโดยไม่มีใครรู้
  { value: 'other', label: 'อื่น ๆ — ระบุในรายละเอียด' },
];

const BY_VALUE = new Map(REQUEST_DOC_TYPES.map((t) => [t.value, t]));

export const REQUEST_DOC_TYPE_VALUES = REQUEST_DOC_TYPES.map((t) => t.value);

// ⚠️ ชนิดที่ไม่รู้จัก **คืนค่าดิบ ไม่ใช่ค่าว่าง** — ของเก่าที่บันทึกด้วยชุดอื่นต้อง
// ยังอ่านออก (บทเรียนเดียวกับ requestItemStatusLabel)
export function docTypeLabel(value) {
  return BY_VALUE.get(value)?.label || String(value ?? '') || '—';
}

// "อื่น ๆ" ต้องมีรายละเอียด ไม่งั้นแถวนั้นไม่ได้บอกอะไรเลยว่าขออะไร
export function docTypeNeedsDetail(value) {
  return value === 'other';
}

// ── โรงงานคำศัพท์เอกสาร — ให้ฝ่ายอื่นมีชุดของตัวเองโดยไม่ก๊อปตัวตรวจ ──────
//
// ⭐ ฝ่ายบัญชีขอ "ใบวางบิล/ใบแจ้งหนี้/ใบกำกับภาษี/ใบเสร็จ" ซึ่งเป็นคนละคำศัพท์กับ
// IFRA/COA/MSDS ของ RD สิ้นเชิง — แต่ **กฎของบรรทัดเหมือนกันทุกข้อ** (ต้องเลือกชนิด ·
// "อื่น ๆ" ต้องมีรายละเอียด · ซ้ำทั้งชนิดและรายละเอียดไม่ได้)
//
// ⚠️ เอาสองชุดมารวมลิสต์เดียวไม่ได้ — คำร้องขอเอกสารของ RD จะมีตัวเลือก
// "ใบกำกับภาษี" โผล่ขึ้นมา ซึ่งไม่ใช่ของที่ RD ออกให้ได้
export function docVocabulary({ lineKind, types, detailValue = 'other' }) {
  const byValue = new Map(types.map((t) => [t.value, t]));
  return {
    lineKind,
    types,
    values: types.map((t) => t.value),
    // ⚠️ ชนิดที่ไม่รู้จักคืนค่าดิบ ไม่ใช่ค่าว่าง — ของเก่าที่บันทึกด้วยชุดอื่นต้องยังอ่านออก
    label: (value) => byValue.get(value)?.label || String(value ?? '') || '—',
    needsDetail: (value) => value === detailValue,
  };
}

export const REQUEST_DOC_VOCABULARY = docVocabulary({
  lineKind: 'document', types: REQUEST_DOC_TYPES,
});

// ── รูปร่างบรรทัดที่เป็น "เอกสาร" — ที่เดียวของระบบ ──────────────────────
//
// ⭐ RD ขอ IFRA/COA/MSDS (`document`) · บัญชีขอใบวางบิล/ใบกำกับ (`billing_doc`) —
// คนละชุดคำศัพท์ กฎเดียวกัน · สายของแถวพวกนี้ **สั้นกว่าสายพัฒนา** (ม-85):
// ไม่มีลูกค้าอยู่ในสาย ไม่มีขั้นราคา ⇒ จบที่ "ได้รับแล้ว" หรือ "ให้ไม่ได้"
//
// ⚠️ เดิมประกาศซ้ำอยู่ใน `documentBoard.js` (`DOC_SHAPES`) — ยกมาที่นี่ตอนที่
// `hops.js`/`rowStage.js` ต้องรู้จักด้วย · สามที่ประกาศเองเมื่อไรก็เพี้ยนกันเมื่อนั้น
export const DOC_LINE_KINDS = ['document', 'billing_doc'];

export function isDocLineKind(lineKind) {
  return DOC_LINE_KINDS.includes(lineKind);
}
