"use client";
// ── ด่านฝั่งจอของช่อง "แพ็ค/เดือน" (งวด PR-3 · docs/qt-pack-column.md) ───────────────────────────────────────
//
// ⭐ มติเจ้าของ 08/10 ข้อ A2–A4: บรรทัดหมวด 02-001 ทุกบรรทัดต้องมีเลขแพ็คก่อนบันทึก/ยื่น/อนุมัติ — เซิร์ฟเวอร์ปฏิเสธอยู่แล้ว
//   hook นี้ทำให้หน้าสร้างและหน้าใบ **หยุดก่อนส่งคำขอ** ด้วยกฎตัวเดียวกัน (lib/sales/linePackEdit.js) แล้วชี้แถวที่ค้างให้
//   หน้าสองหน้าเรียก hook เดียว ⇒ พฤติกรรมเดียวกัน (กฎ AGENTS.md: ฟอร์มแก้ = ฟอร์มสร้าง)
//
// กติกาที่ hook นี้ถือ
//   · **แดงหลังกดเท่านั้น** — `errorsShown` เป็นจริงตั้งแต่การกดที่เจอข้อค้าง จนไม่เหลือข้อไหน แล้วดับเอง
//     (แถวที่เพิ่มหลังจากนั้นไม่แดงจนกว่าจะกดอีกครั้ง · ระหว่างที่ยังแดงอยู่ แถวใหม่ที่ต้องกรอกแดงทันที — โหมดนี้เข้ามาด้วยการกด)
//   · **โหมดแดงจบเมื่อบริบทของการกดจบ** ไม่ใช่แค่เมื่อข้อค้างหมด (รีวิว 09/10 — ในโหมดอ่านข้อค้างแก้ไม่ได้ แถบจึงค้างตลอดกาล):
//       ออกจากโหมดแก้ (ทิ้งการแก้ไข / บันทึกสำเร็จ) = ดับ · `scope` ของหน้าเปลี่ยน (ใบอื่น · สถานะอนุมัติเปลี่ยนหลังตีกลับ/ดึงกลับ) = ดับ
//       ⇒ แถบไม่มีวันชี้ปุ่มที่ไม่อยู่บนหน้าแล้ว ("กด “ตีกลับให้แก้ไข”" หลังตีกลับไปแล้ว) และโหมดอ่านไม่แดงจากการกดในโหมดแก้ที่ถูกทิ้ง
//       เข้าโหมดแก้จากโหมดอ่าน (ลิงก์ "แก้ไขข้อมูล" ของแถบหลังกดยื่น) **ไม่ดับ** — คนนั้นกดมาแล้ว แถวที่ค้างควรแดงรออยู่
//   · **ข้อความคิดสดทุกครั้งที่วาด** (`notice`) ไม่เก็บสตริงไว้ — แก้หรือลบแถวแล้วเลขรายการในข้อความตามทัน
//     ⇒ หน้าห้ามคัดลอกข้อความนี้ลง error ของตัวเอง (ยาม quotePackEditorPages.test.mjs)
//   · hook ไม่แตะเลขแพ็ค (ไม่ตั้ง ไม่ล้าง) และไม่เรียก API — บรรทัดเดินทางไปกับ payload เดิมของหน้า
import { useCallback, useEffect, useMemo, useState } from "react";
import { packGateNotice, quoteLinesPackView } from "@/lib/sales/linePackEdit";

/* ช่องแรกที่ต้องแก้ ตามลำดับบนจอ — เซลล์ของช่องประกาศสถานะไว้ที่ data-pack-state (QuoteLineCells) */
const FIRST_OPEN_INPUT = ["missing", "invalid", "stray"].map((state) => `td[data-pack-state="${state}"] input`).join(", ");

/* ป้ายของกล่องที่หน้าใช้ห่อแถบแจ้ง (`<div {...PACK_GATE_NOTICE_PROPS}>`) — กดจากโหมดอ่าน (ยื่นอนุมัติ / อนุมัติ) ไม่มีช่องให้โฟกัส
   ⇒ hook เลื่อนแถบนี้เข้ามาในจอแทน: ปุ่มอยู่ในรางขวาที่ติดจอ แถบอยู่บนสุดของหน้า — ไม่เลื่อน = กดแล้วเหมือนไม่มีอะไรเกิดขึ้น */
const NOTICE_ATTRIBUTE = "data-pack-gate-notice";
export const PACK_GATE_NOTICE_PROPS = Object.freeze({ [NOTICE_ATTRIBUTE]: "" });

