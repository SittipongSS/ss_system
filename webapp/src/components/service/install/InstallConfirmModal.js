"use client";
// ── โมดัล "ยืนยันวันติดตั้ง" ของ TS (ขั้นเข้าติดตั้ง PR-3b · ม็อก B2 · mig 0425) ──────────────────────────────
//
// ⭐ ลำดับคำถาม: โซนไหนในนัดนี้ › วัน/เวลา (ตั้งต้นจากที่ฝ่ายขายขอ = ค่าจากบริบท) › ถ้าวันไม่ตรง ต้องบอกเหตุ ›
//    หัวหน้างาน › เครื่องจากคลังรายโซน
// ⭐ ผล = นัดติดตั้งร่าง · ส่งให้ฝ่ายขายคอนเฟิร์มลูกค้า (กระดิ่ง) · ช่างยังไม่เห็นจนกว่าฝ่ายขายคอนเฟิร์ม
// ⚠️ ด่านค่าถาม `installConfirmInput` ตัวเดียวกับ API — ปุ่มบอกเหตุ · โซนที่มีนัดแล้วไม่โชว์ให้เลือก
// ⭐ โหมด "ยืนยันวันใหม่" (`visit` · PR-4) — ลูกค้าขอเปลี่ยนวันหลัง TS ยืนยัน: ถามแค่ วัน · เวลา · หัวหน้างาน · เหตุ
//    บนนัดร่างเดิม (โซน/เครื่องที่วางไว้คงเดิม) · ด่านถาม `installReconfirmInput` ตัวเดียวกับ API
// ⭐ วัน · เวลา · หัวหน้างาน = ตัวเลือกตาราง ช่าง × เวลา ตัวเดียว (`CrewSlotPicker` · P2 · มติเจ้าของ 10/11/2026)
//    แทน DateInput + TimeInput คู่ + CrewLoadPicker เดิม · ม็อกฉบับสุดท้าย Final.dc.html
import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import ChoiceChips from "@/components/ui/ChoiceChips";
import SearchableSelect from "@/components/ui/SearchableSelect";
import Textarea from "@/components/ui/Textarea";
import StatusNotice from "@/components/ui/StatusNotice";
import CrewSlotPicker from "@/components/service/CrewSlotPicker";
import { apiJson } from "@/lib/apiFetch";
import { useCrewLoadData } from "@/lib/service/useCrewLoad";
import { askedSlot, slotTimes } from "@/lib/service/crewSlotGrid";
import { fitToAccess, rangeText } from "@/lib/service/crewSlotView";
import { minutesOf, toHHMM } from "@/lib/service/sites";
import { notifyToast } from "@/lib/feedback";
import { fmtDate } from "@/lib/format";
import { installConfirmInput, installReconfirmInput } from "@/lib/service/installConfirm";
import styles from "./InstallConfirmModal.module.css";

