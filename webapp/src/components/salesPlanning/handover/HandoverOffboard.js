"use client";
// ── เนื้อหน้าโอนงานคนลาออก (มติเจ้าของ 27/11/2026 · docs/sales-handover.md) — เปลือกหน้า + ด่านอยู่ที่ app/users/[id]/handover/page.js
// ปุ่ม ⇄ "โอนงาน" ที่แถวของผู้ใช้ใน /users พามาที่นี่ (เดิมเป็นโมดัลที่ยกดีลเปิดทั้งหมดให้คนเดียว)
// โชว์รายการ → เลือกทีมและคนรับทีละรายการ → โอนแล้วหายไป จนกว่าจะเหลือ 0
// ⭐ ด่านหน้า (users:manage) อยู่ที่ page.js · API ส่งต่องานตรวจซ้ำเอง
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CircleCheck, Lock, UserRoundX } from "lucide-react";
import { Metric, MetricStrip } from "@/components/ui/Workspace";
import Button from "@/components/ui/Button";
import Tabs from "@/components/ui/Tabs";
import StatusNotice from "@/components/ui/StatusNotice";
import SkeletonRows from "@/components/ui/Skeleton";
import { TableScroll } from "@/components/ui/Table";
import HandoverTable, { useHandoverPeople } from "./HandoverTable";
import HandoverTargets, { monthLabel } from "./HandoverTargets";
import styles from "./handover.module.css";
import { apiJson } from "@/lib/apiFetch";
import { notifyToast } from "@/lib/feedback";
import { fmtDateTime, fmtMoney, NA, naText } from "@/lib/format";

const toast = (t) => notifyToast(t.msg, { kind: t.kind });

/**
 * @param fromId คนต้นทาง · @param fromName ชื่อที่โชว์ · @param directory ทะเบียนคน (usePeopleDirectory ของหน้า)
 */
