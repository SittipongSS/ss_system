"use client";
// ── หน้ารายละเอียดสูตร (มติผู้ใช้ 2026-08-10) ─────────────────────────────
//
// ⚠️ เปลือกเดียวกับทะเบียนกลิ่น (`RegistryDetailShell`) — ต่างกันแค่ข้อเท็จจริง
// กับปุ่ม · เขียนสองเปลือกเมื่อไรมันจะเพี้ยนหากัน (กฎ AGENTS.md)
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { BadgeDollarSign, Beaker, Pencil, Trash2 } from "lucide-react";
import RegistryDetailShell, { RegistryFactCard } from "@/components/database/RegistryDetailShell";
import RegistryPriceModal from "@/components/database/RegistryPriceModal";
import FormulaFormModal from "@/components/database/FormulaFormModal";
import { formulaToForm } from "@/components/database/FormulaForm";
import Toast from "@/components/ui/Toast";
import { cachedFetchJson } from "@/lib/apiCache";
import { fmtDate, NA } from "@/lib/format";
import { useDepartment, useRole } from "@/lib/roleContext";
import { canQuoteMaterial } from "@/lib/materialPrices";
import { apiFetch } from "@/lib/apiFetch";
import {
  FORMULA_STATUS_LABELS, FORMULA_STATUS_TONES, formulaFormPayload, formulaSourceLabel,
  isFormulaRegistrar, isFormulaUsable,
} from "@/lib/master/formulas";

const TONE_COLOR = {
  success: "var(--green)", danger: "var(--red)", warn: "var(--amber)", neutral: "var(--text-3)",
};

