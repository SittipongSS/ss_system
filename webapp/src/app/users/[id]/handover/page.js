"use client";
// ── โอนงานคนลาออก (มติเจ้าของ 27/11/2026 · docs/sales-handover.md) ─────────────────────────────────────
// ปุ่ม ⇄ "โอนงาน" ที่แถวของผู้ใช้ใน /users พามาที่นี่ (เดิมเป็นโมดัลที่ยกดีลเปิดทั้งหมดให้คนเดียว)
// โชว์รายการ → เลือกทีมและคนรับทีละรายการ → โอนแล้วหายไป จนกว่าจะเหลือ 0 · เนื้อหน้าอยู่ที่ HandoverOffboard
// ⭐ ด่านหน้า = users:manage (แอดมิน · มติ 27/11 ข้อ 2) · API ส่งต่องานตรวจซ้ำเอง
import { use, useMemo } from "react";
import { ArrowRightLeft } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import AccessDenied from "@/components/ui/AccessDenied";
import SkeletonRows from "@/components/ui/Skeleton";
import HandoverOffboard from "@/components/salesPlanning/handover/HandoverOffboard";
import { accessState } from "@/lib/accessGate";
import { useCan, useRole } from "@/lib/roleContext";
import { ROLE_LABELS } from "@/lib/permissions";
import usePeopleDirectory from "@/lib/usePeopleDirectory";

export default function UserHandoverPage({ params }) {
  const { id } = use(params);
  const role = useRole();
  const canManage = useCan("users:manage");
  const directory = usePeopleDirectory();
  const from = useMemo(() => directory.find((u) => String(u.id) === String(id)) || null, [directory, id]);

  const gate = accessState(role, canManage);
  if (gate === "loading") return <SkeletonRows rows={6} />;
  if (gate === "denied") {
    return <AccessDenied icon={<ArrowRightLeft size={22} />} title="โอนงานพนักงาน" message="หน้านี้สำหรับผู้ดูแลระบบเท่านั้น" back={{ href: "/users", label: "จัดการผู้ใช้งาน" }} />;
  }
  const fromName = from?.name || "ผู้ใช้";
  const roleText = from ? [ROLE_LABELS[from.role] || from.role, from.team ? `ทีม ${from.team}` : ""].filter(Boolean).join(" · ") : "";
  return (
    <Workspace
      icon={<ArrowRightLeft size={22} />}
      title={`โอนงานของ ${fromName}`}
      subtitle={`${roleText ? `${roleText} · ` : ""}เลือกทีมและคนรับทีละรายการ โอนแล้วรายการหายไปจากหน้านี้ จนกว่าจะเหลือ 0`}
      back={{ href: "/users", label: "จัดการผู้ใช้งาน" }}
    >
      <HandoverOffboard fromId={id} fromName={fromName} directory={directory} />
    </Workspace>
  );
}
