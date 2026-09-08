"use client";
// ── แจกกลิ่นก้อนหนึ่งให้ผู้ปรุง (mig 0350 · มติผู้ใช้ 2026-09-08) ───────────
//
// ⭐ **ตัวเดียว สองทางเรียก** — ตารางงานผู้ปรุงกลิ่น (`/rd/perfumers`) และหน้าใบคำร้อง
// (`/requests/[id]` ผ่าน `BriefBoard`) ต้องแจกได้เหมือนกันเป๊ะ · กฎของโปรเจกต์
// (AGENTS.md): เขียนสองชุดเมื่อไร มันเพี้ยนหากันเสมอ และแต่ละฝั่งจะขาดคนละอย่าง
// โดยไม่มีใครรู้ — ที่นี่ของจริงคือ "หัวหน้าอ่านบรีฟอยู่บนใบแล้วอยากแจกทันที"
//
// ⭐ **ไทล์ ไม่ใช่ดรอปดาวน์** — ผู้ปรุงทั้งฝ่ายมี 4 คน (2026-09-08) ซึ่งเป็นชุดเล็ก
// ตายตัว · ดรอปดาวน์ซ่อนจำนวนตัวเลือกไว้จนกว่าจะกด แล้วคำถาม "จะแจกให้ใครดี"
// ต้องเปิดดูก่อนถึงจะเริ่มคิดได้ (กติกาคอนโทรล design v2)
//
// ⚠️ **บอกผลลัพธ์ก่อนกด** — ทุกโมดัลที่เปลี่ยนสถานะของงานต้องบอกว่ากดแล้วจะเกิดอะไร
// ไม่ใช่แค่ถามว่าแน่ใจไหม (กติกาโมดัลยืนยันของระบบ)
import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import OptionTiles from "@/components/ui/OptionTiles";
import { personFullName } from "@/lib/ui/personName";
import styles from "./requestForm.module.css";

export default function BriefPerfumerModal({
  /* แถวที่กำลังแจก — `null` = ปิด · รูปเดียวกันทั้งสองฝั่ง:
     `{ briefId, label, perfumer: { id, name }, sent }` */
  row = null,
  perfumers = [],
  saving = false,
  onClose,
  // ({ briefId, perfumerId, perfumerName }) => Promise<boolean>
  onSubmit,
}) {
  const [pick, setPick] = useState("");

  /* ⚠️ ตั้งค่าเริ่มต้นตอน **แถวเปลี่ยน** ไม่ใช่ทุก render — เฝ้าค่าตลอดเวลาแปลว่า
     ผู้ใช้กดเลือกคนอื่นไม่ได้เลย มันจะเด้งกลับเป็นคนเดิมทุกครั้ง (บทเรียนเดียวกับ
     ตัวกรอง `?owner=` ของคิว) */
  useEffect(() => { setPick(row?.perfumer?.id || ""); }, [row?.briefId, row?.perfumer?.id]);

  if (!row) return null;

  const current = row.perfumer?.name || "";
  const options = perfumers.map((user) => ({
    value: user.id,
    label: personFullName(user),
  }));
  /* ชื่อเดิมที่ไม่มีในรายชื่อ (คนย้ายตำแหน่ง/ปิดบัญชี · ชื่อที่เคยกรอกมือ) ต้องยังอยู่
     ⚠️ ไม่ใส่ = กดยืนยันแล้วของเดิมหายเงียบ ๆ ทั้งที่ผู้ใช้ตั้งใจแค่มาดู
     (โรคเดียวกับตัวเลือก "(ของเดิมบนใบ)" ของช่องผู้เซ็น PDR) */
  if (row.perfumer?.id && !options.some((o) => o.value === row.perfumer.id)) {
    options.unshift({ value: row.perfumer.id, label: `${current || row.perfumer.id} (ของเดิม)` });
  }

  const nameOf = (id) => personFullName(perfumers.find((u) => u.id === id))
    || (id === row.perfumer?.id ? current : "");
  const unchanged = pick === (row.perfumer?.id || "");
  const submit = (perfumerId) => onSubmit?.({
    briefId: row.briefId,
    perfumerId: perfumerId || null,
    // ชื่อ ณ ตอนแจก — snapshot แบบเดียวกับ `assigneeName` ของใบ
    perfumerName: perfumerId ? (nameOf(perfumerId) || null) : null,
  });

  return (
    <Modal
      open dismissible={!saving} onClose={onClose}
      size="sm" title="แจกงานให้ผู้ปรุงกลิ่น"
    >
      <div className="form-group">
        {/* ⚠️ ไม่ใช่ `<label htmlFor>` — `OptionTiles` เป็นกลุ่มปุ่ม (`radiogroup`)
            ไม่ใช่ input เดี่ยวที่ผูก id ได้ · ชื่อของกลุ่มไปทาง `ariaLabel` แทน */}
        <span className={styles.fieldLabel}>{row.label}</span>
        {options.length === 0 ? (
          /* ⚠️ รายชื่อว่างมีสองสาเหตุที่หน้าตาเหมือนกัน: ยังไม่มีใครถือตำแหน่ง หรือ
             คนเปิดหน้าไม่มีสิทธิ์อ่านทะเบียนผู้ใช้ ⇒ บอกให้ครบ ไม่ปล่อยช่องเปล่า */
          <p className={styles.hint}>
            ยังไม่มีบัญชีที่ถือตำแหน่งผู้ปรุงกลิ่น หรือดึงรายชื่อไม่สำเร็จ — ลองโหลดหน้าใหม่อีกครั้ง
          </p>
        ) : (
          <OptionTiles
            value={pick}
            onChange={setPick}
            options={options}
            disabled={saving}
            ariaLabel="ผู้ปรุงกลิ่น"
          />
        )}
        <small className={styles.hint}>
          {current
            ? `ตอนนี้เป็นของ ${current} — เปลี่ยนได้จนกว่ากลิ่นก้อนนี้จะถูกส่ง`
            : "ยังไม่มีใครรับผิดชอบกลิ่นก้อนนี้"}
        </small>
      </div>

      {/* บอกผลลัพธ์ตรง ๆ ไม่ใช่ถามว่าแน่ใจไหม — คนกดต้องรู้ว่าชื่อนี้จะไปโผล่ที่ไหนต่อ */}
      <p className={styles.hint}>
        {pick
          ? `กดยืนยันแล้ว ${nameOf(pick) || "คนที่เลือก"} จะเห็นกลิ่นก้อนนี้ในตารางงานของตัวเอง และชื่อนี้จะถูกบันทึกลงทะเบียนกลิ่นตอนส่งงาน`
          : "กดถอนแล้วกลิ่นก้อนนี้จะกลับไปอยู่กองกลางของฝ่าย"}
      </p>

      <div className="action-bar">
        <Button variant="quiet" disabled={saving} onClick={onClose}>ยกเลิก</Button>
        {/* ⚠️ ถอนการแจกเป็นปุ่มของตัวเอง ไม่ใช่ไทล์ "ยังไม่ระบุ" — มันคือการกระทำ
            ไม่ใช่ตัวเลือกของคำถาม "ใครปรุง" · และต้องกดได้เฉพาะตอนที่มีคนถืออยู่จริง */}
        {row.perfumer?.id ? (
          <Button variant="outline" tone="danger" disabled={saving} onClick={() => submit(null)}>
            ถอนการแจก
          </Button>
        ) : null}
        <Button tone="primary" disabled={saving || !pick || unchanged} onClick={() => submit(pick)}>
          แจกงาน
        </Button>
      </div>
    </Modal>
  );
}
