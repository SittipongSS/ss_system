"use client";
import { TableScroll } from "@/components/ui/Table";

import { useCallback, useEffect, useState } from "react";
import { Inbox, Filter, Users, PhoneCall, CalendarClock } from "lucide-react";
import { Metric as SaMetric, WorkspaceSection as SaSection } from "@/components/ui/Workspace";
import { CHANNEL_GROUP_LABELS, LEAD_CHANNEL_LABELS, slaPendingTone } from "@/lib/sales/leads";
import { TEAM_LABELS } from "@/lib/permissions";
import usePeopleDirectory from "@/lib/usePeopleDirectory";
import { livePersonName } from "@/lib/ui/personName";
import { fmtName, fmtPercent } from "@/lib/format";
import styles from "./KpiLeadsTab.module.css";

const pct = (hit, total) => (total ? fmtPercent((hit / total) * 100) : "-");

/* สามด่านของเส้นทางลีด วัดด้วยกติกาเดียวกัน (≤1 วันทำการ) ต่างกันแค่คู่ timestamp —
   ประกาศเป็นลิสต์เพื่อให้เพิ่ม/ลดด่านแล้วไม่ต้องไล่แก้ JSX ทีละใบ
   ⚠️ หมายเหตุใต้ตัวเลขต้องสั้นระดับ "ทัน x/y · ค้างตอนนี้ z" เท่านั้น — `.ui-metric em`
   เป็น nowrap + ellipsis แต่กล่องข้างในไม่มี min-width:0 ellipsis เลยไม่ทำงาน
   ข้อความยาวจึงล้นไปทับการ์ดข้าง ๆ (เจอตอนลองใส่ชื่อผู้รับผิดชอบด่านลงไป) */
const SLA_STAGES = [
  { key: "screen", icon: <Filter />, label: "SLA คัดกรอง ≤1 วันทำการ" },
  { key: "assign", icon: <Users />, label: "SLA กระจาย ≤1 วันทำการ" },
  { key: "contact", icon: <PhoneCall />, label: "SLA ติดต่อกลับ ≤1 วันทำการ" },
];

/* สี่ตัวที่ฝ่ายขายอยากวัดจริง ๆ (มติผู้ใช้ 2026-08-12)
 *   ลีดเข้า · นัดประชุมได้ · เปิดลูกค้า · ไม่ไปต่อ
 *
 * ⚠️ **ไม่ใช่โซ่** — สามตัวหลังวัดเทียบ `total` ตัวเดียวกันหมด ไม่ต่อกันเป็นลูกศร
 * เพราะมันซ้อนทับกันได้และไม่ครบร้อย:
 *   · นัด ∩ เปิดลูกค้า ≠ ว่าง — ทั้งปีมี 6 ใบที่เปิดลูกค้า โดย 2 ใบเคยนัด
 *   · เปิดลูกค้ามาจาก create_deal ซึ่งไปได้จากทั้ง contacted และ meeting ⇒ ข้ามนัดได้
 *     เดือน ส.ค. จึงได้ นัด 2 แต่เปิดลูกค้า 4 — ต่อเป็นโซ่เมื่อไรปลายสายจะมากกว่าต้นสาย
 *     อ่านแล้วเหมือนระบบคำนวณพัง (🐞 โน้ตเดิมเขียน "ลีด 53 → นัด 2 → เปิดลูกค้า 4" จริง ๆ)
 *   · ที่เหลือยังเดินอยู่ในคิว สามตัวนี้จึงรวมกันไม่ถึง 100% โดยธรรมชาติ
 *
 * ตัวหารร่วม = "ลีดที่เข้ามาเดือนนี้" ทำให้เทียบข้ามเดือน/ข้ามทีมได้ตรง ๆ
 * ส่วนคำถาม "หล่นตรงไหนระหว่างทาง" ตอบด้วยกริด Funnel ข้างบนที่มีครบทุกขั้นอยู่แล้ว
 *
 * ⚠️ โน้ตต้องสั้นระดับนี้ — `.ui-metric em` เป็น nowrap + ellipsis ที่ไม่ทำงาน
 * (ไม่มี min-width:0) ข้อความยาวจะล้นไปทับการ์ดข้าง ๆ
 */
const OUTCOME_CARDS = [
  { key: "in", label: "ลีดเข้า", value: (f) => f.total ?? "-", note: () => "ตัวหารของทุกอัตราในแถวนี้" },
  { key: "meet", label: "นัดประชุมได้", value: (f) => pct(f.meeting, f.total), note: (f) => `${f.meeting ?? 0} จาก ${f.total ?? 0} ใบ` },
  { key: "won", label: "เปิดลูกค้า", value: (f) => pct(f.qualified, f.total), note: (f) => `${f.qualified ?? 0} จาก ${f.total ?? 0} ใบ` },
  { key: "lost", label: "ไม่ไปต่อ", value: (f) => pct(f.disqualified, f.total), note: (f) => `${f.disqualified ?? 0} จาก ${f.total ?? 0} ใบ` },
];

