"use client";
import { Boxes } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import SahamitPlaceholder from "@/components/sahamit/SahamitPlaceholder";

export default function MaterialPage() {
  return (
    <Workspace
      icon={<Boxes size={22} />}
      title="วัสดุ / Lead time"
      subtitle="ติดตาม PM (สต็อกตาม FC) และ RM (สั่งตาม PO)"
      back={{ href: "/sahamit", label: "SAHAMIT" }}
    >
      <SahamitPlaceholder phase="เฟส 4" note="จำแนก PO ตรง/นอก FC · วันพร้อมผลิต 60/90 วันทำการ (ใช้ปฏิทินวันหยุด) · สถานะ PM/RM" />
    </Workspace>
  );
}
