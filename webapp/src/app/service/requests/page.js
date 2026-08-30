"use client";
// ── คิวคำร้องของฝ่ายธุรกิจบริการ (mig 0314) ───────────────────────────────
//
// ⚠️ **ฝาแฝดของ `/rd/requests` และ `/finance/requests` โดยตั้งใจ** (ม-34) — ต่างกัน
// แค่ค่า `DEPT` กับป้ายชื่อ · ของกลางทั้งหมด (`RequestQueuePanel` · `queueBoard` ·
// `useQueueBoard`) ใช้ตัวเดิม **ห้ามโคลนของกลาง** — โคลนแล้วอีกสามเดือนคิวสามที่จะ
// นับไม่ตรงกันโดยไม่มีใครรู้
//
// ⭐ **มุมของฝ่าย ไม่ใช่มุมของคน** — `/requests` ตอบว่า "ตอนนี้เป็นตาใคร" ส่วนหน้านี้
// ตอบว่า "งานของฝ่ายเราค้างตรงไหน" ⇒ กรองด้วยฝ่ายก่อนเสมอ
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MessageCircleQuestion } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import Segmented from "@/components/ui/Segmented";
import ViewSwitcher from "@/components/ui/ViewSwitcher";
import RequestQueuePanel from "@/components/requests/RequestQueuePanel";
import QueueCountStrip from "@/components/requests/QueueCountStrip";
import { useQueueBoard } from "@/lib/requests/useQueueBoard";
import useRevalidateOnFocus from "@/lib/ui/useRevalidateOnFocus";
import { businessDate } from "@/lib/businessDate";
import { DEPT_QUEUE_TAB_KEYS, deptQueueRows, deptQueueTabs, queueCounts } from "@/lib/requests/queueBoard";
import { compareRequestUrgency } from "@/lib/deptRequests";
import { apiFetch } from "@/lib/apiFetch";

const DEPT = "TS";

const TAB_BLURB = {
  todo: "งานที่รอ TS ทำต่อ — ใบที่ยังไม่มีใครรับขึ้นก่อนเสมอ",
  waiting: "ส่งผลประเมินกลับไปแล้ว รอฝ่ายขายรับและปิดเรื่อง",
  history: "เรื่องที่จบแล้วทั้งหมดของ TS",
};

export default function ServiceRequestsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const board = useQueueBoard();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // แท็บอยู่ใน URL — ลิงก์ตรงและปุ่มย้อนกลับของเบราว์เซอร์ทำงานได้จริง
  const tabKeys = DEPT_QUEUE_TAB_KEYS;
  const urlTab = searchParams.get("tab");
  const tab = tabKeys.includes(urlTab) ? urlTab : "todo";
  const setTab = (next) => router.replace(`/service/requests?tab=${next}`, { scroll: false });

  const reload = useCallback(async (opts) => {
    /* โหมดเบื้องหลัง (ดึงเองตอนกลับมามองแท็บ) ห้ามพาหน้าไปอยู่สถานะโหลด —
       จอมีของอยู่แล้วและผู้ใช้ไม่ได้สั่งอะไร ตารางต้องไม่หายแล้วโผล่ใหม่
       ⚠️ รอบที่ล้มในเบื้องหลังต้องเงียบด้วย — ของเดิมบนจอยังใช้ได้อยู่ */
    if (!opts?.background) setLoading(true);
    setLoadError("");
    try {
      const res = await apiFetch("/api/sa/requests", { cache: "no-store" });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error || "โหลดคำร้องไม่สำเร็จ");
      setRequests(Array.isArray(d) ? d : []);
    } catch (e) { if (!opts?.background) setLoadError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);
  // ใบใหม่จาก SA เข้ามาระหว่างที่แท็บเปิดค้าง — กลับมาที่แท็บนี้ต้องเห็นของจริง
  useRevalidateOnFocus(reload);

  const rows = useMemo(
    () => deptQueueRows(requests, { dept: DEPT, tab }).slice().sort(compareRequestUrgency),
    [requests, tab],
  );
  const counts = queueCounts(rows, { todayIso: businessDate() });

  return (
    <Workspace
      icon={<MessageCircleQuestion size={22} />}
      /* ชื่อฝ่ายสะกดแบบเดียวกับเมนูและ `DEPARTMENT_NAMES_TH` — ฝ่ายเดียวต้องมีชื่อเดียว */
      title="คิวคำร้องฝ่ายธุรกิจบริการ"
      subtitle={TAB_BLURB[tab]}
      /* ⚠️ **ไม่มีปุ่ม "เปิดคำร้อง"** — คิวของฝ่ายเป็นที่ *ตอบ* ไม่ใช่ที่เปิด (ม-29) */
      headerRight={(
        <ViewSwitcher
          value={board.view} onChange={board.setView}
          modes={["table", "list"]} ariaLabel="มุมมองคิวคำร้อง"
        />
      )}
    >
      <div className="flex flex-col gap-4">

      <div className="scope-row">
        <Segmented
          ariaLabel="มุมมองคิวของฝ่ายธุรกิจบริการ"
          className="scope-toggle"
          value={tab}
          onChange={setTab}
          options={deptQueueTabs(DEPT).map((t) => ({
            value: t.key,
            label: t.label,
            // นับจากชุดเดียวกับที่แท็บนั้นแสดงจริง — ตัวเลขบนแท็บกับตารางข้างล่างขัดกันไม่ได้
            count: deptQueueRows(requests, { dept: DEPT, tab: t.key }).length,
          }))}
        />
      </div>

      {!loading && !loadError && (
        <QueueCountStrip
          counts={counts}
          filter activeKey={board.countFilter}
          note="กดเพื่อกรองรายการ"
          ariaLabel="ตัวเลขสรุปคิวของฝ่าย — กดเพื่อกรอง" scope="dept"
          onSelect={(key, on) => board.setCountFilter(on ? null : key)}
        />
      )}

      <RequestQueuePanel
        scope="queue" dept={DEPT} rows={rows} board={board}
        loading={loading} loadError={loadError} reload={reload}
      />
      </div>
    </Workspace>
  );
}
