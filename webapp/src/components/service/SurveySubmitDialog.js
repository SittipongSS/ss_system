"use client";
// ── โมดัล "ส่งงานหน้างาน" ของนัดประเมินพื้นที่ (มติผู้ใช้ 2026-09-21) ──────────
//
// ⭐ **แทนแผ่นปิดงานของงานบริการสำหรับนัดประเมิน** — ของที่ช่างต้องตอบตอนส่งมีสองอย่าง:
//   เข้าพื้นที่ได้ไหม และ (ถ้าได้) ผลวัดครบหรือยัง · ของที่ใช้ · ลายเซ็นลูกค้า · รูปหน้างาน
//   อีกชุด เป็นเรื่องของงานบริการ ไม่ใช่ของใบประเมิน (รูปอยู่รายพื้นที่แล้ว)
//
// 🔴 **ด่านตัวเดียวกับ server** (`surveyFieldSubmitError`) — จอบอกเหตุรายพื้นที่พร้อมปุ่ม
//   พาไป แต่คนตัดสินจริงคือ route ปิดนัด (อ่านผลวัดจากฐาน ไม่ใช่จากจอ)
// ⚠️ **ปุ่มส่งไม่จางเงียบ** — กดได้เสมอ ติดด่านก็บอกเหตุตรงนั้น (กติกา UI ของระบบ)
// ⚠️ **แผ่นใช้ซ้ำทุกครั้งที่เปิด ⇒ ล้าง state ที่อยู่นอกฟอร์มทุกครั้ง** (บทเรียน #1690:
//   ชิป "ไปแล้วเข้าไม่ได้" ค้างข้ามใบแล้วปิดใบถัดไปด้วยเหตุผลของอีกงาน)
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, CircleAlert, MapPinPlus, Pencil, Scissors } from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import ChoiceChips from "@/components/ui/ChoiceChips";
import Input from "@/components/ui/Input";
import StatusNotice from "@/components/ui/StatusNotice";
import Textarea from "@/components/ui/Textarea";
import { surveyFieldMissing, surveyFieldSubmitError } from "@/lib/service/survey";
import styles from "./SurveySubmitDialog.module.css";

const UNABLE_MIN = 10;
const zoneLabel = (row) => String(row?.zoneName || "").trim() || "พื้นที่ไม่มีชื่อ";

/**
 * @param zones         แถวผลวัดทุกแถวของใบ (รวมที่ตัดออก)
 * @param filesByZone   ไฟล์รายพื้นที่
 * @param dirtyZoneIds  พื้นที่ที่ยังมีค่าพิมพ์ค้างบนจอ — server มองไม่เห็น จอต้องกันเอง
 * @param onGoZone      (zoneId) => void — ปิดโมดัลแล้วพาไปที่การ์ดของพื้นที่นั้น
 * @param onSubmit      ({ status, unableReason, summary }) => Promise — โยน error = ไม่สำเร็จ
 * @param viewerKind    `crew` | `senior` (หัวหน้าที่ออกหน้างานเอง) | `head` (ส่งแทนช่างจาก `?submit=1`)
 *                      — บรรทัดบอกผลหลังส่งเปลี่ยนตามคนอ่าน (สามแบบ ไม่ใช่สอง: Senior คือคนเคาะต่อเอง)
 * @param onAddZone     () => void — ปิดโมดัลแล้วเปิดฟอร์มเพิ่มพื้นที่ (ใบที่ยังไม่มีพื้นที่เลย)
 */
