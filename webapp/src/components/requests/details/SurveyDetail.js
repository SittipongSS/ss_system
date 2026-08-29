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
// เฉย ๆ แปลว่าคนอ่านไม่มีทางรู้ว่าเคยขอให้วัดแล้วช่างตัดทิ้งเพราะอะไร
import { TableScroll } from "@/components/ui/Table";
import { fmtDate, fmtNumber, naText } from "@/lib/format";
import { surveyTotals, surveyZoneSummary } from "@/lib/service/survey";
import styles from "./details.module.css";

const STATUS_LABEL = { ok: "", cut: "ตัดออก", added: "ช่างเพิ่มหน้างาน" };

// ตัวเลขที่ยังไม่ได้วัดต้องเป็น **ขีด** ไม่ใช่ 0 — 0 อ่านว่า "วัดแล้วได้ศูนย์"
const num = (value) => (value
  ? fmtNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  : null);

const VISIT_STATE = {
  draft: { label: 'ยังไม่ขึ้นตาราง', tone: 'warning' },
  scheduled: { label: 'อยู่บนตารางช่าง', tone: 'info' },
  in_progress: { label: 'ช่างกำลังเข้าพื้นที่', tone: 'info' },
  done: { label: 'เข้าพื้นที่แล้ว', tone: 'success' },
  partial: { label: 'เข้าแล้วบางส่วน', tone: 'warning' },
  unable: { label: 'เข้าไม่ได้', tone: 'danger' },
  rescheduled: { label: 'เลื่อนแล้ว', tone: 'plain' },
  cancelled: { label: 'ยกเลิก', tone: 'plain' },
};

export default function SurveyDetail({ request }) {
  const zones = request.surveyZones || [];
  const site = request.surveySite || null;
  const visit = request.surveyVisit || null;
  if (!zones.length && !site) return null;
  const totals = surveyTotals(zones);
  const measured = zones.some((z) => surveyZoneSummary(z).volumeCbm > 0);

  return (
    <section className={styles.surveyWrap} aria-label="สถานที่และพื้นที่ที่ต้องประเมิน">
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

      {/* ── นัดของช่าง (เฟส 2) ────────────────────────────────────────────
          ⭐ ใบต้องตอบเองได้ว่า **ลงคิวไปแล้วหรือยัง และนัดขึ้นตารางจริงไหม** —
             ไม่งั้นคนเปิดใบต้องไปเปิดหน้าจัดคิวช่างอีกแท็บเพื่อตอบคำถามเดียว
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
              <tr>
                <th>
                  รวม {totals.zones} พื้นที่
                  {totals.cutZones ? <span className="cell-sub">ตัดออก {totals.cutZones}</span> : null}
                </th>
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
    </section>
  );
}
