"use client";
// ── ปุ่ม "สร้างงาน" สำหรับหน้าดีล / หน้าโครงการ ────────────────────────────────
//
// ⭐ **มติผู้ใช้ 2026-08-22: ดีลกับโครงการเป็นศูนย์กลางการควบคุม** — คนที่ยืนอยู่บน
//    ดีลหรือโครงการต้องเปิดงานได้จากตรงนั้น ไม่ใช่ถูกโยนไปคิวงานรวมแล้วมาเลือกดีลใหม่
//
// ⭐ **โมดัลในหน้า ไม่ใช่ลิงก์ไป `/sa/tasks`** — ต่างจากคำร้องซึ่งจงใจเป็นหน้าเต็ม
//    (คำร้องต้องมีจังหวะทบทวนก่อนออกเลขที่) · งานไม่มีเลขที่ให้ออก และ `TaskFormModal`
//    ถูกออกแบบให้ผู้เรียก mount เองอยู่แล้ว (ใช้อยู่ที่ /sa/tasks และหน้ารายละเอียดงาน)
//
//    🐞 **เหตุผลที่ลิงก์ใช้ไม่ได้จริง ๆ** — `/pm/tasks` อ่าน `returnTo` เฉพาะในสาขา
//    `?inquiryId=` เท่านั้น ทางที่มาด้วยดีลจึงไม่มีวันพากลับ: กดสร้างงานจากหน้าดีล →
//    บันทึก → ค้างอยู่ที่คิวงาน และตารางงานบนหน้าดีลก็ไม่รีเฟรช · โมดัลในหน้าไม่ต้อง
//    เดินสายอะไรเพิ่มเลย `onSaved` เรียก `load()` ของหน้าเดิมได้ตรง ๆ
//
// ⚠️ **ของหนักโหลดตอนกด ไม่ใช่ตอนเปิดหน้า** — หน้าดีล/โครงการหนักอยู่แล้ว และคนส่วน
//    ใหญ่เข้ามาอ่าน ไม่ได้เข้ามาสร้างงาน ⇒ สามรายการ (ผู้รับมอบหมาย/ดีล/โครงการ)
//    ถูกขอเมื่อกดปุ่มครั้งแรกเท่านั้น แล้วจำไว้ใช้รอบถัดไป
import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import Button from "@/components/ui/Button";
import TaskFormModal from "@/components/pm/TaskFormModal";
import { assignableUsersFor } from "@/lib/permissions";
import { cachedFetchJson } from "@/lib/apiCache";
import { notifyToast } from "@/lib/feedback";
import { apiFetch } from "@/lib/apiFetch";

export default function TaskCreateButton({
  // โหมดหน้าดีล — ดีลถูกกำหนดมาแล้ว
  dealId = "",
  /* โหมดหน้าโครงการ — ยังไม่รู้ว่างานนี้ของดีลไหน ⇒ ส่ง **เฉพาะดีลของโครงการนี้**
     มาเป็นตัวเลือก · `DealPicker` ในโมดัลจึงถูกจำกัดขอบเขตโดยไม่ต้องมีตัวเลือกดีล
     ชุดที่สองบนหน้าโครงการ (ฟอร์มเป็นเจ้าของช่องดีลอยู่แล้ว — กฎ AGENTS.md ข้อ
     "สร้าง/แก้ ใช้ component เดียวกัน" กันไม่ให้งอกแถบปุ่ม/ข้อความ blocker ชุดสอง) */
  projectDeals = null,
  canEdit = false,
  label = "สร้างงาน",
  size = "sm",
  tone,
  onSaved,
}) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [deals, setDeals] = useState([]);
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [me, setMe] = useState(null);

  useEffect(() => {
    if (!open || ready) return;
    /* ⚠️ `/api/pm/task-deals` ไม่ใช่ `/api/sales-planning/deals` — ตัวแรกคือ "ดีลที่
       *ผูกงาน* ได้" ตามขอบเขต `taskDealScope` ซึ่งเป็นด่านเดียวกับที่ route ใช้
       ปฏิเสธ · ใช้ผิดตัวแล้วดีลจะโผล่ให้เลือกทั้งที่กดบันทึกจะโดน 403 */
    Promise.all([
      cachedFetchJson("/api/pm/assignable-users").catch(() => []),
      projectDeals ? Promise.resolve(null) : apiFetch("/api/pm/task-deals").then((r) => (r.ok ? r.json() : [])).catch(() => []),
      apiFetch("/api/pm/projects").then((r) => (r.ok ? r.json() : [])).catch(() => []),
      apiFetch("/api/users/me").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([u, d, p, meRow]) => {
      setUsers(u || []);
      if (d) setDeals(d || []);
      setProjects(p || []);
      setMe(meRow);
      setReady(true);
    });
  }, [open, ready, projectDeals]);

  const close = useCallback(() => setOpen(false), []);

  if (!canEdit) return null;

  return (
    <>
      <Button size={size} tone={tone} onClick={() => setOpen(true)} disabled={open && !ready} icon={<Plus size={13} aria-hidden="true" />}>
        {open && !ready ? "กำลังเปิด…" : label}
      </Button>
      {/* ⚠️ **ห้ามกางโมดัลก่อน `me` มาถึง** — `TaskFormModal` เตือนไว้เองว่า
          `requiresDealLink(null)` = false ⇒ ช่องดีลจะไม่ถูกบังคับเงียบ ๆ แล้วผู้ใช้
          ไปเจอ error ตอนกดบันทึกแทน · รอให้ครบก่อนแล้วค่อยเปิด (ปุ่มบอกว่ากำลังเปิด) */}
      <TaskFormModal
        open={open && ready}
        onClose={close}
        task={null}
        initialForm={dealId ? { dealId } : null}
        deals={projectDeals || deals}
        projects={projects}
        assignableUsers={assignableUsersFor(me, users)}
        me={me}
        canManage
        canChangeStatus
        onSaved={() => {
          close();
          notifyToast.success("สร้างงานแล้ว");
          onSaved?.();
        }}
        onError={(msg) => notifyToast.error(msg || "บันทึกงานไม่สำเร็จ")}
      />
    </>
  );
}
