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
//   · ใช้กับพื้นที่นี้แล้ว (`file.usedHere === true` จาก view · ไม่มีคีย์ = ยังไม่ใช้) = ป้าย "ใช้แล้ว" บนการ์ด ปุ่มจาง
//     กดแล้วขึ้นเหตุเหนือปุ่ม ไม่คัดลอกอะไร (S2b แก้หลังตรวจจอ head-r3-35 — เดิมกดซ้ำได้ รูปเดียวกันซ้ำในภาพแบบเป็นรูปที่สอง)
//     ⏸️ **ยังไม่ทำงาน — มติเจ้าของ 26/10: ตัดไว้ก่อน (ไม่มี migration)** — ไฟล์ที่คัดลอกไม่เก็บอ้างอิงถึงไฟล์ต้นทาง ⇒ ไม่มี view ไหนตั้ง
//       `usedHere` (ไม่มีคีย์ = ยังไม่ใช้ ⇒ ป้ายไม่มีทางขึ้น) · ฝั่งนี้คงไว้เงียบ ๆ ให้ต่อสายได้เมื่อมีคอลัมน์ (docs/site-survey-request-plan.md §16.5)
// 🔴 **อ่านไม่สำเร็จ ≠ ไม่มีไฟล์** — `view.unknown` ขึ้นกล่องเตือนพร้อมไฟล์เท่าที่อ่านได้ · `view.empty` ขึ้นเฉพาะตอนอ่านครบแล้วไม่มีจริง
// ⚠️ **ไม่มีของที่กดได้บนหัวการ์ด** — หัวของ `CollapsibleCard` เป็นปุ่มทั้งแถว (ปุ่มซ้อนปุ่ม = กดโดนกันเองบนจอสัมผัส)
//   ⇒ ปุ่มใช้รูป · ภาพย่อ · ลิงก์ อยู่ในเนื้อทั้งหมด · บรรทัดคำใบ้ของหัว (`summary`) โชว์เฉพาะตอนพับตามสัญญาของการ์ด
//   จึงพิมพ์ซ้ำเป็นบรรทัดแรกของเนื้อ — ตอนกางคือตอนที่มีรูปให้กดและมีปุ่มให้ถามว่า "จะแนบเข้าพื้นที่ไหน"
// ⭐ **พับได้ทุกที่วาง ทุกความกว้าง** (S2b แก้หลังตรวจจอ head-r3-31 · มติเจ้าของ) — เดิมโหมด `compact` เป็นบล็อกหัวธรรมดาที่พับไม่ได้
//   ⇒ มือถือต้องเลื่อนราวสองจอกว่าจะถึงรายการพื้นที่ · เปิดหรือพับตอนแรกเป็นของหน้า (`defaultOpen` — รู้บทบาท · ขนาดจอ · จำนวนไฟล์)
import { useId, useState } from "react";
import { Check, CircleAlert, CornerDownRight, Download, ExternalLink, Paperclip, ZoomIn } from "lucide-react";
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
/* ปุ่มท้ายกล่องขยายรูป — คำเดียวกับตัวดูภาพแบบของหน้าพื้นที่ (`AttachmentsPanel` แผ่นรูป · S2b แก้หลังตรวจจอ planner-q12) */
const ORIGINAL = "เปิดไฟล์ต้นฉบับ";
const COPYING = "กำลังคัดลอก…";
const UNREAD = "อ่านไฟล์จากฝ่ายขายไม่สำเร็จ — ลองโหลดหน้าใหม่";
/* รูปนี้เป็นภาพแบบของพื้นที่ที่เปิดอยู่แล้ว (head-r3-35) — ป้ายบนการ์ด · เหตุตอนกดปุ่มจางเป็นคำเดียวกับข้อความเด้งหลังคัดลอกสำเร็จ */
const USED_TAG = "ใช้แล้ว";
const USED_REASON = "ใช้รูปนี้เป็นภาพแบบแล้ว";

/* "JPG · 1.8 MB · Lalida · พ. 7 ต.ค." — ชิ้นที่ view ไม่มีถูกข้าม · ไม่มีสักชิ้น = ไม่มีบรรทัด
   ⭐ คืนเป็นชิ้น (ชนิด · ขนาด · คน · วัน) — แต่ละชิ้นเป็นก้อนที่ไม่หักกลาง จุดคั่นเกาะท้ายชิ้นก่อนหน้า
   🐞 UAT S2b S01 (1200 / 1024): บรรทัดนี้หักสามบรรทัด เดือนตกไปอยู่บรรทัดของตัวเอง ("พฤ. 8" / "ต.ค.") */
