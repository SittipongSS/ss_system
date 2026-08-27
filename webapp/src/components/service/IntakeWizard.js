"use client";
// ── รับใบสั่งขายเข้าไซต์/โซน (เฟส 4) — wizard 2 จังหวะ ────────────────────
//
// ⭐ **TS ไม่ใช่ต้นทางของงาน** — จังหวะแรกไม่ใช่ "สร้างงาน" แต่คือ "ของที่ขายไปแล้ว
//   ไปตั้งที่ไหน" · ทุกแถวที่นี่มีต้นเรื่องเป็นบรรทัดในใบสั่งขายที่อนุมัติแล้วเสมอ
//
// ⚠️ ฟอร์มสร้างไซต์/โซนที่นี่ **เรียก component เดิม** (ServiceSiteModal /
//   ServiceZoneModal) ไม่ได้เขียนฟอร์มชุดที่สอง — กฎ AGENTS.md ข้อแรกของ repo
//   (เคสจริง: ฟอร์มแก้ที่ก๊อปมาแล้วขาดช่องไป 3 ช่องโดยไม่มีใครรู้)
//
// ⚠️ ที่นี่ **เลือกไซต์ได้อย่างเดียว ไม่แก้ทะเบียนลูกค้า** — ที่อยู่ทางภาษีกับที่อยู่
//   หน้างานเป็นคนละความจริง (มติ 2026-08-28) · อยากเพิ่มที่อยู่ต้องไปทะเบียนลูกค้า
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Building2, MapPin, Plus } from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import SearchableSelect from "@/components/ui/SearchableSelect";
import ServiceSiteModal from "@/components/service/ServiceSiteModal";
import ServiceZoneModal from "@/components/service/ServiceZoneModal";
import { STANDARD_ML_HINT_TEXT, suggestStandardMl } from "@/lib/service/terms";
import { fmtNumber, naText } from "@/lib/format";
import styles from "./IntakeWizard.module.css";

const NEW_ZONE = "__new__";

