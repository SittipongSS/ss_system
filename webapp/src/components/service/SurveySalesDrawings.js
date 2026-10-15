"use client";
// ── แผง "แบบจากฝ่ายขาย" ของใบประเมินพื้นที่ (ประเมินจากแบบ · งวด S2b §3 B-3 · บอร์ด B1) ─────────────────────────
//
// ⭐ **หัวหน้าประเมินจากแบบ = ต้องเห็นแบบที่ฝ่ายขายส่งมาข้างช่องที่กำลังกรอก** — ทุกไฟล์ของคำร้องและของเธรดอยู่ที่เดียว:
//   รูป = ภาพย่อ กดแล้วขยายในหน้า (ค่าที่พิมพ์ค้างอยู่ที่เดิม) · ไฟล์อื่น (PDF ฯลฯ) = แผ่นลิงก์ เปิดแท็บใหม่
//   ปุ่ม "ใช้รูปนี้เป็นภาพแบบของพื้นที่นี้" คัดลอกรูปของฝ่ายขายไปเป็นภาพแบบของพื้นที่ที่เปิดอยู่ (มติเจ้าของ §10 ข้อ 6)
// 🔑 **วาดอย่างเดียว** — คำ ลำดับ และ "ไฟล์ไหนใช้ได้" มาจาก `surveySalesDrawingsView` ทั้งหมด · ไฟล์นี้ไม่รู้ว่าใครดู:
//   · ปุ่มใช้รูปขึ้นเมื่อ **ทั้ง** view ให้ `file.reuse` **และ** ผู้เรียกส่ง `onReuse` — ขาดข้างใดข้างหนึ่ง = ไม่มีปุ่ม ไม่มีเหตุ ไม่มีบรรทัด
//     "พื้นที่ที่เปิดอยู่" (ผู้วางคิว · หน้ารายการที่ยังไม่ได้เปิดพื้นที่ = แกลเลอรีอ่านอย่างเดียวทุกความกว้าง · มติ O4)
//   · ใช้ไม่ได้ (`reuse.enabled === false` — PDF · TIFF · เอกสาร Google) = ปุ่มยังอยู่ จาง กดไม่ได้ และ **เหตุเป็นตัวหนังสือเหนือปุ่ม**
//     (ติดด่านข้อมูล = โชว์แล้วบอกเหตุ · ไม่ใช่ tooltip ที่จอสัมผัสเปิดไม่ได้)
// 🔴 **อ่านไม่สำเร็จ ≠ ไม่มีไฟล์** — `view.unknown` ขึ้นกล่องเตือนพร้อมไฟล์เท่าที่อ่านได้ · `view.empty` ขึ้นเฉพาะตอนอ่านครบแล้วไม่มีจริง
// ⚠️ **ไม่มีของที่กดได้บนหัวการ์ด** — หัวของ `CollapsibleCard` เป็นปุ่มทั้งแถว (ปุ่มซ้อนปุ่ม = กดโดนกันเองบนจอสัมผัส)
//   ⇒ ปุ่มใช้รูป · ภาพย่อ · ลิงก์ อยู่ในเนื้อทั้งหมด · บรรทัดคำใบ้ของหัว (`summary`) โชว์เฉพาะตอนพับตามสัญญาของการ์ด
//   จึงพิมพ์ซ้ำเป็นบรรทัดแรกของเนื้อ — ตอนกางคือตอนที่มีรูปให้กดและมีปุ่มให้ถามว่า "จะแนบเข้าพื้นที่ไหน"
import { useId, useState } from "react";
import { CircleAlert, CornerDownRight, ExternalLink, Paperclip, ZoomIn } from "lucide-react";
import Modal from "@/components/Modal";
import thaiText from "@/components/ThaiText";
import Button from "@/components/ui/Button";
import CollapsibleCard from "@/components/ui/CollapsibleCard";
import PhotoThumb from "@/components/ui/PhotoThumb";
import StatusNotice from "@/components/ui/StatusNotice";
import Tag from "@/components/ui/Tag";
import styles from "./SurveySalesDrawings.module.css";

