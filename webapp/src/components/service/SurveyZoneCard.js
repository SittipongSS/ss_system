"use client";
// ── การ์ดพื้นที่หนึ่งใบบนจอบันทึกหน้างาน (เฟส 3 · จอ 06) ─────────────────
//
// ⭐ **ช่างยืนหน้างาน ถือมือถือ อีกมือถือตลับเมตร** ⇒ ต่อพื้นที่จึงมีของแค่สองอย่าง:
//   **ตัวเลขสามช่อง** กับ **รูปสามหัวข้อ** · เรื่องแพ็คเกจไม่อยู่จอนี้ เพราะเป็นงาน
//   ที่ทำที่โต๊ะหลังกลับ (มติผู้ใช้ 2026-08-29)
//
// ⭐ **หนึ่งพื้นที่วัดได้หลายส่วน** — พื้นที่จริงไม่ใช่กล่องสี่เหลี่ยม รูปตัว L แบ่งสองก้อน
//   แล้วบวกกัน · และ **แต่ละส่วนมีความสูงของตัวเอง** (โถงกลาง 6.5 ม. ทางเดินข้าง 2.6 ม.
//   ต่างจากคิดสูงเดียวทั้งพื้นที่ถึง 11%)
//
// ⚠️ **เมตรอย่างเดียว ไม่มีดรอปดาวน์เลือกหน่วย** — หน่วยที่เลือกได้คือหน่วยที่กรอกผิดได้
//   (ชีตเก่ามีทั้ง "500 ML" กับ "2 KG" ปนกันมาแล้ว)
import { useMemo, useState } from "react";
import { Camera, Check, Plus, Scissors, Trash2, Undo2 } from "lucide-react";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import {
  SURVEY_DOC_PLAN, SURVEY_DOC_SPOT, SURVEY_DOC_WIDE,
  surveyDocCounts, surveyFieldMissing, surveyZoneSize, suggestedPackages,
} from "@/lib/service/survey";
import { fmtNumber, naText } from "@/lib/format";
import styles from "./SurveyZoneCard.module.css";

const emptyPart = () => ({ id: `new-${Math.random().toString(36).slice(2, 9)}`, label: "", widthM: "", lengthM: "", heightM: "" });
const emptySpot = () => ({ id: `new-${Math.random().toString(36).slice(2, 9)}`, label: "", note: "" });

