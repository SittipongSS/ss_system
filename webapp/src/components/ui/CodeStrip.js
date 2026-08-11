"use client";
// ── แถบรหัส — รหัสที่ระบบประกอบให้ โชว์เป็นท่อน พร้อมป้ายว่าท่อนไหนมาจากไหน ──
//
// ⭐ มติผู้ใช้ 2026-08-12 (เลือก "แบบ A" จากม็อก 2/3 ทาง): รหัสลูกค้า/รหัสสินค้าที่
// ระบบออกให้ ต้องเห็นตั้งแต่ก่อนกดบันทึกว่าจะได้เลขอะไร และ**แต่ละท่อนมาจากคำตอบไหน**
// — รหัส FG ประกอบจากสามคำตอบคนละที่ (ลูกค้า · หมวด · เลขรัน) ถ้าโชว์เป็นข้อความก้อน
// เดียว คนกรอกจะไม่รู้ว่าจะแก้ท่อนที่ผิดได้ที่ช่องไหน
//
// เป็นญาติของ `.deal-derived` (ช่องเส้นประ อ่านอย่างเดียว): เส้นประเหมือนกันเพราะ
// เป็น "ค่าที่ระบบเติมให้" เหมือนกัน ต่างกันที่ตัวนี้แตกเป็นท่อนพร้อมป้าย
//
// ท่อนที่ยังตอบไม่ครบ = ขึ้น placeholder จาง ๆ ไม่ใช่หายไป — จำนวนท่อนคงที่เสมอ
// คนกรอกจึงเห็นว่ายังเหลืออีกกี่ท่อนกว่าจะได้รหัส
export default function CodeStrip({
  parts = [],       // [{ key, label, value, placeholder?, tone? }] — tone: fixed|from|new
  ariaLabel,
}) {
  return (
    <div className="code-strip" role="group" aria-label={ariaLabel}>
      {parts.map((part) => (
        <div
          key={part.key}
          className="code-strip-part"
          data-tone={part.tone}
          data-blank={part.value ? undefined : "1"}
        >
          <span className="code-strip-value">{part.value || part.placeholder || "—"}</span>
          <span className="code-strip-key">{part.label}</span>
        </div>
      ))}
    </div>
  );
}
