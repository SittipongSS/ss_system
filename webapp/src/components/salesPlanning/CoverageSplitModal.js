"use client";
// ── แบ่งช่วงครอบของงวดตามช่วงบริการของใบ (งานบริการรายบรรทัด · mig 0391 · แผน §2.8 · r2 S7) ─────────────
//
// ⭐ **พรีวิวก่อนเสมอ ไม่เขียนเงียบ** — ตาราง "งวด · สัดส่วน · ครอบเดิม → ครอบใหม่" ทุกงวดที่จะถูกแตะ แล้วคนกด
//   "ใช้ช่วงครอบนี้" เอง (กติกา #1223: การยืนยันบอกผลที่ตรวจได้ · ท่าเดียวกับ "เติมตามรอบ เดือนละงวด" ของแผงงวด)
// ⭐ ตัวคิด `splitCoverageByPeriod` ตัวเดียวกับ route (`PATCH …/installments {action:'fill-coverage'}`) —
//   route คิดซ้ำจากงวดชุดเดียวกับที่จอเห็น (`installmentsForScreen`) แล้วเทียบกับ `plan` ที่ส่งไป · ไม่ตรง = 409
//   ⇒ ห้ามแต่งวันในพรีวิวเองที่นี่ ส่ง `plan` ตามที่ตัวคิดคืนมาเป๊ะ ๆ
// 🔴 **ไม่มีวิธีแบ่งตั้งต้น** (กฎบ้าน: ไม่เลือกให้ในการตัดสินใจ — ตัวเดียวกับ "ใช้รอบไหน" ของเติมตามรอบ) ⇒ ยังไม่เลือก
//   = ยังไม่มีพรีวิว ปุ่มดับพร้อมเหตุ
// 🔴 **แบ่งไม่ลงตัว = ไม่มีปุ่มใช้** (มีแค่ "ปิด") — ทางออกคือกรอกช่วงครอบรายงวดเองที่ตาราง
// ⚠️ error ของ API ขึ้นในโมดัล (แถบของหน้าอยู่ใต้โมดัล) — ผู้เรียกส่ง `error` ของหน้าเข้ามา
// ⚠️ ด่านรายงวด (`rowGate`) = `installmentActionError(row,'coverage',…)` ตัวเดียวกับ route ด้วยค่าชุดที่จะส่งจริง
//   ⇒ ติดด่านบอกก่อนกด ไม่ใช่ปล่อยให้ API ตอบ 400 ทีหลัง
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import Segmented from "@/components/ui/Segmented";
import StatusNotice from "@/components/ui/StatusNotice";
import { TableScroll } from "@/components/ui/Table";
import { fmtDate, fmtMoney, fmtPercent, NA } from "@/lib/format";
import { COVERAGE_SPLIT_ERRORS, splitCoverageByPeriod } from "@/lib/sales/paymentCoverage";
import { periodSpan } from "@/lib/sales/serviceSetup";
import styles from "./CoverageSplitModal.module.css";

/* วิธีแบ่ง — ค่าเดียวกับที่ route รับ (`mode`) */
export const COVERAGE_SPLIT_MODES = Object.freeze([
  { value: "monthly", label: "เท่ากันรายเดือน" },
  { value: "proportional", label: "ตามสัดส่วนงวด" },
]);

const MODE_NOTE = {
  monthly: "ทุกงวดครอบจำนวนเดือนเท่ากัน — จำนวนเดือนต้องหารจำนวนงวดลงตัว งวดสุดท้ายยืดถึงวันสิ้นสุดบริการ",
  proportional: "งวดที่ยอดมากครอบนานกว่า ตามสัดส่วนยอดของงวด (อย่างน้อยงวดละ 1 เดือน)",
};

const rangeText = (from, to) => `${from ? fmtDate(from) : "…"}–${to ? fmtDate(to) : "…"}`;

/* ครอบเดิม → ครอบใหม่ (ท่าเดียวกับ "เดิม → ใหม่" ของจัดวันใหม่) — เดิมจาง+ขีดฆ่าเมื่อจะเปลี่ยน · ตรงกันแล้วบอกว่าไม่เปลี่ยน */
function CoverChange({ planned }) {
  const hadCover = Boolean(planned.prevFrom || planned.prevTo);
  const same = planned.prevFrom === planned.coversFrom && planned.prevTo === planned.coversTo;
  const months = periodSpan({ from: planned.coversFrom, to: planned.coversTo }).label;
  return (
    <span className={styles.change}>
      {same ? null : (
        <span className={styles.prev}>
          {hadCover ? <span className={styles.cleared}>{rangeText(planned.prevFrom, planned.prevTo)}</span> : "ยังไม่มีช่วงครอบ"}
          <ArrowRight size={12} aria-hidden="true" /><span className="sr-only">เป็น</span>
        </span>
      )}
      <span className={styles.next}>
        {rangeText(planned.coversFrom, planned.coversTo)}
        {months ? <small>{months}</small> : null}
      </span>
      {same ? <small>ไม่เปลี่ยน</small> : null}
    </span>
  );
}

