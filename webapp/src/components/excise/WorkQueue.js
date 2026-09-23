"use client";
import { AlertCircle, ChevronRight, CheckCircle2, ClipboardCheck } from "lucide-react";
import StatusBadge from "./StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import { ListPanel } from "@/components/ui/Workspace";

// "งานของฉันตอนนี้" — the unified action queue on the dashboard. Each item:
//   { id, status, title, subtitle, cta, onClick }
// onClick deep-links into the relevant list/drawer.
//
// ⭐ **วาดแผงรายการของตัวเอง** (มติผู้ใช้ 2026-09-15 · รายการทุกชุด = ListPanel ใบเดียว)
// เดิมหน้า /tax เขียนหัว "งานของฉันตอนนี้" + ป้ายจำนวนแยกไว้เหนือกล่อง และทุกแถวเป็น
// glass-panel ของตัวเอง ⇒ ตอนนี้หัว/ป้ายจำนวนเป็นของแผง แถวเป็นแถวเรียบในเนื้อแผง
// ⚠️ แถวยังเป็น `<button>` จริง — ทางเข้าของคีย์บอร์ดมาฟรี ห้ามเปลี่ยนเป็น div onClick
//
// ⭐ `incomplete` = แหล่งข้อมูลที่ป้อนคิวนี้โหลดไม่สำเร็จอย่างน้อยหนึ่งก้อน (จอที่เรียกเป็น
// คนบอก และเป็นคนขึ้น StatusNotice อธิบายเอง) ⇒ ที่นี่แค่เลิกพูดตัวเลขที่พิสูจน์ไม่ได้:
// ป้ายจำนวนเลิกอ้างยอดเต็ม และช่องว่างเปลี่ยนจาก "ไม่มีงานค้าง 🎉" เป็นคำบอกว่าคิวยังไม่ครบ
// 🐞 ของจริง: /api/orders ตอบ 500 อยู่ 26 วัน คิวนี้ขึ้น "0 งาน · ไม่มีงานค้างที่ต้องทำ 🎉"
//    ทุกวันทั้งที่ใบยื่นค้างเต็มระบบ — ตัวเลข 0 ที่มาจากความไม่รู้คือคำตอบที่ผิด ไม่ใช่ว่าง
export default function WorkQueue({ items = [], incomplete = false }) {
  /* 🪤 ขีดเฉพาะตอน **ไม่มีอะไรให้นับจริง ๆ** — แปะขีดทับคิวที่ยังมีแถวโชว์อยู่ใต้หัวแผง
     อ่านเป็นป้ายเสียมากกว่า "ข้อมูลไม่ครบ" · มีแถวก็บอกไปว่าอย่างน้อยเท่านี้ แล้วปล่อยให้
     ป้าย error ด้านบนเป็นคนอธิบายว่าทำไมถึงยังไม่ใช่ตัวเลขเต็ม
     (กติกาเดียวกับ `noData` ที่ /tax/filings: ขีดเมื่อยังไม่มีข้อมูลในมือเลยเท่านั้น) */
  const count = !incomplete ? `${items.length} งาน`
    : items.length ? `อย่างน้อย ${items.length} งาน`
      : null;
  return (
    <ListPanel
      icon={<ClipboardCheck size={17} aria-hidden="true" />}
      title="รายการงานของฉันตอนนี้"
      subtitle="งานที่รอคุณลงมือ เรียงจากค้างนานสุด"
      count={count}
    >
      {!items.length ? (
        incomplete ? (
          <EmptyState plain icon={AlertCircle}>คิวงานยังไม่ครบเพราะโหลดข้อมูลไม่สำเร็จ — ดูข้อความด้านบนแล้วกด “ลองใหม่”</EmptyState>
        ) : (
          <EmptyState plain icon={CheckCircle2}>ไม่มีงานค้างที่ต้องทำตอนนี้ 🎉</EmptyState>
        )
      ) : (
        <div className="flex flex-col">
          {items.map((it) => (
            <button
              key={it.id}
              type="button"
              onClick={it.onClick}
              className="clickable-row"
              style={{
                display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, rowGap: "var(--space-1)",
                padding: "12px 14px", textAlign: "left", width: "100%", cursor: "pointer",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <StatusBadge status={it.status} />
              {/* ⭐ **แถวพับได้** — จอแคบ (390) แถวในเนื้อแผงเหลือ ~330px · ป้ายสถานะ + อายุ + ปุ่มไม่หด
                  ⇒ ของเดิมบีบหัวเรื่องเหลือ 10–84px ("Q" / "3.") · ฐาน 12rem = หัวเรื่องจองที่ไว้ก่อน
                  ถ้าไม่พอ อายุกับปุ่มพับลงบรรทัดสองชิดขวา · จอกว้างทุกชิ้นอยู่บรรทัดเดียวเหมือนเดิม */}
              <div style={{ flex: "1 1 12rem", minWidth: 0 }}>
                <div style={{ fontSize: "var(--fs-8)", fontWeight: "var(--fw-semibold)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {it.title}
                </div>
                {it.subtitle && (
                  <div style={{ fontSize: "var(--fs-6)", color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {it.subtitle}
                  </div>
                )}
              </div>
              {/* ⭐ อายุงาน — ของเดิมไม่มี ⇒ ใบที่ค้าง 34 วันหน้าตาเหมือนใบที่เพิ่งเข้ามาเมื่อวาน
                  (ตรวจระบบ 2026-08-28 เจอ 9 ใบค้าง 28–34 วันโดยไม่มีอะไรฟ้อง) */}
              {/* อายุ + ปุ่มพับลงบรรทัดเดียวกันเสมอ · `ml-auto` ดันชิดขวาทั้งตอนอยู่บรรทัดแรกและบรรทัดสอง */}
              <span className="flex items-center gap-[var(--space-3)] ml-auto shrink-0">
                {it.age && (
                  <span
                    style={{
                      color: it.age.color || "var(--text-3)", fontSize: "var(--fs-6)",
                      fontWeight: it.age.color ? "var(--fw-semibold)" : undefined,
                      whiteSpace: "nowrap",
                    }}
                    title="ค้างอยู่ในสถานะนี้มานานเท่าไร"
                  >
                    {it.age.label}
                  </span>
                )}
                <span className="flex items-center gap-1" style={{ color: "var(--accent)", fontSize: "var(--fs-7)", fontWeight: "var(--fw-semibold)", whiteSpace: "nowrap" }}>
                  {it.cta} <ChevronRight size={15} aria-hidden="true" />
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </ListPanel>
  );
}
