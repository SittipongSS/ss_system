"use client";
// ── ทะเบียนวัสดุ (mig 0143 + 0157) ─────────────────────────────────────
//
// เดิมหน้านี้มีสามแท็บ (ทะเบียน + คิวเคสฝ่าย + เคสที่ฉันขอ) เพราะเคสขอราคาคือ
// วิธี "เติมราคา" ให้ทะเบียน — แต่พอเคสขอราคากลายเป็น **คำร้องข้ามฝ่าย** ที่รับ
// งานได้ทุกชนิด (บรีฟกลิ่น/ขอ mockup/ขอเอกสาร/ติดตามของเข้า — mig 0173) มันโตเกิน
// กว่าจะเป็นแท็บของหน้าวัสดุแล้ว จึงย้ายไปเป็นเมนู "คำร้อง" ของตัวเอง
//
// หน้านี้เหลือหน้าที่เดียว: ข้อมูลหลักของราคาวัสดุ
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
