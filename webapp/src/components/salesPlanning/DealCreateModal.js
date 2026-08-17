"use client";
// "สร้างดีล" — โมดัลเดียวของทุกที่ที่เปิดดีลได้ (คิวลีด · หน้ารายละเอียดลีด · หน้ารวมดีล)
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
// 🐞 และหน้ารวมดีลเคยมีโมดัล "เพิ่มดีล" ของตัวเองอีกชุด (มติผู้ใช้ 2026-08-05 ให้ยุบรวม)
// สองชุดนั้นเพี้ยนกันไปแล้วจริง ๆ ตามที่ AGENTS.md เตือน:
//   · ฝั่งลีดเป็นแท็บ · ฝั่งรวมดีลเรียงการ์ดลงมาเรื่อย ๆ จนต้องเลื่อนยาว
//   · ฝั่งลีดจำใบที่สร้างสำเร็จแล้ว กดซ้ำไม่ได้ดีลซ้ำ — **ฝั่งรวมดีลไม่มี** ถ้าใบที่ 2 พัง
//     แล้วกดใหม่ ใบที่ 1 จะถูกสร้างซ้ำอีกใบโดยไม่มีอะไรเตือน
//
// ⚠️ `metadata.leadId` คือเส้นเดียวที่ผูกดีลกลับไปหาลีด — เปิดจากหน้ารวมดีล (`lead` = null)
// จะไม่ส่งค่านี้โดยตั้งใจ: ดีลนั้นสร้างจากศูนย์ ไม่ได้มาจากลีด

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleAlert, Plus, Trash2 } from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import Tabs from "@/components/ui/Tabs";
import DealFormFields from "@/components/salesPlanning/DealFormFields";
import { initialDealForm } from "@/components/salesPlanning/ui";
import { CREATABLE_STAGES } from "@/lib/salesPlanning";
import { TEAM_LABELS } from "@/lib/permissions";
import styles from "./DealCreateModal.module.css";

/* ดีลใบแรกดึงค่าจากลีดให้หมดเท่าที่ดึงได้ — ใบถัดไปเป็น NPD เปล่า เพราะกรณีใช้จริงคือ
   "ลูกค้ารายเดียวเปิดทั้งงานกลิ่นและงานพัฒนาสูตร" ไม่ใช่ก๊อปใบเดิม
   เปิดจากหน้ารวมดีล (ไม่มีลีด) = ใบเปล่าล้วน ทั้งใบแรกและใบถัดไป */
/* `defaults` = ค่าที่ "ที่ทางที่กดเปิดฟอร์ม" รู้อยู่แล้ว (เช่น เปิดจากหน้าโครงการ =
   รู้ทั้งลูกค้าและโครงการ) — ทับท้ายสุดเสมอ ทั้งใบแรกและใบถัดไป */
const firstDeal = (lead, ownerId, defaults) => (lead ? {
  ...initialDealForm,
  ownerId,
  title: `${lead.company || lead.contactName} — SCENT`,
  customerId: lead.customerId || "",
  dealType: "SCENT",
  stage: "qualified",
  /* ⚠️ **ไม่ดึงงบจากลีดมาเป็นมูลค่าตั้งต้นแล้ว** (มติผู้ใช้ 2026-08-17 · mig 0264):
     มูลค่าคาดการณ์เป็นแถวรายหมวด (หมวด · จำนวน · ราคา/หน่วย) — งบก้อนเดียวจากลีด
     ตอบไม่ได้ว่าหมวดไหน กี่ชิ้น ราคาเท่าไร การแปลงให้เองคือการปั้นตัวเลขที่ไม่มีใคร
     เคยบอก (เหตุผลเดียวกับที่ mig 0264 ไม่ backfill ดีลเก่า)
     งบลีดยังอ่านได้ที่หน้าลีด และ AE พิมพ์เป็นแถวเองตอนที่รู้ของจริง */
  ...defaults,
} : { ...initialDealForm, ownerId, ...defaults });

const nextDeal = (lead, ownerId, defaults) => (lead ? {
  ...initialDealForm,
  ownerId,
  title: `${lead.company || lead.contactName} — NPD`,
  customerId: lead.customerId || "",
  dealType: "NPD",
  stage: "qualified",
  ...defaults,
} : { ...initialDealForm, ownerId, ...defaults });

