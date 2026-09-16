"use client";
// ── เนื้อหน้ารายละเอียด · ประเมินพื้นที่ (mig 0314 · ม-34) ────────────────
//
// ⭐ **คำถามของหัวข้อนี้คือ "ไปวัดที่ไหน กี่จุด ได้ผลมาแล้วเท่าไร"** — ไม่ใช่ "บรรทัด
// เดินถึงไหน" แบบสายเอกสาร · ใบนี้ไม่มี `dept_request_items` เลย (hasItems: false)
// เนื้อทั้งหมดอยู่ที่ `service_survey_zones` ซึ่งเป็นตารางลูกของใบ
//
// ⚠️ **ตัวเลขทุกตัวคำนวณสด ไม่มีคอลัมน์เก็บ** (`lib/service/survey.js`) — พื้นที่
// ปริมาตร แพ็คเกจตามสูตร ล้วน derive จาก `parts` · เก็บลงคอลัมน์เมื่อไรก็จะมีวัน
// ที่ตัวเลขบนจอกับของจริงไม่ตรงกัน (กติกาเดิมของรีโปเรื่องค่าที่คำนวณได้)
//
// ⚠️ พื้นที่ที่ถูก **ตัด** (`status='cut'`) ยังอยู่ในตาราง แต่ไม่เข้ายอดรวม — หายไป
// เฉย ๆ แปลว่าคนอ่านไม่มีทางรู้ว่าเคยขอให้วัดแล้วเจ้าหน้าที่ตัดทิ้งเพราะอะไร
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { DetailCard } from "@/components/ui/DetailPage";
import StatusNotice from "@/components/ui/StatusNotice";
import { TableScroll } from "@/components/ui/Table";
import { fmtDate, fmtDateTime, fmtNumber, naText } from "@/lib/format";
import { surveyChangeCounts, surveyChangeText, surveyTotals, surveyZoneSummary } from "@/lib/service/survey";
import styles from "./details.module.css";

const STATUS_LABEL = { ok: "", cut: "ตัดออก", added: "เจ้าหน้าที่เพิ่มหน้างาน" };

/* ตัวเลขที่ยังไม่ได้วัดต้องเป็น **ขีด** ไม่ใช่ 0 — 0 อ่านว่า "วัดแล้วได้ศูนย์"
   ⭐ จำนวนเต็มไม่ต้องลาก `.00` มาด้วย — ขนาดพื้นที่ที่วัดได้ลงตัวคือเลขที่อ่านออก
   ในพริบตา ("8" ไม่ใช่ "8.00") ส่วนเลขที่มีเศษยังโชว์สองตำแหน่งเหมือนเดิม เพราะ
   ทศนิยมของมันคือข้อมูลจริงที่ห้ามหาย
   ⚠️ **รู้ตัวว่าคอลัมน์ผสมแล้วจุดทศนิยมไม่ตรงแถว** ("7.50" กับ "50" ในคอลัมน์เดียวกัน) —
   ยอมตามมติที่เลือก "เลขลงตัวต้องอ่านเป็น 8" · จะให้ตรงทั้งคอลัมน์ต้องตัดสินความละเอียด
   **รายคอลัมน์** (ถ้าคอลัมน์ไหนมีเศษ ทั้งคอลัมน์สองตำแหน่ง) ซึ่งแปลว่าเลขลงตัวกลับไป
   เป็น 8.00 ทันทีที่แถวข้าง ๆ มีเศษ — เป็นมติของเจ้าของงาน ไม่ใช่ของไฟล์นี้ */