export default function SurveyZoneCard({ zone, files = [], canWrite = false, busy = false, onSave }) {
  const [parts, setParts] = useState(() => (Array.isArray(zone.parts) && zone.parts.length ? zone.parts : [emptyPart()]));
  const [spots, setSpots] = useState(() => (Array.isArray(zone.spots) ? zone.spots : []));
  const [note, setNote] = useState(zone.note || "");
  const [cutting, setCutting] = useState(false);
  const [cutReason, setCutReason] = useState(zone.cutReason || "");
  const [error, setError] = useState("");

  const isCut = zone.status === "cut";
  const size = useMemo(() => surveyZoneSize(parts), [parts]);
  const packages = suggestedPackages(size.volumeCbm);
  const docs = surveyDocCounts(files);
  /* เช็คลิสต์อ่านจาก **ค่าที่บันทึกแล้ว** ไม่ใช่ค่าที่กำลังพิมพ์ — ไม่งั้นมันจะเขียวตั้งแต่
     ยังไม่กดบันทึก แล้วช่างเดินออกจากหน้างานโดยเชื่อว่าเสร็จแล้ว */
  const missing = surveyFieldMissing(zone, files);

  const patchPart = (id, field, value) => setParts((rows) => rows.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  const patchSpot = (id, field, value) => setSpots((rows) => rows.map((s) => (s.id === id ? { ...s, [field]: value } : s)));

  const save = async (extra = {}) => {
    setError("");
    try {
      await onSave({ parts, spots, note, ...extra });
      setCutting(false);
    } catch (e) {
      setError(e.message || "บันทึกไม่สำเร็จ");
    }
  };

  return (
    <section className={styles.card} data-cut={isCut ? "1" : undefined}>
      <header className={styles.head}>
        <div className={styles.title}>
          <b>{zone.zoneName}</b>
          {zone.floor ? <span className={styles.sub}>ชั้น {zone.floor}</span> : null}
        </div>
        {/* ป้ายบอกสภาพของพื้นที่นี้ — ไม่ใช่ของทั้งใบ */}
        {isCut
          ? <span className={styles.cutBadge}>ตัดออก</span>
          : missing.length === 0
            ? <span className={styles.doneBadge}><Check size={13} aria-hidden="true" /> วัดแล้ว</span>
            : <span className={styles.todoBadge}>ยังไม่ครบ</span>}
      </header>

      {isCut ? (
        <>
          <p className={styles.cutNote}>ตัดออกจากใบนี้ — {naText(zone.cutReason)}</p>
          {canWrite && (
            <Button size="sm" icon={<Undo2 size={14} aria-hidden="true" />} disabled={busy}
              onClick={() => save({ status: "ok" })}>
              เอากลับเข้าใบ
            </Button>
          )}
        </>
      ) : (
        <>
          {/* ── ขนาด ─────────────────────────────────────────────────── */}
          <div className={styles.block}>
            <div className={styles.blockHead}>
              <span>ขนาด</span>
              <em className={styles.req}>บังคับ</em>
            </div>
            {parts.map((part, i) => (
              <div key={part.id} className={styles.part}>
                <div className={styles.partNo}>{i + 1}</div>
                <div className={styles.partBody}>
                  <Input
                    value={part.label || ""} disabled={!canWrite}
                    onChange={(e) => patchPart(part.id, "label", e.target.value)}
                    placeholder="ชื่อส่วน (ไม่บังคับ) — เช่น ปีกทิศเหนือ" maxLength={60} autoComplete="off"
                  />
                  <div className={styles.dims}>
                    {[["widthM", "กว้าง"], ["lengthM", "ยาว"], ["heightM", "สูง"]].map(([field, label]) => (
                      <label key={field} className={styles.dim}>
                        <span>{label}</span>
                        <Input
                          type="number" inputMode="decimal" min="0" step="0.01" disabled={!canWrite}
                          value={part[field] ?? ""} onChange={(e) => patchPart(part.id, field, e.target.value)}
                        />
                        <small>ม.</small>
                      </label>
                    ))}
                  </div>
                </div>
                {canWrite && parts.length > 1 && (
                  <button type="button" className={styles.iconBtn} aria-label={`ลบส่วนที่ ${i + 1}`}
                    onClick={() => setParts((rows) => rows.filter((p) => p.id !== part.id))}>
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
            {canWrite && (
              <Button size="sm" variant="outline" icon={<Plus size={14} aria-hidden="true" />}
                onClick={() => setParts((rows) => [...rows, emptyPart()])}>
                เพิ่มส่วน
              </Button>
            )}
            {/* 🔴 ปัดเศษครั้งเดียวที่ระดับพื้นที่ ไม่ใช่รายส่วน — สองส่วนส่วนละ 100 ลบ.ม.
                = 1 แพ็คเกจ ไม่ใช่ 2 (`suggestedPackages` รับปริมาตรรวมมาแล้ว) */}
            <div className={styles.sum}>
              <span>รวม {parts.length} ส่วน</span>
              <b>{fmtNumber(size.areaSqm)}</b><small>ตร.ม.</small>
              <b>{fmtNumber(size.volumeCbm)}</b><small>ลบ.ม.</small>
              {packages ? <span className={styles.pkg}>→ สูตรได้ {packages} แพ็คเกจ</span> : null}
            </div>
            {/* ⚠️ ระบบตรวจส่วนที่วัดทับกันไม่ได้ — คนวัดต้องแบ่งให้ไม่ทับ */}
            <p className={styles.warn}>แบ่งให้ไม่ทับกัน — มุมที่สองส่วนชนกันนับครั้งเดียว ระบบตรวจให้ไม่ได้</p>
          </div>

          {/* ── รูปสามหัวข้อ ─────────────────────────────────────────── */}
          <div className={styles.block}>
            <div className={styles.blockHead}>
              <span>ภาพกว้าง</span>
              <em className={styles.req}>บังคับ</em>
              <small>{docs.wide} รูป</small>
            </div>
            <AttachmentsPanel
              entityType="service_survey_zone" entityId={zone.id} canEdit={canWrite}
              title="" inlineUpload docTypes={[{ key: SURVEY_DOC_WIDE, label: "ภาพกว้าง" }]}
            />
          </div>

          <div className={styles.block}>
            <div className={styles.blockHead}>
              <span>ภาพผัง</span>
              <em className={styles.opt}>ยังไม่ต้องมีตอนนี้</em>
              <small>{docs.plan} รูป</small>
            </div>
            {/* ⭐ ผังไม่บล็อกที่นี่ — ช่างไม่ได้ถือผังไปด้วย · ผังมาจากฝ่ายอาคารหรือไฟล์ที่
                SA แนบมา ขอแล้วอาจได้วันรุ่งขึ้น ⇒ ด่านผังอยู่ที่ปุ่มส่งผลของหัวหน้า */}
            <p className={styles.hint}>
              ไม่มีติดตัวก็ข้ามได้ — แต่หัวหน้าต้องมีผังก่อนกดส่งผล และต้องเป็น
              <strong> ผังที่มาร์กจุดแล้ว</strong> ไม่ใช่ผังเปล่าที่ฝ่ายขายแนบมา
            </p>
            <AttachmentsPanel
              entityType="service_survey_zone" entityId={zone.id} canEdit={canWrite}
              title="" inlineUpload docTypes={[{ key: SURVEY_DOC_PLAN, label: "ภาพผัง" }]}
            />
          </div>

          {/* ── จุดที่ติดตั้งได้ ──────────────────────────────────────── */}
          <div className={styles.block}>
            <div className={styles.blockHead}>
              <span>จุดที่ติดตั้งได้</span>
              <em className={styles.req}>บังคับ</em>
              <small>{spots.length} จุด · {docs.spot} รูป</small>
            </div>
            {spots.map((spot, i) => (
              <div key={spot.id} className={styles.spot}>
                <div className={styles.partNo}>{i + 1}</div>
                <div className={styles.partBody}>
                  <Input
                    value={spot.label || ""} disabled={!canWrite}
                    onChange={(e) => patchSpot(spot.id, "label", e.target.value)}
                    placeholder="ชื่อจุด — เช่น เสาต้นที่ 3 ฝั่งลิฟต์" maxLength={100} autoComplete="off"
                  />
                  <Input
                    value={spot.note || ""} disabled={!canWrite}
                    onChange={(e) => patchSpot(spot.id, "note", e.target.value)}
                    placeholder="บันทึก (ไม่บังคับ) — เช่น ปลั๊กอยู่ใต้เสา" maxLength={300} autoComplete="off"
                  />
                </div>
                {canWrite && (
                  <button type="button" className={styles.iconBtn} aria-label={`ลบจุดที่ ${i + 1}`}
                    onClick={() => setSpots((rows) => rows.filter((s) => s.id !== spot.id))}>
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
            {canWrite && (
              <Button size="sm" variant="outline" icon={<Plus size={14} aria-hidden="true" />}
                onClick={() => setSpots((rows) => [...rows, emptySpot()])}>
                เพิ่มจุดที่ติดตั้งได้
              </Button>
            )}
            {/* 🔴 ช่างแจ้ง "ติดตั้งได้ตรงไหนบ้าง" ไม่ใช่ "จะติดตั้งตรงไหน" — คนเลือกจุดจริง
                คือหัวหน้า TS ที่จอส่งผล โครงเดียวกับจำนวนแพ็คเกจเป๊ะ */}
            <p className={styles.hint}>
              แจ้งมาให้ครบทุกจุดที่ทำได้ — หัวหน้าเป็นคนเลือกว่าจะติดตั้งจริงกี่จุด ·
              <strong> อย่างน้อย 1 จุดต่อพื้นที่ ไม่งั้นส่งงานไม่ได้</strong>
            </p>
            <div className={styles.spotFiles}>
              <div className={styles.blockHead}><Camera size={14} aria-hidden="true" /><span>รูปของจุดติดตั้ง</span></div>
              {/* ⚠️ รูปผูกกับ **พื้นที่** ไม่ใช่กับจุดรายตัว — จุดต้องมีตัวตนแม้ยังไม่มีรูป
                  (ถ้าจุด = รูปที่มีป้ายชื่อ จุดที่ยังไม่ได้ถ่ายจะไม่มีอยู่ในระบบ
                   แล้วช่างไม่มีทางรู้ว่าเหลือถ่ายอะไร) */}
              <AttachmentsPanel
                entityType="service_survey_zone" entityId={zone.id} canEdit={canWrite}
                title="" inlineUpload docTypes={[{ key: SURVEY_DOC_SPOT, label: "ภาพจุดติดตั้ง" }]}
              />
            </div>
          </div>

          <label className="form-field">
            <span>บันทึกหน้างาน</span>
            <Textarea value={note} disabled={!canWrite} rows={2} maxLength={1000}
              onChange={(e) => setNote(e.target.value)} />
          </label>
        </>
      )}

      {error && <p className={styles.error} role="alert">{error}</p>}

      {/* เช็คลิสต์ของพื้นที่นี้ — เหตุผลเป็นตัวหนังสือ ไม่ใช่ปุ่มจางเงียบ */}
      {!isCut && missing.length > 0 && (
        <ul className={styles.missing}>{missing.map((m) => <li key={m}>{m}</li>)}</ul>
      )}

      {canWrite && !isCut && (
        <div className={styles.actions}>
          <Button tone="primary" disabled={busy} onClick={() => save()}>
            {busy ? "กำลังบันทึก…" : "บันทึกพื้นที่นี้"}
          </Button>
          {cutting ? (
            <div className={styles.cutBox}>
              {/* ⚠️ ตัดพื้นที่ออกต้องบอกเหตุผลเสมอ — ของที่หายไปจากสิ่งที่ SA จะเสนอราคา
                  คือของที่ลูกค้าจะถาม และ SA ไม่ได้ไปหน้างาน */}
              <Input value={cutReason} onChange={(e) => setCutReason(e.target.value)}
                placeholder="ตัดออกเพราะอะไร (อย่างน้อย 5 ตัวอักษร)" maxLength={500} autoComplete="off" />
              <Button size="sm" tone="danger" disabled={busy || cutReason.trim().length < 5}
                onClick={() => save({ status: "cut", cutReason })}>
                ยืนยันตัดออก
              </Button>
              <Button size="sm" onClick={() => setCutting(false)}>ยกเลิก</Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" icon={<Scissors size={14} aria-hidden="true" />}
              onClick={() => setCutting(true)}>
              ตัดพื้นที่นี้ออก
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