export default function InstallConfirmModal({ row, visit = null, technicians = [], rosterState = "ready", todayIso, onClose, onSaved }) {
  const reconfirm = Boolean(visit);
  const openZones = useMemo(
    () => (reconfirm
      ? row.zones.filter((z) => (visit.zoneIds || []).includes(String(z.zoneId)))
      : row.zones.filter((z) => z.stage === "awaiting_ts" && !z.visitId)),
    [row, visit, reconfirm],
  );
  const asked = useMemo(() => askedSlot({
    requestedDate: row.requestedDate, requestedStartTime: row.requestedStartTime, requestedEndTime: row.requestedEndTime,
  }), [row]);
  const site = row.siteAccess || null;
  /* ⭐ ม็อกฉบับสุดท้าย: ขอ 09:00–12:00 แต่ไซต์เปิด 10:00 ⇒ ตั้งต้นที่ 10:00–13:00 (ยาวเท่าที่ขอ) และบอกตรง ๆ ว่าเลื่อนให้
     · ยืนยันวันใหม่ไม่เลื่อนให้ — ลูกค้าเป็นคนขอเวลานั้นเอง */
  const [fitted] = useState(() => {
    const slot = !reconfirm && asked && !asked.allDay ? fitToAccess(site, asked) : null;
    if (!slot) return null;
    return {
      ...slotTimes(slot),
      note: `ฝ่ายขายขอ ${rangeText(asked.start, asked.end)} แต่ไซต์ให้เข้า ${toHHMM(site.accessFrom) || "00:00"}–${toHHMM(site.accessTo) || "24:00"} — ตั้งต้นที่ ${rangeText(slot.start, slot.end)} ให้แล้ว (ยาวเท่าที่ขอ)`,
    };
  });
  const [form, setForm] = useState(() => ({
    zoneIds: openZones.map((z) => z.zoneId),
    scheduledDate: row.requestedDate || "",
    startTime: fitted?.startTime || row.requestedStartTime || "",
    endTime: fitted?.endTime || row.requestedEndTime || "",
    dateChangeReason: "",
    assigneeId: reconfirm ? String(visit.assigneeId || "") : "",
    plannedAssets: [],
  }));
  const [stock, setStock] = useState(null);
  const [stockError, setStockError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  /* ⭐ ภาระของทุกคน — สูตรเดียวกับหน้าจัดคิว (`crewLoadPeople`) · ไม่รู้ = บอกว่าไม่รู้ ไม่ใช่ 0
     · ตารางต้องการนัดรายใบ (วาดก้อนตามเวลา) ⇒ ก้อนดิบ ไม่ใช่ตัวเลขรายคน */
  const load = useCrewLoadData({ enabled: true });

  useEffect(() => {
    /* ยืนยันวันใหม่ = เครื่องคงเดิม ⇒ ไม่ต้องโหลดคลัง */
    if (reconfirm) return undefined;
    let live = true;
    apiJson("/api/service/assets", { fallbackError: "โหลดเครื่องในคลังไม่สำเร็จ" })
      .then((rows) => { if (live) setStock((Array.isArray(rows) ? rows : []).filter((a) => a.status === "in_stock")); })
      .catch((e) => { if (live) setStockError(e?.message || "โหลดเครื่องในคลังไม่สำเร็จ"); });
    return () => { live = false; };
  }, [reconfirm]);

  const assetsById = useMemo(() => new Map((stock || []).map((a) => [a.id, a])), [stock]);
  const technician = technicians.find((t) => String(t.id) === String(form.assigneeId)) || null;
  const check = useMemo(() => {
    const request = { id: row.requestId, mode: "install", requestedAt: row.requestedAt, requestedDate: row.requestedDate };
    const deposit = { state: row.deposit?.state || "blocked", reason: row.deposit?.text || "" };
    const body = { ...form, assigneeName: technician?.name || "" };
    if (reconfirm) {
      return installReconfirmInput(body, {
        request, visit: { ...visit, installRequestId: row.requestId, status: visit.status || "draft" }, deposit, todayIso,
      });
    }
    return installConfirmInput(body, {
      request,
      requestZoneIds: row.zones.map((z) => z.zoneId),
      busyZoneIds: new Set(row.zones.filter((z) => z.visitId || z.stage !== "awaiting_ts").map((z) => z.zoneId)),
      deposit,
      todayIso,
      assetsById,
    });
  }, [form, technician, row, visit, reconfirm, todayIso, assetsById]);
  const dateMoved = Boolean(form.scheduledDate) && form.scheduledDate !== row.requestedDate;
  const slotValue = useMemo(() => ({
    date: form.scheduledDate, startTime: form.startTime, endTime: form.endTime, assigneeId: form.assigneeId,
  }), [form.scheduledDate, form.startTime, form.endTime, form.assigneeId]);
  const onSlot = (next) => setForm((f) => ({
    ...f,
    scheduledDate: next.date || "",
    startTime: next.startTime || "",
    endTime: next.endTime || "",
    assigneeId: String(next.assigneeId || ""),
  }));
  /* "ถ้าเลือก → x/12 จุด" — จุดของงานนี้ = เครื่องที่วางไว้ (ยังไม่วาง/ยืนยันวันใหม่ = ไม่รู้ ⇒ พูดแค่จำนวนนัด ไม่เดาจุด) */
  const siteLoad = useMemo(
    () => (!reconfirm && form.plannedAssets.length ? { assets: form.plannedAssets.length } : null),
    [reconfirm, form.plannedAssets.length],
  );
  const currentLength = useMemo(() => {
    if (!reconfirm) return null;
    const start = minutesOf(visit.startTime);
    const end = minutesOf(visit.endTime);
    return start !== null && end !== null && end > start ? end - start : null;
  }, [reconfirm, visit]);
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
      const json = reconfirm
        ? {
          visitId: visit.id, scheduledDate: form.scheduledDate, startTime: form.startTime, endTime: form.endTime,
          assigneeId: form.assigneeId, assigneeName: technician?.name || "", dateChangeReason: form.dateChangeReason,
        }
        : { ...form, assigneeName: technician?.name || "" };
      await apiJson(`/api/service/install-requests/${row.requestId}/confirm`, {
        method: "POST",
        json,
        fallbackError: "ยืนยันวันติดตั้งไม่สำเร็จ",
      });
      notifyToast.success(reconfirm
        ? "ยืนยันวันใหม่แล้ว — ฝ่ายขายต้องคอนเฟิร์มลูกค้าอีกครั้ง"
        : "ยืนยันวันแล้ว — ส่งให้ฝ่ายขายคอนเฟิร์มลูกค้า · นัดขึ้นงานช่างเมื่อลูกค้ายืนยัน");
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
      size="xl"
      sheetOnPhone
      onClose={saving ? undefined : onClose}
      title={reconfirm ? "ยืนยันวันใหม่ · ลูกค้าขอเปลี่ยนวัน" : "ยืนยันวันติดตั้ง"}
      subtitle={`${reconfirm && visit.code ? `${visit.code} · ` : ""}${row.siteCode || ""} ${row.siteName || ""} · ${row.orderNumber || ""}`.trim()}
      footer={(
        <div className={styles.footer}>
          {check.error ? <span className={styles.why} role="status">{check.error}</span> : <span />}
          <Button variant="ghost" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          <Button tone="primary" onClick={submit} disabled={saving || Boolean(check.error)}>
            {saving ? "กำลังส่ง…" : reconfirm ? "ยืนยันวันใหม่ · ส่งให้ฝ่ายขาย" : "ยืนยันวัน · ส่งให้ฝ่ายขาย"}
          </Button>
        </div>
      )}
    >
      {error ? <StatusNotice tone="error" className={styles.block}>{error}</StatusNotice> : null}

      {reconfirm ? (
        <div className={styles.asked}>
          <b>เดิม TS ยืนยัน</b>
          <span>
            {visit.scheduledDate ? fmtDate(visit.scheduledDate) : "ไม่ระบุวัน"}
            {visit.startTime && visit.endTime ? ` ${String(visit.startTime).slice(0, 5)}–${String(visit.endTime).slice(0, 5)}` : " · ทั้งวัน"}
            {visit.assigneeName ? ` · ${visit.assigneeName}` : ""}
          </span>
          {row.changeReason ? <small>ลูกค้าขอเปลี่ยนเพราะ: {row.changeReason}</small> : null}
        </div>
      ) : null}

      <div className={styles.asked}>
        <b>{reconfirm ? "ลูกค้าขอวันใหม่" : "ฝ่ายขายขอ"}</b>
        <span>
          {row.requestedDate ? fmtDate(row.requestedDate) : "ไม่ระบุวัน"}
          {row.requestedStartTime && row.requestedEndTime ? ` ${row.requestedStartTime}–${row.requestedEndTime}` : " · ทั้งวัน"}
          {row.requestedByName ? ` · ${row.requestedByName}` : ""}
        </span>
        {row.contactName || row.contactPhone ? <small>ผู้ติดต่อหน้างาน {[row.contactName, row.contactPhone].filter(Boolean).join(" ")}</small> : null}
        {row.note ? <small>ฝากบอก: {row.note}</small> : null}
      </div>

      {reconfirm ? (
        <p className={styles.block}>
          <span className="form-field-label">โซนในนัดนี้ (คงเดิม)</span>
          <span>{openZones.map((z) => z.name || z.code).join(" · ") || "ไม่มีโซน"}</span>
          <small className={styles.hint}>โซนและเครื่องที่วางไว้คงเดิม — ลูกค้าเปลี่ยนวัน ไม่ได้เปลี่ยนของที่จะติด</small>
        </p>
      ) : (
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
      )}

      <div className={styles.block}>
        <span className="form-field-label" id="install-slot">วันติดตั้ง · เวลา · หัวหน้างาน <span className="req">*</span></span>
        <CrewSlotPicker
          technicians={technicians}
          load={load}
          value={slotValue}
          onChange={onSlot}
          asked={asked}
          site={site}
          siteLoad={siteLoad}
          excludeVisitId={reconfirm ? visit.id : null}
          allowUnassigned={false}
          currentName={reconfirm ? visit.assigneeName || "" : ""}
          currentLength={currentLength}
          todayIso={todayIso}
          rosterState={rosterState}
          labelledBy="install-slot"
          disabled={saving}
          note={fitted && form.startTime === fitted.startTime && form.endTime === fitted.endTime ? fitted.note : ""}
        />
      </div>
      {dateMoved ? (
        <label className={`form-field ${styles.block}`}>
          <span className="form-field-label">{reconfirm ? "เหตุที่ไม่ใช้วันที่ลูกค้าขอ" : "เหตุที่ปรับวัน"} (ฝ่ายขายเห็นตอนคอนเฟิร์มลูกค้า) <span className="req">*</span></span>
          <Textarea variant="form" value={form.dateChangeReason} onChange={(e) => set("dateChangeReason")(e.target.value)} maxLength={500} placeholder="เช่น ช่างทีมเต็มวันที่ขอ" />
        </label>
      ) : null}

      {reconfirm ? null : (
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
              {/* 🐞 UAT 11/11 (F4): คลังมีหลายร้อยเครื่อง (395 ตัว ณ วันทดสอบ) — ดรอปดาวน์ธรรมดาต้องไล่ทั้งลิสต์
                  ⇒ ช่องค้นได้ตัวเดียวกับ "ผู้ไปด้วย" · พิมพ์รหัสหรือรุ่นแล้วเลือก · เลือกแล้วช่องว่างรอเครื่องถัดไป */}
              <SearchableSelect
                value=""
                onChange={(id) => addAsset(zone.zoneId, id)}
                placeholder={stock.length ? "+ ค้นรหัส/รุ่นเครื่องในคลัง" : "ไม่มีเครื่องในคลัง"}
                ariaLabel={`เพิ่มเครื่องจากคลังให้ ${zone.name || zone.code || "โซนนี้"}`}
                disabled={!stock.length}
                options={stock.filter((a) => !pickedIds.has(a.id)).map((a) => ({ value: a.id, label: [a.code, a.label].filter(Boolean).join(" · ") }))}
              />
            </div>
          );
        }) : null}
      </fieldset>
      )}

      <p className={styles.hint}>ยืนยันแล้ว = นัดเป็นร่างรอฝ่ายขายคอนเฟิร์มลูกค้า · ช่างยังไม่เห็นงาน · ฝ่ายขายได้กระดิ่ง</p>
    </Modal>
  );
}