export default function FormulaDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const role = useRole();
  const department = useDepartment();
  const me = useMemo(() => ({ role, department }), [role, department]);
  const [formula, setFormula] = useState(null);
  const [scentName, setScentName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pricing, setPricing] = useState(false);
  const [toast, setToast] = useState(null);
  /* ⭐ **แก้ในที่ ไม่เด้งกลับหน้ารายการ** (ผู้ใช้ทัก 2026-08-19) — เดิมปุ่มนี้
     `router.push('/database/formulas?edit=…')` ⇒ คนที่กำลังอ่านรายละเอียดถูกพาออกจาก
     หน้าที่ดูอยู่ และหลังบันทึกก็ค้างที่หน้ารายการ · ตอนนี้เปิดฟอร์มตัวเดียวกัน
     (`FormulaFormModal`) ทับหน้านี้ แล้วโหลดค่าที่แก้กลับมาแสดง */
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  /* ฟอร์มสูตรต้องมีของครบชุดเหมือนหน้าทะเบียน: ลูกค้า · กลิ่น · สูตร (สายพันธุ์) ·
     หมวดสินค้า — โหลดตอนกดแก้ครั้งแรกพอ (ชุด taxonomy ใช้แคชร่วมกับทั้งระบบ) */
  const [registryData, setRegistryData] = useState({
    customers: [], scents: [], formulas: [], categories: [],
  });
  const openEdit = async () => {
    setForm({ mode: "edit", formula, value: formulaToForm(formula) });
    const get = (url) => apiFetch(url, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => (Array.isArray(d) ? d : []))
      .catch(() => []);
    const [customers, scents, formulas, categories] = await Promise.all([
      get("/api/customers"), get("/api/master/scents"), get("/api/master/formulas"),
      cachedFetchJson("/api/master/product-types").then((d) => (Array.isArray(d) ? d : [])).catch(() => []),
    ]);
    setRegistryData({ customers, scents, formulas, categories });
  };
  const submitEdit = async () => {
    setSaving(true);
    try {
      const payload = formulaFormPayload(form.value, { canSetCode: isFormulaRegistrar(me) });
      const res = await fetch(`/api/master/formulas/${formula.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "edit", ...payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setToast({ kind: "error", msg: data.error || "บันทึกไม่สำเร็จ" }); return; }
      setForm(null);
      setToast({ kind: "success", msg: "บันทึกข้อมูลสูตรแล้ว" });
      await load();
    } finally { setSaving(false); }
  };

  /* ⭐ **ปุ่มลบบนการ์ดจัดการ** (มติผู้ใช้ 2026-08-18) — ลบได้ถึงขั้น "กำลังพัฒนา"
     (ด่านจริงอยู่ที่ `deleteFormulaError` ฝั่ง server) · ที่นี่แค่ถามยืนยัน
     ⚠️ ปุ่มโผล่เฉพาะสถานะที่ลบได้จริง — ปุ่มที่กดแล้วเด้ง error ทุกครั้งคือปุ่มหลอก */
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [removing, setRemoving] = useState(false);
  const removeFormula = async () => {
    setRemoving(true);
    try {
      const res = await fetch(`/api/master/formulas/${formula.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast({ kind: "error", msg: data.error || "ลบไม่สำเร็จ" });
        setConfirmDelete(false);
        return;
      }
      router.push("/database/formulas");
    } finally { setRemoving(false); }
  };

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await apiFetch(`/api/master/formulas/${id}`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "โหลดข้อมูลสูตรไม่สำเร็จ");
      setFormula(data);
      // ⚠️ ชื่อกลิ่นไม่ได้ติดมากับแถวสูตร — ยิงต่อเฉพาะตอนผูกกลิ่นจริง และ
      // ล้มแล้วไม่ทำให้ทั้งหน้าพัง (แค่โชว์ id แทนชื่อ)
      if (data?.scentId) {
        const sRes = await apiFetch(`/api/master/scents/${data.scentId}`, { cache: "no-store" });
        const sData = await sRes.json().catch(() => null);
        if (sRes.ok && sData) setScentName(sData.code ? `${sData.code} · ${sData.name}` : sData.name);
      } else setScentName("");
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const back = { href: "/database/formulas", label: "กลับทะเบียนสูตร" };
  if (loading || error || !formula) {
    return (
      <RegistryDetailShell
        back={back}
        loading={loading}
        error={error || (loading ? "" : "ไม่พบสูตรนี้ในทะเบียน")}
      />
    );
  }

  // ⚠️ คืน object เหมือน `scentSourceLabel` — ใช้แค่ `label` (ดูหมายเหตุที่หน้ากลิ่น)
  const src = formulaSourceLabel(formula);
  const srcLabel = src?.label || null;
  // ปุ่มใส่ราคา FB — กติกาเดียวกับราคา F บนหน้ากลิ่น (ดูหมายเหตุที่นั่น)
  const canPrice = canQuoteMaterial(me, "RM_FB") && isFormulaUsable(formula);
  const hasPrice = formula.price?.unitPrice != null;


  return (
    <RegistryDetailShell
      back={back}
      eyebrow={`ทะเบียนสูตร${srcLabel ? ` · ${srcLabel}` : ""}`}
      title={formula.code ? `${formula.code} · ${formula.name}` : formula.name}
      description={formula.customerName || "สูตรฐาน — ใช้ได้ทุกลูกค้า"}
      statusLabel={FORMULA_STATUS_LABELS[formula.status] || formula.status}
      statusTone={TONE_COLOR[FORMULA_STATUS_TONES[formula.status]] || "var(--blue)"}
      statusDescription="แก้ข้อมูล ดูที่มา และราคาล่าสุดของสูตรนี้"
      facts={[
        { label: "ลูกค้า", value: formula.customerName || "สูตรฐาน" },
        { label: "วันที่ของสูตร", value: formula.formulaDate ? fmtDate(formula.formulaDate) : NA },
        { label: "เพิ่มเข้าทะเบียน", value: fmtDate(formula.createdAt) },
      ]}
      price={formula.price}
      priceLabel="ราคา FB (บาท/Kg)"
      primaryAction={{
        id: "edit",
        kind: "edit",
        label: "แก้ไขข้อมูล",
        icon: Pencil,
        // ⚠️ เปิดฟอร์มตัวเดียวกับหน้ารายการทับหน้านี้ — ไม่เด้งออกไปไหน
        onClick: openEdit,
      }}
      secondaryActions={canPrice ? [{
        id: "price",
        label: hasPrice ? "ออกราคา FB ใหม่" : "ใส่ราคา FB",
        icon: BadgeDollarSign,
        onClick: () => setPricing(true),
      }] : []}
      /* ⚠️ **ลบอยู่ในกลุ่ม danger ของการ์ดจัดการ** — ที่เดียวกับทุกเอกสารในระบบ
         · โผล่เฉพาะขั้นที่ลบได้จริง (ร่าง / กำลังพัฒนา) และเฉพาะคนที่คุมทะเบียน */
      dangerActions={["draft", "developing"].includes(formula.status) && isFormulaRegistrar(me) ? [{
        id: "delete",
        label: "ลบสูตรนี้",
        icon: Trash2,
        onClick: () => setConfirmDelete(true),
      }] : []}
    >
      <RegistryFactCard
        icon={Beaker}
        eyebrow="FORMULA"
        title="ข้อมูลสูตร"
        rows={[
          { label: "รหัสสูตร", value: formula.code },
          { label: "ชื่อสูตร", value: formula.name },
          { label: "ชื่อที่ลูกค้าเรียก", value: formula.customerTradeName },
          { label: "กลิ่นที่ใช้", value: scentName || formula.scentId },
          { label: "หมวดสินค้า", value: formula.categoryCode },
          { label: "แก้มาจากสูตร", value: formula.derivedFromFormulaId },
          { label: "ที่มา", value: srcLabel },
          { label: "หมายเหตุ", value: formula.note, wide: true },
        ]}
      />

      {/* ฟอร์มแก้ — ตัวเดียวกับหน้ารายการ เปิดทับหน้านี้ ไม่พาผู้ใช้ออกไปไหน */}
      <FormulaFormModal
        form={form} saving={saving}
        customers={registryData.customers} scents={registryData.scents}
        formulas={registryData.formulas} categories={registryData.categories}
        canSetCode={isFormulaRegistrar(me)}
        onChange={(value) => setForm({ ...form, value })}
        onClose={() => setForm(null)}
        onSubmit={submitEdit}
      />

      <RegistryPriceModal
        open={pricing}
        onClose={() => setPricing(false)}
        title={`${hasPrice ? "ออกราคา FB ใหม่" : "ใส่ราคา FB"} — ${formula.name}`}
        endpoint={`/api/master/formulas/${formula.id}/price`}
        onSaved={(msg) => {
          setPricing(false);
          setToast({ kind: "success", msg });
          load();
        }}
      />
      {/* ⚠️ เนื้อความอยู่ที่ `description` — `ConfirmDialog` ไม่เรนเดอร์ children */}
      <ConfirmDialog
        open={confirmDelete}
        tone="danger"
        title={`ลบสูตร ${formula.code || formula.name}`}
        description="ลบออกจากทะเบียนถาวร ย้อนกลับไม่ได้"
        detail="ถ้ามีคำร้องหรือทะเบียนราคาอ้างอยู่ ระบบจะไม่ยอมให้ลบ และจะบอกว่าติดที่ไหน"
        confirmLabel="ลบ"
        busy={removing}
        onClose={() => setConfirmDelete(false)}
        onConfirm={removeFormula}
      />
      <Toast toast={toast} onClose={() => setToast(null)} />
    </RegistryDetailShell>
  );
}
