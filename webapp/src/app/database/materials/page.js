"use client";
// ── ทะเบียนวัสดุ (mig 0143 + 0157) ─────────────────────────────────────
//
// เดิมหน้านี้มีสามแท็บ (ทะเบียน + คิวเคสฝ่าย + เคสที่ฉันขอ) เพราะเคสขอราคาคือ
// วิธี "เติมราคา" ให้ทะเบียน — แต่พอเคสขอราคากลายเป็น **คำร้องข้ามฝ่าย** ที่รับ
// งานได้ทุกชนิด (บรีฟกลิ่น/ขอ mockup/ขอเอกสาร/ติดตามของเข้า — mig 0173) มันโตเกิน
// กว่าจะเป็นแท็บของหน้าวัสดุแล้ว จึงย้ายไปเป็นเมนู "คำร้อง" ของตัวเอง
//
// หน้านี้เหลือหน้าที่เดียว: ข้อมูลหลักของราคาวัสดุ → ย้ายจาก /sa/materials มาอยู่
// ใต้ "ฐานข้อมูล" กับทะเบียนกลิ่น/สูตร/สินค้า เพราะไม่มีงาน (workflow) เหลือแล้ว
//
// ⚠️ URL ของ **API ยังเป็น /api/sa/materials ตามเดิม** — ไม่ย้ายตาม เพราะกฎ
// allowlist ใน proxy.js ผูกกับ prefix นั้น และ path ของ API ผู้ใช้ไม่เห็นอยู่ดี
// (บทเรียน /api/company-profile: ย้าย prefix แล้วลืมลงทะเบียน = non-admin 403 เงียบ)
import { useCallback, useEffect, useState } from "react";
import { Boxes } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import MaterialRegistryPanel from "@/components/materials/MaterialRegistryPanel";
import { cachedFetchJson } from "@/lib/apiCache";

const REGISTRY_BLURB = "ข้อมูลหลักของราคาวัตถุดิบและบรรจุภัณฑ์ — ใบขอราคาผลิตเลือกวัสดุจากที่นี่ "
  + "แต่ละราคาเป็นรุ่น (rev) เก็บประวัติครบ และมีได้หลายชั้นจำนวน";

export default function MaterialsPage() {
  const [materials, setMaterials] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [formulas, setFormulas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const res = await fetch("/api/sa/materials", { cache: "no-store" });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error || "โหลดทะเบียนไม่สำเร็จ");
      setMaterials(Array.isArray(d) ? d : []);
    } catch (e) { setLoadError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    cachedFetchJson("/api/customers").then((d) => setCustomers(d || [])).catch(() => {});
    // ทะเบียนสูตร — วัสดุ RM ผูกสูตรจากที่นี่ ไม่ใช่พิมพ์รหัสเอง (mig 0181)
    fetch("/api/master/formulas?status=active", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setFormulas(Array.isArray(d) ? d : []))
      .catch(() => setFormulas([]));
  }, []);

  return (
    <Workspace
      icon={<Boxes size={22} />}
      title="ทะเบียนวัสดุ"
      subtitle={REGISTRY_BLURB}
    >
      <MaterialRegistryPanel
        materials={materials} customers={customers} formulas={formulas}
        loading={loading} loadError={loadError} reload={reload}
      />
    </Workspace>
  );
}
