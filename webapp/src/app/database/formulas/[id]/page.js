"use client";
// ── หน้ารายละเอียดสูตร (มติผู้ใช้ 2026-08-10) ─────────────────────────────
//
// ⚠️ เปลือกเดียวกับทะเบียนกลิ่น (`RegistryDetailShell`) — ต่างกันแค่ข้อเท็จจริง
// กับปุ่ม · เขียนสองเปลือกเมื่อไรมันจะเพี้ยนหากัน (กฎ AGENTS.md)
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Beaker, Pencil } from "lucide-react";
import RegistryDetailShell, { RegistryFactCard } from "@/components/database/RegistryDetailShell";
import { fmtDate } from "@/lib/format";
import {
  FORMULA_STATUS_LABELS, FORMULA_STATUS_TONES, formulaSourceLabel,
} from "@/lib/master/formulas";

const TONE_COLOR = {
  success: "var(--green)", danger: "var(--red)", warn: "var(--amber)", neutral: "var(--text-3)",
};

export default function FormulaDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [formula, setFormula] = useState(null);
  const [scentName, setScentName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/master/formulas/${id}`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "โหลดข้อมูลสูตรไม่สำเร็จ");
      setFormula(data);
      // ⚠️ ชื่อกลิ่นไม่ได้ติดมากับแถวสูตร — ยิงต่อเฉพาะตอนผูกกลิ่นจริง และ
      // ล้มแล้วไม่ทำให้ทั้งหน้าพัง (แค่โชว์ id แทนชื่อ)
      if (data?.scentId) {
        const sRes = await fetch(`/api/master/scents/${data.scentId}`, { cache: "no-store" });
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
        { label: "วันที่ของสูตร", value: formula.formulaDate ? fmtDate(formula.formulaDate) : "-" },
        { label: "เพิ่มเข้าทะเบียน", value: fmtDate(formula.createdAt) },
      ]}
      price={formula.price}
      priceLabel="ราคา FB (บาท/Kg)"
      primaryAction={{
        id: "edit",
        kind: "edit",
        label: "แก้ไขข้อมูล",
        icon: Pencil,
        onClick: () => router.push(`/database/formulas?edit=${formula.id}`),
      }}
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
    </RegistryDetailShell>
  );
}
