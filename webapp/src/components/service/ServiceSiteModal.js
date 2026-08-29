"use client";
// ── ฟอร์มไซต์บริการ (mig 0187) — ตัวเดียวใช้ทั้ง "เพิ่ม" และ "แก้ไข" ────────
// กฎ AGENTS.md: ห้ามเขียนฟอร์มแก้แยกอีกชุด · ต่างกันได้แค่ "โหมด" ผ่าน props
//   site = null → โหมดสร้าง (ไม่มีช่องสถานะ — ของใหม่เริ่มที่เปิดใช้งานเสมอ)
//   site = row  → โหมดแก้ (มีช่องสถานะ)
import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import OptionTiles from "@/components/ui/OptionTiles";
import SearchableSelect from "@/components/ui/SearchableSelect";
import TimeInput from "@/components/ui/TimeInput";
import { RefreshCw } from "lucide-react";
import {
  WEEKDAY_LABELS, WEEKDAYS, normalizeSiteInput, siteAddressCarry, siteAddressDrift, toHHMM,
} from "@/lib/service/sites";
import { ADDRESS_USE_LABELS, addressText, addressUse } from "@/lib/master/addresses";
import styles from "./ServiceSiteModal.module.css";
import { apiFetch } from "@/lib/apiFetch";

// ไทล์ "ที่อยู่อื่น" = ตั้งใจไม่ก๊อปจากทะเบียน (ไซต์ที่ไม่ใช่สถานประกอบการทางภาษี)
const OWN_ADDRESS = "__own__";

const EMPTY = {
  customerId: "", name: "", routeZone: "", address: "", mapUrl: "",
  contactName: "", contactPhone: "",
  accessFrom: "", accessTo: "", accessDays: [], accessNote: "",
  note: "", isActive: true,
  // ที่มาของที่อยู่ (mig 0313) — ไม่ใช่ช่องกรอก ไทล์ข้างล่างเป็นคนตั้ง
  customerAddressId: null,
};

/* `defaults` = ค่าตั้งต้นของโหมด **สร้าง** เท่านั้น (แพตเทิร์นเดียวกับ ServiceVisitModal)
   ใช้ตอนที่ผู้เรียกรู้คำตอบอยู่แล้ว เช่น wizard รับใบสั่งขายซึ่งรู้ว่าลูกค้าคือใคร —
   ไม่ใช่ฟอร์มคนละชุด แค่โหมดที่กรอกช่องที่ตอบได้แล้วให้ล่วงหน้า */
