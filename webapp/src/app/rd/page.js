"use client";
// ── ภาพรวมฝ่ายวิจัยและพัฒนา (P2 · ม-29 · Q34 ก) ──────────────────────────
//
// ⭐ ตอบคำถามเดียว: **"งานของฝ่ายค้างตรงไหน และอะไรใกล้ถึงกำหนด"**
//
// ⚠️ **ยังไม่มีสถิติ/กราฟโดยตั้งใจ** — ทั้งระบบมีคำร้องหลักหน่วย กราฟที่มีจุดเดียว
// แย่กว่าไม่มีกราฟ · เติมเมื่อมีของจริงพอ (Q34: "โครงหน้าเผื่อไว้")
//
// ⚠️ ใช้ primitive กลางทั้งหน้า (`MetricStrip` · `TableShell` · `Button`) — ห้ามเขียน
// `glass-panel` / `premium-table` / คลาส `btn` ดิบ · `npm run audit:ui` มี ratchet
// คุมยอดชั้นเก่าไว้ และของที่เพิ่งเขียนไม่ควรไปเพิ่มยอดนั้น
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlarmClock, FlaskConical } from "lucide-react";
import Workspace, { Metric, MetricStrip } from "@/components/ui/Workspace";
import SkeletonRows from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import StatusBadge from "@/components/ui/StatusBadge";
import Button from "@/components/ui/Button";
import { TableShell } from "@/components/ui/Table";
import { fmtDate } from "@/lib/format";
import { businessDate } from "@/lib/businessDate";
import { requestKindLabel } from "@/lib/master/requestTypes";
import { REQUEST_STATUS_LABELS, REQUEST_STATUS_TONES } from "@/lib/deptRequests";
import {
  QUEUE_COUNT_META, dueSoonRows, queueCounts, requestNextStep,
} from "@/lib/requests/queueBoard";
import styles from "./page.module.css";

const DEPT = "RD";

// โทนของแถบตัวเลขใช้คำของ `Metric` (good/warning/danger) — ทะเบียนกลางพูดคำของ
// `StatusBadge` ⇒ แปลที่นี่ที่เดียว ไม่แก้ทะเบียนให้กระทบหน้าคิวที่ใช้คำเดิมอยู่
const METRIC_TONE = { warning: "warning", danger: "danger", info: undefined, neutral: undefined };

export default function RdOverviewPage() {
  const router = useRouter();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const res = await fetch("/api/sa/requests", { cache: "no-store" });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error || "โหลดคำร้องไม่สำเร็จ");
      setRequests(Array.isArray(d) ? d : []);
    } catch (e) { setLoadError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // วันไทย ไม่ใช่วัน UTC — ก่อนเจ็ดโมงเช้า toISOString() ยังให้เมื่อวาน แล้ว
  // "เลยกำหนด" จะนับผิดไปหนึ่งวันทุกเช้า
  const today = businessDate();
  // ⚠️ นับจาก **ใบของฝ่าย** เท่านั้น — `requests` ดิบมีใบที่คน RD เปิดถึงฝ่ายอื่นปนอยู่
  // ด้วย ซึ่งไม่ใช่งานที่ฝ่ายนี้ต้องตอบ · ตัวเลขที่นี่ต้องตรงกับหน้าคิวเป๊ะ ๆ
  const deptRows = useMemo(
    () => requests.filter((r) => r.dept === DEPT && r.status !== "draft"),
    [requests],
  );
  const counts = queueCounts(deptRows, { todayIso: today });
  const dueSoon = useMemo(
    () => dueSoonRows(requests, { dept: DEPT, todayIso: today, days: 7 }),
    [requests, today],
  );

  return (
    <Workspace
      icon={<FlaskConical size={22} />}
      title="ภาพรวมฝ่ายวิจัยและพัฒนา"
      subtitle="งานที่ค้างอยู่กับฝ่าย และของที่ใกล้ถึงกำหนดที่รับปากไว้"
    >
      {/* แถบตัวเลข 4 ตัว — ชุดเดียวกับหัวคิว (`QUEUE_COUNT_META`) ไม่ประกาศใหม่
          ⚠️ **0 ก็เป็นข้อมูล** — "ยังไม่รับเรื่อง 0" บอกว่างานไม่ค้าง ซึ่งเป็นสิ่งที่
          หัวหน้าเปิดมาดูเพื่อจะรู้ · ซ่อนตอนว่างทำให้แยกไม่ออกจาก "ยังโหลดไม่เสร็จ" */}
      {!loading && !loadError && (
        <MetricStrip>
          {QUEUE_COUNT_META.map((meta) => (
            <Metric
              key={meta.key}
              as="button" type="button"
              label={meta.label}
              value={counts[meta.key]}
              tone={METRIC_TONE[meta.tone]}
              note="กดเพื่อเปิดคิวที่กรองไว้แล้ว"
              onClick={() => router.push(meta.key === "waitingRequester"
                ? "/rd/requests?tab=waiting"
                : "/rd/requests?tab=todo")}
            />
          ))}
        </MetricStrip>
      )}

      <TableShell
        title="ใกล้ถึงกำหนด และที่เลยกำหนดแล้ว"
        description="นับจากวันที่ฝ่ายรับปากไว้ตอนรับเรื่อง (7 วันข้างหน้า) — ใบที่ยังไม่รับเรื่องอยู่ในคิว"
        actions={<Button onClick={() => router.push("/rd/requests")}>เปิดคิวทั้งหมด</Button>}
      >
        {loading ? (
          <SkeletonRows rows={4} />
        ) : loadError ? (
          <div className={styles.loadError}>{loadError}</div>
        ) : dueSoon.length === 0 ? (
          <EmptyState icon={AlarmClock}>
            ไม่มีงานที่ใกล้ถึงกำหนดใน 7 วัน — ของที่ยังไม่รับเรื่องดูได้ที่คิว
          </EmptyState>
        ) : (
          <table>
            <thead>
              <tr>
                <th>เลขที่</th>
                <th>ชนิด</th>
                <th>เรื่อง / ลูกค้า</th>
                <th>กำหนดส่งที่รับปาก</th>
                <th>ก้าวถัดไป</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {dueSoon.map((r) => {
                const late = String(r.committedDueDate) < String(today);
                return (
                  <tr
                    key={r.id} className={styles.rowLink}
                    onClick={() => router.push(`/requests/${r.id}`)}
                  >
                    <td>{r.docNo || "ร่าง"}</td>
                    <td>{requestKindLabel(r.kind)}</td>
                    <td>{r.title || r.customerName || "—"}</td>
                    <td className={styles.dueCell} data-late={late ? "1" : undefined}>
                      {fmtDate(r.committedDueDate)}
                      {late && <span className={styles.lateTag}>เลยกำหนด</span>}
                    </td>
                    <td>{requestNextStep(r)?.label || "—"}</td>
                    <td>
                      <StatusBadge
                        tone={REQUEST_STATUS_TONES[r.status] || "neutral"}
                        label={REQUEST_STATUS_LABELS[r.status] || r.status}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </TableShell>
    </Workspace>
  );
}