const num = (value) => {
  if (!value) return null;
  return Number.isInteger(Number(value))
    ? fmtNumber(value, { maximumFractionDigits: 0 })
    : fmtNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const VISIT_STATE = {
  draft: { label: 'ยังไม่ขึ้นตาราง', tone: 'warning' },
  scheduled: { label: 'อยู่บนตารางเจ้าหน้าที่', tone: 'info' },
  in_progress: { label: 'เจ้าหน้าที่กำลังเข้าพื้นที่', tone: 'info' },
  done: { label: 'เข้าพื้นที่แล้ว', tone: 'success' },
  partial: { label: 'เข้าแล้วบางส่วน', tone: 'warning' },
  unable: { label: 'เข้าไม่ได้', tone: 'danger' },
  rescheduled: { label: 'เลื่อนแล้ว', tone: 'plain' },
  cancelled: { label: 'ยกเลิก', tone: 'plain' },
};

export default function SurveyDetail({ request, canWorkSurvey = false }) {
  const zones = request.surveyZones || [];
  const site = request.surveySite || null;
  const visit = request.surveyVisit || null;
  if (!zones.length && !site) return null;
  const totals = surveyTotals(zones);
  const measured = zones.some((z) => surveyZoneSummary(z).volumeCbm > 0);
  /* "ที่ขอไป" เทียบ "ที่ได้กลับมา" (มติข้อ 6 · แผน §9 ข้อ 2)
     🔑 **ขึ้นเฉพาะเมื่อของที่ได้ ≠ ของที่ขอ** — ต่างจากจอของ TS ที่ขึ้นเสมอ
       ผู้ขอเป็นคนพิมพ์รายการนี้เองกับมือ ⇒ บอกเขาว่า "ได้ครบตามที่ขอ" คือเสียง
       รบกวนบนใบที่ยังไม่มีใครไปวัดด้วยซ้ำ · สิ่งที่เขาไม่รู้คือ *สิ่งที่เปลี่ยน* */
  const change = surveyChangeCounts(zones);
  /* 🔑 **ชื่อการ์ดต้องเดินตามของที่อยู่ในการ์ดจริง ๆ ไม่ใช่ค่าคงที่** — ใบประเมินเกิดมา
     โดยยังไม่มีผล (รอคิว/รอเข้าพื้นที่ คือช่วงชีวิตส่วนใหญ่ของใบ) หัวที่ตรึงว่า
     "ผลประเมินพื้นที่" จึงประกาศผลที่ยังไม่มีใครวัด แล้วผลักให้เมตาใต้หัวเป็นฝ่าย
     ปฏิเสธหัวตัวเอง = สองบรรทัดชิดกันพูดคนละเรื่อง (มาร์กอัปเดิมไม่มีหัวเลย จึงไม่เคยโกหก)
     ⇒ **หัวเดินตามเนื้อ** (`measured` คือตัวเดียวกับที่ตัดสินว่ามีคอลัมน์ผลวัดไหม
       — ใบที่ TS ส่งผลแล้วนับว่ามีผลเสมอ) ส่วน **เมตาเดินตามขั้นของใบ**:
       วัดแล้ว/ส่งแล้ว → "ผลประเมินพื้นที่" + ใครส่งเมื่อไร
       วัดแล้วยังไม่ส่ง → "ผลประเมินพื้นที่" + "ยังไม่ส่งผล"
       ยังไม่มีอะไรเลย → "พื้นที่ที่ต้องประเมิน" (ถ้อยคำเดิมของบล็อกนี้ ซึ่งเคยเป็น
       aria-label ของ <section>) + "ยังไม่ส่งผล" */
  const answered = Boolean(request.answeredAt || request.answeredByName);
  const hasResult = measured || answered;
  const sentMeta = answered
    ? [
      request.answeredByName ? `ส่งผลโดย ${request.answeredByName}` : "ส่งผลแล้ว",
      request.answeredAt ? fmtDateTime(request.answeredAt) : null,
    ].filter(Boolean).join(" · ")
    : "ยังไม่ส่งผล";

  /* ⭐ **ครอบด้วย DetailCard ของระบบ** (มติเจ้าของงาน 2026-09-16) — เดิมบล็อกนี้วางลง
     คอลัมน์หลักตรง ๆ ตารางจึงไม่มีพื้นของตัวเอง: แถวโชว์สีพื้นหน้า (วัด #efe9dd สว่าง /
     #121726 มืด) กลายเป็น "หลุม" ระหว่างการ์ดใบอื่น และกรอบตารางเยื้องเข้ามา 16px
     ทั้งสองข้างเพราะกฎยกเลิกมาร์จินของ embedded ใช้ได้เฉพาะในเนื้อการ์ด
     ⚠️ ลิงก์เข้าจอ TS เป็น `actions` ของหัวการ์ด และยังคุมด้วยด่านเดิม —
     ไม่มีสิทธิ์ = ไม่โชว์ (ไม่ใช่โชว์แล้วกดไปเจอ 403) */
  return (
    <DetailCard
      icon={ClipboardList}
      title={hasResult ? "ผลประเมินพื้นที่" : "พื้นที่ที่ต้องประเมิน"}
      meta={sentMeta}
      actions={canWorkSurvey ? (
        <p className={styles.surveyOpen}>
          <Link className="linklike" href={`/service/surveys/${request.id}`}>เปิดใบประเมิน →</Link>
        </p>
      ) : null}
    >
    <div className={styles.surveyWrap}>
      {site && (
        <p className={styles.surveySite}>
          {/* รหัส · ชื่อ ตามกติกาหน้ารายละเอียดของทั้งระบบ */}
          <strong>{[site.code, site.name].filter(Boolean).join(" · ")}</strong>
          {site.address ? <span>{site.address}</span> : null}
          {site.contactName || site.contactPhone ? (
            <span>{[site.contactName, site.contactPhone].filter(Boolean).join(" · ")}</span>
          ) : null}
        </p>
      )}

      {/* ── นัดของเจ้าหน้าที่ (เฟส 2) ────────────────────────────────────────────
          ⭐ ใบต้องตอบเองได้ว่า **ลงคิวไปแล้วหรือยัง และนัดขึ้นตารางจริงไหม** —
             ไม่งั้นคนเปิดใบต้องไปเปิดหน้าจัดคิวเจ้าหน้าที่อีกแท็บเพื่อตอบคำถามเดียว
          ⚠️ สถานะ `draft` = นัดยังไม่ขึ้นตารางใคร ⇒ ต้องเห็นชัดว่าไม่ใช่ "ลงคิวแล้วจบ" */}
      {visit && (
        <p className={styles.surveyVisit}>
          <span className={`ui-badge ${VISIT_STATE[visit.status]?.tone || 'plain'}`}>
            {VISIT_STATE[visit.status]?.label || visit.status}
          </span>
          <span>
            {[
              visit.code,
              fmtDate(visit.scheduledDate),
              visit.startTime ? String(visit.startTime).slice(0, 5) : 'ทั้งวัน',
              visit.assigneeName,
            ].filter(Boolean).join(' · ')}
          </span>
        </p>
      )}
      {/* 🔴 **นัดที่ปิดเป็น "เข้าไม่ได้" ต้องบอกเหตุผล** (§5E ②) — ป้ายลอย ๆ ทำให้
          ฝ่ายขายรู้แค่ว่ายังไม่ได้คำตอบ แต่ตอบลูกค้าไม่ได้ว่าเพราะอะไร
          ⚠️ ใบถอยกลับขั้นลงคิวไปแล้ว ⇒ บรรทัดนี้คือหลักฐานว่าทำไมวันบนใบถึงหายไป */}
      {visit?.status === 'unable' && visit.unableReason && (
        <p className={styles.surveyVisit}>
          <span className={styles.surveyUnable}>เข้าไม่ได้เพราะ {visit.unableReason}</span>
        </p>
      )}

      {/* ⭐ **ทางเข้าจอทำงานของ TS ย้ายขึ้นไปเป็น action ของหัวการ์ด** — ตารางนี้เป็นของ
          *ผู้อ่าน* (ฝ่ายขายเป็นหลัก) ส่วนการกรอกผลอยู่คนละจอ เพราะเป็นคนละงานคนละสิทธิ์ */}

      {(change.cut > 0 || change.added > 0) && (
        <StatusNotice tone="info" title={surveyChangeText(change, { actor: "TS" })}>
          เจ้าหน้าที่ตัด/เพิ่มพื้นที่เองได้โดยไม่ต้องรออนุมัติ — ตัดออกต้องบอกเหตุผลเสมอ เพิ่มไม่ต้อง
          · ดูว่าแถวไหนเปลี่ยนได้ที่ป้ายท้ายชื่อพื้นที่ในตารางข้างล่าง
        </StatusNotice>
      )}

      <TableScroll surface="embedded" cells="stacked" minWidth={640}>
        <table>
          <thead>
            <tr>
              <th>พื้นที่</th>
              {/* คอลัมน์ผลวัดขึ้นเมื่อมีของจริงแล้วเท่านั้น — ใบที่ยังไม่ได้ไปวัด
                  ไม่ควรมีสี่คอลัมน์ขีดยาวให้ไล่อ่าน */}
              {measured && <th className="num">พื้นที่ (ตร.ม.)</th>}
              {measured && <th className="num">ปริมาตร (ลบ.ม.)</th>}
              {measured && <th className="num">แพ็คเกจ</th>}
              {measured && <th className="num">จุดติดตั้ง</th>}
            </tr>
          </thead>
          <tbody>
            {zones.map((zone, index) => {
              const s = surveyZoneSummary(zone);
              return (
                <tr key={zone.id} data-cut={s.status === "cut" ? "1" : undefined}>
                  <td>
                    <span className="t-strong">{index + 1}. {zone.zoneName}</span>
                    <span className="cell-sub">
                      {/* รหัส ZN มาจากทะเบียน (`zoneCode`) — id ดิบ (SZN-…) อ่านไม่ออก
                          ⚠️ มี `zoneId` แต่ยังไม่มีรหัส = โซนถูกลบทิ้งไปแล้ว ⇒ บอกตรง ๆ */}
                      {zone.zoneId
                        ? (zone.zoneCode || "พื้นที่นี้ถูกลบจากทะเบียนแล้ว")
                        : "พื้นที่ใหม่ — ได้รหัส ZN ตอนกดส่งใบ"}
                      {STATUS_LABEL[s.status] ? ` · ${STATUS_LABEL[s.status]}` : ""}
                      {zone.cutReason ? ` · ${zone.cutReason}` : ""}
                      {zone.note ? ` · ${zone.note}` : ""}
                    </span>
                  </td>
                  {measured && <td className="num">{naText(num(s.areaSqm))}</td>}
                  {measured && <td className="num">{naText(num(s.volumeCbm))}</td>}
                  {/* ⭐ โชว์ทั้งเลขที่หัวหน้าเคาะและเลขที่สูตรบอก — ต่างกันได้ (มติข้อ 6)
                      แต่ต้องเห็นว่าต่าง ไม่ใช่ทับกันเงียบ ๆ */}
                  {measured && (
                    <td className="num">
                      {naText(s.packageQty)}
                      {s.suggestedPackages ? (
                        <span className="cell-sub">สูตร {s.suggestedPackages}</span>
                      ) : null}
                    </td>
                  )}
                  {measured && (
                    <td className="num">
                      {naText(s.spotsTotal ? `${s.spotsSelected}/${s.spotsTotal}` : null)}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          {measured && (
            <tfoot>
              {/* ⭐ **แถวรวมคือเซลล์ข้อมูล ไม่ใช่หัวคอลัมน์** — ป้ายเคยเป็น `<th>` จึงโดนกฎ
                  หัวคอลัมน์ทั้งชุด (พื้น --panel-2 · 9.5px หนา · สูง 42px · จัดกึ่งกลาง
                  แนวตั้ง) ⇒ เห็นเป็นบล็อกสีอ่อนกินความกว้าง 40% ของแถวรวม และป้ายต่ำกว่า
                  ตัวเลขข้างกัน 9px (วัดจริง 2026-09-16)
                  ⚠️ แถวยังอ่านออกครบหลังเปลี่ยนเป็น td: ทุกตัวเลขในแถวถูกเรียกด้วย
                  **หัวคอลัมน์ใน thead** อยู่แล้ว (WCAG 1.3.1) ส่วนเซลล์แรกคือเนื้อความ
                  "รวม n พื้นที่" ไม่ใช่หัวของแถว — ห้ามใส่ `scope` บน td (ไม่ใช่ HTML
                  ที่ถูกต้อง screen reader ไม่อ่านให้) */}
              <tr>
                <td>
                  รวม {totals.zones} พื้นที่
                  {/* ⚠️ ต้องบอกทั้งสองทาง — เดิมมีแต่ "ตัดออก" ⇒ ใบที่ TS เพิ่มพื้นที่ให้
                      จะอ่านเหมือนตัวเลขบวมขึ้นเองโดยไม่มีคำอธิบาย */}
                  {totals.cutZones ? <span className="cell-sub">ตัดออก {totals.cutZones}</span> : null}
                  {totals.addedZones ? <span className="cell-sub">เพิ่มหน้างาน {totals.addedZones}</span> : null}
                </td>
                <td className="num">{naText(num(totals.areaSqm))}</td>
                <td className="num">{naText(num(totals.volumeCbm))}</td>
                <td className="num">
                  {naText(totals.packageQty)}
                  {totals.suggestedPackages ? (
                    <span className="cell-sub">สูตร {totals.suggestedPackages}</span>
                  ) : null}
                </td>
                <td className="num">
                  {naText(totals.spotsTotal ? `${totals.spotsSelected}/${totals.spotsTotal}` : null)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </TableScroll>
    </div>
    </DetailCard>
  );
}
