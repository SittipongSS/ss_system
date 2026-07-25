"use client";

// ตัวเลือก "ชุดเงื่อนไขการค้า" บนฟอร์มใบเสนอราคา — ใช้ร่วมทั้งชุดการชำระและชุดหมายเหตุ
// กติกา (มติ 2026-07-25):
//   · เลือกได้ชุดเดียว เลือกแล้วทับทั้งช่อง
//   · แก้ทับบนใบได้ และมีผลกับใบนั้นใบเดียว — ที่นี่ไม่มีปุ่มสร้าง/แก้/ลบชุด
//     (จัดการที่ /settings/commercial-presets เท่านั้น)
//   · ป้าย "แก้เพิ่มเติมแล้ว" คิดสดจากการเทียบค่าทุกครั้ง ไม่เก็บธง — แก้กลับให้ตรงแล้วหายเอง
//   · เลือกชุดใหม่ตอนมีของจะเสีย → ถามยืนยันก่อนทับ; ช่องว่าง/ยังตรงกับชุดเดิม → ทับเงียบ ๆ
import { useCallback, useEffect, useState } from "react";
import { Library } from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { COMMERCIAL_PRESET_KIND_LABELS } from "@/lib/commercialPresets";
import styles from "./CommercialPresetPicker.module.css";

export default function CommercialPresetPicker({
  kind,
  selectedVersionId = null,
  onApply,
  matchesCurrent,
  hasContent = false,
  disabled = false,
}) {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [pending, setPending] = useState(null); // ชุดที่รอยืนยันทับ
  const label = COMMERCIAL_PRESET_KIND_LABELS[kind] || "ชุดเงื่อนไข";

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setLoadError("");
      try {
        const response = await fetch(`/api/commercial-presets/options?kind=${kind}`, { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || `โหลด${label}ไม่สำเร็จ`);
        if (alive) setOptions(Array.isArray(payload.options) ? payload.options : []);
      } catch (error) {
        if (alive) {
          setOptions([]);
          setLoadError(error.message || `โหลด${label}ไม่สำเร็จ`);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [kind, label, retryKey]);

  const selected = options.find((option) => option.versionId === selectedVersionId) || null;
  // ป้ายขึ้นเฉพาะเมื่อรู้จักชุดที่เลือกและเนื้อหาไม่ตรงกันแล้ว
  const edited = !!selected && !matchesCurrent?.(selected);

  const apply = useCallback((option) => {
    onApply?.(option);
    setPending(null);
  }, [onApply]);

  const pick = (versionId) => {
    if (!versionId) { apply(null); return; }
    const option = options.find((row) => row.versionId === versionId);
    if (!option) return;
    // ทับได้เงียบ ๆ เมื่อไม่มีอะไรจะเสีย: ช่องว่าง หรือยังตรงกับชุดที่เลือกอยู่
    if (!hasContent || (selected && matchesCurrent?.(selected))) { apply(option); return; }
    setPending(option);
  };

  return (
    <div className={styles.picker}>
      <label className={styles.field}>
        <span className={styles.label}><Library size={13} aria-hidden="true" /> {label}</span>
        <select
          className="premium-select"
          value={selectedVersionId || ""}
          disabled={disabled || loading || !options.length}
          onChange={(event) => pick(event.target.value)}
        >
          <option value="">{loading ? "กำลังโหลด…" : loadError ? "โหลดชุดไม่สำเร็จ" : "ไม่ใช้ชุด — กรอกเอง"}</option>
          {options.map((option) => (
            <option key={option.versionId} value={option.versionId}>{option.title}</option>
          ))}
        </select>
      </label>
      {edited && <span className={styles.edited}>แก้เพิ่มเติมแล้ว</span>}
      {!loading && loadError && (
        <span className={styles.loadError} role="alert">
          {loadError}
          <button type="button" className="btn ghost sm" onClick={() => setRetryKey((value) => value + 1)}>ลองใหม่</button>
        </span>
      )}
      {!loading && !loadError && !options.length && (
        <span className={styles.empty}>ยังไม่มี{label}ที่เผยแพร่ — ตั้งได้ที่หน้าตั้งค่า &gt; คลังเงื่อนไขการค้า</span>
      )}

      <ConfirmDialog
        open={!!pending}
        title={`ใช้${label} “${pending?.title || ""}”`}
        description="ข้อความที่แก้ไว้ในช่องนี้จะถูกแทนด้วยเนื้อหาของชุดที่เลือก"
        detail="ทับเฉพาะใบนี้ · ชุดในคลังไม่เปลี่ยน และหลังทับยังแก้ทับได้อีกตามต้องการ"
        confirmLabel="ใช้ชุดนี้"
        onClose={() => setPending(null)}
        onConfirm={() => apply(pending)}
      />
    </div>
  );
}