/**
 * @param period   `{ from, to }` ช่วงบริการของใบ (หรือ null)
 * @param rows     งวดตามที่หน้าใบถืออยู่ (GET …/installments = `installmentsForScreen`) — ชุดเดียวกับที่ route คิดซ้ำ
 * @param rowGate  `(planned) => string|null` ด่านรายงวดตัวเดียวกับ route · ไม่ส่ง = ไม่ตรวจก่อนกด
 * @param onApply  `({ mode, plan }) => Promise<boolean>` — ผู้เรียกปิดโมดัลเองเมื่อสำเร็จ
 * @param blockedReason เหตุของใบที่ทำให้แบ่งไม่ได้แล้ว (ตัวเดียวกับปุ่มบนการ์ด) — มีค่า = บอกเหตุแทนพรีวิว ไม่มีปุ่มใช้
 */
export default function CoverageSplitModal({
  open, onClose, period, rows = [], rowGate = null, onApply, blockedReason = "", busy = false, error = "", subtitle = "",
}) {
  const [mode, setMode] = useState(null);
  const span = periodSpan(period);
  const split = splitCoverageByPeriod(period, rows, mode || "");
  /* ยังไม่เลือกวิธีแบ่ง: ตัวคิดตอบ "ไม่ลงตัว" เพราะไม่รู้วิธี — ไม่ใช่เหตุจริง · แต่ "ไม่มีช่วงบริการ" / "ไม่มีงวดให้แบ่ง"
     ไม่ขึ้นกับวิธี (ตัวคิดถามสองข้อนี้ก่อน) ⇒ บอกได้ทันทีโดยไม่ต้องรอเลือก
     ⭐ เหตุของใบ (`blockedReason`) มาก่อนเหตุของการแบ่ง — ใบที่แก้ไม่ได้แล้ว คำถามว่าแบ่งลงตัวไหมไม่มีความหมาย */
  const previewError = blockedReason
    || (mode || [COVERAGE_SPLIT_ERRORS.noPeriod, COVERAGE_SPLIT_ERRORS.noRows].includes(split.error) ? split.error : null)
    || null;
  const planned = mode && !previewError ? split.rows : [];
  const amountOf = (id) => rows.find((row) => row?.id === id)?.amount;
  const blocker = rowGate
    ? planned.map((row) => {
      const why = rowGate(row);
      return why ? (planned.length > 1 ? `งวดที่ ${row.seq}: ${why}` : why) : "";
    }).find(Boolean) || ""
    : "";
  const apply = async () => {
    if (!mode || previewError || blocker || !planned.length || !onApply) return;
    await onApply({
      mode,
      plan: planned.map(({ id, coversFrom, coversTo }) => ({ id, coversFrom, coversTo })),
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="แบ่งช่วงครอบตามช่วงบริการ" size="lg" dismissible={!busy}
      subtitle={subtitle} footer={(
        <div className="action-bar">
          {previewError ? (
            <Button variant="ghost" onClick={onClose} disabled={!!busy}>ปิด</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose} disabled={!!busy}>ยกเลิก</Button>
              <Button tone="primary" disabled={!!busy || !mode || !!blocker || !planned.length}
                title={!mode ? "เลือกวิธีแบ่งก่อน" : blocker || undefined} onClick={apply}>
                {busy ? "กำลังบันทึก…" : "ใช้ช่วงครอบนี้"}
              </Button>
            </>
          )}
        </div>
      )}>
      <div className={styles.body}>
        {error ? <StatusNotice tone="error" role="alert">{error}</StatusNotice> : null}
        <p className={styles.period}>
          ช่วงบริการ <b>{period?.from && period?.to ? rangeText(period.from, period.to) : NA}</b>
          {span.label ? ` · ${span.label}` : ""}
        </p>
        <div className={styles.field}>
          <span>วิธีแบ่ง</span>
          <Segmented ariaLabel="วิธีแบ่งช่วงครอบ" options={COVERAGE_SPLIT_MODES} value={mode} onChange={setMode} />
          <p className="form-note">
            {mode ? MODE_NOTE[mode] : "เลือกวิธีแบ่งก่อน — ระบบแสดงช่วงครอบใหม่ของทุกงวดให้ดูก่อนใช้"}
          </p>
        </div>
        {previewError ? (
          <StatusNotice tone="warning">{previewError}</StatusNotice>
        ) : planned.length ? (
          <>
            {blocker ? <StatusNotice tone="warning">{blocker}</StatusNotice> : null}
            <TableScroll surface="auto" cells="stacked" minWidth={560}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.seqCol}>งวด</th>
                    <th className="num">สัดส่วน</th>
                    <th>ครอบเดิม → ครอบใหม่</th>
                  </tr>
                </thead>
                <tbody>
                  {planned.map((row) => (
                    <tr key={row.id}>
                      <td className={styles.seqCol}>{row.seq}</td>
                      <td className="num">
                        {fmtPercent((Number(row.share) || 0) * 100)}
                        <small>{fmtMoney(amountOf(row.id))}</small>
                      </td>
                      <td><CoverChange planned={row} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </>
        ) : null}
        <ul className={styles.notes}>
          <li>แบ่งเป็นเดือนปฏิทิน · แก้รายงวดต่อได้</li>
          <li>งวดที่บัญชีรับรองแล้วไม่ถูกแตะ</li>
        </ul>
      </div>
    </Modal>
  );
}
