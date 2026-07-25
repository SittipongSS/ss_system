"use client";
import { useRouter } from "next/navigation";
import { LineChart } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import ForecastForm from "@/components/sahamit/ForecastForm";
import { useApiList } from "@/lib/excise/useApiList";
import { apiCache } from "@/lib/apiCache";
import { useCan } from "@/lib/roleContext";

// ลงรอบ FC ใหม่ — หน้าเต็ม. ฟอร์มมาจาก ForecastForm (ตัวเดียวกับหน้าแก้
// /sahamit/forecast/[id]/edit) ตามกฎ component เดียวสองโหมด.
export default function ForecastCreatePage() {
  const router = useRouter();
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

  if (!canEdit) {
    return shell(
      <div className="empty-state dashed" style={{ padding: 48, textAlign: "center", color: "var(--text-3)" }}>
        <LineChart size={28} strokeWidth={1.5} style={{ marginBottom: 10 }} />
        <div style={{ fontWeight: 600, fontSize: 15 }}>ไม่มีสิทธิ์ลงรอบ FC</div>
        <div style={{ fontSize: 13, marginTop: 6 }}>บัญชีนี้ดูข้อมูลได้อย่างเดียว</div>
      </div>,
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