export default function HandoverOffboard({ fromId, fromName = "ผู้ใช้", directory = [] }) {
  const people = useHandoverPeople(directory, { excludeId: fromId });
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [tab, setTab] = useState("open");
  const [log, setLog] = useState([]);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const data = await apiJson(`/api/sales-planning/handover?from=${encodeURIComponent(fromId)}`, { fallbackError: "โหลดงานที่ต้องโอนไม่สำเร็จ" });
      setState({ loading: false, error: "", data });
    } catch (error) {
      setState({ loading: false, error: error.message, data: null });
    }
  }, [fromId]);
  useEffect(() => { load(); }, [load]);

  const data = state.data || { deals: [], leads: [], targets: [], counts: {} };
  const openDeals = data.deals.filter((d) => d.group === "open");
  const wonDeals = data.deals.filter((d) => d.group === "won_open");
  const remaining = data.deals.length + data.leads.length + data.targets.length;

  const dropRows = (key) => (done, rowsById) => {
    const ids = new Set(done.map((r) => r.id));
    setState((s) => ({ ...s, data: { ...s.data, [key]: s.data[key].filter((row) => !ids.has(row.id)) } }));
    const at = new Date().toISOString();
    setLog((prev) => [
      ...done.map((r) => {
        const row = rowsById.get(r.id) || {};
        return { at, key: `${r.kind}-${r.id}-${at}`, label: row.code || row.company || r.label, title: row.title || row.contactName || "", to: r.toName, team: r.team, moved: r.moved };
      }),
      ...prev,
    ]);
  };
  const targetsDone = ({ receivers }) => {
    const at = new Date().toISOString();
    setLog((prev) => [
      ...data.targets.map((row) => ({ at, key: `target-${row.id}`, label: `เป้า ${monthLabel(row.period)}`, title: `ทีม ${naText(row.team)} · ${fmtMoney(row.targetAmount)}`, to: receivers.join(", "), team: row.team })),
      ...prev,
    ]);
    setState((s) => ({ ...s, data: { ...s.data, targets: [] } }));
  };

  const tabs = [
    { key: "open", label: `ดีลเปิด ${openDeals.length}` },
    { key: "won", label: `Won งานยังไม่จบ ${wonDeals.length}` },
    { key: "leads", label: `ลีดเปิด ${data.leads.length}` },
    { key: "targets", label: `เป้า ${data.targets.length}` },
    { key: "log", label: `โอนแล้ว ${log.length}` },
  ];
  const card = (title, description, body) => (
    <section className="ui-table-shell">
      <header className="ui-table-header"><div><h2>{title}</h2><p>{description}</p></div></header>
      {body}
    </section>
  );
  const empty = (title, line) => <div className="ui-table-empty"><strong>{title}</strong><p>{line}</p></div>;

  return (
    <>
      {state.data ? (
        <div className="ui-workspace-rail">
          <MetricStrip>
            <Metric label="เหลือต้องโอน" value={remaining} note="รายการ" tone={remaining ? undefined : "success"} />
            <Metric label="ดีลเปิด" value={openDeals.length} note={`มูลค่า ${fmtMoney(openDeals.reduce((s, d) => s + Number(d.projectValue || 0), 0))}`} />
            <Metric label="Won งานยังไม่จบ" value={wonDeals.length} note="เก็บเงิน · SO · สัญญา" />
            <Metric label="ลีดเปิด" value={data.leads.length} />
            <Metric label="เป้า" value={data.targets.length} note="เดือน ตั้งแต่เดือนถัดไป" />
          </MetricStrip>
          <div className={styles.keepNote}>
            <span className={styles.legendItem}><Lock size={13} aria-hidden="true" /><strong>อยู่กับคนเดิม ไม่ต้องโอน:</strong></span>
            <span>Won ที่งานจบแล้ว {data.counts?.wonDone || 0} ใบ</span>
            <span>Lost {data.counts?.lost || 0} ใบ</span>
            <span>ยอดขายของ SO ที่อนุมัติแล้ว (นับให้คนปิดเสมอ)</span>
            {data.counts?.historical ? <span>ดีลของใบสั่งขายย้อนหลัง {data.counts.historical} ใบ — ย้ายเจ้าของที่ฟอร์มแก้ไขดีลทีละใบ</span> : null}
          </div>
        </div>
      ) : null}
      {state.loading && !state.data ? <SkeletonRows rows={6} /> : null}
      {state.error ? <StatusNotice tone="error" action={<Button size="sm" onClick={load}>ลองใหม่</Button>}>{state.error}</StatusNotice> : null}
      {state.data && remaining === 0 ? (
        <div className={styles.doneBanner}>
          <CircleCheck size={22} className={styles.doneIcon} aria-hidden="true" />
          <div className={styles.grow}>
            <strong>โอนงานของ {fromName} ครบแล้ว</strong>
            <p className={styles.hint}>ไม่มีดีล ลีด หรือเป้าค้างชื่อ {fromName} · ระงับบัญชีได้ที่หน้าจัดการผู้ใช้งาน (ปุ่มแม่กุญแจ)</p>
          </div>
          <Button as={Link} href="/users" tone="primary" icon={<UserRoundX size={15} />}>ไปหน้าจัดการผู้ใช้งาน</Button>
        </div>
      ) : null}
      {state.data ? (
        <>
          <Tabs tabs={tabs} value={tab} onChange={setTab} ariaLabel="งานที่ต้องโอน" />
          {tab === "open" && card("ดีลที่ยังเปิด", "ทีมตั้งต้น = ทีมเดิมของดีล · คนรับไม่มีค่าตั้งต้น · ใบเสนอราคาที่ยังไม่ปิดไปกับดีล",
            openDeals.length
              ? <HandoverTable kind="deal" rows={openDeals} people={people} onTransferred={dropRows("deals")} onToast={toast} />
              : empty("ไม่มีดีลเปิดเหลือ", "ดีลเปิดที่โอนแล้วอยู่ในแท็บ \"โอนแล้ว\""))}
          {tab === "won" && card("ดีล Won ที่งานยังไม่จบ", `ยอดขายของ SO ที่อนุมัติแล้วยังนับให้ ${fromName} · คนรับตามงานที่เหลือต่อ: เก็บเงิน · ยื่น SO · สัญญา`,
            wonDeals.length
              ? <HandoverTable kind="deal" rows={wonDeals} people={people} showReasons onTransferred={dropRows("deals")} onToast={toast} />
              : empty("ไม่มีดีล Won ที่งานค้างเหลือ", "Won ที่งานจบแล้วอยู่กับคนเดิม ไม่ต้องโอน"))}
          {tab === "leads" && card("ลีดที่ยังเปิด", "ผู้รับผิดชอบลีดย้ายไปให้คนรับ · ประวัติการติดตามคงเดิม",
            data.leads.length
              ? <HandoverTable kind="lead" rows={data.leads} people={people} onTransferred={dropRows("leads")} onToast={toast} />
              : empty("ไม่มีลีดเปิดเหลือ", "ลีดที่ปิดแล้วอยู่กับคนเดิม"))}
          {tab === "targets" && (data.targets.length
            ? <HandoverTargets fromId={fromId} rows={data.targets} holders={people.holdersIn(null)} onDone={targetsDone} onToast={toast} />
            : card("เป้ารายเดือนที่เหลือ", "ตั้งแต่เดือนถัดไป", empty("ไม่มีเป้าให้โอนแล้ว", "เป้าเดือนที่ผ่านมาแล้วและเดือนนี้อยู่กับคนเดิม")))}
          {tab === "log" && card("โอนแล้ว", "รายการที่โอนจากหน้านี้รอบนี้ · ประวัติเต็มอยู่ในบันทึกการใช้งาน (audit) ของแต่ละรายการ",
            log.length ? (
              <TableScroll family="list" surface="embedded" cells="stacked">
                <table>
                  <thead><tr><th>เวลา</th><th>รายการ</th><th>ส่งให้</th><th>ทีม</th><th>ย้ายตาม</th></tr></thead>
                  <tbody>
                    {log.map((row) => (
                      <tr key={row.key}>
                        <td>{fmtDateTime(row.at)}</td>
                        <td><div className={styles.cellStack}><span className={styles.code}>{row.label}</span><span className={styles.sub}>{row.title}</span></div></td>
                        <td>{row.to}</td>
                        <td>{naText(row.team)}</td>
                        <td>{row.moved ? [row.moved.orders ? `SO ${row.moved.orders}` : "", row.moved.contracts ? `สัญญา ${row.moved.contracts}` : ""].filter(Boolean).join(" · ") || NA : NA}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            ) : empty("ยังไม่ได้โอนรายการไหน", "รายการที่โอนแล้วจะมาอยู่ที่นี่"))}
        </>
      ) : null}
    </>
  );
}
