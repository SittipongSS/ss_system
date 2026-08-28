"use client";
// ── ทะเบียนวัสดุ (mig 0143 + 0157) ─────────────────────────────────────
//
// เดิมหน้านี้มีสามแท็บ (ทะเบียน + คิวเคสฝ่าย + เคสที่ฉันขอ) เพราะเคสขอราคาคือ
// วิธี "เติมราคา" ให้ทะเบียน — แต่พอเคสขอราคากลายเป็น **คำร้องข้ามฝ่าย** ที่รับ
// งานได้ทุกชนิด (พัฒนากลิ่น/พัฒนาสูตร/ขอเอกสาร/ติดตามของเข้า — mig 0173) มันโตเกิน
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
import { apiFetch } from "@/lib/apiFetch";

// มติผู้ใช้ 2026-08-10: ทะเบียนนี้เหลือ **บรรจุภัณฑ์ (PM) อย่างเดียว** เตรียมต่อ
// โมดูลจัดซื้อ · ราคา RM (หัวน้ำหอม F / เนื้อสาร FB) จัดการที่ทะเบียนกลิ่น/สูตร
const REGISTRY_BLURB = "ข้อมูลหลักของราคาบรรจุภัณฑ์ (PM) — ใบขอราคาผลิตเลือกวัสดุจากที่นี่ "
  + "แต่ละราคาเป็นรุ่น (rev) มีได้หลายชั้นจำนวน · ราคา F/FB ดูที่ทะเบียนกลิ่นและทะเบียนสูตร";

export default function MaterialsPage() {
  const [materials, setMaterials] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const res = await apiFetch("/api/sa/materials", { cache: "no-store" });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error || "โหลดทะเบียนไม่สำเร็จ");
      // แถว RM ที่สายคำร้อง/ปุ่มใส่ราคาสร้างไว้ยังอยู่ใน DB (ใบขอราคาผลิตอ้างต่อ)
      // แต่หน้านี้ไม่ใช่ที่จัดการมันแล้ว — เห็นเฉพาะบรรจุภัณฑ์
      setMaterials((Array.isArray(d) ? d : []).filter((m) => m.kind === "PM"));
    } catch (e) { setLoadError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    cachedFetchJson("/api/customers").then((d) => setCustomers(d || [])).catch(() => {});
  }, []);

  return (
    <Workspace
      icon={<Boxes size={22} />}
      title="ทะเบียนวัสดุ"
      subtitle={REGISTRY_BLURB}
    >
      <MaterialRegistryPanel
        materials={materials} customers={customers}
        loading={loading} loadError={loadError} reload={reload}
      />
    </Workspace>
  );
}
