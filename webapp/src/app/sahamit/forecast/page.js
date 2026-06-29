"use client";
import { LineChart } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import SahamitPlaceholder from "@/components/sahamit/SahamitPlaceholder";

export default function ForecastPage() {
  return (
    <Workspace
      icon={<LineChart size={22} />}
      title="Forecast"
      subtitle="รับ FC รายเดือนเป็นรอบ และเทียบรอบต่อรอบ"
      back={{ href: "/sahamit", label: "SAHAMIT" }}
    >
      <SahamitPlaceholder phase="เฟส 1" note="นำเข้ารอบ FC (Excel) · เทียบรอบ เพิ่ม/ลด/เลื่อน/หาย · เฝ้าระวังยอด Peak" />
    </Workspace>
  );
}
