"use client";
// ── คำแนะนำผูกกลิ่น/สูตรให้ FG จากคำร้องขอ MSDS (ม-167 · มติเจ้าของ 25/11/2026) ─────────────────────────
//
// ⭐ เจ้าของ: *"ผู้ขอเลือกในบรรทัด และ ใน ฐานข้อมูลสินค้า ขึ้นแนะนำ เพื่อ กดยื่นขออนุมัติ"*
//    · บรรทัด MSDS ของ FG ที่ยังไม่ผูก เลือกกลิ่น (02-020) / สูตร (หมวดอื่น) ไว้ในคำร้อง — **ไม่เขียนกลับ FG เอง**
//    · หน้านี้ขึ้นตัวที่คำร้องระบุ + ปุ่ม "ผูก + ยื่นขออนุมัติ" = PATCH ช่องเดียวกับฟอร์มสินค้า (`formulaId` / `scentId`)
//      ⇒ ด่านอนุมัติเดิมทำงานเอง (FG ที่อนุมัติแล้วกลับไปรออนุมัติ · `resetApprovalOnEdit`)
//    · ชื่อที่พิมพ์ (ยังไม่มีในทะเบียน) ผูกไม่ได้ — บอกให้ RD ลงทะเบียนก่อน
// ⚠️ ไม่มีสิทธิ์แก้สินค้า = เห็นคำแนะนำ แต่ไม่มีปุ่ม (กติกา "ไม่มีสิทธิ์ = ไม่โชว์ปุ่ม")
import { useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import StatusNotice from "@/components/ui/StatusNotice";
import { apiJson } from "@/lib/apiFetch";

export default function FgSubjectSuggestions({ productId, suggestions = [], canEdit = false, approved = false, onBound }) {
  const [pick, setPick] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!suggestions.length) return null;

  const bind = async () => {
    if (!pick) return;
    setBusy(true);
    setError("");
    try {
      await apiJson(`/api/products/${encodeURIComponent(productId)}`, {
        method: "PATCH",
        json: pick.kind === "scent" ? { scentId: pick.id } : { formulaId: pick.id },
        fallbackError: `ผูก${pick.noun}ไม่สำเร็จ`,
      });
      setPick(null);
      onBound?.();
    } catch (e) {
      setError(e?.message || `ผูก${pick.noun}ไม่สำเร็จ`);
    } finally {
      setBusy(false);
    }
  };

  const noun = suggestions[0].noun;
  return (
    <div className="md:col-span-2">
      <StatusNotice tone="info" title={`คำร้องขอ MSDS ระบุ${noun}ให้ FG นี้`}>
        <ul className="flex flex-col gap-2 mt-1">
          {suggestions.map((s) => (
            <li key={s.id || s.label} className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-[var(--text)]">{s.label}</span>
              {s.typed && <span className="text-[var(--text-3)]">(พิมพ์ชื่อ · ยังไม่มีในทะเบียน{noun} — ให้ RD ลงทะเบียนก่อนจึงผูกได้)</span>}
              <span className="text-[var(--text-3)]">
                จาก{" "}
                {s.requests.map((r, i) => (
                  <span key={r.id}>
                    {i > 0 ? " · " : ""}
                    <Link href={`/requests/${encodeURIComponent(r.id)}`} className="linklike">{r.docNo || r.id}</Link>
                  </span>
                ))}
              </span>
              {canEdit && !s.typed && (
                <Button size="sm" onClick={() => { setError(""); setPick(s); }}>
                  ผูก{noun}นี้ + ยื่นขออนุมัติ
                </Button>
              )}
            </li>
          ))}
        </ul>
      </StatusNotice>
      <ConfirmDialog
        open={!!pick}
        title={`ผูก${pick?.noun || noun}กับ FG นี้`}
        message={pick ? `${pick.noun} ${pick.label}` : ""}
        detail={approved
          ? "FG ที่อนุมัติแล้วจะกลับไปรอหัวหน้าอนุมัติใหม่ (กติกาแก้สินค้าเดิม)"
          : "บันทึกลงสินค้าแล้วรอหัวหน้าอนุมัติตามขั้นปกติ"}
        confirmLabel="ผูก + ยื่นขออนุมัติ"
        busy={busy}
        error={error}
        onConfirm={bind}
        onClose={() => { if (!busy) setPick(null); }}
      />
    </div>
  );
}
