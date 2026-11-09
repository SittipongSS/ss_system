"use client";
// ── โมดัล "ยืนยันวันติดตั้ง" ของ TS (ขั้นเข้าติดตั้ง PR-3b · ม็อก B2 · mig 0425) ──────────────────────────────
//
// ⭐ ลำดับคำถาม: โซนไหนในนัดนี้ › วัน/เวลา (ตั้งต้นจากที่ฝ่ายขายขอ = ค่าจากบริบท) › ถ้าวันไม่ตรง ต้องบอกเหตุ ›
//    หัวหน้างาน › เครื่องจากคลังรายโซน
// ⭐ ผล = นัดติดตั้งร่าง · ส่งให้ฝ่ายขายคอนเฟิร์มลูกค้า (กระดิ่ง) · ช่างยังไม่เห็นจนกว่าฝ่ายขายคอนเฟิร์ม
// ⚠️ ด่านค่าถาม `installConfirmInput` ตัวเดียวกับ API — ปุ่มบอกเหตุ · โซนที่มีนัดแล้วไม่โชว์ให้เลือก
import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import ChoiceChips from "@/components/ui/ChoiceChips";
import DateInput from "@/components/ui/DateInput";
import TimeInput from "@/components/ui/TimeInput";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import StatusNotice from "@/components/ui/StatusNotice";
import CrewLoadPicker from "@/components/service/CrewLoadPicker";
import { apiJson } from "@/lib/apiFetch";
import useCrewLoad from "@/lib/service/useCrewLoad";
import { notifyToast } from "@/lib/feedback";
import { fmtDate } from "@/lib/format";
import { installConfirmInput } from "@/lib/service/installConfirm";
import styles from "./InstallConfirmModal.module.css";

