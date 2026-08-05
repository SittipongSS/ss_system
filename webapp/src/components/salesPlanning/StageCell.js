"use client";
// ── ช่อง "สถานะ" ในตารางดีล — กดเปลี่ยนขั้นได้ในแถวเลย ────────────────────
//
// ทำไมต้องแก้ตรงนี้ (มติผู้ใช้ 2026-08-05): การขยับขั้นเป็นงานที่ทำถี่ที่สุดของ AE แต่
// เดิมต้องเปิดโมดัลแก้ดีลทั้งใบ (12 ช่อง) เพื่อเปลี่ยนดรอปดาวน์เดียว — และการบันทึก
// ทั้งฟอร์มจากตารางเสี่ยงเขียนทับช่องที่คนอื่นเพิ่งแก้
//
// ⚠️ **ส่งเฉพาะ `stage`** — PATCH เป็น partial update และ FC% ถูก server คิดใหม่จาก
// กติกาเองเมื่อขั้นเปลี่ยน (lib/sales/dealProbability.js) ห้ามส่ง probability มาจากตาราง
//
// ⚠️ **มีปุ่มบันทึกเสมอ ไม่ auto-save** — เหตุผลเดียวกับช่องเดือน FC: การเปลี่ยนขั้นเขียน
// ประวัติหนึ่งแถว (`sales_deal_stage_history`) ที่ใช้นับ "อยู่ขั้นนี้มากี่วัน" ถ้าเซฟทุกครั้ง
// ที่เลื่อนดรอปดาวน์ ประวัติจะเต็มไปด้วยขั้นที่คนแค่กดผ่าน
//
// ⚠️ **ไม่มี "ไม่สำเร็จ (Lost)" ในตัวเลือก** ทั้งที่ API ยอมรับ — การปิดดีลต้องกรอกเหตุผล
// (dealLifecycle: `reason: "required"`) ถ้าใส่ไว้ในดรอปดาวน์นี้ จะปิดดีลได้โดยไม่มีเหตุผล
// เลย = UI หลวมกว่ากติกาของตัวเอง · ปิดดีลใช้ "ไม่ไปต่อ" ในเมนูท้ายแถวเหมือนเดิม
// ⚠️ และไม่มี "ปิดได้ (Won)" — ทางเดียวคือรับใบเสนอราคา (API ตอบ 400 ถ้าส่งมาตรง ๆ)
import { useState } from "react";
import { Check, X } from "lucide-react";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import { STAGE_LABELS, isClosedStage } from "@/lib/salesPlanning";
import { ROW_EDITABLE_STAGES } from "@/lib/sales/dealLifecycle";
import { stageBadge } from "@/components/salesPlanning/ui";
import styles from "./StageCell.module.css";

export default function StageCell({ deal, canEdit = false, className = "", onSaved }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const badge = stageBadge(deal.stage, className);
  // ปิดแล้ว (Won/Lost) = ไม่มีขั้นถัดไปให้เลือก — ป้ายเฉย ๆ เหมือนเดิม
  if (!canEdit || isClosedStage(deal.stage)) return badge;

  const save = async () => {
    if (value === deal.stage) { setEditing(false); return; }
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/sales-planning/deals/${deal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: value }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "บันทึกไม่สำเร็จ");
      setEditing(false);
      onSaved?.(body);
    } catch (e) {
      setError(e.message || "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <div className={styles.editor}>
        <Select
          aria-label={`สถานะของดีล ${deal.title || ""}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        >
          {/* ขั้นปัจจุบันอาจเป็น stage ที่ไม่อยู่ในตัวเลือก (ข้อมูลเก่า) — ต้องมีให้เห็น
              ไม่งั้นดรอปดาวน์จะโชว์ขั้นแรกทั้งที่ยังไม่ได้กดอะไร แล้วเซฟทับโดยไม่ตั้งใจ */}
          {(ROW_EDITABLE_STAGES.includes(deal.stage) ? ROW_EDITABLE_STAGES : [deal.stage, ...ROW_EDITABLE_STAGES]).map((stage) => (
            <option key={stage} value={stage}>{STAGE_LABELS[stage] || stage}</option>
          ))}
        </Select>
        <div className={styles.actions}>
          <Button size="sm" tone="primary" icon={<Check size={13} aria-hidden="true" />} onClick={save} disabled={busy}>
            {busy ? "กำลังบันทึก…" : "บันทึก"}
          </Button>
          <Button size="sm" variant="quiet" icon={<X size={13} aria-hidden="true" />} onClick={() => setEditing(false)} disabled={busy}>
            ยกเลิก
          </Button>
        </div>
        {error ? <p className={styles.error}>{error}</p> : null}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={styles.trigger}
      title="กดเพื่อเปลี่ยนสถานะ (FC% จะปรับตามกติกาให้เอง)"
      onClick={() => { setValue(deal.stage); setError(""); setEditing(true); }}
    >
      {badge}
    </button>
  );
}
