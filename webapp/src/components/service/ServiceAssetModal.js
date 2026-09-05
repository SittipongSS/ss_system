"use client";
// ── ฟอร์มอุปกรณ์บริการ (mig 0187 + 0298) — ตัวเดียวใช้ทั้ง "เพิ่ม" และ "แก้ไข" ──
// กฎ AGENTS.md: ห้ามเขียนฟอร์มแก้แยกอีกชุด · ต่างกันได้แค่ "โหมด" ผ่าน props
//   asset = null → โหมดสร้าง (ไม่มีช่องสถานะ — เครื่องใหม่เริ่มที่ 'ใช้งาน' เสมอ)
//   asset = row  → โหมดแก้ (มีช่องสถานะ + วันที่ถอด)
//
// ชนิดอุปกรณ์ (มติ 2026-08-02 ข้อ 12-14): ไม่ใช่ทุกตัวเป็นเครื่องกระจายกลิ่น —
//   diffuser = แถวละเครื่อง (serial · ค่าตั้ง work/pause) · reed/soap/alcohol =
//   แถวเดียวทั้งชุด + จำนวนจุด · ช่องบนฟอร์มจึงเปลี่ยนตามชนิด
import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import DateInput from "@/components/ui/DateInput";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { ASSET_STATUSES, ASSET_STATUS_LABELS, isWarehouseSite, normalizeAssetInput } from "@/lib/service/sites";
import { ASSET_KINDS, ASSET_KIND_LABELS } from "@/lib/service/assetKinds";
import styles from "./ServiceSiteModal.module.css";

const EMPTY = {
  kind: "diffuser", zoneId: "", label: "", model: "", serial: "", colour: "",
  floor: "", spot: "", qty: "", productName: "",
  bottleMl: "", mlPerDay: "", installedAt: "", removedAt: "",
  status: "active", note: "", settings: {},
};

// ค่าตั้งเฉพาะชนิด — คีย์ต้องตรงทะเบียน assetKinds.js (API ปัดคีย์แปลกปลอมทิ้ง)
const SETTING_INPUTS = {
  diffuser: [
    { key: "workSec", label: "พ่น (วินาที)", type: "number", hint: "เช่น 30/225 · 60/180 — เลขบนหน้าจอเครื่อง" },
    { key: "pauseSec", label: "พัก (วินาที)", type: "number" },
    { key: "grade", label: "Grade", type: "text", hint: "preset ของเครื่อง เช่น Grade 3 / Grade 5" },
    { key: "schedule", label: "ช่วงเวลาทำงาน", type: "text", hint: "เช่น จ-อา 07:00-19:00 หรือ 3 ช่วง" },
  ],
  reed: [
    { key: "sticks", label: "จำนวนก้าน", type: "number" },
    { key: "changeEveryDays", label: "รอบเปลี่ยนก้าน (วัน)", type: "number" },
  ],
  soap: [
    { key: "tankMl", label: "ขนาดถัง (ml)", type: "number" },
    { key: "liquidType", label: "ชนิดน้ำยา", type: "text", hint: "สบู่โฟม / เจล" },
  ],
  alcohol: [
    { key: "tankMl", label: "ขนาดถัง (ml)", type: "number" },
    { key: "liquidType", label: "ชนิดน้ำยา", type: "text" },
  ],
};

