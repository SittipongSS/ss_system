"use client";
// ── กล่อง "ส่งงาน" ของนัดประเมินพื้นที่ (มติผู้ใช้ 2026-09-21 · รูปแบบ A §10.5 S8 · ม็อก A-4 · AT-4) ──────────
//
// ⭐ **แทนแผ่นปิดงานของงานบริการสำหรับนัดประเมิน** — ของที่ช่างต้องตอบตอนส่งมีสองอย่าง:
//   เข้าพื้นที่ได้ไหม และ (ถ้าได้) ผลวัดครบหรือยัง · ของที่ใช้ · ลายเซ็นลูกค้า · รูปหน้างาน
//   อีกชุด เป็นเรื่องของงานบริการ ไม่ใช่ของใบประเมิน (รูปอยู่รายพื้นที่แล้ว)
//
// ⭐ **เปลือกเดียวกับโมดัลจัดคิว** (`ScheduleModalShell layout="split"`) — ซ้าย: ผลของการเข้า (+ เหตุผลเข้าไม่ได้) ·
//   สรุปงานที่ทำ · ขวา: ผลวัดรายพื้นที่ + "กด ส่งงาน แล้วระบบจะ" · ท้าย: "กลับไปแก้ต่อ" · **ส่งงาน** + บรรทัดผลใต้ปุ่ม ·
//   มือถือเป็นแผ่นเต็มจอ (ม็อก A-4) · ≥1000 เป็นโมดัลกลางจอ (AT-4)
// 🔑 **วาดอย่างเดียว** — แถว · ยอดรวม · ผลที่จะเกิด · เหตุที่ส่งไม่ได้ มาจาก `surveySubmitView` (เทสต์ด้วยข้อมูลล้วน)
//   · ด่านของจริงคือ route ปิดนัด (`surveyFieldSubmitError` อ่านผลวัดจากฐาน ไม่ใช่จากจอ)
// 🔴 **ผลของการเข้าไม่มีค่าตั้งต้น** (pain B12 · กติกาฟอร์ม) — 🐞 เดิมเลือก "เข้าพื้นที่ได้" ไว้ให้ ⇒ ช่างที่เข้าไม่ได้
//   กดส่งผ่าน ๆ แล้วนัดปิดเป็น "เข้าแล้ว" · ค่าเริ่มมีทางเดียว: เปิดจากแถว "ไปแล้วเข้าไม่ได้" (`initialOutcome="unable"`)
// ⚠️ **ปุ่มส่งไม่จางเงียบ** — `GatedAction` ของเปลือก: กดได้เสมอ ติดด่านก็บอกเหตุ (กติกา UI ของระบบ · แผน §10 ข้อ 6)
// ⚠️ **แผ่นใช้ซ้ำทุกครั้งที่เปิด ⇒ ล้าง state ที่อยู่นอกฟอร์มทุกครั้ง** (บทเรียน #1690:
//   ชิป "ไปแล้วเข้าไม่ได้" ค้างข้ามใบแล้วปิดใบถัดไปด้วยเหตุผลของอีกงาน)
import { useEffect, useMemo, useState } from "react";
import {
  Archive, ArrowRight, BellRing, CalendarCheck2, Check, ChevronRight, CircleAlert, ClipboardCheck, MapPinPlus,
  MessageSquareText, Minus, Pencil, Send, Undo2,
} from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import OptionTiles from "@/components/ui/OptionTiles";
import Textarea from "@/components/ui/Textarea";
import { SURVEY_UNABLE_REASON_MIN, surveySubmitView } from "@/lib/service/surveyFieldView";
import { SURVEY_UNKNOWN_TEXT } from "@/lib/service/surveyControl";
import { naText } from "@/lib/format";
import ScheduleModalShell from "./ScheduleModalShell";
import styles from "./SurveySubmitDialog.module.css";

/* ไอคอนของบรรทัด "กด ส่งงาน แล้วระบบจะ" ตาม `key` ของตัวตัดสิน — ของวาด (ข้อไหนขึ้นมาจากตัวตัดสิน) */
const EFFECT_ICONS = {
  close: CalendarCheck2, notify: BellRing, edit: Pencil, next: ArrowRight,
  queue: Undo2, sales: MessageSquareText, kept: Archive,
};
const ROW_MARKS = { ok: Check, miss: CircleAlert, dirty: Pencil, cut: Minus };

