"use client";
// ── หน้าโซน = รายการจุด (ขั้นเข้าติดตั้ง PR-5b · ม็อก C2 · มติเจ้าของ 09/11/2026) ──────────────────────────────────
//
// ⭐ หนึ่งจุดต่อหนึ่งเครื่องที่ TS วางไว้: รูป + ชื่อจุด (กรอกตามที่ติดจริง) + รหัสเครื่อง
//    · ติดตั้งแล้ว = ต้องมีรูป + ชื่อจุด · ติดไม่ได้ = ใส่เหตุ (เครื่องกลับคลังตอนส่งงาน) · ทำจุดไหนก่อนก็ได้
//    · ‹ › เลื่อนโซน · "บันทึกโซนนี้" ส่งทุกจุดที่แก้ + หมายเหตุโซน
// ⭐ รูปอัปทันทีที่ถ่าย (ไบต์ขึ้น Drive › แนบกับนัดผ่าน `visits/[id]/photos`) แล้วจำ URL ไว้ในร่างของจุด
//    ⇒ กดบันทึกซ้ำหลังพลาดไม่อัปรูปซ้ำ (กติกา retry-must-not-reupload) · server ตรวจว่ารูปอยู่กับนัดจริง
// ⚠️ ตรวจค่าที่ server (`installSpotInput`) — จอโชว์เหตุรายจุดตามที่ server ตอบ
import { useMemo, useState } from "react";
import { ArrowLeft, Camera, ChevronLeft, ChevronRight, Save } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import OptionTiles from "@/components/ui/OptionTiles";
import PhotoThumb from "@/components/ui/PhotoThumb";
import StatusBadge from "@/components/ui/StatusBadge";
import StatusNotice from "@/components/ui/StatusNotice";
import Textarea from "@/components/ui/Textarea";
import { apiJson } from "@/lib/apiFetch";
import { notifyToast } from "@/lib/feedback";
import { uploadFileBytes } from "@/lib/master/uploadFile";
import { useFileIntake } from "@/lib/ui/useFileIntake";
import { INSTALL_SPOT_LIMITS } from "@/lib/service/installJob";
import { installSpotDirty, installSpotDraft, installZoneBadge } from "@/lib/service/installJobScreen";
import { visitFileHref } from "@/lib/service/visitFiles";
import styles from "./InstallJob.module.css";

const OUTCOME_OPTIONS = [
  { value: "done", label: "ติดตั้งแล้ว", description: "รูป + ชื่อจุด", tone: "teal" },
  { value: "unable", label: "ติดไม่ได้", description: "ใส่เหตุ · เครื่องกลับคลัง", tone: "amber" },
];

