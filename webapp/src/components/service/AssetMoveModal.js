"use client";
// ── โมดัลคำสั่งย้าย/เปลี่ยนสถานะเครื่อง (เฟส C · mig 0335) ───────────────
//
// ⭐ **โมดัลเดียวรับทุกคำสั่ง** — ติดตั้ง · ย้าย · ถอนกลับคลัง · ส่งซ่อม ·
//   รับคืนจากซ่อม · แจ้งสภาพ · ปลดระวาง · ช่องที่โผล่เปลี่ยนตาม `kind`
//   ⚠️ ไม่แยกเป็นเจ็ดไฟล์เพราะทุกใบถามเรื่องเดียวกัน (วันที่ · ปลายทาง · เหตุผล)
//      แยกแล้วมันจะเพี้ยนหากันแน่ — โรคเดียวกับที่ AGENTS.md ห้ามเรื่องฟอร์มสร้าง/แก้
//
// ⭐ **บอกผลลัพธ์ก่อนกด** ตามกติกาโมดัลอนุมัติของระบบ — ไม่ใช่กล่อง "แน่ใจหรือไม่"
//   ที่ไม่บอกว่าอะไรจะเปลี่ยน
import { useEffect, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import AlertBanner from "@/components/ui/AlertBanner";
import Button from "@/components/ui/Button";
import Modal from "@/components/Modal";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import SearchableSelect from "@/components/ui/SearchableSelect";
import {
  ASSET_CONDITIONS, ASSET_CONDITION_LABELS, ASSET_STATUS_LABELS, isWarehouseSite,
} from "@/lib/service/sites";
import {
  MOVE_CHANGES_SITE, MOVE_LABELS, MOVE_NEEDS_REASON, MOVE_RESULT, MOVE_TO_WAREHOUSE, assetMoveError,
} from "@/lib/service/assetMoves";
import { businessDate } from "@/lib/businessDate";
import { naText } from "@/lib/format";
import styles from "./AssetMoveModal.module.css";

/* คำอธิบายใต้หัวโมดัล — บอกว่าคำสั่งนี้ทำอะไรกับเครื่อง ไม่ใช่แค่ชื่อคำสั่ง */
const MOVE_HINTS = {
  install: "เครื่องจะออกจากคลังไปอยู่ที่ไซต์ลูกค้า และเริ่มนับอายุใช้งาน",
  transfer: "เครื่องจะถูกถอดจากที่เดิมไปติดตั้งที่ใหม่ — ประวัติเก็บทั้งสองฝั่ง",
  return: "เครื่องจะกลับเข้าคลัง ไม่ถูกนับเป็นเครื่องของไซต์นั้นอีก",
  repair: "เครื่องจะไม่ถูกนับในคลังพร้อมใช้ระหว่างที่ส่งซ่อม",
  repair_done: "เลือกคลังที่จะรับเครื่องกลับเข้า — สภาพกลับเป็นปกติ พร้อมนำไปติดตั้งใหม่",
  condition: "เปลี่ยนแค่สภาพเครื่อง — ที่อยู่และสถานะไม่เปลี่ยน",
  retire: "ย้อนกลับไม่ได้ — แต่ระเบียนไม่ถูกลบ ประวัติทั้งหมดยังอ่านได้",
};

const REASON_PRESETS = {
  transfer: ["ลูกค้าเลิกสัญญา", "ย้ายสาขา", "สลับไปแทนเครื่องเสีย", "ปรับจำนวนเครื่องในไซต์"],
  return: ["ลูกค้าเลิกสัญญา", "ลดจำนวนเครื่อง", "เอากลับมาเช็ค"],
  retire: ["ซ่อมไม่คุ้ม", "อะไหล่เลิกผลิต", "สูญหาย", "ลูกค้าทำเสียหาย"],
};

export default function AssetMoveModal({ open, kind, asset, fromSite, sites = [], zones = [], busy, onClose, onToSite, onSubmit }) {
  const [form, setForm] = useState({});
  const [error, setError] = useState("");

  // เปิดโมดัล = เริ่มใหม่ทุกครั้ง — ค่าค้างจากคำสั่งก่อนหน้าคือค่าที่ไม่มีใครตั้งใจส่ง
  useEffect(() => {
    if (!open) return;
    setForm({ movedAt: businessDate(), toSiteId: "", toZoneId: "", reason: "", note: "", condition: "broken" });
    setError("");
  }, [open, kind]);

  const patch = (next) => setForm((f) => ({ ...f, ...next }));

  const needsSite = MOVE_CHANGES_SITE.includes(kind);
  const needsReason = MOVE_NEEDS_REASON.includes(kind);

  /* ไซต์ปลายทางที่เลือกได้ — คัดตามชนิดคำสั่งตั้งแต่ในลิสต์ ไม่ใช่ให้เลือกผิดแล้วค่อยเด้ง
     ⚠️ ตัดไซต์ปัจจุบันออกด้วย: "ย้ายไปที่เดิม" ไม่ใช่การย้าย */
  const siteOptions = useMemo(() => sites
    // ⚠️ `repair_done` กลับเข้าคลังใบเดิมได้ ⇒ ตัดไซต์ปัจจุบันออกเฉพาะคำสั่งที่ต้องย้ายจริง
    .filter((s) => (kind === "repair_done" || s.id !== asset?.siteId) && s.isActive !== false)
    .filter((s) => (MOVE_TO_WAREHOUSE.includes(kind) ? isWarehouseSite(s) : !isWarehouseSite(s)))
    .map((s) => ({ value: s.id, label: s.name, search: `${s.name} ${s.code || ""} ${s.customerName || ""}` })),
  [sites, asset?.siteId, kind]);

  const toSite = useMemo(() => sites.find((s) => s.id === form.toSiteId) || null, [sites, form.toSiteId]);
  /* โซนที่หน้าโหลดมาให้เป็นของไซต์ปลายทางอยู่แล้ว (ยิงรายไซต์ตอนเลือก)
     ⚠️ ยังกรอง `siteId` ซ้ำอยู่ดี — กันกรณีคำตอบของไซต์ก่อนหน้ามาถึงช้ากว่า */
  const zoneOptions = useMemo(() => zones
    .filter((z) => (!form.toSiteId || z.siteId === form.toSiteId) && z.isActive !== false)
    .map((z) => ({ value: z.id, label: z.name })),
  [zones, form.toSiteId]);

  /* 🔑 **ตัวตัดสินตัวเดียวกับที่ API ใช้** — ปุ่มยืนยันปิดตามนี้ และเหตุผลที่ปิด
     ขึ้นเป็นตัวหนังสือ ไม่ใช่ tooltip (จอสัมผัสไม่มีทางเห็น tooltip) */
  const gate = asset ? assetMoveError(asset, kind, form, { canEdit: true, fromSite, toSite }) : "ไม่พบเครื่อง";

  const result = MOVE_RESULT[kind] || {};
  const nextStatus = kind === "condition" ? asset?.status : (result.status || asset?.status);
  const nextCondition = kind === "condition" ? form.condition : (result.condition || asset?.condition);

  const submit = async () => {
    setError("");
    try {
      await onSubmit({ kind, ...form });
    } catch (e) {
      setError(e.message || "บันทึกไม่สำเร็จ");
    }
  };

  if (!asset) return null;

  return (
    <Modal open={open} onClose={onClose} title={MOVE_LABELS[kind] || "จัดการเครื่อง"} size="md">
      <p className={styles.hint}>{MOVE_HINTS[kind]}</p>

      {/* ก่อน → หลัง · บอกผลลัพธ์ก่อนกด ไม่ใช่ถามว่าแน่ใจไหม */}
      <div className={styles.change}>
        <span className={styles.side}>
          <b>{ASSET_STATUS_LABELS[asset.status] || asset.status}</b>
          <small>{naText(fromSite?.name)}{asset.condition === "broken" ? " · ชำรุด" : ""}</small>
        </span>
        <ArrowRight size={16} aria-hidden="true" className={styles.arrow} />
        <span className={`${styles.side} ${styles.to}`}>
          <b>{ASSET_STATUS_LABELS[nextStatus] || nextStatus}</b>
          <small>
            {needsSite ? naText(toSite?.name) : naText(fromSite?.name)}
            {nextCondition === "broken" ? " · ชำรุด" : ""}
          </small>
        </span>
      </div>

      {needsSite && (
        <label className="form-field">
          <span>ไซต์ปลายทาง <em className={styles.req}>ต้องระบุ</em></span>
          <SearchableSelect
            value={form.toSiteId}
            onChange={(v) => { patch({ toSiteId: v, toZoneId: "" }); onToSite?.(v); }}
            options={siteOptions}
            placeholder={MOVE_TO_WAREHOUSE.includes(kind) ? "เลือกคลัง" : "เลือกไซต์ลูกค้า"}
          />
        </label>
      )}

      {needsSite && !MOVE_TO_WAREHOUSE.includes(kind) && (
        <label className="form-field">
          <span>โซน</span>
          <SearchableSelect
            value={form.toZoneId}
            onChange={(v) => patch({ toZoneId: v })}
            options={zoneOptions}
            placeholder={form.toSiteId ? "— ยังไม่ระบุโซน —" : "เลือกไซต์ก่อน"}
            disabled={!form.toSiteId}
          />
          <small className={styles.hintSm}>เว้นว่างได้ถ้ายังไม่รู้ว่าจะลงโซนไหน</small>
        </label>
      )}

      {kind === "condition" && (
        <label className="form-field">
          <span>สภาพเครื่อง <em className={styles.req}>ต้องระบุ</em></span>
          {/* ตัวเลือกสองตัว = ปุ่มเรียงให้เห็นทั้งหมด ไม่ใช่ดรอปดาวน์ (กติกาของระบบ) */}
          <div className={styles.picks}>
            {ASSET_CONDITIONS.map((c) => (
              <Button
                key={c} size="sm"
                tone={form.condition === c ? "accent" : "neutral"}
                variant={form.condition === c ? "filled" : "outline"}
                onClick={() => patch({ condition: c })}
              >
                {ASSET_CONDITION_LABELS[c]}
              </Button>
            ))}
          </div>
        </label>
      )}

      <label className="form-field">
        <span>วันที่ <em className={styles.req}>ต้องระบุ</em></span>
        <Input type="date" value={form.movedAt || ""} onChange={(e) => patch({ movedAt: e.target.value })} />
        <small className={styles.hintSm}>กรอกย้อนหลังได้ — ไทม์ไลน์เรียงตามวันที่นี้ ไม่ใช่เวลาที่กดบันทึก</small>
      </label>

      {needsReason && (
        <label className="form-field">
          <span>เหตุผล <em className={styles.req}>ต้องระบุ</em></span>
          <div className={styles.picks}>
            {(REASON_PRESETS[kind] || []).map((r) => (
              <Button
                key={r} size="sm"
                tone={form.reason === r ? "accent" : "neutral"}
                variant={form.reason === r ? "filled" : "outline"}
                onClick={() => patch({ reason: r })}
              >
                {r}
              </Button>
            ))}
          </div>
          <Input
            value={form.reason || ""}
            onChange={(e) => patch({ reason: e.target.value })}
            placeholder="หรือพิมพ์เอง"
          />
        </label>
      )}

      <label className="form-field">
        <span>หมายเหตุ</span>
        <Textarea value={form.note || ""} onChange={(e) => patch({ note: e.target.value })} rows={2} />
      </label>

      {error && <AlertBanner tone="danger">{error}</AlertBanner>}
      {/* เหตุผลที่กดไม่ได้ต้องเป็นตัวหนังสือ ไม่ใช่ tooltip — บนจอสัมผัสไม่มีทางเห็น */}
      {!error && gate && <p className={styles.gate} role="status">{gate}</p>}

      <div className="form-action-bar">
        <Button onClick={onClose} disabled={busy}>ยกเลิก</Button>
        <Button
          tone={kind === "retire" ? "danger" : "primary"}
          onClick={submit}
          disabled={busy || !!gate}
        >
          {busy ? "กำลังบันทึก…" : MOVE_LABELS[kind]}
        </Button>
      </div>
    </Modal>
  );
}
