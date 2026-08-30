"use client";
import { useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { LineChart } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import ForecastForm from "@/components/sahamit/ForecastForm";
import { useApiList } from "@/lib/excise/useApiList";
import { apiCache } from "@/lib/apiCache";
import { useRole, useCan } from "@/lib/roleContext";
import AccessDenied from "@/components/ui/AccessDenied";
import { accessState } from "@/lib/accessGate";
// แก้รอบ FC — หน้าเต็ม ใช้ฟอร์มตัวเดียวกับหน้าลงรอบใหม่ (ForecastForm).
export default function ForecastEditPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id;
  const role = useRole();
  const canEdit = useCan("sahamit:edit");
  const { data: products } = useApiList("/api/sahamit/products");
  const { data: rounds, loading } = useApiList("/api/sahamit/forecast/rounds");
  const round = useMemo(() => rounds.find((r) => r.id === id) || null, [rounds, id]);

  const done = () => {
    apiCache.delete("/api/sahamit/forecast/rounds");
    router.push(`/sahamit/forecast${round?.roundNo ? `?round=${round.roundNo}` : ""}`);
  };

  const shell = (body) => (
    <Workspace
      icon={<LineChart size={22} />}
      title={round ? `แก้ FC รอบที่ ${round.roundNo}` : "แก้ไขรอบ FC"}
      subtitle="ฟอร์มเดียวกับตอนลงรอบใหม่ (ลูกค้า AR-109)"
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
        title="แก้รอบ FC"
        message="การแก้รอบ FC เปิดให้ผู้ที่มีสิทธิ์แก้ไขข้อมูลสหมิตรเท่านั้น — บัญชีนี้ดูข้อมูลได้อย่างเดียว"
        back={{ href: "/sahamit/forecast", label: "Forecast" }}
      />
    );
  }
  if (loading && !round) return shell(<div style={{ padding: 24, color: "var(--text-3)" }}>กำลังโหลด...</div>);
  if (!round) return shell(<div style={{ padding: 24, color: "var(--red)" }}>ไม่พบรอบ FC นี้</div>);

  return shell(
    <ForecastForm
      products={products}
      editRound={round}
      existingRounds={rounds}
      onDone={done}
      onCancel={() => router.push("/sahamit/forecast")}
    />,
  );
}