export default function ServiceSiteModal({
  open, site = null, customers = [], customerAddresses = [], defaults = null, onClose, onSave,
}) {
  const editing = !!site;
  const [form, setForm] = useState(EMPTY);
  const [pickedAddressId, setPickedAddressId] = useState("");
  /* ⭐ ที่อยู่ของลูกค้าที่เลือกอยู่ — ผู้เรียกส่งมาก็ได้ (wizard รู้ลูกค้าอยู่แล้ว)
     ไม่ส่งก็ดึงเองเมื่อผู้ใช้เลือกลูกค้าในฟอร์ม ⇒ ทุกทางเข้าได้ไทล์เหมือนกัน
     ไม่ใช่ฟีเจอร์ที่มีเฉพาะบางหน้า (โรคเดียวกับฟอร์มสร้าง/แก้ที่เพี้ยนหากัน) */
  const [fetchedAddresses, setFetchedAddresses] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    setForm(site
      ? {
        customerId: site.customerId || "",
        name: site.name || "",
        routeZone: site.routeZone || "",
        address: site.address || "",
        mapUrl: site.mapUrl || "",
        contactName: site.contactName || "",
        contactPhone: site.contactPhone || "",
        // Postgres คืน time เป็น '10:00:00' — ช่องกรอกรับ 'HH:MM'
        accessFrom: toHHMM(site.accessFrom),
        accessTo: toHHMM(site.accessTo),
        accessDays: Array.isArray(site.accessDays) ? site.accessDays : [],
        accessNote: site.accessNote || "",
        note: site.note || "",
        isActive: site.isActive !== false,
        customerAddressId: site.customerAddressId || null,
      }
      : { ...EMPTY, ...(defaults || {}) });
    // โหมดแก้: ไทล์ที่ถูกเลือกไว้คือที่มาที่บันทึกไว้เมื่อครั้งก่อน (ไม่มี = ไม่รู้ที่มา
    // ซึ่งเป็นเรื่องปกติของไซต์ยุคก่อน mig 0313 — ไม่ใช่ "ที่อยู่อื่น")
    setPickedAddressId(site?.customerAddressId || (defaults?.customerAddressId ?? ""));
  }, [open, site, defaults]);

  const addressOptions = customerAddresses.length ? customerAddresses : fetchedAddresses;
  const sourceAddress = pickedAddressId && pickedAddressId !== OWN_ADDRESS
    ? addressOptions.find((a) => a.id === pickedAddressId) || null
    : null;
  // เตือนเฉพาะโหมดแก้ — ในโหมดสร้าง ค่าที่ต่างคือค่าที่เพิ่งพิมพ์ทับไปเมื่อครู่
  const stale = editing ? siteAddressDrift(form, sourceAddress) : [];

  /* กดไทล์ = เติมสี่ช่องที่ก๊อปได้ให้ครั้งเดียว แล้วปล่อยให้แก้ต่อ
     ⚠️ `|| prev.x` ทุกช่อง — ทะเบียนไม่มีค่า **ห้ามล้างของที่กรอกไว้เอง** (ไซต์จริง
        ใบแรกบน production มี mapUrl แต่ไม่มี address ⇒ ดึงใหม่แล้วหมุดหายไม่ได้)
     ⭐ เก็บ id ที่มาลงแถวไซต์ด้วย (mig 0313) — ปุ่ม "ดึงใหม่" ในโหมดแก้อาศัยค่านี้ */
  const applyCustomerAddress = (id) => {
    setPickedAddressId(id);
    if (id === OWN_ADDRESS) {
      setForm((prev) => ({ ...prev, customerAddressId: null }));
      return;
    }
    const row = addressOptions.find((a) => a.id === id);
    if (!row) return;
    setForm((prev) => ({ ...prev, customerAddressId: id, ...siteAddressCarry(prev, row) }));
  };

  /* ⭐ **ย้ายลูกค้า = ที่มาเดิมใช้ไม่ได้แล้ว** — id ชี้เข้า addresses[] ของคนเดิม
     ล้างที่นี่ให้ตรงกับด่านฝั่ง server (PATCH /api/service/sites/[id]) · ข้อความที่
     ก๊อปไว้แล้วยังอยู่ครบ หายแค่ "ที่มา" ซึ่งคนกรอกแก้ต่อได้ตามจริง */
  const changeCustomer = (value) => {
    setPickedAddressId("");
    setForm((prev) => (prev.customerId === value
      ? prev
      : { ...prev, customerId: value, customerAddressId: null }));
  };

  useEffect(() => {
    // ⭐ โหมดแก้ก็เสนอไทล์ (มติ 2026-08-29) — ของเดิมปิดไว้ ⇒ ไซต์ที่สร้างไปแล้ว
    //    ดึงที่อยู่จากทะเบียนมาเติมทีหลังไม่ได้เลย ต้องพิมพ์เองทั้งชุด
    if (!open) return;
    if (customerAddresses.length) return;         // ผู้เรียกส่งมาแล้ว
    const customerId = form.customerId;
    if (!customerId) { setFetchedAddresses([]); return; }
    let alive = true;
    (async () => {
      try {
        const res = await apiFetch(`/api/customers/${customerId}`);
        const body = await res.json().catch(() => null);
        if (alive && res.ok) setFetchedAddresses(Array.isArray(body?.addresses) ? body.addresses : []);
      } catch {
        if (alive) setFetchedAddresses([]);       // ดึงไม่ได้ = ไม่มีไทล์ ไม่ใช่ฟอร์มพัง
      }
    })();
    return () => { alive = false; };
  }, [open, site, form.customerId, customerAddresses.length]);

  const change = (field) => (event) => {
    const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleDay = (day) => {
    setForm((prev) => {
      const days = prev.accessDays.includes(day)
        ? prev.accessDays.filter((d) => d !== day)
        : [...prev.accessDays, day];
      return { ...prev, accessDays: days.sort((a, b) => a - b) };
    });
  };

  const customerOptions = useMemo(
    () => customers.map((c) => ({ value: c.id, label: c.arCode ? `${c.name} (${c.arCode})` : c.name })),
    [customers],
  );

  const submit = async () => {
    // validate ด้วยตัวเดียวกับฝั่ง server — ข้อความผิดพลาดตรงกันคำต่อคำ
    const { error: invalid } = normalizeSiteInput(form);
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
    <Modal open={open} onClose={onClose} title={editing ? `แก้ไขไซต์ ${site.name}` : "เพิ่มไซต์บริการ"} size="lg">
      <div className={styles.grid}>
        <label className={`${styles.field} ${styles.wide}`}>
          <span>ลูกค้า *</span>
          <SearchableSelect
            value={form.customerId}
            onChange={changeCustomer}
            options={customerOptions}
            entity="customer"
            placeholder="เลือกลูกค้า"
            ariaLabel="ลูกค้าเจ้าของไซต์"
          />
        </label>

        <label className={styles.field}>
          <span>ชื่อไซต์ *</span>
          <Input value={form.name} onChange={change("name")} placeholder="สาขาเอ็มควอเทียร์ ชั้น 3" maxLength={150} />
        </label>

        <label className={styles.field}>
          <span>เขตวิ่งงาน</span>
          <Input value={form.routeZone} onChange={change("routeZone")} placeholder="BKK-E / ปริมณฑล" maxLength={50} />
          <small>ใช้จัดรอบวิ่งให้ช่างไม่ต้องข้ามเมืองในวันเดียว</small>
        </label>

        {/* ⭐ **ตั้งจากที่อยู่ในทะเบียนลูกค้า** (มติ 2026-08-28) — เลิกพิมพ์ที่อยู่
            ซ้ำสองที่ · กดไทล์แล้วช่องข้างล่างถูกเติมให้ แล้วแก้ต่อได้เอง
            ⚠️ **ก๊อปมาตั้งต้นเท่านั้น ไม่ผูกให้เปลี่ยนตามกัน** — ที่อยู่ทางภาษีกับ
            ที่อยู่หน้างานเป็นคนละความจริง เครื่องย้ายชั้นไม่ได้แปลว่าบริษัทย้าย
            ⚠️ ที่นี่ **เลือกได้อย่างเดียว** เพิ่มที่อยู่ต้องไปทะเบียนลูกค้า — ไม่งั้น
            ที่อยู่หน้างานจะไหลกลับเข้าไปอยู่ในเอกสารภาษี
            ⭐ **โหมดแก้ก็เห็นไทล์** (มติ 2026-08-29) — ไซต์ที่พิมพ์เองไว้ก่อน ผูกกลับ
            เข้าทะเบียนทีหลังได้ · ไทล์ที่ติดอยู่คือที่มาที่บันทึกไว้ (mig 0313) */}
        {addressOptions.length > 0 && (
          <div className={`${styles.field} ${styles.wide}`}>
            <span>{editing ? "ที่อยู่ต้นทางจากทะเบียนลูกค้า" : "ตั้งจากที่อยู่ในทะเบียนลูกค้า"}</span>
            <OptionTiles
              value={pickedAddressId}
              onChange={applyCustomerAddress}
              ariaLabel="ที่อยู่จากทะเบียนลูกค้า"
              options={[
                ...addressOptions.map((row) => ({
                  value: row.id,
                  label: row.label || row.branchCode || "ที่อยู่",
                  description: [ADDRESS_USE_LABELS[addressUse(row)], addressText(row)]
                    .filter(Boolean).join(" · ").slice(0, 120),
                })),
                { value: OWN_ADDRESS, label: "ที่อยู่อื่น — พิมพ์เอง", description: "ไซต์ที่ไม่ใช่สถานประกอบการทางภาษี เช่น ล็อบบี้ห้างที่เช่าพื้นที่" },
              ]}
            />
            {editing && !pickedAddressId && (
              <small>ยังไม่รู้ที่มา — เลือกไทล์เพื่อผูกกับทะเบียน หรือปล่อยไว้ถ้าที่อยู่นี้พิมพ์เอง</small>
            )}
          </div>
        )}

        {/* ── ทะเบียนขยับหลังไซต์ถูกสร้าง ────────────────────────────────
            ไม่อัปเดตให้เอง (ที่อยู่ทางภาษี ≠ ที่อยู่หน้างาน) แต่ต้อง **บอกว่าต่าง**
            แล้วให้คนตัดสิน · กดแล้วทับเฉพาะช่องที่ทะเบียนมีค่า ไม่ล้างของที่กรอกเอง */}
        {stale.length > 0 && (
          <div className={`${styles.field} ${styles.wide} ${styles.stale}`} role="status">
            <span>ทะเบียนลูกค้าเปลี่ยนไปจากที่ก๊อปไว้ — {stale.map((f) => f.label).join(" · ")}</span>
            <Button size="sm" tone="neutral" onClick={() => applyCustomerAddress(pickedAddressId)}
              icon={<RefreshCw size={14} aria-hidden="true" />}>
              ดึงค่าจากทะเบียนมาทับ
            </Button>
            <small>ไม่กดก็ได้ — ที่อยู่หน้างานต่างจากที่อยู่จดทะเบียนเป็นเรื่องปกติ</small>
          </div>
        )}

        <label className={`${styles.field} ${styles.wide}`}>
          <span>ที่อยู่</span>
          <Input as="textarea" rows={2} value={form.address} onChange={change("address")} maxLength={500} />
          {pickedAddressId && pickedAddressId !== OWN_ADDRESS && (
            <small>ก๊อปมาจากทะเบียนลูกค้าเป็นค่าตั้งต้น — แก้ต่อได้ ไม่กระทบทะเบียน</small>
          )}
        </label>

        <label className={styles.field}>
          <span>ลิงก์แผนที่</span>
          <Input value={form.mapUrl} onChange={change("mapUrl")} placeholder="https://maps.app.goo.gl/..." maxLength={500} />
        </label>

        <label className={styles.field}>
          <span>ผู้ติดต่อหน้างาน</span>
          <Input value={form.contactName} onChange={change("contactName")} maxLength={100} />
        </label>

        <label className={styles.field}>
          <span>เบอร์ผู้ติดต่อ</span>
          <Input value={form.contactPhone} onChange={change("contactPhone")} maxLength={50} />
        </label>

        {/* ── ช่วงเวลาที่ไซต์ยอมให้เข้า ─────────────────────────────────── */}
        <fieldset className={`${styles.field} ${styles.wide} ${styles.fieldset}`}>
          <legend>ช่วงเวลาที่เข้าไซต์ได้</legend>
          <p className={styles.hint}>
            ข้อจำกัดถาวรของไซต์ (ห้างเปิด 10:00 · โรงงานพัก 12:00–13:00) กรอกครั้งเดียวใช้ตลอด —
            คนละเรื่องกับเวลานัดแต่ละครั้ง · เว้นว่าง = เข้าได้ตลอดเวลาทำการ
          </p>
          <div className={styles.timeRow}>
            <label className={styles.timeField}>
              <span>ตั้งแต่</span>
              <TimeInput value={form.accessFrom} onChange={(value) => setForm((prev) => ({ ...prev, accessFrom: value }))} />
            </label>
            <label className={styles.timeField}>
              <span>ถึง</span>
              <TimeInput value={form.accessTo} onChange={(value) => setForm((prev) => ({ ...prev, accessTo: value }))} />
            </label>
          </div>
          <div className={styles.dayRow} role="group" aria-label="วันที่เข้าไซต์ได้">
            {WEEKDAYS.map((day) => (
              <label key={day} className={styles.dayChip}>
                <input type="checkbox" checked={form.accessDays.includes(day)} onChange={() => toggleDay(day)} />
                <span>{WEEKDAY_LABELS[day]}</span>
              </label>
            ))}
          </div>
          <p className={styles.hint}>ไม่ติ๊กเลย = เข้าได้ทุกวัน</p>
          <label className={styles.field}>
            <span>เงื่อนไขอื่น</span>
            <Input value={form.accessNote} onChange={change("accessNote")} placeholder="ต้องแลกบัตร · จอดรถชั้น B2" maxLength={1000} />
          </label>
        </fieldset>

        <label className={`${styles.field} ${styles.wide}`}>
          <span>หมายเหตุ</span>
          <Input as="textarea" rows={2} value={form.note} onChange={change("note")} maxLength={1000} />
        </label>

        {/* โหมดสร้างไม่มีช่องสถานะ — ของใหม่เริ่มที่ "เปิดใช้งาน" เสมอ (กฎ AGENTS.md) */}
        {editing && (
          <label className={`${styles.field} ${styles.wide} ${styles.check}`}>
            <input type="checkbox" checked={form.isActive} onChange={change("isActive")} />
            <span>เปิดใช้งาน</span>
            <small>ปิดใช้งาน = ไซต์และประวัติยังอยู่ แต่ไม่ขึ้นในคิวจัดนัดอีก</small>
          </label>
        )}
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="form-actions">
        <Button tone="neutral" onClick={onClose} disabled={saving}>ยกเลิก</Button>
        <Button tone="primary" onClick={submit} disabled={saving}>
          {saving ? "กำลังบันทึก…" : editing ? "บันทึกการแก้ไข" : "เพิ่มไซต์"}
        </Button>
      </div>
    </Modal>
  );
}
