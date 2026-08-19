"use client";
// ── คิวคำร้องของฝ่ายบัญชีและการเงิน (B-1 · ม-ก) ──────────────────────────
//
// ⭐ **มุมของฝ่าย ไม่ใช่มุมของคน** — `/requests` ตอบว่า "ตอนนี้เป็นตาใคร" (รวมใบที่
// ฉันเปิดถึงฝ่ายอื่น) ส่วนหน้านี้ตอบว่า "งานของฝ่ายเราค้างตรงไหน" ⇒ กรองด้วยฝ่าย
// ก่อนเสมอ ไม่ดูว่าใครเป็นคนเปิด
//
// ⚠️ **ฝาแฝดของ `/rd/requests` โดยตั้งใจ** (ม-34) — ต่างกันแค่ค่า `DEPT` กับป้ายชื่อ ·
// ของกลางทั้งหมด (`RequestQueuePanel` · `queueBoard` · `useQueueBoard`) ใช้ตัวเดิม
// **ห้ามโคลนของกลาง** — โคลนแล้วอีกสามเดือนคิวสองที่จะนับไม่ตรงกันโดยไม่มีใครรู้
// ⚠️ ตัวใบยังเป็นจอเดียวกันทั้งสองฝั่ง (`/requests/[id]` · ม-31) — ที่แยกคือคิว ไม่ใช่ใบ
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Receipt } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import Segmented from "@/components/ui/Segmented";
import ViewSwitcher from "@/components/ui/ViewSwitcher";
import RequestQueuePanel from "@/components/requests/RequestQueuePanel";
import QueueCountStrip from "@/components/requests/QueueCountStrip";
import { useQueueBoard } from "@/lib/requests/useQueueBoard";
import { businessDate } from "@/lib/businessDate";
import { DEPT_QUEUE_TAB_KEYS, deptQueueRows, deptQueueTabs, queueCounts } from "@/lib/requests/queueBoard";
import { compareRequestUrgency } from "@/lib/deptRequests";

const DEPT = "FN";

const TAB_BLURB = {
  todo: "งานที่รอ FN ทำต่อ — เรื่องที่ยังไม่มีใครรับขึ้นก่อนเสมอ",
  waiting: "ออกเอกสารไปแล้ว รอผู้ขอรับ/ส่งลูกค้า — ไม่ใช่งานค้างของเรา แต่ต้องตามได้",
  history: "เรื่องที่จบแล้วทั้งหมดของ FN",
};

export default function FinanceRequestsPage() {
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
  const setTab = (next) => router.replace(`/finance/requests?tab=${next}`, { scroll: false });

  // ⚠️ **ไม่มีตัวสลับขอบเขต** — ขอบเขตกรองด้วย "ใครเป็นคนเปิด" ซึ่งไม่มีความหมาย
  // สำหรับคิวของฝ่าย · API คืนคิวของฝ่ายที่ผู้ใช้ตอบได้มาให้อยู่แล้ว ด่านจริงอยู่ที่นั่น
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

  /* `?owner=` / `?count=` มาจากลิงก์บนหน้าภาพรวม — ตั้งครั้งเดียวตอนเปิดจากลิงก์
     แล้วปล่อยให้ผู้ใช้แก้ตัวกรองต่อได้เอง (เฝ้าค่าตลอด = กดล้างตัวกรองไม่ได้เลย) */
  const ownerParam = searchParams.get("owner");
  const { setFilter, setCountFilter } = board;
  useEffect(() => {
    if (ownerParam) setFilter("owner", [ownerParam]);
  }, [ownerParam, setFilter]);

  const countParam = searchParams.get("count");
  useEffect(() => {
    if (countParam) setCountFilter(countParam);
  }, [countParam, setCountFilter]);

  const rows = useMemo(
    () => deptQueueRows(requests, { dept: DEPT, tab }).slice().sort(compareRequestUrgency),
    [requests, tab],
  );

  const counts = queueCounts(rows, { todayIso: businessDate() });

  return (
    <Workspace
      icon={<Receipt size={22} />}
      /* ชื่อฝ่ายสะกดแบบเดียวกับเมนูและ `DEPARTMENT_NAMES_TH` — ฝ่ายเดียวต้องมีชื่อเดียว */
      title="คิวคำร้องฝ่ายบัญชีและการเงิน"
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
          ariaLabel="มุมมองคิวของฝ่ายบัญชีและการเงิน"
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