export default function IntakeWizard({ open, order, sites = [], zonesBySite = new Map(), onClose, onDone, onReloadRegistry }) {
  const [step, setStep] = useState(1);
  const [siteId, setSiteId] = useState("");
  const [rows, setRows] = useState([]);           // [{ lineId, zoneId, standardMlPerMonth }]
  const [siteModal, setSiteModal] = useState(false);
  const [zoneModalFor, setZoneModalFor] = useState(null);  // lineId ที่กำลังสร้างโซนให้
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setSiteId("");
    setError("");
    setRows((order?.lines || []).map((line) => ({ lineId: line.id, zoneId: "", standardMlPerMonth: "" })));
  }, [open, order]);

  /* ไซต์ของลูกค้ารายนี้เท่านั้น — ไซต์ของลูกค้าอื่นโผล่มาในดรอปดาวน์เมื่อไร
     คนจะผูกผิดบ้านโดยไม่มีอะไรทัก (โซนไม่มี customerId ให้ตรวจย้อน) */
  const customerSites = useMemo(
    () => sites.filter((s) => s.customerId === order?.customerId),
    [sites, order?.customerId],
  );
  const zones = useMemo(() => (siteId ? (zonesBySite.get(siteId) || []) : []), [zonesBySite, siteId]);
  const site = customerSites.find((s) => s.id === siteId) || null;

  /* 🐞 เลือกไซต์แล้วดรอปดาวน์โซนว่างเปล่า — ของเดิมโหลดโซนตอน "สร้างโซนใหม่" กับ
     ตอนกดบันทึกเท่านั้น ⇒ จังหวะ 2 ไม่มีโซนเดิมให้เลือกเลย ทั้งที่ไซต์มีโซนอยู่
     (แล้วคนจะสร้างโซนซ้ำชื่อเดิมจนชน unique) ⇒ ไซต์เปลี่ยนเมื่อไร ดึงโซนของไซต์นั้นทันที */
  useEffect(() => {
    if (!open || !siteId) return;
    onReloadRegistry?.ensureZones?.(siteId);
  }, [open, siteId, onReloadRegistry]);

  const setRow = (lineId, patch) =>
    setRows((prev) => prev.map((r) => (r.lineId === lineId ? { ...r, ...patch } : r)));

  const ready = rows.every((r) => r.zoneId && r.zoneId !== NEW_ZONE);

  const submit = async () => {
    if (!ready) { setError("ยังมีบรรทัดที่ยังไม่ได้เลือกโซน"); return; }
    setSaving(true);
    setError("");
    try {
      await onDone({
        salesOrderId: order.id,
        bindings: rows.map((r) => ({
          salesOrderLineId: r.lineId,
          zoneId: r.zoneId,
          standardMlPerMonth: String(r.standardMlPerMonth ?? "").trim() || null,
        })),
      });
      onClose();
    } catch (e) {
      setError(e.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  if (!order) return null;

  return (
    <>
      <Modal
        open={open && !siteModal && !zoneModalFor}
        onClose={onClose}
        title={`รับใบสั่งขาย ${order.code} เข้าไซต์`}
        size="lg"
      >
        <ol className={styles.steps}>
          <li data-active={step === 1 ? "yes" : undefined} data-done={step > 1 ? "yes" : undefined}>
            <Building2 size={14} aria-hidden="true" /> ของไปตั้งที่ไหน
          </li>
          <li data-active={step === 2 ? "yes" : undefined}>
            <MapPin size={14} aria-hidden="true" /> บรรทัดไหนอยู่โซนไหน
          </li>
        </ol>

        {step === 1 && (
          <div className={styles.pane}>
            <p className={styles.lead}>
              ลูกค้า <strong>{naText(order.customerName)}</strong> · ใบนี้มี {order.pendingLines} บรรทัดที่ยังไม่ผูกโซน
            </p>
            <label className={styles.field}>
              <span>ไซต์ที่ของไปตั้ง *</span>
              <SearchableSelect
                value={siteId}
                onChange={setSiteId}
                options={customerSites.map((s) => ({
                  value: s.id,
                  label: s.routeZone ? `${s.name} · ${s.routeZone}` : s.name,
                }))}
                placeholder={customerSites.length ? "เลือกไซต์ของลูกค้ารายนี้" : "ลูกค้ารายนี้ยังไม่มีไซต์"}
                ariaLabel="ไซต์ที่ของไปตั้ง"
              />
              <small>
                เห็นเฉพาะไซต์ของลูกค้ารายนี้ · ที่อยู่ของไซต์ก๊อปมาจากทะเบียนลูกค้าเป็นค่าตั้งต้น
                แล้วแก้ได้เอง — ไม่ผูกให้เปลี่ยนตามกัน
              </small>
            </label>
            <div className={styles.inlineAction}>
              <Button tone="neutral" variant="quiet" size="sm" icon={<Plus size={15} aria-hidden="true" />}
                onClick={() => setSiteModal(true)}>
                ไซต์ใหม่
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className={styles.pane}>
            <p className={styles.lead}>
              ไซต์ <strong>{naText(site?.name)}</strong> · จับคู่ทีละบรรทัด — บรรทัดที่ผูกโซนเดิม
              คือ<strong>การต่อสัญญา</strong> ประวัติและยอดการใช้ของโซนนั้นเดินต่อไม่ขาดตอน
            </p>
            <ul className={styles.lines}>
              {(order.lines || []).map((line) => {
                const row = rows.find((r) => r.lineId === line.id) || {};
                const suggestion = suggestStandardMl(line.qty, line.unit);
                return (
                  <li key={line.id} className={styles.line}>
                    <div className={styles.lineHead}>
                      <b>{naText(line.fgCode)}</b>
                      <span>{naText(line.description)}</span>
                      <span className={styles.qty}>
                        {line.qty == null ? naText(null) : `${fmtNumber(line.qty)}${line.unit ? ` ${line.unit}` : ""}`}
                      </span>
                    </div>
                    <div className={styles.lineFields}>
                      <label className={styles.field}>
                        <span>โซน *</span>
                        <Select
                          value={row.zoneId || ""}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (value === NEW_ZONE) { setZoneModalFor(line.id); return; }
                            setRow(line.id, { zoneId: value });
                          }}
                        >
                          <option value="">เลือกโซน</option>
                          {zones.map((z) => (
                            <option key={z.id} value={z.id}>
                              {z.name}{z.isActive === false ? " (ปิดใช้งาน)" : ""}
                            </option>
                          ))}
                          <option value={NEW_ZONE}>+ สร้างโซนใหม่…</option>
                        </Select>
                      </label>
                      <label className={styles.field}>
                        <span>มาตรฐานต่อเดือน (ml)</span>
                        <Input
                          value={row.standardMlPerMonth ?? ""}
                          onChange={(e) => setRow(line.id, { standardMlPerMonth: e.target.value })}
                          inputMode="numeric"
                          placeholder="ยังไม่ระบุก็ได้"
                        />
                        {/* ⚠️ ระบบ **ไม่เติมค่านี้ให้เอง** — ไม่มีสูตรที่เป็นทางการ
                            มีแค่หลักฐานจากชีตที่ลงตัว 10 ใน 13 แถว ⇒ เสนอให้กดรับ
                            ไม่ใช่เขียนเงียบ ๆ แล้วให้คนมารู้ทีหลังว่าตัวเลขมาจากไหน */}
                        {suggestion != null && (
                          <small>
                            <button type="button" className={styles.suggest}
                              onClick={() => setRow(line.id, { standardMlPerMonth: String(suggestion) })}>
                              ใช้ {fmtNumber(suggestion)} ml
                            </button>
                            {" — "}{STANDARD_ML_HINT_TEXT}
                          </small>
                        )}
                      </label>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="form-actions">
          <Button tone="neutral" onClick={step === 1 ? onClose : () => setStep(1)} disabled={saving}>
            {step === 1 ? "ยกเลิก" : "ย้อนกลับ"}
          </Button>
          {step === 1 ? (
            <Button tone="primary" onClick={() => setStep(2)} disabled={!siteId}
              icon={<ArrowRight size={15} aria-hidden="true" />}>
              จับคู่บรรทัดกับโซน
            </Button>
          ) : (
            <Button tone="primary" onClick={submit} disabled={saving || !ready}>
              {saving ? "กำลังบันทึก…" : "บันทึกและตั้งรอบต่อ"}
            </Button>
          )}
        </div>
      </Modal>

      {/* ฟอร์มเดิมทั้งสองตัว — สร้างเสร็จแล้วเลือกให้ต่อทันที คนกรอกไม่ต้องกลับไปหาเอง */}
      <ServiceSiteModal
        open={siteModal}
        site={null}
        customers={order.customerId ? [{ id: order.customerId, name: order.customerName }] : []}
        defaults={{ customerId: order.customerId, customerName: order.customerName }}
        onClose={() => setSiteModal(false)}
        onSave={async (form) => {
          const created = await onReloadRegistry.createSite(form);
          setSiteId(created.id);
          setSiteModal(false);
        }}
      />
      <ServiceZoneModal
        open={!!zoneModalFor}
        zone={null}
        onClose={() => setZoneModalFor(null)}
        onSave={async (form) => {
          const created = await onReloadRegistry.createZone(siteId, form);
          setRow(zoneModalFor, { zoneId: created.id });
          setZoneModalFor(null);
        }}
      />
    </>
  );
}