const CARD_ID = "survey-sales-drawings";
const HOW_TO = "กดรูปเพื่อขยาย · PDF เปิดในแท็บใหม่";
const NEW_TAB = "เปิดในแท็บใหม่";
const COPYING = "กำลังคัดลอก…";
const UNREAD = "อ่านไฟล์จากฝ่ายขายไม่สำเร็จ — ลองโหลดหน้าใหม่";

/* "JPG · 1.8 MB · Lalida · พ. 7 ต.ค." — ชิ้นที่ view ไม่มีถูกข้าม · ไม่มีสักชิ้น = ไม่มีบรรทัด
   ⭐ คืนเป็นชิ้น (ชนิด · ขนาด · คน · วัน) — แต่ละชิ้นเป็นก้อนที่ไม่หักกลาง จุดคั่นเกาะท้ายชิ้นก่อนหน้า
   🐞 UAT S2b S01 (1200 / 1024): บรรทัดนี้หักสามบรรทัด เดือนตกไปอยู่บรรทัดของตัวเอง ("พฤ. 8" / "ต.ค.") */
const metaParts = (file) => [file.typeText, ...String(file.metaText || "").split(" · ")].filter(Boolean);

/**
 * @param view      `surveySalesDrawingsView(...)` — `{ label, empty, unknown, countText, files }`
 * @param zoneTitle ชื่อพื้นที่ที่เปิดอยู่ (ปุ่มใช้รูปจะแนบเข้าพื้นที่นี้) · `null` = หน้ารายการ / คนที่แนบไม่ได้
 * @param busyKey   `file.key` ของไฟล์ที่กำลังคัดลอก — ปุ่มนั้นขึ้น "กำลังคัดลอก…" ปุ่มใช้รูปที่เหลือดับระหว่างรอ
 * @param onReuse   `(file) => void` · **ไม่ส่ง = ไม่มีปุ่มใช้รูปเลย** (แกลเลอรีอ่านอย่างเดียว)
 * @param compact   อยู่ในหน้าพื้นที่ / เหนือรายการบนจอแคบ — บล็อกมีหัวธรรมดา ไม่พับ (การ์ดซ้อนการ์ดพับได้ = พับสองชั้น)
 */
