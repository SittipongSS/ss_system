"use client";
// "สร้างดีลจากลีด" — ฟอร์มเดียวที่ใช้ทั้งหน้ารายการลีดและหน้ารายละเอียดลีด
//
// ทำไมต้องแยกออกมา: การเปิดดีลไม่ใช่การย้ายสถานะ (สร้าง entity คนละตัว ต้องเลือกลูกค้า/
// มูลค่า/เดือน FC) lifecycle จึงประกาศ transition `create_deal` ไว้ให้ "ขั้นถัดไป" ถูกต้อง
// แต่หน้าเรียกต้องดักเองแล้วเปิดฟอร์มนี้แทนการยิง /transition
// (handler ก็ปิดทางนั้นไว้: `badRequest('สร้างดีลจากลีดผ่านปุ่ม "สร้างดีล" เท่านั้น')`)
//
// 🐞 ก่อนหน้านี้ฟอร์มนี้ฝังอยู่ในหน้ารายการที่เดียว หน้ารายละเอียด (#864) จึงได้แค่
// `router.push('/sales-planning/deals?fromLead=…')` ซึ่ง **ไม่มีใครอ่าน `fromLead`** →
// ปุ่ม "เปิดดีลจากลีดนี้" พาไปหน้ารวมดีลเปล่า ๆ ไม่มีฟอร์ม ไม่มีค่าที่ดึงมาจากลีด
//
// ⚠️ `metadata.leadId` คือเส้นเดียวที่ผูกดีลกลับไปหาลีด — หน้ารวมดีลสร้างดีลโดยไม่ส่ง
// ค่านี้ (ตั้งใจ: สร้างจากศูนย์ ไม่ได้มาจากลีด) อย่าเอา submit ของสองที่มารวมกัน

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import DealFormFields from "@/components/salesPlanning/DealFormFields";
import { initialDealForm } from "@/components/salesPlanning/ui";
import { DEAL_STAGES } from "@/lib/salesPlanning";
import { TEAM_LABELS } from "@/lib/permissions";
import styles from "./LeadDealModal.module.css";

/* ดีลใบแรกดึงค่าจากลีดให้หมดเท่าที่ดึงได้ — ใบถัดไปเป็น NPD เปล่า เพราะกรณีใช้จริงคือ
   "ลูกค้ารายเดียวเปิดทั้งงานกลิ่นและงานพัฒนาสูตร" ไม่ใช่ก๊อปใบเดิม */
const firstDeal = (lead) => ({
  ...initialDealForm,
  title: `${lead.company || lead.contactName} — SCENT`,
  customerId: lead.customerId || "",
  dealType: "SCENT",
  stage: "qualified",
  projectValue: lead.budget || "",
});

const nextDeal = (lead) => ({
  ...initialDealForm,
  title: `${lead.company || lead.contactName} — NPD`,
  customerId: lead.customerId || "",
  dealType: "NPD",
  stage: "qualified",
  projectValue: "",
});

/* ⚠️ **mount ตอนจะเปิดเท่านั้น** — `{open && <LeadDealModal … />}` ห้าม mount ค้างไว้
   แล้วส่ง lead=null: ค่าตั้งต้นของ drafts อ่านจาก lead ตอน mount ครั้งแรกครั้งเดียว
   ถ้า mount ตอนยังไม่มีลีด จะได้รายการว่างค้างตลอด (เจอจริงตอนทดสอบ: ปุ่มขึ้น "สร้าง 0 ดีล")
   ตัว component เองเช็ค `lead` ซ้ำอีกชั้น แต่นั่นกัน crash ไม่ได้กันเคสนี้ */
export default function LeadDealModal({
  lead,
  customers = [],
  projects = [],
  categories = [],
  onClose,
  onCreated,
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState(() => (lead ? [firstDeal(lead)] : []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!lead) return null;

  const patch = (index, values) =>
    setDrafts((prev) => prev.map((draft, i) => (i === index ? { ...draft, ...values } : draft)));

  const submit = async () => {
    if (!drafts.length) return;
    setBusy(true); setError("");
    try {
      const created = [];
      for (const draft of drafts) {
        const res = await fetch("/api/sales-planning/deals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...draft,
            metadata: { leadId: lead.id, source: "lead", leadChannel: lead.channel },
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `สร้างดีล ${draft.title} ไม่สำเร็จ`);
        // deal-POST ไม่รับ projectId — ผูกโครงการผ่าน link-project (ต่อ segment ไทม์ไลน์
        // ให้ด้วย) แพตเทิร์นเดียวกับหน้ารวมดีล
        if (draft.projectId) {
          const linkRes = await fetch(`/api/sales-planning/deals/${data.id}/link-project`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId: draft.projectId, startDate: draft.startDate || undefined }),
          });
          if (!linkRes.ok) {
            throw new Error((await linkRes.json().catch(() => ({}))).error
              || `สร้างดีล ${draft.title} แล้ว แต่เชื่อมโครงการไม่สำเร็จ`);
          }
        }
        created.push(data);
      }
      onCreated?.(created);
      router.push(created.length === 1 ? `/sa/deals/${created[0].id}` : "/sa/deals");
    } catch (e) {
      setError(e.message || "สร้างดีลไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={() => !busy && onClose?.()} title="สร้างดีลจากลีด" size="lg">
      <div className={styles.body}>
        <div className={styles.lead}>
          ลีด: <strong>{lead.contactName}</strong>{lead.company ? ` · ${lead.company}` : ""}
          {lead.team ? ` · ทีม ${TEAM_LABELS[lead.team] || lead.team}` : ""}
          {lead.assigneeName ? ` · ${lead.assigneeName}` : ""}
        </div>

        {drafts.map((draft, index) => (
          <div key={index} className={styles.draft}>
            {drafts.length > 1 && (
              <button
                type="button"
                className={`btn-icon danger ${styles.remove}`}
                title="ลบรายการนี้"
                aria-label={`ลบดีลรายการที่ ${index + 1}`}
                onClick={() => setDrafts((prev) => prev.filter((_, i) => i !== index))}
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            )}
            <div className="form-grid cols-2">
              <DealFormFields
                form={draft}
                onPatch={(values) => patch(index, values)}
                customers={customers}
                projects={projects}
                showProject
                categories={categories}
                stages={DEAL_STAGES.filter((stage) => stage !== "won")}
              />
            </div>
          </div>
        ))}

        <div className={styles.add}>
          <Button variant="ghost" onClick={() => setDrafts((prev) => [...prev, nextDeal(lead)])}>
            <Plus size={14} aria-hidden="true" /> เพิ่มดีลอีกรายการ
          </Button>
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}

        <div className="form-action-bar">
          <Button variant="quiet" onClick={onClose} disabled={busy}>ยกเลิก</Button>
          <Button onClick={submit} disabled={busy || !drafts.length}>
            {busy ? "กำลังสร้าง…" : `สร้าง ${drafts.length} ดีล`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
