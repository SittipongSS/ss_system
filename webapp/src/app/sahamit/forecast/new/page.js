"use client";
import { useRouter } from "next/navigation";
import { LineChart } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import ForecastForm from "@/components/sahamit/ForecastForm";
import { useApiList } from "@/lib/excise/useApiList";
import { apiCache } from "@/lib/apiCache";
import { useRole, useCan } from "@/lib/roleContext";
import AccessDenied from "@/components/ui/AccessDenied";
import { accessState } from "@/lib/accessGate";
// ลงรอบ FC ใหม่ — หน้าเต็ม. ฟอร์มมาจาก ForecastForm (ตัวเดียวกับหน้าแก้
// /sahamit/forecast/[id]/edit) ตามกฎ component เดียวสองโหมด.
export default function ForecastCreatePage() {
  const router = useRouter();
  const role = useRole();
  const canEdit = useCan("sahamit:edit");
  const { data: products } = useApiList("/api/sahamit/products");
  const { data: rounds } = useApiList("/api/sahamit/forecast/rounds");

  const done = (json) => {
    apiCache.delete("/api/sahamit/forecast/rounds");
    router.push(`/sahamit/forecast${json?.roundNo ? `?round=${json.roundNo}` : ""}`);
  };

  const shell = (body) => (
    <Workspace
      icon={<LineChart size={22} />}
      title="นำเข้ารอบ FC ใหม่"
      subtitle="รับ FC รายเดือนเป็นรอบ · กรอกจำนวนราย SKU × เดือน (ลูกค้า AR-109)"
      back={{ href: "/sahamit/forecast", label: "Forecast" }}
    >
      {body}
    </Workspace>
  );

  /* ⛔ จอปฏิเสธสิทธิ์มีหน้าตาเดียวทั้งระบบ (กฎ: docs/ui-visibility-rule.md) */
  if (accessState(role, canEdit) === "denied") {
    return (
      <AccessDenied
        icon={<LineChart size={22} />}
        title="นำเข้ารอบ FC ใหม่"
        message="การลงรอบ FC เปิดให้ผู้ที่มีสิทธิ์แก้ไขข้อมูลสหมิตรเท่านั้น — บัญชีนี้ดูข้อมูลได้อย่างเดียว"
        back={{ href: "/sahamit/forecast", label: "Forecast" }}
      />
    );
  }

  return shell(
    <ForecastForm
      products={products}
      editRound={null}
      existingRounds={rounds}
      onDone={done}
      onCancel={() => router.push("/sahamit/forecast")}
      onEditExisting={(r) => router.push(`/sahamit/forecast/${r.id}/edit`)}
    />,
  );
}