/**
 * @param lines    บรรทัดของหน้า (state เดียวกับที่ส่งให้ตาราง)
 * @param products ลิสต์สินค้าที่หน้าโหลดไว้
 * @param editing  ตารางเปิดแก้อยู่ไหม — เปิดอยู่ = แถบแจ้งเป็นข้อความแบบบันทึกเสมอ (คนที่กดยื่นแล้วเข้ามาแก้ ไม่ถูกชี้กลับไปที่ปุ่มเดิม)
 * @param storedLines บรรทัดที่เก็บไว้ของใบ (หน้าใบส่ง `quote.lines` · หน้าสร้างไม่ส่ง) — ตัวเดียวกับที่หน้าส่งให้ตาราง ⇒ `pending` ของหน้า
 *                 กับยอดในตารางตัดสิน "บรรทัดเก่าที่ยังไม่มีใครแตะ" ตรงกัน
 * @param scope    สตริงที่บอกว่าปุ่มของหน้าเป็นชุดไหน (หน้าใบ: id · สถานะอนุมัติ · สถานะใบ) — เปลี่ยน = การกดครั้งก่อนไม่เกี่ยวแล้ว โหมดแดงดับ
 * @returns
 *   view         ผลของ quoteLinesPackView (ไม่มีข้อความแดง — ตารางคิดของตัวเองจาก `errorsShown`)
 *   issues       ข้อที่เซิร์ฟเวอร์จะตีกลับถ้าส่งไปตอนนี้
 *   pending      มีบรรทัดที่ยังไม่มียอด ⇒ หน้าโชว์ยอดรวมเป็นขีด (อ่านเฉพาะตอนตารางเปิดแก้)
 *   errorsShown  ส่งต่อให้ `<QuotationLineItems packErrorsShown>`
 *   notice       null | `{ text, action }` — แถบแจ้งของหน้า (ห่อด้วย `<div {...PACK_GATE_NOTICE_PROPS}>`) · action 'submit' = หน้าแนบลิงก์ไปโหมดแก้
 *   mark(action) เรียกตอนคนกดปุ่ม: ไม่มีข้อค้าง = true (เดินต่อได้) · มี = จำปุ่มที่กด เปิดโหมดแดง เลื่อนไปช่องแรกที่ต้องแก้ แล้วคืน false
 *                action: 'save' (ค่าตั้งต้น) · 'submit' · 'approve' · 'approveOwn'
 */
export default function useQuoteLinePackGate(lines, products, { editing = false, storedLines = null, scope = "" } = {}) {
  const view = useMemo(() => quoteLinesPackView(lines, products, { storedLines }), [lines, products, storedLines]);
  const [pressed, setPressed] = useState(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const [context, setContext] = useState({ editing, scope });
  const hasIssues = view.issues.length > 0;

  /* ไม่เหลือข้อแล้ว = ออกจากโหมดแดง (ปรับ state ระหว่างวาด — แบบที่ React แนะนำสำหรับค่าที่ตามค่าอื่น ไม่ต้องรอ effect) */
  if (pressed && !hasIssues) setPressed(null);

  /* บริบทของการกดจบแล้ว = ออกจากโหมดแดง: ออกจากโหมดแก้ หรือ scope ของหน้าเปลี่ยน · เข้าโหมดแก้ (false → true) ไม่นับ */
  if (context.editing !== editing || context.scope !== scope) {
    const pressEnded = context.scope !== scope || (context.editing && !editing);
    setContext({ editing, scope });
    if (pressed && pressEnded) setPressed(null);
  }

  /* พาคนไปหาสิ่งที่ต้องแก้ **หลัง** React วาดเสร็จ (นับครั้งที่ขอ ไม่ query ทันทีตอนกด — ตอนนั้น DOM ยังเป็นของก่อนกด)
     · โหมดแก้: โฟกัสช่องแรกที่ต้องแก้ (เบราว์เซอร์เลื่อนไปหาเอง) · โหมดอ่าน: ไม่มีช่อง ⇒ เลื่อนแถบแจ้งเข้ามาในจอ */
  useEffect(() => {
    if (!focusRequest) return;
    const input = document.querySelector(FIRST_OPEN_INPUT);
    if (input) { input.focus(); return; }
    document.querySelector(`[${NOTICE_ATTRIBUTE}]`)?.scrollIntoView({ block: "center" });
  }, [focusRequest]);

  const mark = useCallback((action = "save") => {
    if (!hasIssues) return true;
    setPressed(action);
    setFocusRequest((count) => count + 1);
    return false;
  }, [hasIssues]);

  return {
    view,
    issues: view.issues,
    pending: view.pending,
    errorsShown: Boolean(pressed) && hasIssues,
    notice: packGateNotice(view, pressed, { editing }),
    mark,
  };
}
