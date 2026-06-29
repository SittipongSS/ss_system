"use client";
import { ClipboardCheck } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import SahamitPlaceholder from "@/components/sahamit/SahamitPlaceholder";

export default function ReconcilePage() {
  return (
    <Workspace
      icon={<ClipboardCheck size={22} />}
      title="กระทบยอด (Reconciliation)"
      subtitle="สถานะ FC / PO / FC vs PO รายสินค้า × เดือน"
      back={{ href: "/sahamit", label: "SAHAMIT" }}
    >
      <SahamitPlaceholder phase="เฟส 3" note="กริด SKU × เดือน · สถานะต่อช่อง (ครบ/เกิน/ขาด/รอ/นอกแผน) · drill-down" />
    </Workspace>
  );
}
