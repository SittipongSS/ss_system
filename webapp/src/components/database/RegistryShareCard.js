"use client";

/* ── การ์ด "ลูกค้าที่ใช้ร่วม" ของกลิ่น/สูตร (ม-150 · mig 0373) ─────────────────────────────────
   ⭐ มติผู้ใช้ 2026-09-22: กลิ่น/สูตรแชร์ให้ลูกค้ารายอื่นได้ — ลูกค้าที่ได้รับแชร์ใช้ได้เหมือนเป็นของตัวเอง
   (เลือกในคำร้อง/PDR · ทำสูตรของตัวเอง · แตกรอบแก้) · เจ้าของยังเป็นรายเดิม
   · แชร์/เลิกแชร์ = `canManageRegistryShares` (RD + หัวหน้าฝ่ายขาย Sup ขึ้นไป · มติ 2026-10-05) — ผู้เรียกส่ง `canManage`
   · ตัวเดียวทั้งหน้ากลิ่นและหน้าสูตร (`kind`) — ต่างกันแค่ป้าย
   · รายชื่อ + ช่องเพิ่มในโมดัล = `RegistryShareField` ตัวเดียวกับช่องในฟอร์มสร้าง/แก้
   ⚠️ เลิกแชร์ลูกค้าที่ใช้อยู่แล้วไม่ได้ — server ตีกลับพร้อมเหตุ (โชว์ในโมดัล ไม่ปิดโมดัล) */
import { useState } from "react";
import { Share2 } from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import StatusNotice from "@/components/ui/StatusNotice";
import { DetailCard } from "@/components/ui/DetailPage";
import RegistryShareField, { sharesToField } from "@/components/database/RegistryShareField";
import { apiJson } from "@/lib/apiFetch";
import { naText } from "@/lib/format";
import styles from "./registryForm.module.css";

const LABEL = { scent: "กลิ่น", formula: "สูตร" };

export default function RegistryShareCard({ kind, entity, canManage = false, onSaved }) {
  const noun = LABEL[kind] || "รายการ";
  const shared = entity?.sharedCustomers || [];
  const isBaseFormula = kind === "formula" && !entity?.customerId;

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState([]);
  const [customers, setCustomers] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const openModal = async () => {
    setDraft(sharesToField(entity) || []);
    setError(""); setOpen(true);
    if (!customers) {
      try {
        setCustomers(await apiJson("/api/customers", { fallbackError: "โหลดรายชื่อลูกค้าไม่สำเร็จ" }));
      } catch (e) {
        // คงเป็น null — เปิดโมดัลรอบหน้าโหลดใหม่ (ตั้งเป็น [] = ถือว่าโหลดแล้ว ตัวเลือกว่างเงียบ ๆ ไม่มีข้อความ)
        setError(`${e.message} — ปิดแล้วเปิดใหม่เพื่อลองอีกครั้ง`);
      }
    }
  };

  const save = async () => {
    setSaving(true); setError("");
    try {
      const data = await apiJson(`/api/master/${kind === "formula" ? "formulas" : "scents"}/${entity.id}`, {
        method: "PATCH",
        json: { action: "shares", customerIds: draft.map((d) => d.customerId) },
        fallbackError: "บันทึกการแชร์ไม่สำเร็จ",
      });
      setOpen(false);
      onSaved?.(data, data?.scentSharedWith?.length
        ? `บันทึกการแชร์แล้ว · แชร์กลิ่นของสูตรนี้ให้ลูกค้าที่เพิ่มด้วย ${data.scentSharedWith.length} ราย (คำร้องเลือกกลิ่น)`
        : "บันทึกการแชร์แล้ว");
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DetailCard icon={Share2} eyebrow="SHARED" title="ลูกค้าที่ใช้ร่วม">
      {isBaseFormula ? (
        <p className={styles.muted}>สูตรฐาน (ไม่ผูกลูกค้า) ใช้ได้ทุกลูกค้าอยู่แล้ว — ไม่ต้องแชร์</p>
      ) : (
        <>
          <p className={styles.hint}>
            ลูกค้าหลัก (เจ้าของ): <strong>{naText(entity?.customerName || entity?.customerId)}</strong>
            {" · "}ลูกค้าที่ได้รับแชร์ใช้{noun}นี้ได้เหมือนเป็นของตัวเอง (เลือกในคำร้อง/PDR · ทำสูตร · แตกรอบแก้)
          </p>
          {shared.length ? (
            <ul className={styles.shareList}>
              {shared.map((s) => (
                <li key={s.customerId} className={styles.shareItem}>{s.customerName || s.customerId}</li>
              ))}
            </ul>
          ) : (
            <p className={styles.muted}>ยังไม่ได้แชร์ให้ลูกค้ารายอื่น</p>
          )}
          {canManage && (
            <div className={styles.shareActions}>
              <Button size="sm" icon={<Share2 size={14} aria-hidden="true" />} onClick={openModal}>
                จัดการการแชร์
              </Button>
            </div>
          )}
        </>
      )}

      <Modal
        open={open} onClose={() => !saving && setOpen(false)} size="sm" dismissible={!saving}
        title={`แชร์${noun}ให้ลูกค้ารายอื่น`}
        subtitle={`${entity?.code ? `${entity.code} · ` : ""}${entity?.name || ""}`}
        footer={(
          <>
            <Button variant="quiet" onClick={() => setOpen(false)} disabled={saving}>ยกเลิก</Button>
            <Button tone="primary" onClick={save} disabled={saving || customers === null}>บันทึก</Button>
          </>
        )}
      >
        {error && <StatusNotice tone="danger" role="alert">{error}</StatusNotice>}
        <p className={styles.hint}>
          ลูกค้าหลัก ({naText(entity?.customerName)}) ใช้ได้อยู่แล้ว · เลิกแชร์ลูกค้าที่ใช้{noun}นี้อยู่แล้วไม่ได้
        </p>
        <div className="form-group">
          <span className={styles.hint}>ลูกค้าที่ได้รับแชร์</span>
          <RegistryShareField
            customers={customers || []} ownerId={entity?.customerId}
            value={draft} onChange={setDraft}
            disabled={saving || customers === null} loading={customers === null && !error}
            emptyText="ยังไม่มีลูกค้าที่ได้รับแชร์"
            ariaLabel="เพิ่มลูกค้าที่ได้รับแชร์"
          />
        </div>
      </Modal>
    </DetailCard>
  );
}