export default function KpiLeadsTab({ month, teamFilter }) {
  /* ชื่อคน — อ่านจาก id ไม่ใช่สำเนาชื่อที่ค้างอยู่ในแถว (ท่าเดียวกับหน้าคิวลีด)
     🐞 ตารางสองใบนี้เคยโชว์ `assigneeName` / `createdByName` ตรง ๆ ซึ่งเป็น snapshot
     ตอนที่บันทึก — prod มี 64 แถวที่เป็นชื่อย่อ/ชื่อเก่าที่ไม่ตรงบัญชีใครเลย ⇒ ตาราง
     ประเมินผลรายคนขึ้นชื่อที่หาตัวคนไม่เจอ ขณะที่หน้าคิวลีดข้าง ๆ ขึ้นชื่อปัจจุบัน
     ⚠️ ต้องรวมคนที่ปิดบัญชีแล้วด้วย — KPI ย้อนหลังมีคนที่ลาออกไปแล้วเสมอ */
  const directory = usePeopleDirectory();
  const [kpi, setKpi] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams({ month });
      if (teamFilter && teamFilter !== "all") q.set("team", teamFilter);
      const res = await fetch(`/api/sales-planning/leads/kpi?${q.toString()}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "โหลด KPI ลีดไม่สำเร็จ");
      setKpi(await res.json());
    } catch (e) {
      setError(e.message || "โหลด KPI ลีดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [month, teamFilter]);

  useEffect(() => { load(); }, [load]);

  const f = kpi?.funnel || {};
  const sla = kpi?.sla || {};

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className={`glass-panel ${styles.errorBox}`} role="alert">{error}</div>
      )}

      {/* ⚠️ เคยมีแถบ KPI 4 การ์ด (ลีดเข้า · SLA คัดกรอง · SLA ติดต่อ · Conversion) อยู่ตรงนี้
          — **ชุดเดียวกับที่หน้าคิวลีดแสดงอยู่แล้วเป๊ะ** คนกดลิงก์ "ดู KPI เต็ม" มาจึงต้อง
          เลื่อนผ่านของที่เพิ่งเห็นก่อนถึงของใหม่ (มติผู้ใช้ 2026-08-05)
          ตัวเลข SLA/Conversion ไม่ได้หายไปไหน — ย้ายลงมาอยู่ในส่วน Funnel ข้างล่างนี้
          ซึ่งเป็นที่ที่มันอ่านคู่กับจำนวนลีดแต่ละขั้นได้พอดี
          ⇒ อย่าเอาแถบซ้ำกลับมา ถ้าอยากให้หน้านี้มีพาดหัว ให้เป็นตัวเลขที่หน้าคิวลีด
            *ไม่มี* เท่านั้น */}

      <SaSection icon={<Filter size={17} />} title="Funnel ลีด → ลูกค้า" subtitle={`ติดตามการเปลี่ยนผ่านของลีดในแต่ละขั้น · เดือน ${kpi?.month || month}`}>
        <div className={styles.funnelGrid} aria-busy={loading}>
          {[["เข้า", f.total], ["คัดกรองแล้ว", f.screened], ["มอบหมายแล้ว", f.assigned], ["ติดต่อแล้ว", f.contacted], ["นัดประชุม", f.meeting], ["เปิดลูกค้า", f.qualified], ["ไม่ไปต่อ", f.disqualified], ["ตีกลับ", f.bounced]].map(([label, v]) => (
            <SaMetric
              key={label}
              label={label}
              /* `?? "-"` ไม่ใช่ `?? 0` — null แปลว่า "นับไม่ได้" (ดู bounceCount ใน route)
                 ส่วน 0 จริง ๆ ยังโชว์ 0 ตามปกติเพราะ ?? จับแค่ null/undefined
                 การกลบ "ไม่รู้" ให้เป็น 0 คือคำตอบที่ดูปกติจนไม่มีใครสงสัย */
              value={v ?? "-"}
              note="จำนวนลีด"
            />
          ))}
        </div>
        {/* คุณภาพของ funnel ข้างบน — เปอร์เซ็นต์อ่านคู่กับจำนวนดิบในกริดเดียวกันไม่ได้
            (คนละหน่วย) จึงแยกเป็นแถวของตัวเองใต้ส่วนเดียวกัน */}
        <div className={styles.qualityGrid} aria-busy={loading}>
          {/* "ค้างตอนนี้" ไม่ใช่ "ค้างของเดือนนี้" — ตัวเลขนี้ไม่ผูกกับเดือนที่เลือก
              โดยเจตนา (ลีดที่ค้างข้ามเดือนมาคือใบที่ต้องทวงที่สุด) ป้ายจึงต้องบอกให้ชัด */}
          {SLA_STAGES.map(({ key, icon, label }) => {
            const s = sla[key] || {};
            return (
              <SaMetric
                key={key}
                icon={icon}
                label={label}
                value={pct(s.hit, s.checked)}
                note={`ทัน ${s.hit ?? 0}/${s.checked ?? 0} · ค้างตอนนี้ ${s.pending ?? "-"}`}
                tone={slaPendingTone(s.pending)}
              />
            );
          })}
        </div>
        {/* ผลลัพธ์แยกกริดของตัวเอง ไม่ต่อท้าย SLA — สองชุดตอบคนละคำถาม
            (ทันเวลาไหม vs ได้ผลเท่าไร) และรวมกริดเดียวแล้วจะตัดบรรทัดค้างเป็นแถวเศษ */}
        <div className={styles.qualityGrid} aria-busy={loading}>
          {OUTCOME_CARDS.map(({ key, label, value, note }) => (
            <SaMetric key={key} icon={<CalendarClock />} label={label} value={value(f)} note={note(f)} />
          ))}
        </div>
      </SaSection>

      <div className={styles.splitSections}>
        {/* Marketing: กรอกรายวัน */}
        <SaSection icon={<Inbox size={17} />} title="การกรอกลีด (Marketing KPI)" subtitle="ปริมาณลีดแยกตามผู้กรอก">
          <TableScroll surface="embedded"><table>
              <thead><tr><th>ผู้กรอก</th><th className="num">ลีด</th><th className="num">วันที่กรอก</th><th className="num">เฉลี่ย/วัน</th></tr></thead>
              <tbody>
                {(kpi?.byCreator || []).map((c) => (
                  <tr key={c.createdBy || c.name} className="premium-row">
                    <td>{livePersonName(directory, c.createdBy, c.name) || c.name}</td>
                    <td className="num mono">{c.count}</td>
                    <td className="num mono">{c.days}</td>
                    <td className="num mono">{c.perDay}</td>
                  </tr>
                ))}
                {!(kpi?.byCreator || []).length && <tr><td colSpan={4} className={styles.emptyCell}>ยังไม่มีข้อมูล</td></tr>}
              </tbody>
            </table></TableScroll>
        </SaSection>

        {/* ช่องทาง */}
        <SaSection icon={<CalendarClock size={17} />} title="แยกตามช่องทาง" subtitle="ผลลัพธ์ของลีดจากแต่ละช่องทาง">
          <TableScroll surface="embedded"><table>
              <thead><tr><th>ช่องทาง</th><th>กลุ่ม</th><th className="num">ลีด</th><th className="num">เปิดลูกค้า</th></tr></thead>
              <tbody>
                {(kpi?.byChannel || []).map((c) => (
                  <tr key={c.channel} className="premium-row">
                    <td>{LEAD_CHANNEL_LABELS[c.channel] || c.channel}</td>
                    <td>{CHANNEL_GROUP_LABELS[c.group] || c.group}</td>
                    <td className="num mono">{c.count}</td>
                    <td className="num mono">{c.qualified}</td>
                  </tr>
                ))}
                {!(kpi?.byChannel || []).length && <tr><td colSpan={4} className={styles.emptyCell}>ยังไม่มีข้อมูล</td></tr>}
              </tbody>
            </table></TableScroll>
        </SaSection>
      </div>

      {/* AE: SLA ติดต่อ + ผลต่อคน */}
      <SaSection icon={<PhoneCall size={17} />} title="รายผู้รับผิดชอบ (AE KPI)" subtitle="SLA และผลลัพธ์แยกตาม AE">
        <TableScroll surface="embedded"><table>
            <thead><tr><th>AE</th><th>ทีม</th><th className="num">รับมอบ</th><th className="num">ติดต่อแล้ว</th><th className="num">SLA ทัน</th><th className="num">นัด</th><th className="num">เปิดลูกค้า</th></tr></thead>
            <tbody>
              {(kpi?.byAssignee || []).map((a) => (
                <tr key={a.assigneeId} className="premium-row">
                  <td>{livePersonName(directory, a.assigneeId, a.name) || fmtName({ name: a.name })}</td>
                  {/* ป้ายทีมเต็ม ("Key Account") ไม่ใช่รหัสดิบ ("KA") — ที่อื่นในระบบใช้ TEAM_LABELS หมด */}
                  <td>{TEAM_LABELS[a.team] || a.team || "-"}</td>
                  <td className="num mono">{a.assigned}</td>
                  <td className="num mono">{a.contacted}</td>
                  <td className="num mono">{pct(a.slaHit, a.contacted)}</td>
                  <td className="num mono">{a.meetings}</td>
                  <td className="num mono">{a.qualified}</td>
                </tr>
              ))}
              {!(kpi?.byAssignee || []).length && <tr><td colSpan={7} className={styles.emptyCell}>ยังไม่มีข้อมูล</td></tr>}
            </tbody>
          </table></TableScroll>
      </SaSection>
    </div>
  );
}
