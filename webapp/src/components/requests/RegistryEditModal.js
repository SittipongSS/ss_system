"use client";
// ── แก้ทะเบียนกลิ่น/สูตร จากในหน้าคำร้อง (มติผู้ใช้ 2026-08-18) ────────────
//
// ⭐ **ฟอร์มเดียวกับหน้าทะเบียนเป๊ะ ๆ** (`ScentForm` / `FormulaForm` โหมด edit) และยิง
// `/api/master/scents|formulas/[id]` ตัวเดิม — กฎ AGENTS.md: แก้ = ฟอร์มเดียวกับสร้าง
// ห้ามมีช่องกรอกชุดที่สองของ entity เดียวกัน ไม่งั้นสองฝั่งจะเพี้ยนหากันเสมอ
//
// ⚠️ **ด่านสิทธิ์เป็นของ API ไม่ใช่ของโมดัลนี้** — ที่นี่แค่ไม่โชว์ปุ่มให้คนที่แก้ไม่ได้
// (`canSetCode` = RD เท่านั้น) · server ตรวจซ้ำทุกครั้งเหมือนเปิดจากหน้าทะเบียน
//
// ⚠️ **ปิดโมดัลแล้วต้องรีโหลดใบ** — จอคำร้องอ่านค่าสดจากทะเบียนผ่าน payload ของใบ
// (`refScent`/`refFormula`) ⇒ ไม่รีโหลด ชื่อบนตารางจะยังเป็นของก่อนแก้จนกว่าจะ F5
import { useCallback, useEffect, useState } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import StatusNotice from "@/components/ui/StatusNotice";
import SkeletonRows from "@/components/ui/Skeleton";
import ScentForm, { scentToForm } from "@/components/database/ScentForm";
import FormulaForm, { formulaToForm } from "@/components/database/FormulaForm";
import { cachedFetchJson } from "@/lib/apiCache";
import { apiFetch } from "@/lib/apiFetch";

const API = { scent: "/api/master/scents", formula: "/api/master/formulas" };

export default function RegistryEditModal({ target, canSetCode = false, onClose, onSaved }) {
  const kind = target?.kind === "formula" ? "formula" : "scent";
  const [value, setValue] = useState(null);
  const [refs, setRefs] = useState({ customers: [], scents: [], formulas: [], categories: [] });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!target?.id) return;
    setError("");
    const res = await apiFetch(`${API[kind]}/${target.id}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error || "โหลดข้อมูลทะเบียนไม่สำเร็จ"); return; }
    setValue(kind === "formula" ? formulaToForm(data) : scentToForm(data));
  }, [kind, target?.id]);

  useEffect(() => { load(); }, [load]);

  /* ตัวเลือกที่ฟอร์มต้องใช้ — โหลดตอนเปิดโมดัลเท่านั้น ไม่ใช่ตอนเปิดหน้าคำร้อง
     (ส่วนใหญ่ของคนที่เปิดใบไม่ได้มาแก้ทะเบียน) */
  useEffect(() => {
    let alive = true;
    const want = kind === "formula"
      ? ["/api/customers", "/api/master/scents", "/api/master/formulas", "/api/master/product-types"]
      : ["/api/customers", "/api/master/scents"];
    Promise.all(want.map((u) => cachedFetchJson(u).catch(() => [])))
      .then(([customers, scents, formulas = [], categories = []]) => {
        if (!alive) return;
        setRefs({
          customers: customers || [],
          scents: scents || [],
          formulas: formulas || [],
          categories: categories || [],
        });
      });
    return () => { alive = false; };
  }, [kind]);

  const save = async () => {
    setBusy(true); setError("");
    try {
      const res = await fetch(`${API[kind]}/${target.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "edit", ...value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "บันทึกไม่สำเร็จ"); return; }
      await onSaved?.();
      onClose?.();
    } finally { setBusy(false); }
  };

  return (
    <Modal
      open onClose={onClose} dismissible={!busy}
      title={kind === "formula" ? "แก้ข้อมูลสูตรในทะเบียน" : "แก้ข้อมูลกลิ่นในทะเบียน"}
    >
      {error && <StatusNotice tone="error">{error}</StatusNotice>}
      {!value ? <SkeletonRows rows={4} /> : (
        <>
          {kind === "formula" ? (
            <FormulaForm
              mode="edit" value={value} onChange={setValue} editingId={target.id}
              customers={refs.customers} scents={refs.scents} formulas={refs.formulas}
              categories={refs.categories} canSetCode={canSetCode} disabled={busy}
            />
          ) : (
            <ScentForm
              mode="edit" value={value} onChange={setValue} editingId={target.id}
              customers={refs.customers} scents={refs.scents}
              canSetCode={canSetCode} disabled={busy}
            />
          )}
          {/* ⚠️ ข้อความนี้ไม่ใช่คำเตือน มันคือสัญญาของหน้านี้ — คนที่กดแก้จากในคำร้อง
              ต้องรู้ว่ากำลังแก้ของกลาง ไม่ใช่แก้ข้อความบนใบนี้ใบเดียว */}
          <small className="form-hint">
            แก้ที่นี่คือแก้ทะเบียนตัวจริง — คำร้องทุกใบที่อ้างถึงตัวนี้จะเห็นค่าใหม่ทันที
          </small>
          <div className="action-bar">
            <Button variant="quiet" disabled={busy} onClick={onClose}>ยกเลิก</Button>
            <Button tone="primary" disabled={busy} onClick={save}>บันทึก</Button>
          </div>
        </>
      )}
    </Modal>
  );
}