/**
 * @param visit          นัดของใบ (ชื่อกล่อง · ชิปสถานะ · ช่วงเวลาที่จะปิด)
 * @param site           ไซต์ของใบ — บรรทัดบริบท "ST-… · ชื่อ"
 * @param zones          แถวผลวัดทุกแถวของใบ (รวมที่ตัดออก)
 * @param filesByZone    ไฟล์รายพื้นที่ชุดสด
 * @param dirtyZoneIds   พื้นที่ที่ยังมีค่าพิมพ์ค้างบนจอ — server มองไม่เห็น จอต้องกันเอง
 * @param viewerKind     `crew` | `senior` (หัวหน้าที่ออกหน้างานเอง) | `head` (ส่งแทนช่างจาก `?submit=1`)
 * @param nowKey         `'YYYY-MM-DD HH:MM'` เวลาไทย — เวลาจบที่ server จะประทับ ("(10:12–11:46)")
 * @param initialOutcome `null` | `'unable'` — เปิดจากแถว "ไปแล้วเข้าไม่ได้" เท่านั้นที่เลือกไว้ให้
 * @param onGoZone       (zoneId) => void — ปิดกล่องแล้วพาไปที่หน้าพื้นที่นั้น
 * @param onAddZone      () => void — ปิดกล่องแล้วเปิดฟอร์มเพิ่มพื้นที่ (ใบที่ยังไม่มีพื้นที่เลย)
 * @param onSubmit       ({ status, unableReason, summary }) => Promise — โยน error = ไม่สำเร็จ
 */