export default function ServiceAssetModal({ open, asset = null, zones = [], site = null, onClose, onSave }) {
  const editing = !!asset;
  /* 🐞 **ค่าตั้งต้นของสถานะต้องเดินตามประเภทไซต์** (UAT 2026-09-02) — เดิมตั้ง
     `active` ตายตัว ⇒ เพิ่มเครื่องเข้า **ไซต์คลัง** แล้วโดน trigger ของ mig 0332
     ตีกลับด้วย 500 + ข้อความภาษาฐานข้อมูล ทั้งที่ผู้ใช้ไม่ได้ทำอะไรผิดเลย
     (เครื่องในคลังต้องเป็น `in_stock` โดยนิยาม) */
  const defaultForm = useMemo(
    () => ({ ...EMPTY, status: isWarehouseSite(site) ? 'in_stock' : 'active' }),
    [site],
  );
  const [form, setForm] = useState(defaultForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    setForm(asset
      ? {
        kind: asset.kind || "diffuser",
        zoneId: asset.zoneId || "",
        label: asset.label || "",
        model: asset.model || "",
        serial: asset.serial || "",
        colour: asset.colour || "",
        floor: asset.floor || "",
        spot: asset.spot || "",
        // null (ยังไม่รู้ค่า) ต้องกลับมาเป็นช่องว่าง ไม่ใช่ "0"
        qty: asset.qty == null ? "" : String(asset.qty),
        productName: asset.productName || "",
        bottleMl: asset.bottleMl == null ? "" : String(asset.bottleMl),
        mlPerDay: asset.mlPerDay == null ? "" : String(asset.mlPerDay),
        installedAt: asset.installedAt || "",
        removedAt: asset.removedAt || "",
        status: asset.status || "active",
        note: asset.note || "",
        settings: (asset.settings && typeof asset.settings === "object") ? asset.settings : {},
      }
      : defaultForm);
  }, [open, asset, defaultForm]);

  const change = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));
  const changeSetting = (key) => (event) =>
    setForm((prev) => ({ ...prev, settings: { ...prev.settings, [key]: event.target.value } }));


  const submit = async () => {
    const { error: invalid } = normalizeAssetInput(form);
    if (invalid) { setError(invalid); return; }
    setSaving(true);
    setError("");
    try {
      await onSave(form);
      onClose();
    } catch (e) {
      setError(e.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? `แก้ไข ${asset.label}` : "เพิ่มอุปกรณ์"} size="md">
      <div className={styles.grid}>
        <div className={`${styles.field} ${styles.wide}`}>
          <span>ชนิดอุปกรณ์ *</span>
          {/* 4 ตัวเลือกคงที่ = segmented ไม่ใช่ dropdown (กติกา direct controls)
              เปลี่ยนชนิดแล้วช่องบนฟอร์มสลับตาม — serial/ค่าตั้งเป็นของ diffuser
              ส่วนจำนวนจุดเป็นของชนิดแถวรวม */}
          <div className="segmented" role="group" aria-label="ชนิดอุปกรณ์">
            {ASSET_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                aria-pressed={form.kind === kind}
                // ⚠️ แก้ชนิดหลังสร้างได้ (ข้อมูลเก่าลงชนิดผิดมีจริง) แต่ค่าที่ชนิดใหม่
                // ไม่รู้จักจะถูก API ปัดทิ้งตอนบันทึก — ไม่ล้างในฟอร์มเพื่อให้กดสลับ
                // ไปมาโดยไม่เสียของที่พิมพ์ไว้
                onClick={() => setForm((prev) => ({ ...prev, kind }))}
              >
                {ASSET_KIND_LABELS[kind]}
              </button>
            ))}
          </div>
        </div>

        <label className={styles.field}>
          <span>โซน</span>
          <Select value={form.zoneId} onChange={change("zoneId")}>
            <option value="">— ยังไม่ระบุโซน —</option>
            {zones.filter((z) => z.isActive !== false || z.id === form.zoneId).map((z) => (
              <option key={z.id} value={z.id}>{z.name}</option>
            ))}
          </Select>
          <small>พื้นที่ย่อยในไซต์ — การใช้ต่อรอบจะถูกนับรวมเป็นของโซนนี้</small>
        </label>

        <label className={styles.field}>
          <span>ชื่อ / ตำแหน่ง *</span>
          <Input value={form.label} onChange={change("label")} placeholder="เครื่องล็อบบี้ (ซ้าย)" maxLength={150} />
        </label>

        <label className={styles.field}>
          <span>รุ่น</span>
          <Input value={form.model} onChange={change("model")} maxLength={100} />
        </label>

        <label className={styles.field}>
          <span>สี</span>
          <Input value={form.colour} onChange={change("colour")} placeholder="ขาว / ดำ" maxLength={50} />
        </label>

        {/* 🔄 เคยซ่อน Serial สำหรับชนิด "แถวรวมทั้งชุด" — ถอดแล้ว (ทุกชนิดนับรายตัว)
            ⚠️ นี่คือ **เบอร์จากโรงงาน** คนละช่องกับรหัสเครื่อง `code` ที่ระบบออกให้ */}
        <label className={styles.field}>
          <span>Serial (เบอร์จากโรงงาน)</span>
          <Input value={form.serial} onChange={change("serial")} mono maxLength={100} />
          <small>ห้ามซ้ำทั้งระบบ — เว้นว่างได้ถ้าเครื่องไม่มีเบอร์ติดมา</small>
        </label>

        <label className={styles.field}>
          <span>ชั้น</span>
          <Input value={form.floor} onChange={change("floor")} placeholder="ชั้น 2" maxLength={50} />
        </label>

        <label className={styles.field}>
          <span>จุดติดตั้ง</span>
          <Input value={form.spot} onChange={change("spot")} placeholder="ประตูทางเข้าขวามือ" maxLength={150} />
        </label>

        <label className={styles.field}>
          <span>กลิ่น / น้ำยาที่เติม</span>
          <Input value={form.productName} onChange={change("productName")} maxLength={200} />
        </label>

        <label className={styles.field}>
          <span>ขนาดขวด (ml)</span>
          <Input type="number" min="0" step="any" value={form.bottleMl} onChange={change("bottleMl")} />
        </label>

        <label className={styles.field}>
          <span>อัตราใช้ต่อวัน (ml)</span>
          <Input type="number" min="0" step="any" value={form.mlPerDay} onChange={change("mlPerDay")} />
          <small>กรอกทั้งคู่แล้วระบบจะประเมินได้ว่าน้ำหอมจะหมดวันไหน · เว้นว่าง = ไม่เดาให้</small>
        </label>

        <label className={styles.field}>
          <span>วันที่ติดตั้ง</span>
          <DateInput value={form.installedAt} onChange={(iso) => setForm((prev) => ({ ...prev, installedAt: iso }))} />
        </label>

        {/* ค่าตั้งเฉพาะชนิด (settings jsonb — มติข้อ 14) · เดิมอยู่ในรูปถ่ายหน้าจอ
            เครื่องที่เจ้าหน้าที่ส่งใน LINE ทุกเดือนแต่ไม่มีที่เก็บ */}
        {(SETTING_INPUTS[form.kind] || []).map((field) => (
          <label key={field.key} className={styles.field}>
            <span>{field.label}</span>
            <Input
              type={field.type}
              min={field.type === "number" ? "0" : undefined}
              step={field.type === "number" ? "any" : undefined}
              value={form.settings[field.key] ?? ""}
              onChange={changeSetting(field.key)}
            />
            {field.hint && <small>{field.hint}</small>}
          </label>
        ))}

        {/* โหมดสร้างไม่มีสถานะ/วันถอด — เครื่องใหม่เริ่มที่ "ใช้งาน" เสมอ (กฎ AGENTS.md) */}
        {editing && (
          <>
            <label className={styles.field}>
              <span>สถานะ</span>
              <Select value={form.status} onChange={change("status")}>
                {ASSET_STATUSES.map((status) => (
                  <option key={status} value={status}>{ASSET_STATUS_LABELS[status]}</option>
                ))}
              </Select>
            </label>
            <label className={styles.field}>
              <span>วันที่ถอด</span>
              <DateInput value={form.removedAt} onChange={(iso) => setForm((prev) => ({ ...prev, removedAt: iso }))} />
            </label>
          </>
        )}

        <label className={`${styles.field} ${styles.wide}`}>
          <span>หมายเหตุ</span>
          <Input as="textarea" rows={2} value={form.note} onChange={change("note")} maxLength={1000} />
        </label>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="form-actions">
        <Button tone="neutral" onClick={onClose} disabled={saving}>ยกเลิก</Button>
        <Button tone="primary" onClick={submit} disabled={saving}>
          {saving ? "กำลังบันทึก…" : editing ? "บันทึกการแก้ไข" : "เพิ่มอุปกรณ์"}
        </Button>
      </div>
    </Modal>
  );
}