export default function SurveySubmitDialog({
  open, visit, zones = [], filesByZone = {}, dirtyZoneIds = [], viewerKind = "crew",
  onGoZone, onAddZone, onClose, onSubmit,
}) {
  const [unable, setUnable] = useState(false);
  const [reason, setReason] = useState("");
  const [summary, setSummary] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  /* นับครั้งที่กดแล้วติด — ใช้เป็น `key` ของกล่องแจ้ง ⇒ กดซ้ำได้ข้อความเดิมก็ยัง mount ใหม่ และ
     `role="alert"` ถูกอ่านออกเสียงอีกรอบ (ไม่งั้นโปรแกรมอ่านหน้าจอเงียบตั้งแต่ครั้งที่สอง) */
  const [attempt, setAttempt] = useState(0);
  /* 🐞 **กดส่งแล้วเหมือนไม่มีอะไรเกิด** (ตรวจจอ 2026-09-22) — โมดัลสูงเกินจอเตี้ย (โน้ตบุ๊ก
     1366×768 · iPad แนวนอน) ตัวเนื้อเลื่อนได้ และกล่องแจ้งอยู่ท้ายสุดใต้ขอบที่มองเห็น ⇒ ต้อง
     เลื่อนกล่องขึ้นมาให้เห็นทุกครั้งที่มี error ใหม่ */
  const noticeRef = useRef(null);
  /* ⚠️ เลื่อนทุกครั้งที่กดแล้วติด **ไม่ใช่เฉพาะตอนข้อความเปลี่ยน** — กดซ้ำได้ข้อความเดิม (state
     ไม่เปลี่ยน = effect ไม่วิ่ง) ⇒ คนที่เลื่อนขึ้นไปอ่านรายการแล้วกดอีกรอบเจออาการเดิม "กดไม่ขึ้นอะไร" */
  const revealNotice = () => requestAnimationFrame(() => {
    noticeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });

  /* 🔴 **ล้างตอนเปิด/เปลี่ยนนัดเท่านั้น ไม่ใช่ทุกครั้งที่ `visit` เป็นก้อนใหม่** — หน้าโหลดซ้ำเอง
     ทุกครั้งที่กลับมามองแท็บ (`useRevalidateOnFocus`) และช่างสลับไปแอปกล้องแล้วกลับมาเป็นเรื่อง
     ปกติ ⇒ ผูกกับตัวก้อน = เหตุผล/สรุปที่พิมพ์ค้างหายทุกครั้งที่กลับมา */
  const visitId = visit?.id || null;
  const visitSummary = visit?.summary || "";
  useEffect(() => {
    if (!open) return;
    setUnable(false);
    setReason("");
    setSummary(visitSummary);
    setError("");
    setBusy(false);
    setAttempt(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- สรุปเดิมอ่านครั้งเดียวตอนเปิด (ดูหัวข้อ)
  }, [open, visitId]);

  /* แถวละพื้นที่: ครบ · ตัดออก · ขาดอะไร — ข้อความรายข้อมาจากด่านกลางตัวเดียวกับการ์ด */
  const rows = useMemo(() => (Array.isArray(zones) ? zones : []).map((row) => {
    const cut = (row.status || "ok") === "cut";
    const missing = cut ? [] : surveyFieldMissing(row, filesByZone?.[row.id] || []);
    return { id: row.id, name: zoneLabel(row), cut, missing, dirty: dirtyZoneIds.map(String).includes(String(row.id)) };
  }), [zones, filesByZone, dirtyZoneIds]);

  const gateError = surveyFieldSubmitError(zones, filesByZone);
  const dirtyNames = rows.filter((r) => r.dirty && !r.cut).map((r) => r.name);
  const missingCount = rows.filter((r) => r.missing.length).length;
  /* ⚠️ **ไม่ท่องรายการซ้ำใต้รายการ** — รายการพื้นที่ข้างบนบอกรายข้อพร้อมปุ่ม "ไปแก้" อยู่แล้ว
     ข้อความเต็มของ server (ข้อ · ชื่อพื้นที่) กินสามบรรทัดและดันโมดัลเกินจอ ⇒ บนจอเหลือ
     บรรทัดเดียว ส่วนข้อความเต็มยังขึ้นเมื่อ server ตีกลับ (ผู้เรียกโยนมา) */
  /* ⚠️ ชื่อปุ่มในวงเล็บห้ามขาดกลางคำ ("“ไป" / "แก้”" ที่ 390px) ⇒ ห่อ nowrap เป็นก้อน
     ⚠️ คำต้องตรงป้ายปุ่มเป๊ะ — "ตัดพื้นที่นี้ออก" คือป้ายบนการ์ดพื้นที่ */
  const buttonName = (label) => <span className={styles.keep}>“{label}”</span>;
  const noZones = rows.length === 0;
  const blocked = unable
    ? (reason.trim().length < UNABLE_MIN ? `บอกเหตุผลที่เข้าไม่ได้อย่างน้อย ${UNABLE_MIN} ตัวอักษร — ฝ่ายขายจะเห็นข้อความนี้` : null)
    : dirtyNames.length
      ? <>มีค่าที่ยังไม่บันทึก: {dirtyNames.join(" · ")} — กด {buttonName("บันทึกพื้นที่นี้")} ก่อนส่งงาน</>
      : noZones
        ? <>ใบนี้ยังไม่มีพื้นที่ให้วัด — เพิ่มพื้นที่ที่เจอหน้างานก่อน หรือเลือก {buttonName("ไปแล้วเข้าไม่ได้")}</>
        : gateError && missingCount
          ? <>ยังขาดผลวัด {missingCount} พื้นที่ — กด {buttonName("ไปแก้")} หรือ {buttonName("ตัดพื้นที่นี้ออก")}</>
          : gateError;

  const submit = async () => {
    if (busy) return;
    if (blocked) { setError(blocked); setAttempt((n) => n + 1); revealNotice(); return; }
    setBusy(true);
    setError("");
    try {
      await onSubmit?.({
        status: unable ? "unable" : "done",
        unableReason: unable ? reason.trim() : undefined,
        summary: summary.trim(),
      });
    } catch (e) {
      setError(e?.message || "ส่งงานไม่สำเร็จ");
      setAttempt((n) => n + 1);
      revealNotice();
    } finally {
      setBusy(false);
    }
  };

  const measured = rows.filter((r) => !r.cut && !r.missing.length).length;
  const active = rows.filter((r) => !r.cut).length;

  return (
    <Modal
      open={open}
      onClose={() => { if (!busy) onClose?.(); }}
      dismissible={!busy}
      title="ส่งงานหน้างาน"
      subtitle={visit?.code ? `นัด ${visit.code}` : undefined}
      size="md"
      footer={(
        <>
          <Button variant="quiet" onClick={onClose} disabled={busy}>ยังไม่ส่ง</Button>
          <Button tone="primary" onClick={submit} disabled={busy} aria-busy={busy || undefined}>
            {busy ? "กำลังส่ง…" : "ส่งงาน"}
          </Button>
        </>
      )}
    >
      <section className={styles.block}>
        <h3 className={styles.title}>ผลของการเข้าครั้งนี้</h3>
        <ChoiceChips
          value={unable ? "unable" : "entered"}
          onChange={(next) => { setUnable(next === "unable"); setError(""); }}
          options={[
            { value: "entered", label: "เข้าพื้นที่ได้" },
            { value: "unable", label: "ไปแล้วเข้าไม่ได้" },
          ]}
          disabled={busy}
          ariaLabel="ผลของการเข้าครั้งนี้"
        />
      </section>

      {unable ? (
        <section className={styles.block}>
          <label className={styles.title} htmlFor="survey-unable-reason">เข้าไม่ได้เพราะอะไร</label>
          <Input
            id="survey-unable-reason"
            value={reason}
            disabled={busy}
            maxLength={500}
            autoComplete="off"
            placeholder="เช่น อาคารไม่อนุญาตให้เข้าวันหยุด"
            invalid={!!reason && reason.trim().length < UNABLE_MIN}
            onChange={(e) => setReason(e.target.value)}
          />
          <p className={styles.note}>อย่างน้อย {UNABLE_MIN} ตัวอักษร · ฝ่ายขายจะได้รับแจ้งพร้อมเหตุผลนี้ และใบจะกลับไปขั้นลงคิวให้ TS ลงวันใหม่</p>
        </section>
      ) : (
        <section className={styles.block}>
          <h3 className={styles.title}>
            ผลวัดรายพื้นที่
            {active ? <span className={styles.count}>{measured} / {active}</span> : null}
          </h3>
          {noZones ? (
            /* ปุ่มทำงานได้จริงในโมดัล — ไม่ใช่ข้อความชี้ไปหาปุ่มที่อาจจมอยู่ใต้แถบบนจอแคบ */
            onAddZone ? (
              <Button variant="outline" className={styles.addZone} icon={<MapPinPlus size={15} aria-hidden="true" />}
                onClick={onAddZone} disabled={busy}>
                เพิ่มพื้นที่ที่เจอหน้างาน
              </Button>
            ) : null
          ) : (
            <ul className={styles.zones}>
              {rows.map((row) => {
                const state = row.cut ? "cut" : row.missing.length ? "miss" : row.dirty ? "dirty" : "ok";
                return (
                  <li key={row.id} className={styles.zone} data-state={state}>
                    <span className={styles.mark} aria-hidden="true">
                      {state === "cut" ? <Scissors size={14} />
                        : state === "miss" ? <CircleAlert size={14} />
                          : state === "dirty" ? <Pencil size={14} />
                            : <Check size={14} />}
                    </span>
                    <span className={styles.zoneCopy}>
                      <b>{row.name}</b>
                      <small>
                        {state === "cut" ? "ตัดออก — ไม่ต้องวัด"
                          : state === "miss" ? `ขาด: ${row.missing.join(" · ")}`
                            : state === "dirty" ? "ยังไม่บันทึก"
                              : "ครบแล้ว"}
                      </small>
                    </span>
                    {(state === "miss" || state === "dirty") && onGoZone ? (
                      <button type="button" className={`text-action ${styles.go}`}
                        onClick={() => onGoZone(row.id)}>
                        ไปแก้ <ArrowRight size={13} aria-hidden="true" />
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          {/* บอกผลหลังส่ง — ใบว่างส่งไม่ได้อยู่แล้ว ไม่ต้องบอก */}
          {noZones ? null : (
            <p className={styles.note}>
              {viewerKind === "head"
                ? "ส่งแทนช่าง — ใบไปต่อที่ขั้นเคาะจุดติดตั้งและแพ็คเกจ ซึ่งคุณทำต่อได้ที่แท็บสรุปส่งผล"
                : viewerKind === "senior"
                  ? "ส่งแล้วใบไปต่อที่ขั้นเคาะจุดติดตั้งและแพ็คเกจ — คุณเคาะต่อได้เลยที่แท็บสรุปส่งผล"
                  : "ส่งแล้วหัวหน้าจะได้แจ้งเตือนให้เคาะจุดติดตั้งและแพ็คเกจ — คุณยังแก้ผลวัดได้จนกว่าหัวหน้าจะส่งผลให้ฝ่ายขาย"}
            </p>
          )}
        </section>
      )}

      <section className={styles.block}>
        <label className={styles.title} htmlFor="survey-submit-summary">
          สรุปงานที่ทำ <span className={styles.optional}>ไม่บังคับ</span>
        </label>
        <Textarea
          id="survey-submit-summary"
          value={summary}
          rows={3}
          maxLength={2000}
          disabled={busy}
          placeholder="เช่น ลูกค้าขอเพิ่มจุดที่ห้องประชุมเล็ก รอคอนเฟิร์มกับฝ่ายขาย"
          onChange={(e) => setSummary(e.target.value)}
        />
      </section>

      {/* เหตุที่ยังส่งไม่ได้ — ขึ้นเป็นตัวหนังสือตั้งแต่ก่อนกด (ไม่ใช่ปุ่มจาง) · กดแล้วยังติด
          หรือ server ตีกลับ ⇒ ขึ้นเป็น alert ตรงนี้ */}
      <div ref={noticeRef} className={styles.notice}>
        {error ? (
          <StatusNotice key={attempt} tone="error" role="alert">{error}</StatusNotice>
        ) : blocked && !unable ? (
          <StatusNotice tone="warning">{blocked}</StatusNotice>
        ) : null}
      </div>
    </Modal>
  );
}
