"use client";
// ── หน้าคีย์ใบสั่งขายย้อนหลังใบใหม่ (มติเจ้าของ 22/09 · mig 0374) ─────────────────────────
//
// ⭐ หน้านี้เป็นแค่ทางเข้า — ฟอร์มทั้งใบอยู่ที่ `HistoricalOrderWizard` **ตัวเดียวกับหน้าแก้ใบ**
//   (กฎ AGENTS.md: ปุ่ม "แก้ไข" ต้องเปิดฟอร์มตัวเดียวกับตอนสร้าง)
// ⚠️ เส้นทางจริงที่ผู้ใช้เห็นคือ `/sa/sales-orders/historical/new` (rewrite ใน next.config.mjs)
//   · เซกเมนต์คงที่ `new` ชนะ `[id]` เสมอ ⇒ ไม่ไปตกที่หน้าแก้ใบของ id ชื่อ "new"
// ⚠️ ด่านสิทธิ์อยู่ในตัวฟอร์ม (AccessDenied) — ด่านจริงคือ route/RPC เหมือนทุกจอ
import { Suspense } from "react";
import { History } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import SkeletonRows from "@/components/ui/Skeleton";
import HistoricalOrderWizard from "@/components/salesPlanning/historicalWizard/HistoricalOrderWizard";

export default function HistoricalSalesOrderNewPage() {
  return (
    <Suspense fallback={(
      <Workspace icon={<History size={22} />} title="คีย์ SO ย้อนหลัง (งานบริการ)">
        <SkeletonRows rows={6} />
      </Workspace>
    )}>
      <HistoricalOrderWizard />
    </Suspense>
  );
}
