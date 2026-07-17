"use client";
// ช่องเลือกคน — ตัวเดียวของทั้งระบบ. ค้นหาได้ทั้งชื่อและนามสกุล (มติผู้ใช้ 2026-07-17)
//
// ของเดิมเป็น <select> ธรรมดาที่โชว์ชื่อย่อ ("สิทธิพงษ์ ส.") — พิมพ์นามสกุลหาไม่เจอ
// เพราะนามสกุลไม่เคยอยู่ในหน้าจอเลย และคนชื่อต้นเหมือนกัน+อักษรนามสกุลเดียวกัน
// จะแยกกันไม่ออก. ที่นี่จึงโชว์ชื่อเต็ม และค้นได้ทั้งชื่อ นามสกุล ทีม และอีเมล
import SearchableSelect from "@/components/ui/SearchableSelect";
import { TEAM_LABELS, DEPARTMENT_LABELS } from "@/lib/permissions";

const fullName = (u) => String(u?.name || u?.email || "").trim();

/** คำที่ใช้ค้น — ชื่อเต็ม (มีนามสกุล) + อีเมล + ทีม/ฝ่าย เพื่อพิมพ์ "KA" แล้วเห็นทั้งทีมได้ */
export const personSearchText = (u) =>
  [fullName(u), u?.email, u?.team, TEAM_LABELS[u?.team], u?.department].filter(Boolean).join(" ");

const personMeta = (u) => [
  u?.team ? (TEAM_LABELS[u.team] || u.team) : null,
  u?.department ? (DEPARTMENT_LABELS[u.department] || u.department) : null,
].filter(Boolean).join(" · ");

/**
 * ผู้ใช้ → ตัวเลือก. emptyLabel ใส่เมื่อเลือก "ไม่ระบุ" ได้
 * by="id" (ปกติ) หรือ by="name" สำหรับช่องที่เก็บ "ชื่อ" เป็นค่าจริงในฐานข้อมูล
 * (ผู้ดูแล/ผู้ตรวจสอบของโครงการ เก็บเป็นข้อความมาแต่เดิม)
 */
export function personSelectOptions(users = [], { emptyLabel = null, by = "id" } = {}) {
  const options = users.map((u) => {
    const meta = personMeta(u);
    return {
      value: by === "name" ? fullName(u) : u.id,
      label: fullName(u),
      search: personSearchText(u),
      render: (
        <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fullName(u)}</span>
          {meta ? <span style={{ fontSize: 11, color: "var(--text-3)" }}>{meta}</span> : null}
        </span>
      ),
    };
  });
  return emptyLabel ? [{ value: "", label: emptyLabel, search: emptyLabel }, ...options] : options;
}

export default function PersonSelect({
  users = [],
  value,
  onChange,
  emptyLabel = "— ไม่ระบุ —",
  placeholder = "ค้นหาชื่อ / นามสกุล...",
  by = "id",
  disabled,
  ariaLabel,
  className,
  size,
}) {
  return (
    <SearchableSelect
      entity="person"
      options={personSelectOptions(users, { emptyLabel, by })}
      value={value || ""}
      onChange={onChange}
      placeholder={emptyLabel}
      searchPlaceholder={placeholder}
      disabled={disabled}
      ariaLabel={ariaLabel}
      className={className}
      size={size}
      emptyText="ไม่พบชื่อนี้"
    />
  );
}
