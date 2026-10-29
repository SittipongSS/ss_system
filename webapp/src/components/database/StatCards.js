"use client";

// A compact row of summary metric cards for master-data list pages.
// Props: items = [{ label, value, tone, onClick?, pressed?, title? }] where tone ∈ undefined | "warn" |
// "success" | "danger" | "accent". Tone tints the value (and a soft bg for
// non-neutral cards) so the "needs attention" numbers stand out.
//
// ⭐ การ์ดที่ส่ง `onClick` มา = <button type="button"> จริง (คีย์บอร์ด/โปรแกรมอ่านจอเข้าถึงได้) พร้อม `aria-pressed`
//    ตาม `pressed` (การ์ดที่ตั้งตัวกรองของตาราง — ตรวจตัวเลข 26/10 · L16b) · ไม่ส่ง = <div> เดิมทุกตัวอักษร
//    ⚠️ ผู้เรียกต้องให้ `onClick` ตั้งตัวกรอง **ทั้งชุด** ที่ทำให้ตารางได้แถวเท่าเลขบนการ์ดพอดี (ล้างตัวกรองค้าง)
//    🪤 เปลือกเดียวสลับแท็ก (ไม่เขียนการ์ดสองชุด) — สไตล์เดิมอยู่ที่เดียว และด่านนับ inline style/ขนาดดิบของ audit:ui ไม่ขยับ
const TONE = {
  warn: { bg: "var(--amber-soft)", fg: "var(--amber)" },
  success: { bg: "var(--green-soft)", fg: "var(--green)" },
  danger: { bg: "var(--red-soft)", fg: "var(--red)" },
  accent: { bg: "var(--accent-soft)", fg: "var(--accent)" },
};

export default function StatCards({ items }) {
  return (
    <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((it) => {
        const t = TONE[it.tone];
        const clickable = typeof it.onClick === "function";
        const Card = clickable ? "button" : "div";
        const buttonProps = clickable
          ? { type: "button", onClick: it.onClick, "aria-pressed": !!it.pressed, title: it.title }
          : {};
        return (
          <Card
            key={it.label}
            /* `card-button` = ปุ่มทรงการ์ดของกลาง (กว้างเต็ม · ชี้แล้วเป็นมือ · วงโฟกัส) · กดอยู่ = วงสี `--accent-ink`
               ⚠️ ไม่ใช่ `--accent` — วงนี้คือ "สถานะ" ที่ต้องผ่าน §1.4.11 (3:1) และนั่งบนพื้นแม่ ธีมสว่าง --accent ได้แค่
                  2.75:1 บน --bg (ตก) · --accent-ink 4.76:1 — โทเคนเดียวกับวงโฟกัสทั้งระบบ (audit-ui.mjs หัวข้อวงโฟกัส)
               🪤 ห้ามเติม `interactive-card` — กฎนั้นอยู่ทีหลังใน globals และตั้ง `cursor: default` ทับมือของ card-button */
            className={`rounded-xl px-4 py-3${clickable ? " card-button aria-pressed:ring-2 aria-pressed:ring-[var(--accent-ink)]" : ""}`}
            style={{ background: t ? t.bg : "var(--panel-2)" }}
            {...buttonProps}
          >
            <div className="text-[12px]" style={{ color: t ? t.fg : "var(--text-3)" }}>{it.label}</div>
            <div className="text-[22px] font-semibold mt-0.5" style={{ color: t ? t.fg : "var(--text)" }}>
              {it.value}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