export default function InstallConfirmModal({ row, technicians = [], todayIso, onClose, onSaved }) {
  const openZones = useMemo(() => row.zones.filter((z) => z.stage === "awaiting_ts" && !z.visitId), [row]);
  const [form, setForm] = useState(() => ({
    zoneIds: openZones.map((z) => z.zoneId),
    scheduledDate: row.requestedDate || "",
    startTime: row.requestedStartTime || "",
    endTime: row.requestedEndTime || "",
    dateChangeReason: "",
    assigneeId: "",
    plannedAssets: [],
  }));
  const [stock, setStock] = useState(null);
  const [stockError, setStockError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  /* ⭐ ภาระรายคนของวันที่เลือก — สูตรเดียวกับหน้าจัดคิว (`crewLoadPeople`) · ไม่รู้ = บอกว่าไม่รู้ ไม่ใช่ 0 */
  const loadFor = useCrewLoad({ enabled: true, technicians });

  useEffect(() => {
    let live = true;
    apiJson("/api/service/assets", { fallbackError: "โหลดเครื่องในคลังไม่สำเร็จ" })
      .then((rows) => { if (live) setStock((Array.isArray(rows) ? rows : []).filter((a) => a.status === "in_stock")); })
      .catch((e) => { if (live) setStockError(e?.message || "โหลดเครื่องในคลังไม่สำเร็จ"); });
    return () => { live = false; };
  }, []);

  const assetsById = useMemo(() => new Map((stock || []).map((a) => [a.id, a])), [stock]);
  const technician = technicians.find((t) => String(t.id) === String(form.assigneeId)) || null;
  const check = useMemo(() => installConfirmInput(
    { ...form, assigneeName: technician?.name || "" },
    {
      request: { mode: "install", requestedAt: row.requestedAt, requestedDate: row.requestedDate },
      requestZoneIds: row.zones.map((z) => z.zoneId),
      busyZoneIds: new Set(row.zones.filter((z) => z.visitId || z.stage !== "awaiting_ts").map((z) => z.zoneId)),
      deposit: { state: row.deposit?.state || "blocked", reason: row.deposit?.text || "" },
      todayIso,
      assetsById,
    },
  ), [form, technician, row, todayIso, assetsById]);
  const dateMoved = Boolean(form.scheduledDate) && form.scheduledDate !== row.requestedDate;
  const pickedIds = new Set(form.plannedAssets.map((p) => p.assetId));

  const addAsset = (zoneId, assetId) => {
    if (!assetId) return;
    setForm((f) => ({ ...f, plannedAssets: [...f.plannedAssets, { zoneId, assetId }] }));
  };
  const dropAsset = (assetId) => setForm((f) => ({ ...f, plannedAssets: f.plannedAssets.filter((p) => p.assetId !== assetId) }));

  async function submit() {
    if (check.error) { setError(check.error); return; }
    setSaving(true);
    setError("");
    try {
      await apiJson(`/api/service/install-requests/${row.requestId}/confirm`, {
        method: "POST",
        json: { ...form, assigneeName: technician?.name || "" },
        fallbackError: "ยืนยันวันติดตั้งไม่สำเร็จ",
      });
      notifyToast.success("ยืนยันวันแล้ว — ส่งให้ฝ่ายขายคอนเฟิร์มลูกค้า · นัดขึ้นงานช่างเมื่อลูกค้ายืนยัน");
      await onSaved?.();
    } catch (e) {
      setError(e?.message || "ยืนยันวันติดตั้งไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      size="lg"
      sheetOnPhone
      onClose={saving ? undefined : onClose}
      title="ยืนยันวันติดตั้ง"
      subtitle={`${row.siteCode || ""} ${row.siteName || ""} · ${row.orderNumber || ""}`.trim()}
      footer={(
        <div className={styles.footer}>
          {check.error ? <span className={styles.why} role="status">{check.error}</span> : <span />}
          <Button variant="ghost" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          <Button variant="primary" onClick={submit} disabled={saving || Boolean(check.error)}>
            {saving ? "กำลังส่ง…" : "ยืนยันวัน · ส่งให้ฝ่ายขาย"}
          </Button>
        </div>
      )}
    >
      {error ? <StatusNotice tone="error" className={styles.block}>{error}</StatusNotice> : null}

      <div className={styles.asked}>
        <b>ฝ่ายขายขอ</b>
        <span>
          {row.requestedDate ? fmtDate(row.requestedDate) : "ไม่ระบุวัน"}
          {row.requestedStartTime && row.requestedEndTime ? ` ${row.requestedStartTime}–${row.requestedEndTime}` : " · ทั้งวัน"}
          {row.requestedByName ? ` · ${row.requestedByName}` : ""}
        </span>
        {row.contactName || row.contactPhone ? <small>ผู้ติดต่อหน้างาน {[row.contactName, row.contactPhone].filter(Boolean).join(" ")}</small> : null}
        {row.note ? <small>ฝากบอก: {row.note}</small> : null}
      </div>

      <fieldset className={styles.block}>
        <legend className="form-field-label">โซนในนัดนี้ <span className="req">*</span></legend>
        <ChoiceChips
          multiple
          minSelected={0}
          ariaLabel="โซนในนัดนี้"
          value={form.zoneIds}
          onChange={(ids) => setForm((f) => ({ ...f, zoneIds: ids, plannedAssets: f.plannedAssets.filter((p) => ids.includes(p.zoneId)) }))}
          options={openZones.map((z) => ({
            value: z.zoneId,
            label: [z.name || z.code, z.packsPerRound ? `${z.packsPerRound} แพ็ค/รอบ` : null].filter(Boolean).join(" · "),
          }))}
        />
        <small className={styles.hint}>เอาบางโซนออกได้ — โซนที่ไม่เลือกยังรอ TS ยืนยันเป็นอีกนัด (ฝ่ายขายต้องคอนเฟิร์มแยกนัด)</small>
      </fieldset>

      <div className={`form-grid cols-3 ${styles.block}`}>
        <label className="form-field">
          <span className="form-field-label">วันติดตั้ง <span className="req">*</span></span>
          <DateInput value={form.scheduledDate} onChange={set("scheduledDate")} min={todayIso || undefined} weekday ariaLabel="วันติดตั้ง" />
        </label>
        <label className="form-field">
          <span className="form-field-label">เริ่ม</span>
          <TimeInput value={form.startTime} onChange={set("startTime")} ariaLabel="เวลาเริ่ม" />
        </label>
        <label className="form-field">
          <span className="form-field-label">ถึง</span>
          <TimeInput value={form.endTime} onChange={set("endTime")} ariaLabel="เวลาจบ" />
        </label>
      </div>
      {dateMoved ? (
        <label className={`form-field ${styles.block}`}>
          <span className="form-field-label">เหตุที่ปรับวัน (ฝ่ายขายเห็นตอนคอนเฟิร์มลูกค้า) <span className="req">*</span></span>
          <Textarea variant="form" value={form.dateChangeReason} onChange={(e) => set("dateChangeReason")(e.target.value)} maxLength={500} placeholder="เช่น ช่างทีมเต็มวันที่ขอ" />
        </label>
      ) : null}

      <div className={styles.block}>
        <span className="form-field-label" id="install-assignee">หัวหน้างาน <span className="req">*</span></span>
        <CrewLoadPicker
          value={form.assigneeId}
          onChange={set("assigneeId")}
          technicians={technicians}
          load={loadFor(form.scheduledDate)}
          dateIso={form.scheduledDate}
          labelledBy="install-assignee"
          allowUnassigned={false}
          timeWindow={{ startTime: form.startTime, endTime: form.endTime }}
        />
      </div>

      <fieldset className={styles.block}>
        <legend className="form-field-label">เครื่องจากคลัง (โซนละอย่างน้อยหนึ่งเครื่อง) <span className="req">*</span></legend>
        {stockError ? <StatusNotice tone="error">{stockError}</StatusNotice> : null}
        {!stock && !stockError ? <small className={styles.hint}>กำลังโหลดเครื่องในคลัง…</small> : null}
        {stock ? openZones.filter((z) => form.zoneIds.includes(z.zoneId)).map((zone) => {
          const mine = form.plannedAssets.filter((p) => p.zoneId === zone.zoneId);
          return (
            <div key={zone.zoneId} className={styles.zoneAssets}>
              <b>{zone.name || zone.code}</b>
              <ul>
                {mine.map((p) => {
                  const a = assetsById.get(p.assetId);
                  return (
                    <li key={p.assetId}>
                      <span>{a ? [a.code, a.label].filter(Boolean).join(" · ") : p.assetId}</span>
                      <Button size="sm" variant="ghost" onClick={() => dropAsset(p.assetId)} aria-label={`เอา ${a?.code || p.assetId} ออก`}>เอาออก</Button>
                    </li>
                  );
                })}
              </ul>
              <Select
                value=""
                onChange={(e) => addAsset(zone.zoneId, e.target.value)}
                options={[
                  { value: "", label: stock.length ? "+ เพิ่มเครื่องจากคลัง" : "ไม่มีเครื่องในคลัง" },
                  ...stock.filter((a) => !pickedIds.has(a.id)).map((a) => ({ value: a.id, label: [a.code, a.label].filter(Boolean).join(" · ") })),
                ]}
              />
            </div>
          );
        }) : null}
      </fieldset>

      <p className={styles.hint}>ยืนยันแล้ว = นัดเป็นร่างรอฝ่ายขายคอนเฟิร์มลูกค้า · ช่างยังไม่เห็นงาน · ฝ่ายขายได้กระดิ่ง</p>
    </Modal>
  );
}
