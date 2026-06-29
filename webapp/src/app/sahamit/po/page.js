"use client";
import { FileText } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import SahamitPlaceholder from "@/components/sahamit/SahamitPlaceholder";

export default function PoPage() {
  return (
    <Workspace
      icon={<FileText size={22} />}
      title="Purchase Orders"
      subtitle="ติดตาม PO ที่ลูกค้าส่งมา"
      back={{ href: "/sahamit", label: "SAHAMIT" }}
    >
      <SahamitPlaceholder phase="เฟส 2" note="บันทึก PO หลายบรรทัด · วันเอกสาร/รับ/กำหนดส่ง/คาดการณ์(เลื่อนได้)/ส่งจริง · Split PO" />
    </Workspace>
  );
}
