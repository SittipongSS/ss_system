"use client";
// ── ตารางงานผู้ปรุงกลิ่น (mig 0350 · มติผู้ใช้ 2026-09-08) ──────────────────
//
// ⭐ **หน่วยของหน้านี้คือ "กลิ่น" ไม่ใช่ "ใบ"** — ต่างจากทุกคิวในระบบโดยตั้งใจ · ใบพัฒนา
// กลิ่นหนึ่งใบมีได้ถึง 4 ก้อนแจกให้คนละคนปรุง (วัดจาก production 2026-09-08) ⇒ คิวที่
// นับเป็นใบตอบไม่ได้เลยว่าตอนนี้ใครถืออะไรอยู่ · คำถามที่หน้านี้ตอบมีสองข้อ:
// **"เหลือกลิ่นอะไรที่ยังไม่มีคนทำ"** และ **"กลิ่นก้อนนี้อยู่ในมือใคร"**
//
// ⚠️ **ไม่โคลนคิวคำร้อง** — `RequestQueuePanel` เป็นตารางของ *ใบ* ตั้งแต่ทะเบียนคอลัมน์
// ยันตัวกรอง ยัดแถวกลิ่นเข้าไปคือการสร้างทะเบียนคอลัมน์ที่สองในไฟล์เดียวกัน · ที่นี่จึง
// เป็นตารางใหม่จริง ๆ แต่ **คำศัพท์ของเซลล์ยืมมาทั้งหมด** (TableScroll · StatusBadge ·
// ปุ่มกลาง · `NA`) — ตารางใหม่ได้ แต่ห้ามมีภาษาใหม่
//
// ⚠️ **หัวหน้าแจก · ผู้ปรุงดูอย่างเดียว** (มติผู้ใช้) — ด่านเดียวกับที่ API ใช้ปฏิเสธจริง
// (`canAssignBriefPerfumer`) ⇒ คนที่แจกไม่ได้ **ไม่เห็นปุ่ม** ส่วนคนที่แจกได้แต่แถวติดด่าน
// (กลิ่นส่งไปแล้ว) **เห็นปุ่มแล้วบอกเหตุตอนกด** — กติกา UI ของระบบ
import { useCallback, useEffect, useMemo, useState } from "react";
import { SprayCan, UserPlus } from "lucide-react";
import Workspace, { Metric, MetricStrip, WorkspaceSection } from "@/components/ui/Workspace";
import { TableGroupRow, TableScroll } from "@/components/ui/Table";
import EmptyState from "@/components/ui/EmptyState";
import StatusBadge from "@/components/ui/StatusBadge";
import GatedAction from "@/components/ui/GatedAction";
import BriefPerfumerModal from "@/components/requests/BriefPerfumerModal";
import Link from "next/link";
import { apiFetch, apiJson } from "@/lib/apiFetch";
import { businessDate } from "@/lib/businessDate";
import { NA, fmtDate, naText } from "@/lib/format";
import { notifyToast } from "@/lib/feedback";
import { useCapUser, useDepartment } from "@/lib/roleContext";
import { canAssignBriefPerfumer } from "@/lib/deptRequests";
import useLatestRun from "@/lib/ui/useLatestRun";
import useRevalidateOnFocus from "@/lib/ui/useRevalidateOnFocus";
import {
  compareBoardRows, isOverdue, perfumerBoardTotals, perfumerGroups,
} from "@/lib/rd/perfumerBoard";
import styles from "./page.module.css";

const COLS = 5;