const metaParts = (file) => [file.typeText, ...String(file.metaText || "").split(" · ")].filter(Boolean);

/**
 * @param view        `surveySalesDrawingsView(...)` — `{ label, empty, unknown, countText, files }` · ไฟล์ที่มี `usedHere: true` = ใช้กับพื้นที่นี้แล้ว
 * @param zoneTitle   ชื่อพื้นที่ที่เปิดอยู่ (ปุ่มใช้รูปจะแนบเข้าพื้นที่นี้) · `null` = หน้ารายการ / คนที่แนบไม่ได้
 * @param busyKey     `file.key` ของไฟล์ที่กำลังคัดลอก — ปุ่มนั้นขึ้น "กำลังคัดลอก…" ปุ่มใช้รูปที่เหลือดับระหว่างรอ
 * @param onReuse     `(file) => void` · **ไม่ส่ง = ไม่มีปุ่มใช้รูปเลย** (แกลเลอรีอ่านอย่างเดียว)
 * @param compact     หน้าเดียว (<1000) — อยู่เหนือรายการ **และ** ในหน้าพื้นที่พร้อมกัน (รายการแค่ถูกซ่อนตอนเปิดพื้นที่ ไม่ถูกถอด)
 *                    ⇒ การ์ดแต่ละที่วางได้ id ของตัวเอง (id ซ้ำ = `aria-controls` ของหัวชี้ผิดกล่อง) · หัวพับได้แบบเดียวกับการ์ดเต็มบาน
 * @param defaultOpen กางไว้ตอนวาดครั้งแรกไหม (ค่าตั้งต้น `true` = ผู้เรียกเดิมได้ของเดิม) — **อ่านครั้งเดียวตอนเกิด** หลังจากนั้นเป็นของผู้ใช้:
 *                    ระบบไม่กางคืนเองเมื่อเปลี่ยนพื้นที่หรือจำนวนไฟล์เปลี่ยน (มติเจ้าของ head-r3-31)
 * @param onOpenChange `(open) => void` ไม่บังคับ — บอกหน้าว่าผู้ใช้กาง/พับ ให้หน้าจำข้ามการถอดใส่ใหม่ได้
 *                    (ในหน้าพื้นที่ แผงเกิดใหม่ทุกพื้นที่ · head-r3-31 "หลังจากนั้นผู้ใช้กดพับหรือเปิดเอง")
 */
