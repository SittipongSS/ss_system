"use client";

/* ── การ์ด "ลูกค้าที่ใช้ร่วม" ของกลิ่น/สูตร (ม-150 · mig 0373) ─────────────────────────────────
   ⭐ มติผู้ใช้ 2026-09-22: กลิ่น/สูตรแชร์ให้ลูกค้ารายอื่นได้ — ลูกค้าที่ได้รับแชร์ใช้ได้เหมือนเป็นของตัวเอง
   (เลือกในคำร้อง/PDR · ทำสูตรของตัวเอง · แตกรอบแก้) · เจ้าของยังเป็นรายเดิม · RD เท่านั้นที่แชร์/เลิกแชร์
   · ตัวเดียวทั้งหน้ากลิ่นและหน้าสูตร (`kind`) — ต่างกันแค่ป้าย
   ⚠️ เลิกแชร์ลูกค้าที่ใช้อยู่แล้วไม่ได้ — server ตีกลับพร้อมเหตุ (โชว์ในโมดัล ไม่ปิดโมดัล) */
import { useMemo, useState } from "react";
import { Share2, X } from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import SearchableSelect from "@/components/ui/SearchableSelect";
import StatusNotice from "@/components/ui/StatusNotice";
import { DetailCard } from "@/components/ui/DetailPage";
import { customerSelectOptions } from "@/components/master/customerOption";
import { customerSnapshotName } from "@/lib/master/customerName";
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
  const [pick, setPick] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const openModal = async () => {
    setDraft(shared.map((s) => ({ customerId: s.customerId, customerName: s.customerName })));
    setPick(""); setError(""); setOpen(true);
    if (!customers) {
      try {
        setCustomers(await apiJson("/api/customers", { fallbackError: "โหลดรายชื่อลูกค้าไม่สำเร็จ" }));
      } catch (e) {
        // คงเป็น null — เปิดโมดัลรอบหน้าโหลดใหม่ (ตั้งเป็น [] = ถือว่าโหลดแล้ว ตัวเลือกว่างเงียบ ๆ ไม่มีข้อความ)
        setError(`${e.message} — ปิดแล้วเปิดใหม่เพื่อลองอีกครั้ง`);
      }
    }
  };

  // ตัวเลือก = ลูกค้าทุกราย ยกเว้นเจ้าของ (ใช้ได้อยู่แล้ว) และรายที่อยู่ในชุดแล้ว
  const options = useMemo(() => {
    const taken = new Set([entity?.customerId, ...draft.map((d) => d.customerId)].filter(Boolean));
    return customerSelectOptions((customers || []).filter((c) => !taken.has(c.id)));
  }, [customers, draft, entity?.customerId]);

  const add = (customerId) => {
    if (!customerId) return;
    const c = (customers || []).find((x) => x.id === customerId);
    setDraft((d) => [...d, { customerId, customerName: customerSnapshotName(c) || customerId }]);
    setPick("");
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
            เจ้าของ: <strong>{naText(entity?.customerName || entity?.customerId)}</strong>
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
          เจ้าของ ({naText(entity?.customerName)}) ใช้ได้อยู่แล้ว · เลิกแชร์ลูกค้าที่ใช้{noun}นี้อยู่แล้วไม่ได้
        </p>
        {draft.length ? (
          <ul className={styles.shareList}>
            {draft.map((d) => (
              <li key={d.customerId} className={styles.shareItem}>
                <span>{d.customerName || d.customerId}</span>
                <Button
                  size="sm" variant="quiet" iconOnly icon={<X size={14} aria-hidden="true" />}
                  aria-label={`เลิกแชร์ ${d.customerName || d.customerId}`}
                  onClick={() => setDraft((list) => list.filter((x) => x.customerId !== d.customerId))}
                  disabled={saving}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.muted}>ยังไม่มีลูกค้าที่ได้รับแชร์</p>
        )}
        <div className="form-group">
          <span className={styles.hint}>เพิ่มลูกค้า</span>
          <SearchableSelect
            value={pick}
            onChange={add}
            options={options}
            disabled={saving || customers === null}
            placeholder={customers === null ? (error ? "โหลดรายชื่อลูกค้าไม่สำเร็จ" : "กำลังโหลดรายชื่อลูกค้า…") : "ค้นหาลูกค้า"}
            ariaLabel="เพิ่มลูกค้าที่ได้รับแชร์"
          />
        </div>
      </Modal>
    </DetailCard>
  );
}
