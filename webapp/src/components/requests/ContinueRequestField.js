"use client";
// ── ช่อง "ต่อจากคำร้อง" ของฟอร์มคำร้องพัฒนากลิ่น (ม-164 PR-4 · แผน §3) ──────────────────────────────────
//
// ⭐ ทางของงานเพิ่มที่ต้องมีบรีฟใหม่ หรือใบเดิมปิดไปแล้ว (VARIDA) — ใบใหม่ชี้กลับใบเดิม · ใบที่ปิดแล้วไม่เปิดกลับ
// ⭐ **ตัวเดียว สองทางเรียก** — ฟอร์มเปิดใบกับฟอร์มแก้ใช้ `RequestForm` ตัวเดียวกันอยู่แล้ว (AGENTS.md)
// ⚠️ ลิสต์มาจาก `GET /api/sa/requests/continue-candidates` (ลูกค้าเดียวกันทั้งนิติบุคคล · เฉพาะใบที่คนเปิดฟอร์มเปิดได้)
//    ด่านจริงตอนบันทึกอยู่ที่ server (`checkContinueTarget`)
// ⚠️ ค่าที่เลือกไว้แล้วแต่หลุดลิสต์ (เปิดไม่ได้แล้ว/โหลดไม่ขึ้น) ต้องยังโชว์ — ไม่งั้นช่องว่างทั้งที่ใบถือค่าอยู่
import { useEffect, useState } from "react";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { apiJson } from "@/lib/apiFetch";
import { fmtDate } from "@/lib/format";
import { REQUEST_STATUS_LABELS } from "@/lib/requests/statuses";
import styles from "./requestForm.module.css";

const NONE = "";

export default function ContinueRequestField({
  value = "",
  customerId = null,
  // ใบที่กำลังแก้ (ไม่ให้เลือกตัวเอง) — โหมดสร้าง = null
  excludeId = null,
  disabled = false,
  // (id) => void
  onChange,
  // (scentIds) => void — กลิ่นที่ลูกค้าคอนเฟิร์มในใบที่เลือก (ช่อง "แก้จากกลิ่น" เรียงให้ขึ้นก่อน)
  onPreferScents,
}) {
  const [state, setState] = useState({ loading: false, error: "", rows: [] });

  useEffect(() => {
    if (!customerId) { setState({ loading: false, error: "", rows: [] }); return undefined; }
    let live = true;
    setState((s) => ({ ...s, loading: true, error: "" }));
    const q = new URLSearchParams({ customerId, ...(excludeId ? { exclude: excludeId } : {}) });
    apiJson(`/api/sa/requests/continue-candidates?${q}`, { fallbackError: "โหลดคำร้องเดิมไม่สำเร็จ" })
      .then((d) => { if (live) setState({ loading: false, error: "", rows: d?.candidates || [] }); })
      .catch((e) => { if (live) setState({ loading: false, error: e.message, rows: [] }); });
    return () => { live = false; };
  }, [customerId, excludeId]);

  // กลิ่นที่คอนเฟิร์มของใบที่เลือก — แจ้งผู้เรียกทุกครั้งที่ลิสต์/ค่าที่เลือกเปลี่ยน
  useEffect(() => {
    const picked = state.rows.find((r) => r.id === value);
    onPreferScents?.(picked?.confirmedScentIds || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ผู้เรียกส่ง setter ใหม่ทุก render · ผูกที่ข้อมูลพอ
  }, [value, state.rows]);

  const options = [
    { value: NONE, label: "ไม่ได้ต่อจากคำร้องใบไหน" },
    ...state.rows.map((r) => ({
      value: r.id,
      label: [r.docNo || r.id, r.title, REQUEST_STATUS_LABELS[r.status] || r.status].filter(Boolean).join(" · "),
      search: [r.docNo, r.title, REQUEST_STATUS_LABELS[r.status], fmtDate(r.createdAt)].filter(Boolean).join(" "),
    })),
  ];
  if (value && !options.some((o) => o.value === value)) {
    options.push({ value, label: `${value} (ค่าเดิม)` });
  }

  return (
    <div className="form-group">
      <span className={styles.fieldLabel}>ต่อจากคำร้อง (ถ้ามี)</span>
      <SearchableSelect
        value={value || NONE}
        onChange={(v) => onChange?.(v || "")}
        options={options}
        disabled={disabled || !customerId}
        placeholder={customerId ? "เลือกคำร้องเดิม" : "เลือกใบสั่งขายก่อน"}
        emptyText={() => (state.loading ? "กำลังโหลด…" : "ไม่มีคำร้องพัฒนากลิ่นของลูกค้านี้")}
        ariaLabel="ต่อจากคำร้อง"
      />
      <small className={styles.hint}>
        {state.error
          || "ใช้เมื่องานนี้ต่อจากคำร้องเดิม (ใบเดิมปิดแล้ว หรือมีบรีฟใหม่) — ใบเดิมไม่ถูกเปิดกลับ · บรีฟเลือกกลิ่นที่จะแก้จากใบเดิมได้"}
      </small>
    </div>
  );
}