export default function SurveySalesDrawings({
  view, zoneTitle = null, busyKey = null, onReuse, compact = false,
}) {
  const [open, setOpen] = useState(true);
  /* รูปที่กำลังขยาย — `null` = ปิด · เก็บทั้งไฟล์ (ชื่อบนหัวกล่อง + ที่อยู่ของลิงก์สำรอง) */
  const [zoom, setZoom] = useState(null);
  const titleId = useId();
  const reasonBase = useId();
  if (!view) return null;

  const files = view.files || [];
  const canReuse = typeof onReuse === "function";
  /* ปุ่มใช้รูปมีจริงอย่างน้อยหนึ่งไฟล์ = ต้องบอกว่ารูปจะไปลงพื้นที่ไหน · ไม่มีปุ่ม = ไม่มีบรรทัดนี้ */
  const target = canReuse && zoneTitle && files.some((file) => file.reuse) ? `พื้นที่ที่เปิดอยู่: ${zoneTitle}` : null;

  const lead = files.length ? (
    <p className={styles.lead}>
      <span>{HOW_TO}</span>
      {target ? <span className={styles.target}>{target}</span> : null}
    </p>
  ) : null;

  const body = (
    <>
      {lead}
      {view.unknown ? (
        <StatusNotice tone="warning">{UNREAD}</StatusNotice>
      ) : view.empty ? (
        <p className={styles.empty}>{thaiText(view.empty)}</p>
      ) : null}
      {files.length ? (
        <ul className={styles.grid}>
          {files.map((file, index) => {
            const reuse = canReuse ? file.reuse : null;
            const copying = busyKey === file.key;
            const blocked = !!reuse && reuse.enabled === false;
            const reasonId = `${reasonBase}-${index}`;
            const meta = metaParts(file);
            return (
              <li key={file.key} className={styles.file}>
                {file.image ? (
                  <button type="button" className={styles.media} onClick={() => setZoom(file)}
                    aria-label={`ดูรูป ${file.name}`}>
                    <PhotoThumb src={file.href} alt="" label="เปิดไม่ได้" className={styles.thumbImg} />
                    <span className={styles.zoomMark} aria-hidden="true"><ZoomIn size={14} /></span>
                  </button>
                ) : (
                  <a className={styles.media} data-kind="doc" href={file.href} target="_blank" rel="noreferrer">
                    <Paperclip size={22} aria-hidden="true" />
                    <span className={styles.docOpen}>
                      <span>{NEW_TAB}</span>
                      <ExternalLink size={13} aria-hidden="true" />
                    </span>
                    <span className="sr-only">{file.name}</span>
                  </a>
                )}
                <div className={styles.info}>
                  <b className={styles.name}>{file.name}</b>
                  {meta.length ? (
                    <span className={styles.meta}>
                      {meta.map((part, at) => (
                        <span key={at}>
                          <span className={styles.metaPart}>{at < meta.length - 1 ? `${part}\u00a0·` : part}</span>
                          {at < meta.length - 1 ? " " : null}
                        </span>
                      ))}
                    </span>
                  ) : null}
                  {file.sourceLabel ? <Tag label={file.sourceLabel} className={styles.source} /> : null}
                </div>
                {reuse ? (
                  <div className={styles.reuse}>
                    {/* ติดด่านข้อมูล = ปุ่มยังอยู่ + เหตุเป็นตัวหนังสือ (จอสัมผัสไม่มี hover) · ปุ่มถือโฟกัสได้ แต่ไม่ยิงอะไร */}
                    {blocked ? (
                      <p id={reasonId} className={styles.blocked}>
                        <CircleAlert size={14} aria-hidden="true" />
                        <span>{thaiText(reuse.reason)}</span>
                      </p>
                    ) : null}
                    <Button
                      variant="outline"
                      className={styles.reuseBtn}
                      icon={<CornerDownRight size={15} aria-hidden="true" />}
                      /* ปุ่มที่ติดด่านและปุ่มที่กำลังคัดลอกยังถือโฟกัส (`aria-disabled`) แต่ไม่ยิงอะไร ·
                         ปุ่มใช้รูปของไฟล์อื่นดับจริงระหว่างรอ — คัดลอกทีละไฟล์ */
                      aria-disabled={blocked || copying ? "true" : undefined}
                      aria-describedby={blocked ? reasonId : undefined}
                      aria-busy={copying || undefined}
                      disabled={!blocked && !copying && !!busyKey}
                      onClick={blocked || copying ? undefined : () => onReuse(file)}
                    >
                      {copying ? COPYING : reuse.label}
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {/* ขยายรูปในหน้า — ไม่เปิดแท็บใหม่ (หัวหน้าเทียบแบบกับช่องที่กำลังกรอก) · Esc ปิด · รูปที่เบราว์เซอร์วาดไม่ได้ (TIFF) ยังมีลิงก์เปิดไฟล์จริง */}
      <Modal open={!!zoom} onClose={() => setZoom(null)} title={zoom?.name || view.label} size="lg">
        {zoom ? (
          <div className={styles.zoom}>
            <div className={styles.zoomFrame}>
              <PhotoThumb src={zoom.href} alt={zoom.name} loading="eager" className={styles.zoomImg} />
            </div>
            <a className={styles.zoomLink} href={zoom.href} target="_blank" rel="noreferrer">
              {NEW_TAB}
              <ExternalLink size={14} aria-hidden="true" />
            </a>
          </div>
        ) : null}
      </Modal>
    </>
  );

  if (compact) {
    return (
      <section className={styles.block} aria-labelledby={titleId}>
        <header className={styles.blockHead}>
          <h3 id={titleId} className={styles.blockTitle}>{view.label}</h3>
          {view.countText ? <Tag label={view.countText} /> : null}
        </header>
        {body}
      </section>
    );
  }

  return (
    <CollapsibleCard
      id={CARD_ID}
      open={open}
      onToggle={() => setOpen((value) => !value)}
      title={view.label}
      /* ⚠️ ทุกอย่างในช่องพวกนี้เรนเดอร์อยู่ในปุ่มหัว — ข้อความและป้ายเท่านั้น ห้ามมีลิงก์/ปุ่ม */
      summary={files.length ? (target ? `${HOW_TO} · ${target}` : HOW_TO) : null}
      badges={view.countText ? <Tag label={view.countText} /> : null}
      tone="info"
    >
      <div className={styles.cardBody}>{body}</div>
    </CollapsibleCard>
  );
}
