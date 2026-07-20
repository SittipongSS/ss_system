// ตัดสินว่า "บรรทัด PO ไหนถูกเชื่อมดีลไปแล้ว" — ส่วนตรรกะล้วนของ settle-deal route
// (route ทำแค่ query แล้วส่ง rows เข้ามา) ดู api/sahamit/po/[id]/settle-deal/route.js
//
// กุญแจจับคู่ต่างยุคกัน:
//   poLineIds — ดีลที่ settle ตั้งแต่ 2026-07-20 เก็บ id บรรทัดไว้ตรง ๆ → เทียบราย "บรรทัด"
//   fgCodes   — ดีลเก่าก่อนหน้านั้นไม่มี poLineIds → ถอยไปเทียบด้วย fgCode เหมือนเดิม
//
// ทำไมต้องแยกราย "บรรทัด": PO มีสินค้าเดียวกันได้หลายบรรทัด (คนละเดือนส่ง) และตอนคัด
// บรรทัดใน POST dedup ด้วย poLineId อยู่แล้ว. เดิมเช็คด้วย fgCode อย่างเดียว ทำให้บรรทัด
// FG ซ้ำที่ถูก "ข้าม" ไว้รอบแรกโดนมองว่าเชื่อมแล้วถาวร — settle รอบสองไม่ได้ ตีกลับ 409
// จนต้องแก้ DB มือ.

// normalize fgCode สำหรับจับคู่: ตัดช่องว่าง/ขีด/จุด ให้ "ABC-001" = "ABC 001" = "abc001"
export const normFg = (v) => String(v || '').trim().toLowerCase().replace(/[\s\-_.]/g, '');

// deals = แถว sales_deals ที่ metadata.sahamitPoId = PO ใบนี้ (ทั้ง lost และไม่ lost)
export function resolveSettledLines(deals) {
  const byLine = new Map(); // poLineId → dealId
  const byFg = new Map();   // normFg → dealId (legacy เท่านั้น)

  for (const d of deals || []) {
    // ดีลรวมที่ถูก mark lost (ลูกค้าปฏิเสธ QT แล้วทิ้งดีล / ย้อน Won ผ่าน mig 0116)
    // ไม่บล็อก ให้ settle ใหม่ได้ — ไม่งั้น PO ที่ยังเก็บเงินได้จริงจะตันถาวร
    if (d?.stage === 'lost') continue;

    const lineIds = d?.metadata?.poLineIds;
    if (Array.isArray(lineIds) && lineIds.length) {
      for (const lineId of lineIds) byLine.set(String(lineId), d.id);
    } else {
      // สร้าง byFg จาก "เฉพาะดีลที่ไม่มี poLineIds" — ถ้าเหมารวมดีลใหม่ด้วย
      // กับดัก FG ซ้ำจะกลับมาทันที
      for (const fg of (d?.metadata?.fgCodes || [])) {
        const k = normFg(fg);
        if (k) byFg.set(k, d.id);
      }
    }
  }

  return {
    byLine,
    byFg,
    // บรรทัดนี้เชื่อมไปแล้วหรือยัง → คืน dealId ที่ถือไว้ (null = ยังว่าง)
    dealFor: (line) => byLine.get(String(line?.id)) || byFg.get(normFg(line?.fgCode)) || null,
  };
}