export default function SurveySalesDrawings({
  view, zoneTitle = null, busyKey = null, onReuse, compact = false, defaultOpen = true, onOpenChange,
}) {
  const [open, setOpen] = useState(defaultOpen);
  /* รูปที่กำลังขยาย — `null` = ปิด · เก็บทั้งไฟล์ (ชื่อบนหัวกล่อง + ที่อยู่ของปุ่มเปิดไฟล์ต้นฉบับ) */
  const [zoom, setZoom] = useState(null);
  /* `file.key` ของไฟล์ที่ใช้แล้วซึ่งถูกกดปุ่มจาง — เหตุขึ้นเหนือปุ่มของไฟล์นั้น (head-r3-35 · บอกเหตุตอนกด) */
  const [told, setTold] = useState(null);
  const instanceId = useId();
  const reasonBase = useId();
  if (!view) return null;

  const files = view.files || [];
  const canReuse = typeof onReuse === "function";
  /* ปุ่มใช้รูปมีจริงอย่างน้อยหนึ่งไฟล์ = ต้องบอกว่ารูปจะไปลงพื้นที่ไหน · ไม่มีปุ่ม = ไม่มีบรรทัดนี้ */
  const target = canReuse && zoneTitle && files.some((file) => file.reuse) ? `พื้นที่ที่เปิดอยู่: ${zoneTitle}` : null;
  /* หน้าเดียวมีแผงสองใบพร้อมกัน (เหนือรายการที่ถูกซ่อน + ในหน้าพื้นที่) ⇒ id ของตัวเอง · ตัดอักขระพิเศษของ useId ทิ้ง */
  const cardId = compact ? `${CARD_ID}-${instanceId.replace(/[^\w-]/g, "")}` : CARD_ID;

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
            /* ใช้กับพื้นที่นี้แล้ว — มีความหมายเฉพาะการ์ดที่มีปุ่มใช้รูป (แกลเลอรีอ่านอย่างเดียวไม่มีป้าย) · ไฟล์ที่ติดด่านไม่มีทางถูกใช้ */
            const used = !!reuse && !blocked && file.usedHere === true;
            /* ปุ่มจางที่ยังถือโฟกัส (ติดด่าน · ใช้แล้ว) — ไม่ดับจริงระหว่างคัดลอกไฟล์อื่น เพราะกดแล้วไม่ยิงอะไรอยู่แล้ว */
            const held = blocked || used;
            const showUsed = used && told === file.key;
            const reasonId = `${reasonBase}-${index}`;
            const meta = metaParts(file);
            return (
              <li key={file.key} className={styles.file}>
                {file.image ? (
                  <button type="button" className={styles.media} onClick={() => setZoom(file)}
                    aria-label={`ดูรูป ${file.name}`}>
                    {/* รูปที่เปิดไม่ได้ใช้คำตั้งต้นของ PhotoThumb ("เปิดรูปไม่ได้") — คำเดียวกับกล่องขยาย (S2b แก้หลังตรวจจอ head-rc-r2-6) */}
                    <PhotoThumb src={file.href} alt="" className={styles.thumbImg} />
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
                  {file.sourceLabel || used ? (
                    <span className={styles.tags}>
                      {file.sourceLabel ? <Tag label={file.sourceLabel} className={styles.source} /> : null}
                      {used ? <Tag tone="success" icon={Check} label={USED_TAG} /> : null}
                    </span>
                  ) : null}
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
                    {/* ใช้แล้ว = ป้ายบอกอยู่แล้ว · เหตุขึ้นเมื่อกดปุ่มจาง (บอกเหตุตอนกด) และประกาศให้โปรแกรมอ่านจอ */}
                    {showUsed ? (
                      <p id={reasonId} className={styles.blocked} role="status">
                        <CircleAlert size={14} aria-hidden="true" />
                        <span>{thaiText(USED_REASON)}</span>
                      </p>
                    ) : null}
                    <Button
                      variant="outline"
                      className={styles.reuseBtn}
                      icon={<CornerDownRight size={15} aria-hidden="true" />}
                      /* ปุ่มที่ติดด่าน · ใช้แล้ว · กำลังคัดลอก ยังถือโฟกัส (`aria-disabled`) — ใช้แล้ว = กดแล้วบอกเหตุ ไม่คัดลอก ·
                         ปุ่มใช้รูปของไฟล์อื่นดับจริงระหว่างรอ — คัดลอกทีละไฟล์ */
                      aria-disabled={held || copying ? "true" : undefined}
                      aria-describedby={blocked || showUsed ? reasonId : undefined}
                      aria-busy={copying || undefined}
                      disabled={!held && !copying && !!busyKey}
                      onClick={used ? () => setTold(file.key) : blocked || copying ? undefined : () => onReuse(file)}
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
      {/* ขยายรูปในหน้า — ไม่เปิดแท็บใหม่ (หัวหน้าเทียบแบบกับช่องที่กำลังกรอก) · Esc ปิด
          ⭐ หน้าตาและการปิดเหมือนตัวดูภาพแบบของหน้าพื้นที่ (S2b แก้หลังตรวจจอ planner-q12 — หน้าเดียวเคยมีตัวดูรูปสองแบบ):
             ปุ่มปิดขนาดนิ้ว 44px (`styles.zoomModal`) · กดฉากหลังปิดได้ · ปุ่ม "เปิดไฟล์ต้นฉบับ" ที่แถบท้าย แทนลิงก์เล็กใต้รูป
             รูปที่เบราว์เซอร์วาดไม่ได้ (TIFF) ยังเปิดไฟล์จริงได้จากปุ่มนี้ · "เปิดในแท็บใหม่" เหลือเฉพาะการ์ด PDF */}
      <Modal
        open={!!zoom}
        onClose={() => setZoom(null)}
        title={zoom?.name || view.label}
        size="lg"
        closeOnOverlay
        className={styles.zoomModal}
        footer={zoom ? (
          <Button
            as="a" href={zoom.href} target="_blank" rel="noreferrer"
            className={styles.zoomBtn} icon={<Download size={16} aria-hidden="true" />}
          >
            {ORIGINAL}
          </Button>
        ) : undefined}
      >
        {zoom ? (
          <div className={styles.zoomFrame}>
            <PhotoThumb src={zoom.href} alt={zoom.name} loading="eager" className={styles.zoomImg} />
          </div>
        ) : null}
      </Modal>
    </>
  );

  return (
    <CollapsibleCard
      id={cardId}
      open={open}
      onToggle={() => { const next = !open; setOpen(next); onOpenChange?.(next); }}
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