/* ⚠️ **mount ตอนจะเปิดเท่านั้น** — `{open && <DealCreateModal … />}` ห้าม mount ค้างไว้:
   ค่าตั้งต้นของ drafts อ่านจาก lead ตอน mount ครั้งแรกครั้งเดียว ถ้า mount ค้างไว้ตั้งแต่
   ก่อนผู้ใช้เลือกลีด จะได้ร่างที่ไม่มีค่าจากลีดค้างตลอด
   (สายลีดเคยเจอจริงตอนทดสอบ: ปุ่มขึ้น "สร้าง 0 ดีล")

   @param lead  มาจากลีด = เติมค่าตั้งต้น + ผูก metadata.leadId + เด้งไปหน้าดีลหลังสร้าง
                null = เปิดจากหน้ารวมดีล (ใบเปล่า ไม่ผูกลีด อยู่หน้าเดิม) */
export default function DealCreateModal({
  lead = null,
  customers = [],
  projects = [],
  categories = [],
  stages,
  /* ผู้รับผิดชอบ (AE) — ดู useDealOwners: owners = รายชื่อให้เลือก (ac/sup/admin)
     · lockedOwner = ae/senior_ae ล็อกชื่อตัวเอง (มติ 2026-08-08) */
  owners = [],
  defaultOwnerId = "",
  lockedOwner = null,
  /* ค่าตั้งต้นเพิ่มเติมของทุกใบ — ใช้ตอนเปิดฟอร์มจากบริบทที่รู้ค่าอยู่แล้ว เช่น หน้า
     โครงการส่ง { customerId, projectId, lockedProjectId } มาเพื่อให้ดีลใหม่ผูกกลับ
     เข้าโครงการนั้นเสมอ (อ่านตอน mount ครั้งเดียว เหมือน lead) */
  defaults = null,
  onClose,
  onCreated,
}) {
  const router = useRouter();
  /* `_key` = ตัวตนถาวรของร่างแต่ละใบ — ห้ามใช้ index เป็นกุญแจของ `done` เพราะลบใบ
     กลางทางแล้ว index ของใบที่เหลือจะเลื่อน ⇒ สถานะ "สร้างแล้ว" ไปเกาะผิดใบ */
  const nextKey = useRef(2);
  const [drafts, setDrafts] = useState(() => [{ ...firstDeal(lead, defaultOwnerId, defaults), _key: 1 }]);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /* ⭐ ผลของรอบ submit ที่แล้ว: `_key` → { dealId, linked }
     **หัวใจ**: การสร้างดีลเป็นทีละใบและไม่มี rollback — ถ้าใบที่ 2 พัง ใบที่ 1 เกิดจริง
     ไปแล้ว ของเดิมกดใหม่ = สร้างใบที่ 1 **ซ้ำอีกใบ** (ดีลซ้ำในระบบ ไม่มีอะไรเตือน)
     เก็บไว้เพื่อข้ามใบที่สำเร็จแล้วตอนกดใหม่ · ถ้าดีลเกิดแล้วแต่ผูกโครงการพลาด
     รอบถัดไปจะ "ผูกอย่างเดียว" ไม่สร้างดีลใหม่ */
  const [done, setDone] = useState({});
  const [failedKey, setFailedKey] = useState(null);

  const patch = (index, values) =>
    setDrafts((prev) => prev.map((draft, i) => (i === index ? { ...draft, ...values } : draft)));

  const removeAt = (index) => {
    setDrafts((prev) => prev.filter((_, i) => i !== index));
    setActive((current) => (current >= index && current > 0 ? current - 1 : current));
  };

  /* ⚠️ อย่าเรียก setActive ข้างใน updater ของ setDrafts — updater ต้องบริสุทธิ์
     (React เรียกซ้ำได้) · ใบใหม่ไปต่อท้ายเสมอ index ของมันจึงเท่ากับจำนวนใบตอนนี้ */
  const addDraft = () => {
    nextKey.current += 1;
    const key = nextKey.current;
    setActive(drafts.length);
    setDrafts((prev) => [...prev, { ...nextDeal(lead, defaultOwnerId, defaults), _key: key }]);
  };

  const remaining = drafts.filter((draft) => !done[draft._key]?.dealId).length;

  const submit = async () => {
    if (!drafts.length) return;
    setBusy(true); setError(""); setFailedKey(null);
    const result = { ...done };
    let current = null;
    try {
      for (const draft of drafts) {
        current = draft;
        if (!draft.title?.trim()) throw new Error("กรุณาระบุชื่อดีลให้ครบทุกใบ");
        /* บังคับเลือกประเภทดีล — ตัวนี้เลือก template ไทม์ไลน์ ปล่อยว่างแล้วฝั่ง server
           (normalizeDealType) จะ default เป็น NPD เงียบ ๆ แล้วได้ template ผิดประเภท
           ⚠️ ด่านนี้เคยมีเฉพาะโมดัลของหน้ารวมดีล ฝั่งลีดไม่มี — อาการเพี้ยนของ
           "ฟอร์มสองชุด" ที่ AGENTS.md เตือนไว้พอดี */
        if (!draft.dealType) {
          throw new Error(`กรุณาเลือกประเภทดีล (SCENT/NPD/RE-ORDER) ให้ครบทุกใบ${draft.title ? ` — "${draft.title}"` : ""}`);
        }
        /* ช่องผู้รับผิดชอบโผล่เมื่อไร = ผู้ใช้รายนี้มอบดีลให้คนอื่นได้ ⇒ ต้องระบุให้ครบ
           (API ก็บังคับสำหรับ role ที่ไม่ได้ถือดีลเอง — ที่นี่บอกก่อนเสียเที่ยว) */
        if (owners.length > 0 && !draft.ownerId) {
          throw new Error(`กรุณาเลือกผู้รับผิดชอบ (AE) ให้ครบทุกใบ${draft.title ? ` — "${draft.title}"` : ""}`);
        }
        /* ช่องบังคับ (มติผู้ใช้ 2026-08-08): ทุกช่องยกเว้น ลูกค้า/แบรนด์/โครงการ/
           หมวดสินค้า/รายละเอียด — ด่านฝั่งจอบอกก่อนเสียเที่ยว รวมทุกช่องที่ขาด
           ในข้อความเดียว ไม่ให้กดแล้วเจอทีละช่อง */
        // ดีลเก่าที่สร้างเป็น Won: ช่องเดียวกันเปลี่ยนป้ายเป็นของจริง (มูลค่าที่ปิด/
        // วันที่ปิด) — ข้อความ error ต้องเรียกชื่อเดียวกับที่ตาเห็นบนฟอร์ม
        const legacyWon = draft.legacy && draft.stage === "won";
        const valueLabel = legacyWon ? "มูลค่าที่ปิด" : "มูลค่าคาดการณ์";
        const missing = [
          // สถานะไม่มี default แล้ว (มติ 2026-08-08 "สถานะต้องบังคับเลือก") — ต้องจิ้มเอง
          [!draft.stage, "สถานะ"],
          // มูลค่ามาจากแถวรายหมวด (mig 0264) — "ยังไม่มีแถว" คือช่องที่ขาด ไม่ใช่ยอดว่าง
          [!(draft.valueItems || []).length, `${valueLabel} (อย่างน้อย 1 หมวดสินค้า)`],
          [!draft.expectedCloseDate, legacyWon ? "วันที่ปิด" : "วันที่คาดการณ์ปิด"],
          [!draft.startDate, "วันที่เริ่ม"],
          [!draft.endDate, "วันที่สิ้นสุด"],
        ].filter(([absent]) => absent).map(([, name]) => name);
        if (missing.length) {
          throw new Error(`กรุณากรอก ${missing.join(" · ")} ให้ครบทุกใบ${draft.title ? ` — "${draft.title}"` : ""}`);
        }
        /* แถวที่กรอกไม่ครบ — บอกตั้งแต่ฝั่งจอว่าแถวไหน (server ตรวจซ้ำด้วยสูตรเดียวกัน
           ที่ lib/sales/dealValueItems.js แต่เสียเที่ยวยิงก่อนไม่มีประโยชน์) */
        const badRow = (draft.valueItems || []).findIndex(
          (row) => !row.categoryCode || !(Number(row.qty) > 0),
        );
        if (badRow >= 0) {
          throw new Error(`${valueLabel} แถวที่ ${badRow + 1}: ต้องเลือกหมวดสินค้าและใส่จำนวนมากกว่า 0${draft.title ? ` — "${draft.title}"` : ""}`);
        }
        const state = result[draft._key] || {};
        // ข้ามใบที่สร้างสำเร็จไปแล้วในรอบก่อน — กดใหม่ต้องไม่ได้ดีลซ้ำ
        if (!state.dealId) {
          // `_key`/`lockedProjectId`/`legacy` เป็นธงของฟอร์ม ไม่ใช่คอลัมน์ของดีล —
          // legacy ไปกับ metadata (ธงดีลเก่าจากระบบเดิม เปิดทางสร้างที่ Won ฝั่ง server)
          const { _key, lockedProjectId, legacy, ...rest } = draft;
          const payload = {
            ...rest,
            customerName: customers.find((c) => c.id === draft.customerId)?.name || draft.customerName || null,
          };
          const metadata = {
            ...(lead ? { leadId: lead.id, source: "lead", leadChannel: lead.channel } : {}),
            ...(legacy ? { legacy: true } : {}),
          };
          const res = await fetch("/api/sales-planning/deals", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              Object.keys(metadata).length ? { ...payload, metadata } : payload,
            ),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || `สร้างดีล ${draft.title} ไม่สำเร็จ`);
          // บันทึกทันทีที่ดีลเกิด **ก่อน**ลองผูกโครงการ — ถ้าผูกพลาดแล้วผู้ใช้กดใหม่
          // ต้องไม่สร้างดีลซ้ำ เหลือแค่ผูกอย่างเดียว
          state.dealId = data.id;
          state.deal = data;
          result[draft._key] = { ...state };
          setDone({ ...result });
        }
        // deal-POST ไม่รับ projectId — ผูกโครงการผ่าน link-project (ต่อ segment ไทม์ไลน์
        // ให้ด้วย) แพตเทิร์นเดียวกับหน้ารวมดีล
        if (draft.projectId && !state.linked) {
          const linkRes = await fetch(`/api/sales-planning/deals/${state.dealId}/link-project`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId: draft.projectId, startDate: draft.startDate || undefined }),
          });
          if (!linkRes.ok) {
            throw new Error((await linkRes.json().catch(() => ({}))).error
              || `สร้างดีล ${draft.title} แล้ว แต่เชื่อมโครงการไม่สำเร็จ`);
          }
          state.linked = true;
          result[draft._key] = { ...state };
          setDone({ ...result });
        }
      }
      const created = drafts.map((draft) => result[draft._key]?.deal).filter(Boolean);
      onCreated?.(created);
      // มาจากลีด = ผู้ใช้อยู่คนละหน้ากับดีล ต้องพาไปดูของที่เพิ่งสร้าง
      // เปิดจากหน้ารวมดีลอยู่แล้ว = อยู่ที่เดิม (หน้าโหลดรายการใหม่ผ่าน onCreated)
      if (lead) router.push(created.length === 1 ? `/sa/deals/${created[0].id}` : "/sa/deals");
    } catch (e) {
      // พาไปที่แท็บที่พัง — ไม่งั้นข้อความบอกว่าพังแต่คนหาไม่เจอว่าใบไหน
      const index = drafts.findIndex((draft) => draft._key === current?._key);
      if (index >= 0) { setActive(index); setFailedKey(current._key); }
      setError(e.message || "สร้างดีลไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  /* ── แถบเครื่องมือใต้หัว (โซน toolbar ของ Modal — ไม่เลื่อนตามฟอร์ม) ─────
     (มติผู้ใช้ 2026-08-04) ปุ่ม "เพิ่มดีล" ต้องอยู่แถวเดียวกับแท็บ ไม่ใช่ใต้ฟอร์ม:
     ปุ่มล่างสุดหลุดบริบท และมองไม่ออกว่ามันเพิ่ม "แท็บ" ไม่ใช่ช่องในใบที่เปิดอยู่

     ⚠️ แท็บซ่อนใบอื่นไว้ ป้ายจึงต้องบอกสถานะรายใบโดยไม่ต้องกดเข้าไปดู:
     ✓ = สร้างแล้ว (รอบก่อน) · ! = ใบที่พัง — ไม่งั้น error รวมบรรทัดเดียว
     จะบอกไม่ได้ว่าใบไหน · ปุ่มลบย้ายมาอยู่แถบนี้ (ลบใบที่เปิดอยู่) แทนปุ่มลอย
     มุมการ์ดแบบเดิม — การ์ดร่างถูกยุบทิ้งแล้วตามโครงสามชั้น */
  const toolbar = (
    <>
      {drafts.length > 1 ? (
        <Tabs
          className={styles.tabs}
          ariaLabel="ดีลที่จะสร้าง"
          value={String(active)}
          onChange={(key) => setActive(Number(key))}
          tabs={drafts.map((draft, index) => {
            const state = done[draft._key];
            return {
              key: String(index),
              label: (
                <span className={styles.tabLabel}>
                  {state?.dealId ? <Check size={13} aria-hidden="true" /> : null}
                  {failedKey === draft._key ? <CircleAlert size={13} aria-hidden="true" /> : null}
                  {draft.dealType || `ดีล ${index + 1}`}
                </span>
              ),
            };
          })}
        />
      ) : (
        <span className={styles.spacer} aria-hidden="true" />
      )}
      {drafts.length > 1 && (
        <Button variant="ghost" size="sm" onClick={() => removeAt(active)}>
          <Trash2 size={13} aria-hidden="true" /> ลบใบนี้
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={addDraft} className={styles.addButton}>
        <Plus size={14} aria-hidden="true" /> เพิ่มดีล
      </Button>
    </>
  );

  return (
    <Modal
      open
      onClose={() => !busy && onClose?.()}
      title={lead ? "สร้างดีลจากลีด" : "เพิ่มดีล"}
      /* บริบทลีดอยู่ในหัวที่นิ่ง — ไม่จมไปกับฟอร์มตอนเลื่อน */
      subtitle={lead ? (
        <>
          ลีด: <strong>{lead.contactName}</strong>{lead.company ? ` · ${lead.company}` : ""}
          {lead.team ? ` · ทีม ${TEAM_LABELS[lead.team] || lead.team}` : ""}
          {lead.assigneeName ? ` · ${lead.assigneeName}` : ""}
        </>
      ) : null}
      size="lg"
      toolbar={toolbar}
      footer={(
        <>
          {drafts.length > 1 ? (
            <span className="drawer-footer-note">
              {drafts.length} ใบ · {drafts.map((draft) => draft.dealType || "?").join(" + ")}
            </span>
          ) : null}
          <Button variant="quiet" onClick={onClose} disabled={busy}>ยกเลิก</Button>
          <Button onClick={submit} disabled={busy || !remaining}>
            {busy ? "กำลังสร้าง…" : `สร้าง ${remaining} ดีล`}
          </Button>
        </>
      )}
    >
      <div className={styles.body}>
        {drafts.map((draft, index) => (
          <div
            key={draft._key}
            className={styles.draft}
            hidden={drafts.length > 1 && index !== active}
          >
            {/* ใบที่สร้างสำเร็จไปแล้วในรอบก่อน — บอกให้ชัดว่าแก้ตรงนี้ไม่มีผลอีกแล้ว */}
            {done[draft._key]?.dealId ? (
              <p className={styles.created}>
                สร้างดีลนี้เรียบร้อยแล้ว — กด “สร้าง” อีกครั้งจะข้ามใบนี้ไป (แก้ต่อที่หน้าดีล)
              </p>
            ) : null}
            <div className="form-grid cols-2">
              <DealFormFields
                form={draft}
                onPatch={(values) => patch(index, values)}
                customers={customers}
                projects={projects}
                showProject
                categories={categories}
                /* ค่าตั้งต้น = ทะเบียนกลาง CREATABLE_STAGES — เดิมเป็น DEAL_STAGES ที่ตัดแค่
                   won ทำให้ in_project (ยุบเป็น won ตั้งแต่ mig 0082) โผล่เป็นตัวเลือก
                   เฉพาะฝั่งลีดที่ไม่ส่ง stages มา */
                stages={stages || CREATABLE_STAGES}
                probabilityMode="auto"
                owners={owners}
                lockedOwner={lockedOwner}
              />
            </div>
          </div>
        ))}

        {error ? <p className={styles.error}>{error}</p> : null}
      </div>
    </Modal>
  );
}
