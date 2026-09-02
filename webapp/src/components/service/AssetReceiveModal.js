"use client";
// ── โมดัลรับเครื่องเข้าคลัง (เฟส C ต่อ) ──────────────────────────────────
//
// ⭐ **ทางเดียวที่สร้างเครื่องหลายตัวรวดเดียว** — เครื่องเกิดที่คลังเสมอ แล้วค่อย
//   ถูกติดตั้ง (กติกาเดียวกับที่ไซต์เกิดจากใบคำร้อง ไม่ใช่เกิดที่ทะเบียน)
//
// ⭐ **พรีวิวรหัสก่อนกด** — ระบบเดาเลขถัดไปให้จากของที่มีอยู่ แต่คนกดต้องเห็นว่า
//   จะได้รหัสอะไรบ้างก่อนยืนยัน · แก้เลขเริ่มต้นทับได้เสมอ (เครื่องที่มีเบอร์จาก
//   โรงงานติดมาก็มี)
import { useEffect, useMemo, useState } from "react";
import AlertBanner from "@/components/ui/AlertBanner";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/Modal";
import SearchableSelect from "@/components/ui/SearchableSelect";
import Textarea from "@/components/ui/Textarea";
import { ASSET_KINDS, ASSET_KIND_LABELS } from "@/lib/service/assetKinds";
import {
  MAX_RECEIVE, nextSerialNumber, plannedSerials, receiveError, serialPrefixOf,
} from "@/lib/service/assetReceive";
import { businessDate } from "@/lib/businessDate";
import styles from "./AssetReceiveModal.module.css";

const COLOURS = ["ขาว", "ดำ", "เทา"];

