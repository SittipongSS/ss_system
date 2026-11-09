"use client";
// ── แผ่นส่งงานติดตั้ง (ขั้นเข้าติดตั้ง PR-5b · ม็อก C3 · มติเจ้าของ 09/11/2026) ──────────────────────────────────────
//
// ⭐ ผลรายโซน · โซนที่ข้ามไว้ (ยังมีจุดไม่มีผล) ต้องเลือก "ไปทำต่อ" หรือ "ติดไม่ได้ทั้งโซน" (+ เหตุ) ก่อนส่ง · ไม่มีลายเซ็นลูกค้า
// ⭐ ส่งแล้ว: เครื่องที่ติดตั้งขึ้นทะเบียนที่โซนทันที · โซนที่ไม่ได้ติดกลับไป "รอติดตั้ง" ให้ TS ลงคิวใหม่ · แจ้งฝ่ายขาย
//    · ช่างแก้หลังส่งไม่ได้ (หัวหน้าแก้ผลที่ส่ง)
// ⚠️ ด่านค่าถาม `installSendInput` ตัวเดียวกับ server — ปุ่มบอกเหตุก่อนกด
import { useMemo, useState } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import OptionTiles from "@/components/ui/OptionTiles";
import StatusNotice from "@/components/ui/StatusNotice";
import Textarea from "@/components/ui/Textarea";
import { apiJson } from "@/lib/apiFetch";
import { notifyToast } from "@/lib/feedback";
import { INSTALL_SPOT_LIMITS, INSTALL_ZONE_RESOLUTION_LABELS, installSendInput } from "@/lib/service/installJob";
import { installOpenZones } from "@/lib/service/installJobScreen";
import styles from "./InstallJob.module.css";

export default function InstallSendSheet({ visit, site, view, onClose, onSent }) {
  const openZones = useMemo(() => installOpenZones(view), [view]);
  const [picks, setPicks] = useState({});
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const check = useMemo(() => installSendInput({ zones: picks, note }, { view }), [picks, note, view]);
  const setPick = (zoneId, patch) => setPicks((p) => ({ ...p, [zoneId]: { ...(p[zoneId] || {}), ...patch } }));

  async function send() {
    if (check.error) { setError(check.error); return; }
    setSaving(true);
    setError("");
    try {
      const result = await apiJson(`/api/service/visits/${visit.id}/install`, {
        method: "POST", json: { zones: picks, note }, fallbackError: "ส่งงานไม่สำเร็จ",
      });
      notifyToast.success(`ส่งงานแล้ว · ติดตั้งแล้ว ${result?.installed ?? 0}/${result?.total ?? view.total} จุด`);
      onSent?.();
    } catch (e) {
      setError(e?.message || "ส่งงานไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      size="md"
      sheetOnPhone
      onClose={saving ? undefined : onClose}
      title="ส่งงานติดตั้ง"
      subtitle={[visit.code, site?.name].filter(Boolean).join(" · ")}
      footer={(
        <div className={styles.footer}>
          {check.error ? <span className={styles.why} role="status">{check.error}</span> : <span />}
          <Button variant="ghost" onClick={onClose} disabled={saving}>กลับไปทำต่อ</Button>
          <Button tone="primary" onClick={send} disabled={saving || Boolean(check.error)}>{saving ? "กำลังส่ง…" : "ส่งงาน"}</Button>
        </div>
      )}
    >
      {error ? <StatusNotice tone="error" className={styles.block}>{error}</StatusNotice> : null}

      <p className="form-field-label">ผลรายโซน</p>
      <ul className={styles.sendZones}>
        {view.zones.map((zone) => {
          const open = zone.spots.filter((s) => !s.outcome);
          const pick = picks[zone.zoneId] || {};
          return (
            <li key={zone.zoneId} className={styles.sendZone} data-open={open.length ? "1" : undefined}>
              <b>{zone.name || zone.code} · ติดตั้งแล้ว {zone.done}/{zone.total} จุด{zone.unable ? ` · ติดไม่ได้ ${zone.unable}` : ""}</b>
              <small>
                {zone.spots.filter((s) => s.outcome === "done").map((s) => [s.code, s.spotName].filter(Boolean).join(" ")).join(" · ") || "ยังไม่มีจุดที่ติดตั้ง"}
              </small>
              {open.length ? (
                <div className={styles.resolve}>
                  <small>ยังไม่มีผล {open.length} จุด ({open.map((s) => s.code).filter(Boolean).join(" · ")}) — เลือกอย่างใดอย่างหนึ่ง</small>
                  <OptionTiles
                    ariaLabel={`โซน ${zone.name || zone.code} ที่ยังไม่มีผล`}
                    value={pick.resolution || ""}
                    onChange={(resolution) => setPick(zone.zoneId, { resolution })}
                    options={[
                      { value: "later", label: INSTALL_ZONE_RESOLUTION_LABELS.later, description: "กลับไปรอ TS ลงคิวใหม่", tone: "blue" },
                      { value: "unable", label: INSTALL_ZONE_RESOLUTION_LABELS.unable, description: "ใส่เหตุ · เครื่องกลับคลัง", tone: "amber" },
                    ]}
                  />
                  {pick.resolution === "unable" ? (
                    <Textarea variant="form" value={pick.reason || ""} onChange={(e) => setPick(zone.zoneId, { reason: e.target.value })}
                      maxLength={INSTALL_SPOT_LIMITS.reason} placeholder="เหตุที่ติดไม่ได้ทั้งโซน" aria-label={`เหตุที่ติดไม่ได้ · ${zone.name || zone.code}`} />
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {openZones.length ? null : <p className={styles.hint}>ทุกจุดมีผลแล้ว</p>}

      <label className={`form-field ${styles.block}`}>
        <span className="form-field-label">หมายเหตุถึงฝ่ายขายและ TS</span>
        <Textarea variant="form" value={note} onChange={(e) => setNote(e.target.value)} maxLength={INSTALL_SPOT_LIMITS.sendNote}
          placeholder="เช่น ลูกค้าขอเลื่อนโซนผักผลไม้เพราะกำลังจัดชั้นวาง" />
      </label>
      <p className={styles.hint}>
        ส่งแล้ว: เครื่องที่ติดตั้งขึ้นทะเบียนที่โซนทันที · โซนที่ไม่ได้ติดกลับไป &quot;รอติดตั้ง&quot; ให้ TS ลงคิวใหม่ · แจ้งฝ่ายขาย · แก้หลังส่งไม่ได้ (หัวหน้าแก้ผลที่ส่ง)
      </p>
    </Modal>
  );
}