export default function RdPerfumersPage() {
  const me = useCapUser();
  const department = useDepartment();
  const [rows, setRows] = useState([]);
  const [perfumers, setPerfumers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [assigning, setAssigning] = useState(null);
  const [saving, setSaving] = useState(false);
  const [collapsed, setCollapsed] = useState({});
  const startRun = useLatestRun();

  /* ⚠️ ด่านของจอต้องเป็น **ฟังก์ชันตัวเดียวกับที่ API ใช้ปฏิเสธ** — คิดเงื่อนไขขึ้นเอง
     ตรงจุดที่วางปุ่มเมื่อไร วันหนึ่งปุ่มกับด่านจะพูดคนละเรื่อง · หน้านี้ตรึงฝ่ายเป็น RD
     อยู่แล้ว (เส้น API ก็ตรึง) จึงถามด้วยใบสมมติที่มีแค่ `dept` พอ */
  const canAssign = useMemo(
    () => canAssignBriefPerfumer({ ...me, department }, { dept: "RD" }),
    [me, department],
  );

  const load = useCallback(async (opts) => {
    const isLatest = startRun();
    if (!opts?.background) setLoading(true);
    if (!opts?.background) setLoadError("");
    try {
      const data = await apiJson("/api/rd/perfumer-board", { cache: "no-store" });
      if (!isLatest()) return;
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      if (!isLatest()) return;
      if (!opts?.background) setLoadError(e.message);
    }
    if (isLatest()) setLoading(false);
  }, [startRun]);

  useEffect(() => { load(); }, [load]);
  useRevalidateOnFocus(load);

  /* รายชื่อผู้ปรุง — แหล่งเดียวกับที่ทะเบียนกลิ่นใช้ (`role === 'rd_perfumer'`)
     ⚠️ **ล้มแล้วเงียบ** ตามแพตเทิร์นเดิมของระบบ: คนที่ไม่มี `pm:view` ต้องยังเปิด
     ตารางอ่านได้ตามปกติ ไม่ใช่เจอหน้าพังเพราะดึงรายชื่อไม่ได้ · โมดัลมีข้อความ
     ของตัวเองเมื่อรายชื่อว่าง
     ⚠️ `includeDisabled` ไม่ต้อง — แจกงานให้คนที่ปิดบัญชีไปแล้วไม่ได้ ส่วนชื่อเดิม
     ของแถวเก่ายังอ่านได้จาก `perfumerName` ที่แช่ไว้ในแถว */
  useEffect(() => {
    let alive = true;
    apiFetch("/api/pm/assignable-users")
      .then((res) => (res.ok ? res.json() : []))
      .then((list) => {
        if (alive) setPerfumers((list || []).filter((u) => u.role === "rd_perfumer"));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // วันไทย ไม่ใช่วัน UTC — ก่อนเจ็ดโมงเช้า `toISOString()` ยังให้เมื่อวาน แล้ว
  // "เลยกำหนด" จะนับผิดไปหนึ่งวันทุกเช้า
  const today = businessDate();
  const totals = useMemo(() => perfumerBoardTotals(rows, { todayIso: today }), [rows, today]);
  const groups = useMemo(
    () => perfumerGroups(rows, { todayIso: today })
      .map((g) => ({ ...g, rows: [...g.rows].sort(compareBoardRows) })),
    [rows, today],
  );

  const submit = async ({ briefId, perfumerId, perfumerName }) => {
    const row = rows.find((r) => r.briefId === briefId);
    if (!row) return false;
    setSaving(true);
    try {
      await apiJson(`/api/sa/requests/${row.requestId}`, {
        method: "PATCH",
        json: { action: "assign-brief", briefId, perfumerId, perfumerName },
        fallbackError: "แจกงานไม่สำเร็จ",
      });
      notifyToast(perfumerId ? "แจกงานแล้ว" : "ถอนการแจกแล้ว");
      setAssigning(null);
      // ⚠️ เบื้องหลัง — ตารางมีของอยู่แล้ว ไม่ต้องให้ทั้งหน้าหายไปแล้วโผล่ใหม่
      await load({ background: true });
      return true;
    } catch (e) {
      notifyToast.error(e.message || "แจกงานไม่สำเร็จ");
      return false;
    } finally {
      setSaving(false);
    }
  };

  return (
    <Workspace
      icon={<SprayCan size={22} />}
      title="ตารางงานผู้ปรุงกลิ่น"
      subtitle="กลิ่นที่ยังเดินอยู่ทั้งฝ่าย เรียงตามคนที่รับผิดชอบ — กองที่ยังไม่แจกอยู่บนสุด"
      loading={loading}
    >
      <div className="flex flex-col gap-4">
        {loadError ? (
          <EmptyState icon={SprayCan}>{loadError}</EmptyState>
        ) : null}

        {/* ⚠️ 0 ก็เป็นข้อมูล — "ยังไม่แจก 0" คือคำตอบที่หัวหน้าเปิดหน้ามาเพื่อจะรู้
            ซ่อนตอนว่างทำให้แยกไม่ออกจาก "ยังโหลดไม่เสร็จ" */}
        {!loading && !loadError ? (
          <MetricStrip aria-label="ยอดงานของฝ่าย นับเป็นกลิ่น">
            <Metric label="กลิ่นที่เดินอยู่" value={`${totals.scents} กลิ่น`} />
            <Metric
              label="ยังไม่แจก" value={`${totals.unassigned} กลิ่น`}
              tone={totals.unassigned > 0 ? "warning" : undefined}
              note="กองที่ต้องจัดคนก่อนอย่างอื่น"
            />
            <Metric
              label="เลยกำหนด" value={`${totals.overdue} กลิ่น`}
              tone={totals.overdue > 0 ? "danger" : undefined}
              note="นับเฉพาะกลิ่นที่ยังไม่ได้ส่ง"
            />
            <Metric label="ส่งแล้ว" value={`${totals.sent} กลิ่น`} note="เปลี่ยนผู้ปรุงไม่ได้แล้ว" />
          </MetricStrip>
        ) : null}

        <WorkspaceSection
          icon={<SprayCan size={17} />}
          title="กลิ่นรายคน"
          subtitle="หนึ่งแถวคือหนึ่งกลิ่น — ชื่อผู้ปรุงที่แจกไว้จะถูกบันทึกลงทะเบียนกลิ่นตอนส่งงาน"
          actions={<span className="ui-badge">{groups.length} กอง</span>}
        >
          {!loading && !groups.length ? (
            <EmptyState icon={SprayCan}>ยังไม่มีกลิ่นที่เดินอยู่ในฝ่ายตอนนี้</EmptyState>
          ) : (
            <TableScroll>
              <table className="w-full">
                <thead>
                  <tr>
                    <th>กลิ่น</th>
                    <th>ลูกค้า</th>
                    <th>กำหนดส่ง</th>
                    <th>สถานะ</th>
                    <th>ผู้ปรุง</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => (
                    <RowGroup
                      key={group.key}
                      group={group}
                      today={today}
                      canAssign={canAssign}
                      collapsed={!!collapsed[group.key]}
                      onToggle={() => setCollapsed((c) => ({ ...c, [group.key]: !c[group.key] }))}
                      onAssign={setAssigning}
                    />
                  ))}
                </tbody>
              </table>
            </TableScroll>
          )}
        </WorkspaceSection>
      </div>

      <BriefPerfumerModal
        row={assigning} perfumers={perfumers} saving={saving}
        onClose={() => setAssigning(null)} onSubmit={submit}
      />
    </Workspace>
  );
}

/* หนึ่งกอง = หนึ่งคน (หรือกองกลาง) — หัวกองพับได้เพราะคนที่ถือ 10 กลิ่นไม่ควรดัน
   กองที่เหลือตกจอ · ยอดบนหัวกองเป็น **ยอดทั้งกอง** เสมอ ไม่ใช่ยอดที่เห็นบนหน้านี้ */
function RowGroup({ group, today, canAssign, collapsed, onToggle, onAssign }) {
  return (
    <>
      <TableGroupRow
        colSpan={COLS}
        label={group.name}
        badge={group.overdue > 0 ? `เลยกำหนด ${group.overdue}` : null}
        total={`${group.total} กลิ่น`}
        totalTitle="จำนวนกลิ่นทั้งกอง"
        collapsed={collapsed}
        onToggle={onToggle}
      />
      {collapsed ? null : group.rows.map((row) => (
        <tr key={row.briefId}>
          <td>
            <div>{row.label}</div>
            {/* ⚠️ ลิงก์จริง ไม่ใช่ onClick บนแถว — แถวนี้มีปุ่มของตัวเองอยู่ท้ายแถว
                ทั้งแถวคลิกได้เมื่อไรจะกลายเป็นปุ่มซ้อนปุ่ม (ผิด WCAG และผิดด่าน UI) */}
            <div className={styles.sub}>
              <Link className="linklike" href={`/requests/${row.requestId}`}>
                {naText(row.docNo)}
              </Link>
              {row.title ? ` · ${row.title}` : ""}
            </div>
          </td>
          <td>{naText(row.customerName)}</td>
          <td>
            {row.dueDate ? (
              <span className={isOverdue(row, today) ? styles.overdue : undefined}>
                {fmtDate(row.dueDate)}
              </span>
            ) : NA}
            {/* วันที่ยังไม่ได้รับปาก = วันที่ผู้ขอ *ขอมา* ไม่ใช่วันที่ฝ่ายให้ไว้ —
                สองอย่างนี้ต่างกันมากตอนตามงาน ⇒ ต้องบอกให้รู้ ไม่ใช่โชว์วันเปล่า ๆ */}
            {row.dueDate && !row.committed ? (
              <div className={styles.sub}>วันที่ผู้ขอต้องการ</div>
            ) : null}
          </td>
          <td><RowStatus row={row} /></td>
          <td>
            {row.perfumer.name ? row.perfumer.name : <span className={styles.dim}>{NA}</span>}
            {canAssign ? (
              /* ⚠️ `blocker` มาจากด่านฝั่งเซิร์ฟเวอร์ที่ติดมากับแถว — ปุ่มโชว์เสมอ
                 แล้วบอกเหตุตอนกด ไม่ใช่ `disabled` เงียบ ๆ ที่ไม่สอนอะไรใคร */
              <div className={styles.sub}>
                <GatedAction
                  blocker={row.blocker}
                  size="sm" variant="quiet" icon={<UserPlus size={14} />}
                  onClick={() => onAssign(row)}
                >
                  {row.perfumer.name ? "เปลี่ยนผู้ปรุง" : "แจกงาน"}
                </GatedAction>
              </div>
            ) : null}
          </td>
        </tr>
      ))}
    </>
  );
}

/* สถานะของ **กลิ่นก้อนนี้** ไม่ใช่ของทั้งใบ — สามคำที่ตอบว่าต้องลงมือหรือยัง
   ⚠️ ไม่ยืมป้ายสถานะของใบมาใช้ตรง ๆ: ใบอาจ "กำลังทำ" ทั้งที่กลิ่นก้อนนี้ยังไม่มีใครแตะ */
function RowStatus({ row }) {
  if (row.sent) return <StatusBadge tone="success" label="ส่งแล้ว" showIcon={false} />;
  if (row.untouched) return <StatusBadge tone="warning" label="ยังไม่ลงมือ" showIcon={false} />;
  return <StatusBadge tone="info" label={`กำลังทำ ${row.directions} ตัว`} showIcon={false} />;
}
