"use client";
// ── ฟอร์มไลน์ผลิต (mig 0184) — ตัวเดียวใช้ทั้ง "เพิ่ม" และ "แก้ไข" ─────────
// กฎ AGENTS.md: ห้ามเขียนฟอร์มแก้แยกอีกชุด · ต่างกันได้แค่ "โหมด" ผ่าน props
//   line = null  → โหมดสร้าง (ไม่มีช่องสถานะ — ของใหม่เริ่มที่เปิดใช้งานเสมอ)
//   line = row   → โหมดแก้ (มีช่องสถานะเปิด/ปิดใช้งาน)
import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { LINE_KINDS, LINE_KIND_LABELS, normalizeLineInput } from "@/lib/pm/productionLines";
import styles from "./ProductionLineModal.module.css";

const EMPTY = { code: "", name: "", kind: "other", capacityPerDay: "", unit: "", sortOrder: 0, note: "", isActive: true };

export default function ProductionLineModal({ open, line = null, onClose, onSave }) {
  const editing = !!line;
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    setForm(line
      ? {
        code: line.code || "",
        name: line.name || "",
        kind: line.kind || "other",
        // null (ยังไม่ระบุกำลัง) ต้องกลับมาเป็นช่องว่าง ไม่ใช่ "0" — 0 แปลว่าปิดไลน์
        capacityPerDay: line.capacityPerDay == null ? "" : String(line.capacityPerDay),
        unit: line.unit || "",
        sortOrder: line.sortOrder ?? 0,
        note: line.note || "",
        isActive: line.isActive !== false,
      }
      : EMPTY);
  }, [open, line]);

  const change = (field) => (event) => {
    const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const submit = async () => {
    // validate ด้วยตัวเดียวกับฝั่ง server — ข้อความผิดพลาดจะได้ตรงกันคำต่อคำ
    const { error: invalid } = normalizeLineInput(form);
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
    <Modal open={open} onClose={onClose} title={editing ? `แก้ไขไลน์ ${line.code}` : "เพิ่มไลน์ผลิต"} size="md">
      <div className={styles.grid}>
        <label className={styles.field}>
          <span>รหัสไลน์ *</span>
          <Input value={form.code} onChange={change("code")} placeholder="MIX-01" mono maxLength={30} />
          <small>รหัสที่คนโรงงานเรียกกันจริง — ตัวพิมพ์ใหญ่/เล็กถือว่าเป็นไลน์เดียวกัน</small>
        </label>

        <label className={styles.field}>
          <span>ชื่อไลน์ *</span>
          <Input value={form.name} onChange={change("name")} placeholder="ไลน์ผสม 1" maxLength={100} />
        </label>

        <label className={styles.field}>
          <span>ประเภท</span>
          <Select value={form.kind} onChange={change("kind")}>
            {LINE_KINDS.map((kind) => <option key={kind} value={kind}>{LINE_KIND_LABELS[kind]}</option>)}
          </Select>
        </label>

        <label className={styles.field}>
          <span>ลำดับที่แสดง</span>
          <Input type="number" value={form.sortOrder} onChange={change("sortOrder")} />
        </label>

        <label className={styles.field}>
          <span>กำลังผลิตต่อวันทำการ</span>
          <Input type="number" min="0" step="any" value={form.capacityPerDay} onChange={change("capacityPerDay")} placeholder="เช่น 500" />
          <small>เว้นว่าง = ยังไม่ระบุ (ระบบจะไม่เตือนเรื่องเกินกำลังของไลน์นี้)</small>
        </label>

        <label className={styles.field}>
          <span>หน่วย</span>
          <Input value={form.unit} onChange={change("unit")} placeholder="กก. / ชิ้น" maxLength={30} />
          <small>ระบุกำลังผลิตแล้วต้องมีหน่วย ไม่งั้นอ่านไม่ออกว่า 500 ชิ้นหรือ 500 กิโล</small>
        </label>

        <label className={`${styles.field} ${styles.wide}`}>
          <span>หมายเหตุ</span>
          <Input as="textarea" rows={2} value={form.note} onChange={change("note")} maxLength={1000} />
        </label>

        {/* โหมดสร้างไม่มีช่องสถานะ — ของใหม่เริ่มที่ "เปิดใช้งาน" เสมอ (กฎ AGENTS.md) */}
        {editing && (
          <label className={`${styles.field} ${styles.wide} ${styles.check}`}>
            <input type="checkbox" checked={form.isActive} onChange={change("isActive")} />
            <span>เปิดใช้งาน</span>
            <small>ปิดใช้งาน = ไลน์ยังอยู่ในระบบและประวัติคงเดิม แต่รับคิวใหม่ไม่ได้ (กำลัง = 0 ทุกวัน)</small>
          </label>
        )}
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="form-actions">
        <Button tone="neutral" onClick={onClose} disabled={saving}>ยกเลิก</Button>
        <Button tone="primary" onClick={submit} disabled={saving}>
          {saving ? "กำลังบันทึก…" : editing ? "บันทึกการแก้ไข" : "เพิ่มไลน์"}
        </Button>
      </div>
    </Modal>
  );
}