export default function AssetReceiveModal({
  open, warehouses = [], existingSerials = [], busy, onClose, onSubmit,
}) {
  const [form, setForm] = useState({});
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm({
      siteId: warehouses.length === 1 ? warehouses[0].id : "",
      model: "", colour: "", kind: "diffuser",
      count: 1, startNumber: 1, receivedAt: businessDate(), note: "",
    });
    setError("");
  }, [open, warehouses]);

  const patch = (next) => setForm((f) => ({ ...f, ...next }));

  /* เดาเลขถัดไปให้ทันทีที่พิมพ์รุ่นเสร็จ — อ่านจากรหัสจริงที่มีอยู่ ไม่ใช่ตัวนับแยก
     ⚠️ ไม่เขียนทับถ้าผู้ใช้แก้เลขเองแล้ว (`startTouched`) */
  const prefix = serialPrefixOf(form.model);
  useEffect(() => {
    if (!open || !prefix || form.startTouched) return;
    patch({ startNumber: nextSerialNumber(prefix, existingSerials) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefix, existingSerials.length, form.startTouched]);

  const site = useMemo(
    () => warehouses.find((w) => w.id === form.siteId) || null,
    [warehouses, form.siteId],
  );
  const serials = useMemo(() => plannedSerials(form), [form]);

  /* 🔑 ตัวตัดสินตัวเดียวกับที่ API ใช้ — ปุ่มปิดตามนี้ และเหตุผลขึ้นเป็นตัวหนังสือ */
  const gate = receiveError(form, { canEdit: true, site, existingSerials, takenSerials: existingSerials });

  const submit = async () => {
    setError("");
    try {
      await onSubmit(form);
    } catch (e) {
      setError(e.message || "บันทึกไม่สำเร็จ");
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="รับเครื่องเข้าคลัง" size="md">
      <p className={styles.hint}>
        เครื่องใหม่เข้าระบบทางนี้ทางเดียว แล้วค่อยถูกติดตั้งไปที่ไซต์ลูกค้า —
        รหัสจะเดินต่อกันให้อัตโนมัติ
      </p>

      {warehouses.length === 0 ? (
        <AlertBanner tone="warning">
          ยังไม่มีคลังในระบบ — สร้างไซต์ประเภท “คลัง” ก่อน แล้วจึงรับเครื่องเข้าได้
        </AlertBanner>
      ) : (
        <>
          {warehouses.length > 1 && (
            <label className="form-field">
              <span>คลังปลายทาง <em className={styles.req}>ต้องระบุ</em></span>
              <SearchableSelect
                value={form.siteId}
                onChange={(v) => patch({ siteId: v })}
                options={warehouses.map((w) => ({ value: w.id, label: w.name, search: `${w.name} ${w.code || ""}` }))}
                placeholder="เลือกคลัง"
              />
            </label>
          )}

          <div className="two">
            <label className="form-field">
              <span>รุ่น <em className={styles.req}>ต้องระบุ</em></span>
              <Input
                value={form.model || ""}
                onChange={(e) => patch({ model: e.target.value })}
                placeholder="เช่น OV-08"
                autoComplete="off"
              />
              <small className={styles.hintSm}>
                {prefix ? `รหัสจะขึ้นต้นด้วย ${prefix}-` : "รหัสจะขึ้นต้นด้วยรุ่นที่ตัดขีดออก"}
              </small>
            </label>

            <label className="form-field">
              <span>ชนิด</span>
              {/* ตัวเลือกน้อย = เรียงให้เห็นทั้งหมด ไม่ใช่ดรอปดาวน์ (กติกาของระบบ) */}
              <div className={styles.picks}>
                {ASSET_KINDS.map((k) => (
                  <Button
                    key={k} size="sm"
                    tone={form.kind === k ? "accent" : "neutral"}
                    variant={form.kind === k ? "filled" : "outline"}
                    onClick={() => patch({ kind: k })}
                  >
                    {ASSET_KIND_LABELS[k]}
                  </Button>
                ))}
              </div>
            </label>
          </div>

          <div className="two">
            <label className="form-field">
              <span>สี</span>
              <div className={styles.picks}>
                {COLOURS.map((c) => (
                  <Button
                    key={c} size="sm"
                    tone={form.colour === c ? "accent" : "neutral"}
                    variant={form.colour === c ? "filled" : "outline"}
                    onClick={() => patch({ colour: form.colour === c ? "" : c })}
                  >
                    {c}
                  </Button>
                ))}
              </div>
            </label>

            <label className="form-field">
              <span>วันที่รับเข้า <em className={styles.req}>ต้องระบุ</em></span>
              <Input type="date" value={form.receivedAt || ""} onChange={(e) => patch({ receivedAt: e.target.value })} />
            </label>
          </div>

          <div className="two">
            <label className="form-field">
              <span>รับเข้ากี่ตัว <em className={styles.req}>ต้องระบุ</em></span>
              <Input
                type="number" min="1" max={MAX_RECEIVE}
                value={form.count ?? ""}
                onChange={(e) => patch({ count: Number(e.target.value) })}
              />
              <small className={styles.hintSm}>ครั้งละไม่เกิน {MAX_RECEIVE} ตัว</small>
            </label>

            <label className="form-field">
              <span>เริ่มที่เลข</span>
              <Input
                type="number" min="1"
                value={form.startNumber ?? ""}
                onChange={(e) => patch({ startNumber: Number(e.target.value), startTouched: true })}
              />
              <small className={styles.hintSm}>ระบบเดาเลขถัดไปให้ — แก้ทับได้ถ้าเครื่องมีเบอร์จากโรงงาน</small>
            </label>
          </div>

          {/* ⭐ พรีวิวรหัสก่อนกด — คนกดต้องเห็นว่าจะได้รหัสอะไรบ้าง ไม่ใช่รู้ตอนบันทึกไปแล้ว */}
          {serials.length > 0 && (
            <div className={styles.preview}>
              <div className={styles.previewHead}>รหัสที่จะออก {serials.length} ตัว</div>
              <div className={styles.chips}>
                {serials.slice(0, 12).map((s) => <span key={s} className={styles.chip}>{s}</span>)}
                {serials.length > 12 && (
                  <span className={styles.more}>… ถึง {serials[serials.length - 1]}</span>
                )}
              </div>
            </div>
          )}

          <label className="form-field">
            <span>หมายเหตุ</span>
            <Textarea value={form.note || ""} onChange={(e) => patch({ note: e.target.value })} rows={2} />
          </label>
        </>
      )}

      {error && <AlertBanner tone="danger">{error}</AlertBanner>}
      {!error && gate && warehouses.length > 0 && <p className={styles.gate} role="status">{gate}</p>}

      <div className="form-action-bar">
        <Button onClick={onClose} disabled={busy}>ยกเลิก</Button>
        <Button tone="primary" onClick={submit} disabled={busy || !!gate || !warehouses.length}>
          {busy ? "กำลังบันทึก…" : `รับเข้าคลัง ${serials.length || ""} ตัว`.trim()}
        </Button>
      </div>
    </Modal>
  );
}