export default function SurveySubmitDialog({
  open, visit, site = null, zones = [], filesByZone = {}, dirtyZoneIds = [], viewerKind = "crew", nowKey = null,
  initialOutcome = null, onGoZone, onAddZone, onClose, onSubmit,
}) {
  const [outcome, setOutcome] = useState(initialOutcome ?? null);
  const [reason, setReason] = useState("");
  const [summary, setSummary] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  /* 🔴 **ล้างตอนเปิด/เปลี่ยนนัดเท่านั้น ไม่ใช่ทุกครั้งที่ `visit` เป็นก้อนใหม่** — หน้าโหลดซ้ำเอง
     ทุกครั้งที่กลับมามองแท็บ (`useRevalidateOnFocus`) และช่างสลับไปแอปกล้องแล้วกลับมาเป็นเรื่อง
     ปกติ ⇒ ผูกกับตัวก้อน = เหตุผล/สรุปที่พิมพ์ค้างหายทุกครั้งที่กลับมา */
  const visitId = visit?.id || null;
  const visitSummary = visit?.summary || "";
  useEffect(() => {
    if (!open) return;
    setOutcome(initialOutcome ?? null);
    setReason("");
    setSummary(visitSummary);
    setError("");
    setBusy(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- สรุปเดิม/ค่าเริ่มอ่านครั้งเดียวตอนเปิด (ดูหัวข้อ)
  }, [open, visitId]);

  const view = useMemo(() => surveySubmitView({
    outcome, reason, visit, zones, filesByZone, dirtyZoneIds, viewerKind, nowKey,
  }), [outcome, reason, visit, zones, filesByZone, dirtyZoneIds, viewerKind, nowKey]);

  const submit = async () => {
    if (busy || view.blocker) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit?.({
        status: outcome === "unable" ? "unable" : "done",
        unableReason: outcome === "unable" ? reason.trim() : undefined,
        summary: summary.trim(),
      });
    } catch (e) {
      setError(e?.message || "ส่งงานไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const unable = outcome === "unable";
  const noZones = view.rows.length === 0;

  /* ── ซ้าย: ผลของการเข้า (บังคับ · ไม่มีค่าตั้งต้น) + เหตุผลเมื่อเข้าไม่ได้ ── */
  const aside = (
    <section className={styles.block} aria-labelledby="survey-submit-outcome">
      <h3 id="survey-submit-outcome" className={styles.title}>
        ผลของการเข้าครั้งนี้ <span className={styles.req} aria-hidden="true">*</span>
        <span className={styles.caption}>เลือกหนึ่งข้อ</span>
      </h3>
      <div className={styles.outcomes}>
        <OptionTiles
          value={outcome}
          onChange={(next) => { setOutcome(next); setError(""); }}
          ariaLabel="ผลของการเข้าครั้งนี้"
          options={[
            /* ติดด่าน (ยังไม่กดเริ่มงาน) = แผ่นยังอยู่ พร้อมเหตุในแผ่น — ไม่ซ่อนตัวเลือก (กติกา ui-visibility) */
            { value: "entered", label: "เข้าพื้นที่ได้", description: view.enteredBlocker || "ปิดนัดเป็น “เข้าแล้ว”" },
            {
              value: "unable",
              label: "ไปแล้วเข้าไม่ได้",
              description: `ปิดนัดเป็น “ทำไม่ได้” · คำร้องกลับเข้าคิว · ฝ่ายขายได้รับเหตุผล (อย่างน้อย ${SURVEY_UNABLE_REASON_MIN} ตัวอักษร)`,
            },
          ]}
        />
      </div>
      {unable ? (
        <div className={styles.field}>
          <label className={styles.label} htmlFor="survey-unable-reason">เข้าไม่ได้เพราะอะไร</label>
          <Input
            id="survey-unable-reason"
            touch
            value={reason}
            maxLength={500}
            autoComplete="off"
            /* เปิดจากแถว "ไปแล้วเข้าไม่ได้" = ของที่ต้องพิมพ์ต่อคือเหตุผล */
            autoFocus={initialOutcome === "unable"}
            placeholder="เช่น อาคารไม่อนุญาตให้เข้าวันหยุด"
            invalid={!!reason && reason.trim().length < SURVEY_UNABLE_REASON_MIN}
            onChange={(e) => { setReason(e.target.value); setError(""); }}
          />
          <p className={styles.note}>ฝ่ายขายจะได้รับแจ้งพร้อมเหตุผลนี้ และใบจะกลับไปขั้นลงคิวให้ TS ลงวันใหม่</p>
        </div>
      ) : null}
    </section>
  );

  /* ── ขวา: ผลวัดรายพื้นที่ + ยอดรวม · กด ส่งงาน แล้วระบบจะ ── */
  const main = (
    <>
      <section className={styles.block} aria-labelledby="survey-submit-zones">
        <h3 id="survey-submit-zones" className={styles.title}>
          ผลวัดรายพื้นที่ <span className={styles.caption}>{view.progressText}</span>
        </h3>
        {noZones ? (
          <>
            <p className={styles.note}>ใบนี้ยังไม่มีพื้นที่ให้วัด</p>
            {/* ปุ่มทำงานได้จริงในกล่อง — ไม่ใช่ข้อความชี้ไปหาปุ่มที่อาจจมอยู่ใต้แถบบนจอแคบ */}
            {onAddZone ? (
              <Button variant="outline" className={styles.addZone} icon={<MapPinPlus size={15} aria-hidden="true" />}
                onClick={onAddZone}>
                เพิ่มพื้นที่ที่เจอหน้างาน
              </Button>
            ) : null}
          </>
        ) : (
          <div className={styles.sum}>
            <ul className={styles.rows}>
              {view.rows.map((row) => {
                const Mark = ROW_MARKS[row.state] || Check;
                return (
                  <li key={row.id}>
                    {/* แถวทั้งแถวพาไปที่หน้าพื้นที่ (ปิดกล่องก่อน) — แถวที่ยังขาด/ค้างบอกด้วยคำว่า "ไปแก้" */}
                    <button type="button" className={styles.row} data-state={row.state} onClick={() => onGoZone?.(row.id)}>
                      <span className={styles.mark} aria-hidden="true"><Mark size={14} /></span>
                      <span className={styles.zone}>
                        <span className={styles.code}>{row.codeUnknown ? SURVEY_UNKNOWN_TEXT : naText(row.code)}</span>
                        <span className={styles.name}>{row.title}</span>
                        {row.note ? <span className={styles.rowNote}>{row.note}</span> : null}
                      </span>
                      <span className={styles.figs}>
                        {row.figures ? <span>{row.figures}</span> : null}
                        {row.counts ? <small>{row.counts}</small> : null}
                      </span>
                      <span className={styles.go}>
                        {row.go ? "ไปแก้" : null}
                        <ChevronRight size={15} aria-hidden="true" />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className={styles.total}>
              <span className={styles.totalLabel}>{view.totalsText.label}</span>
              <span className={styles.figs}>
                <span>{view.totalsText.figures}</span>
                <small>{view.totalsText.counts}</small>
              </span>
            </p>
          </div>
        )}
      </section>

      <section className={styles.block} aria-labelledby="survey-submit-effects">
        <h3 id="survey-submit-effects" className={styles.title}>
          กด ส่งงาน แล้วระบบจะ <span className={styles.caption}>{view.effectsCaption}</span>
        </h3>
        <ul className={styles.effects}>
          {view.effects.map((effect) => {
            const Icon = EFFECT_ICONS[effect.key] || ClipboardCheck;
            return (
              <li key={effect.key}>
                <Icon size={15} className={styles.effectIcon} aria-hidden="true" />
                <span>{effect.text}</span>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );

  /* ── ซ้ายล่าง: สรุปงานที่ทำ (ไม่บังคับ) ── */
  const tail = (
    <div className={styles.field}>
      <label className={styles.title} htmlFor="survey-submit-summary">
        สรุปงานที่ทำ <span className={styles.caption}>ไม่บังคับ</span>
      </label>
      <Textarea
        id="survey-submit-summary"
        touch
        value={summary}
        rows={3}
        maxLength={2000}
        placeholder="เช่น ลูกค้าขอเพิ่มจุด รอคอนเฟิร์มกับฝ่ายขาย"
        onChange={(e) => setSummary(e.target.value)}
      />
    </div>
  );

  return (
    <ScheduleModalShell
      open={open}
      onClose={() => { if (!busy) onClose?.(); }}
      busy={busy}
      layout="split"
      title={view.title}
      status={view.statusLabel ? { label: view.statusLabel } : null}
      context={site ? { code: site.code || null, name: site.name || null } : null}
      aside={aside}
      main={main}
      tail={tail}
      secondary={[{ key: "back", label: "กลับไปแก้ต่อ", onClick: () => onClose?.() }]}
      primary={{
        label: "ส่งงาน",
        busyLabel: "กำลังส่ง…",
        icon: <Send size={16} aria-hidden="true" />,
        blocker: view.blocker,
        onClick: submit,
      }}
      outcome={view.outcome}
      error={error}
    />
  );
}
