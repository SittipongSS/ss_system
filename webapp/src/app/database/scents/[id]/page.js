"use client";
// ── หน้ารายละเอียดกลิ่น (มติผู้ใช้ 2026-08-10) ────────────────────────────
//
// ⭐ เดิมทะเบียนกลิ่นมีแค่หน้ารายการ — ดูของทีละตัวไม่ได้เลย ทั้งที่ตัวหนึ่งมีทั้ง
// สายพันธุ์ · ที่มาจากคำร้อง · ราคา F · ชื่อที่ลูกค้าเรียก ซึ่งอ่านในแถวตารางไม่ไหว
//
// ⚠️ เปลือกและปุ่มมาจากของกลาง (`RegistryDetailShell`) ที่ใช้ร่วมกับทะเบียนสูตร —
// เขียนสองเปลือกเมื่อไรมันจะเพี้ยนหากัน (กฎเดียวกับฟอร์มสร้าง/แก้ใน AGENTS.md)
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { FlaskConical, Pencil } from "lucide-react";
import RegistryDetailShell, { RegistryFactCard } from "@/components/database/RegistryDetailShell";
import { fmtDate } from "@/lib/format";
import { SCENT_STATUS_LABELS, SCENT_STATUS_TONES, scentSourceLabel } from "@/lib/master/scents";

// โทนของ StatusBadge → สีจริง (การ์ดจัดการรับเป็นค่า CSS ไม่ใช่ชื่อโทน)
const TONE_COLOR = {
  success: "var(--green)", danger: "var(--red)", warn: "var(--amber)", neutral: "var(--text-3)",
};

export default function ScentDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [scent, setScent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/master/scents/${id}`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "โหลดข้อมูลกลิ่นไม่สำเร็จ");
      setScent(data);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const back = { href: "/database/scents", label: "กลับทะเบียนกลิ่น" };
  if (loading || error || !scent) {
    return (
      <RegistryDetailShell
        back={back}
        loading={loading}
        error={error || (loading ? "" : "ไม่พบกลิ่นนี้ในทะเบียน")}
      />
    );
  }

  /* ⚠️ `scentSourceLabel` คืน **object** `{ kind, label, requestId }` ไม่ใช่สตริง —
     เอาไปวางใน JSX ตรง ๆ ได้ error "Objects are not valid as a React child"
     (เจอจริงตอนเปิดหน้านี้ครั้งแรก) · ที่นี่ใช้แค่ `label` */
  const src = scentSourceLabel(scent);
  const srcLabel = src?.label || null;
  return (
    <RegistryDetailShell
      back={back}
      eyebrow={`ทะเบียนกลิ่น${srcLabel ? ` · ${srcLabel}` : ""}`}
      title={scent.code ? `${scent.code} · ${scent.name}` : scent.name}
      description={scent.customerName || scent.customerId}
      statusLabel={SCENT_STATUS_LABELS[scent.status] || scent.status}
      statusTone={TONE_COLOR[SCENT_STATUS_TONES[scent.status]] || "var(--blue)"}
      statusDescription="แก้ข้อมูล ดูที่มา และราคาล่าสุดของกลิ่นนี้"
      facts={[
        { label: "ลูกค้า", value: scent.customerName || scent.customerId || "-" },
        { label: "วันที่ส่งลูกค้า", value: scent.sentAt ? fmtDate(scent.sentAt) : "ยังไม่ส่ง" },
        { label: "เพิ่มเข้าทะเบียน", value: fmtDate(scent.createdAt) },
      ]}
      price={scent.price}
      priceLabel="ราคา F (บาท/Kg)"
      /* ⚠️ **ไม่ก๊อปฟอร์มมาไว้ที่นี่** — ฟอร์มแก้คือตัวเดียวกับตอนเพิ่มและอยู่หน้า
         รายการ (`ScentForm`) · ปุ่มนี้ส่งกลับไปเปิดฟอร์มที่นั่นด้วย `?edit=` */
      primaryAction={{
        id: "edit",
        kind: "edit",
        label: "แก้ไขข้อมูล",
        icon: Pencil,
        onClick: () => router.push(`/database/scents?edit=${scent.id}`),
      }}
    >
      <RegistryFactCard
        icon={FlaskConical}
        eyebrow="SCENT"
        title="ข้อมูลกลิ่น"
        rows={[
          { label: "รหัสกลิ่น", value: scent.code },
          { label: "ชื่อกลิ่น", value: scent.name },
          { label: "ชื่อที่ลูกค้าเรียก", value: scent.customerTradeName },
          { label: "แก้มาจากกลิ่น", value: scent.derivedFromScentId },
          { label: "เจ้าของกลิ่น (RD)", value: scent.ownerName },
          { label: "ที่มา", value: srcLabel },
          { label: "หมายเหตุ", value: scent.note, wide: true },
        ]}
      />
    </RegistryDetailShell>
  );
}