export default function InstallZonePage({ visitId, zone, position, neighbors, canRecord, onBack, onGo, onSaved }) {
  const [drafts, setDrafts] = useState(() => Object.fromEntries(zone.spots.map((s) => [s.assetId, installSpotDraft(s)])));
  const [note, setNote] = useState(zone.note || "");
  const [errors, setErrors] = useState({});
  const [uploading, setUploading] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const spotById = useMemo(() => new Map(zone.spots.map((s) => [s.assetId, s])), [zone]);
  const dirtyIds = zone.spots.filter((s) => installSpotDirty(drafts[s.assetId], s)).map((s) => s.assetId);
  const noteDirty = (note || "") !== (zone.note || "");
  const anyDirty = dirtyIds.length > 0 || noteDirty;
  const doneCount = zone.spots.filter((s) => drafts[s.assetId]?.outcome === "done").length;
  const badge = installZoneBadge(zone);
  const setDraft = (assetId, patch) => setDrafts((d) => ({ ...d, [assetId]: { ...d[assetId], ...patch } }));

  async function takePhoto(spot, file) {
    if (!file) return;
    setUploading(spot.assetId);
    setErrors((e) => ({ ...e, [spot.assetId]: "" }));
    try {
      const ref = await uploadFileBytes({ file, entityType: "service_visit", entityId: visitId });
      if (!ref?.url) throw new Error("อัปโหลดรูปไม่สำเร็จ");
      const name = drafts[spot.assetId]?.spotName || spot.code || "จุดติดตั้ง";
      await apiJson(`/api/service/visits/${visitId}/photos`, {
        method: "POST", json: { url: ref.url, name, kind: "after" }, fallbackError: "แนบรูปกับงานไม่สำเร็จ",
      });
      setDraft(spot.assetId, { photoUrl: ref.url, photoName: name });
    } catch (e) {
      setErrors((x) => ({ ...x, [spot.assetId]: e?.message || "อัปโหลดรูปไม่สำเร็จ" }));
    } finally {
      setUploading("");
    }
  }

  async function saveZone() {
    setSaving(true);
    setError("");
    const failed = {};
    for (const assetId of dirtyIds) {
      const d = drafts[assetId];
      try {
        await apiJson(`/api/service/visits/${visitId}/install`, {
          method: "PUT",
          json: { assetId, spotName: d.spotName, photoUrl: d.photoUrl, photoName: d.photoName, outcome: d.outcome, reason: d.reason },
          fallbackError: "บันทึกจุดไม่สำเร็จ",
        });
      } catch (e) {
        failed[assetId] = e?.message || "บันทึกจุดไม่สำเร็จ";
      }
    }
    if (noteDirty) {
      try {
        await apiJson(`/api/service/visits/${visitId}/install`, {
          method: "PUT", json: { zoneId: zone.zoneId, note }, fallbackError: "บันทึกหมายเหตุโซนไม่สำเร็จ",
        });
      } catch (e) {
        setError(e?.message || "บันทึกหมายเหตุโซนไม่สำเร็จ");
      }
    }
    setErrors(failed);
    setSaving(false);
    const n = Object.keys(failed).length;
    if (n) {
      notifyToast.error(`บันทึกไม่ผ่าน ${n} จุด — ดูเหตุที่จุดนั้น`);
    } else {
      notifyToast.success(`บันทึก${zone.name || "โซน"}แล้ว`);
    }
    /* โหลดภาพงานใหม่ — จุดที่บันทึกผ่านจะได้ค่าจาก server · จุดที่ไม่ผ่านคงร่างไว้ (key เดิม) */
    await onSaved?.();
  }

  return (
    <div className={styles.page}>
      <button type="button" className={styles.back} onClick={onBack}>
        <ArrowLeft size={16} aria-hidden="true" /> โซนทั้งหมด
      </button>

      <section className={styles.head} aria-label="หัวโซน">
        <div className={styles.headTop}>
          <span className={styles.code}>{zone.code || ""} · โซน {position.index + 1}/{position.count}</span>
          <StatusBadge size="sm" tone={badge.tone} label={badge.text} />
        </div>
        <h1 className={styles.site}>{zone.name || zone.code || "โซน"}</h1>
      </section>

      {!canRecord ? <StatusNotice tone="info">ดูได้อย่างเดียว — บันทึกผลได้หลังกด &quot;เริ่มงาน&quot; (และก่อนส่งงาน)</StatusNotice> : null}
      {error ? <StatusNotice tone="error">{error}</StatusNotice> : null}

      <div className={styles.zonesHead}>
        <b>จุดติดตั้ง</b>
        <span>ติดตั้งแล้ว {doneCount}/{zone.total}</span>
      </div>
      <ol className={styles.spots}>
        {zone.spots.map((spot) => {
          const d = drafts[spot.assetId] || installSpotDraft(spot);
          const saved = spotById.get(spot.assetId);
          const photoHref = d.photoUrl ? visitFileHref(visitId, { url: d.photoUrl }) : null;
          return (
            <li key={spot.assetId} className={styles.spot} data-outcome={d.outcome || undefined}>
              <div className={styles.spotHead}>
                <b>จุด {spot.n}</b>
                <small>{[spot.code, spot.label, spot.colour].filter(Boolean).join(" · ")}</small>
                {installSpotDirty(d, saved) ? <StatusBadge size="sm" tone="warning" label="ยังไม่ได้บันทึก" /> : null}
              </div>
              <div className={styles.spotBody}>
                <div className={styles.photoBox}>
                  {photoHref ? <PhotoThumb src={photoHref} alt={`รูปจุด ${spot.n}`} className={styles.photo} /> : <span className={styles.photoEmpty}>ยังไม่มีรูป</span>}
                  <SpotPhotoButton
                    label={uploading === spot.assetId ? "กำลังอัป…" : d.photoUrl ? "ถ่ายใหม่" : "ถ่ายรูป"}
                    disabled={!canRecord || uploading === spot.assetId}
                    onFile={(file) => takePhoto(spot, file)}
                    onOversize={(message) => setErrors((x) => ({ ...x, [spot.assetId]: message }))}
                  />
                </div>
                <div className={styles.spotFields}>
                  <label className="form-field">
                    <span className="form-field-label">ชื่อจุด</span>
                    <Input value={d.spotName} onChange={(e) => setDraft(spot.assetId, { spotName: e.target.value })}
                      maxLength={INSTALL_SPOT_LIMITS.spotName} placeholder="เช่น ฝั่งขวา ข้างประตู" autoComplete="off" disabled={!canRecord} />
                  </label>
                  <OptionTiles
                    ariaLabel={`ผลของจุด ${spot.n}`}
                    value={d.outcome}
                    onChange={(outcome) => setDraft(spot.assetId, { outcome: d.outcome === outcome ? "" : outcome })}
                    options={OUTCOME_OPTIONS}
                    disabled={!canRecord}
                  />
                  {d.outcome === "unable" ? (
                    <label className="form-field">
                      <span className="form-field-label">เหตุที่ติดไม่ได้ <span className="req">*</span></span>
                      <Textarea variant="form" value={d.reason} onChange={(e) => setDraft(spot.assetId, { reason: e.target.value })}
                        maxLength={INSTALL_SPOT_LIMITS.reason} placeholder="เช่น ผนังเป็นกระจก ยึดไม่ได้" disabled={!canRecord} />
                    </label>
                  ) : null}
                </div>
              </div>
              {errors[spot.assetId] ? <p className={styles.spotError} role="alert">{errors[spot.assetId]}</p> : null}
            </li>
          );
        })}
      </ol>
      <p className={styles.hint}>ทำจุดไหนก่อนก็ได้ · ติดตั้งแล้ว = รูป + ชื่อจุด · ติดไม่ได้ = ใส่เหตุ เครื่องกลับคลัง</p>

      <label className={`form-field ${styles.zoneNote}`}>
        <span className="form-field-label">หมายเหตุโซน</span>
        <Textarea variant="form" value={note} onChange={(e) => setNote(e.target.value)} maxLength={INSTALL_SPOT_LIMITS.zoneNote}
          placeholder="เช่น ลูกค้าขอย้ายจุดจากที่วางไว้" disabled={!canRecord} />
      </label>

      <div className={styles.bar}>
        <span className={styles.pager}>
          <Button size="sm" variant="ghost" iconOnly icon={<ChevronLeft size={18} aria-hidden="true" />} aria-label="โซนก่อนหน้า"
            disabled={!neighbors.prev} onClick={() => neighbors.prev && onGo(neighbors.prev.zoneId)} />
          <span className={styles.barText}>{neighbors.next ? `ถัดไป: ${neighbors.next.name || neighbors.next.code}` : "โซนสุดท้าย"}</span>
          <Button size="sm" variant="ghost" iconOnly icon={<ChevronRight size={18} aria-hidden="true" />} aria-label="โซนถัดไป"
            disabled={!neighbors.next} onClick={() => neighbors.next && onGo(neighbors.next.zoneId)} />
        </span>
        <Button tone="primary" icon={<Save size={16} aria-hidden="true" />} onClick={saveZone} disabled={!canRecord || !anyDirty || saving || Boolean(uploading)}>
          {saving ? "กำลังบันทึก…" : "บันทึกโซนนี้"}
        </Button>
      </div>
    </div>
  );
}

/* ปุ่มรูปของจุด — ช่องเลือกไฟล์ผ่าน `useFileIntake` ตัวกลาง (ขนาดไฟล์ · เลือกไฟล์เดิมซ้ำได้) · ไม่บังคับกล้อง
   (ช่างเลือกรูปจากคลังได้ — กติกาเดียวกับจอประเมิน) · หนึ่งปุ่มต่อหนึ่งจุด ⇒ ฮุกอยู่ในคอมโพเนนต์ย่อย */
function SpotPhotoButton({ label, disabled, onFile, onOversize }) {
  const intake = useFileIntake({
    onFiles: (files) => onFile(files[0]), onOversize, disabled, multiple: false, accept: "image/*", paste: "focused",
  });
  return (
    <>
      <input {...intake.inputProps} />
      <Button size="sm" variant="ghost" icon={<Camera size={14} aria-hidden="true" />} disabled={disabled} onClick={intake.open}>
        {label}
      </Button>
    </>
  );
}
