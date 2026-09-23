"use client";
// ── หน้าแก้ใบสั่งขายย้อนหลังที่เป็นร่างหรือถูกตีกลับ (มติเจ้าของ 22/09 · mig 0374) ──────────────
//
// ⭐ **ฟอร์มเดียวกับตอนสร้างจริง ๆ** — หน้านี้ไม่มีช่องของตัวเองสักช่อง ส่งแค่ `orderId`
//   เข้า `HistoricalOrderWizard` (กฎ AGENTS.md · บทเรียน: ฟอร์มสร้างกับฟอร์มแก้คนละไฟล์
//   จะขาดคนละอย่างโดยไม่มีใครรู้)
// ⚠️ ฟอร์มเป็นคนโหลดใบเองและตีกลับเป็นข้อความอ่านอย่างเดียวเมื่อใบไม่อยู่ในสถานะที่แก้ได้
import { Suspense } from "react";
import { useParams } from "next/navigation";
import { History } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import SkeletonRows from "@/components/ui/Skeleton";
import HistoricalOrderWizard from "@/components/salesPlanning/historicalWizard/HistoricalOrderWizard";

function HistoricalSalesOrderEditInner() {
  const params = useParams();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;
  return <HistoricalOrderWizard orderId={id || null} />;
}

export default function HistoricalSalesOrderEditPage() {
  return (
    <Suspense fallback={(
      <Workspace icon={<History size={22} />} title="คีย์ SO ย้อนหลัง (งานบริการ)">
        <SkeletonRows rows={6} />
      </Workspace>
    )}>
      <HistoricalSalesOrderEditInner />
    </Suspense>
  );
}
