"use client";
// ── หน้างานของช่าง `/service/today/[visitId]` (ขั้นเข้าติดตั้ง PR-5b · มติเจ้าของ 09/11/2026) ─────────────────────
//
// ⭐ เจ้าของเลือก: **สร้างหน้านี้เลย เริ่มจากงานติดตั้ง** — งานรอบบริการเติมเข้าหน้าเดียวกันทีหลังตามแผน crewops
//    (~/ss-team/mockups/operation-crew/PLAN.md C2 · ห้ามทำหน้าช่างแยกอีกชุด)
//    ⇒ ตอนนี้หน้านี้รู้จักแค่ **นัดติดตั้งจากคำขอคิว** (`isInstallStepVisit`) · นัดชนิดอื่นบอกทางกลับไปงานของฉัน
import { useParams } from "next/navigation";
import Workspace from "@/components/ui/Workspace";
import InstallJobScreen from "@/components/service/crew/install/InstallJobScreen";

export default function CrewJobPage() {
  const params = useParams();
  const visitId = Array.isArray(params?.visitId) ? params.visitId[0] : params?.visitId;
  /* เปลือกเดียวกับงานของฉัน · หัวจออยู่ในตัวงานเอง (หัวงาน + แถบขั้น) จึงซ่อนหัวของเปลือก */
  return (
    <Workspace hideHeader back={{ href: "/service/today", label: "งานของฉัน" }}>
      <InstallJobScreen visitId={visitId} />
    </Workspace>
  );
}
