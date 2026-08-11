"use client";
// ── คิวคำร้องของฝ่ายวิจัยและพัฒนา (P2 · ม-29) ────────────────────────────
//
// ⭐ **มุมของฝ่าย ไม่ใช่มุมของคน** — `/requests` ตอบว่า "ตอนนี้เป็นตาใคร" (รวมใบที่
// ฉันเปิดถึงฝ่ายอื่น) ส่วนหน้านี้ตอบว่า "งานของฝ่ายเราค้างตรงไหน" ⇒ กรองด้วยฝ่าย
// ก่อนเสมอ ไม่ดูว่าใครเป็นคนเปิด
//
// ⚠️ **ตัวใบยังเป็นจอเดียวกันทั้งสองฝั่ง** (`/requests/[id]` · มติ ม-31) — ที่แยกคือ
// คิว ไม่ใช่ใบ · ทำสองจอเมื่อไรทุกก้าวที่เพิ่มต้องแก้สองที่แล้ววันหนึ่งจะเพี้ยนกัน
//
// ⚠️ ของกลางทั้งหมดใช้ตัวเดิม (`RequestQueuePanel` · `queueBoard`) **ห้ามโคลน**
// (ม-34) — โคลนแล้วอีกสามเดือนคิวสองที่จะนับไม่ตรงกันโดยไม่มีใครรู้
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FlaskConical } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import Segmented from "@/components/ui/Segmented";
import ViewSwitcher from "@/components/ui/ViewSwitcher";
import RequestQueuePanel from "@/components/requests/RequestQueuePanel";
import QueueCountStrip from "@/components/requests/QueueCountStrip";
import { useQueueBoard } from "@/lib/requests/useQueueBoard";
import { businessDate } from "@/lib/businessDate";
import { DEPT_QUEUE_TABS, deptQueueRows, queueCounts } from "@/lib/requests/queueBoard";
import { compareRequestUrgency } from "@/lib/deptRequests";

const DEPT = "RD";

const TAB_BLURB = {
  todo: "งานที่รอฝ่ายเราทำต่อ — เรื่องที่ยังไม่มีใครรับขึ้นก่อนเสมอ",
  waiting: "ส่งของไปแล้ว รอฝ่ายขายรับ/ส่งลูกค้า/ตอบกลับ — ไม่ใช่งานค้างของเรา แต่ต้องตามได้",
  history: "เรื่องที่จบแล้วทั้งหมดของฝ่าย",
};

export default function RdRequestsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const board = useQueueBoard();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // แท็บอยู่ใน URL — ลิงก์ตรงและปุ่มย้อนกลับของเบราว์เซอร์ทำงานได้จริง
  const tabKeys = DEPT_QUEUE_TABS.map((t) => t.key);
  const urlTab = searchParams.get("tab");
  const tab = tabKeys.includes(urlTab) ? urlTab : "todo";
  const setTab = (next) => router.replace(`/rd/requests?tab=${next}`, { scroll: false });

  // ⚠️ **ไม่มีตัวสลับขอบเขต** — ขอบเขตกรองด้วย "ใครเป็นคนเปิด" ซึ่งไม่มีความหมาย
  // สำหรับคิวของฝ่าย (ฝ่ายต้องเห็นงานของฝ่ายครบเสมอ ไม่ว่าใครเปิด)
  // API คืนคิวของฝ่ายที่ผู้ใช้ตอบได้มาให้อยู่แล้ว — ด่านจริงอยู่ที่นั่น
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

  /* ⭐ **`?owner=` มาจากตาราง "งานค้างรายคน" บนหน้าภาพรวม** (2026-08-12 · แบบ ก) —
     กดชื่อคนแล้วต้องได้คิวที่ **กรองคนนั้นไว้แล้ว** ไม่ใช่คิวทั้งกองให้ไปหาเอง
     ⚠️ ตั้งครั้งเดียวตอนเปิดจากลิงก์ แล้วปล่อยให้ผู้ใช้แก้ตัวกรองต่อได้เอง — เฝ้า
     ค่าตลอดเวลาแปลว่าผู้ใช้กดล้างตัวกรองไม่ได้เลย (มันจะเด้งกลับมาทุก render) */
  const ownerParam = searchParams.get("owner");
  const { setFilter, setCountFilter } = board;
  useEffect(() => {
    if (ownerParam) setFilter("owner", [ownerParam]);
  }, [ownerParam, setFilter]);

  /* ⭐ `?count=` มาจากปุ่มบนหน้าภาพรวม (ปฏิทินคำสัญญา → "ยังไม่ได้ให้วัน") —
     คีย์เดียวกับแถบตัวเลขในหน้านี้ (`QUEUE_COUNT_META`) ⇒ กดแล้วได้คิวที่กรองไว้แล้ว
     ⚠️ ตั้งครั้งเดียวตอนเปิดจากลิงก์ เหมือน `?owner=` — เฝ้าค่าตลอดแปลว่ากดล้างไม่ได้ */
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
      icon={<FlaskConical size={22} />}
      /* ⚠️ ชื่อฝ่ายสะกดแบบเดียวกับหน้าภาพรวม ("ฝ่ายวิจัยและพัฒนา") — เดิมหน้านี้เขียน
         "R&D" ส่วนภาพรวมเขียนไทย และข้อความว่างพูด "ฝ่าย RD" ⇒ ฝ่ายเดียวสามชื่อ */
      title="คิวคำร้องฝ่ายวิจัยและพัฒนา"
      subtitle={TAB_BLURB[tab]}
      /* ⭐ ตัวสลับมุมมองอยู่ในหัวการ์ดตามต้นแบบหน้างานของฉัน
         ⚠️ **ไม่มีปุ่ม "เปิดคำร้อง"** — คิวของฝ่ายเป็นที่ *ตอบ* ไม่ใช่ที่เปิด (ม-29) */
      headerRight={(
        <ViewSwitcher
          value={board.view} onChange={board.setView}
          modes={["table", "list"]} ariaLabel="มุมมองคิวคำร้อง"
        />
      )}
    >
      <div className="flex flex-col gap-4">

      {/* ⭐ แท็บเป็น pill ทรงเดียวกับตัวเลือกทุกหน้าในระบบ — เดิมเป็นขีดเส้นใต้
          ซึ่งเป็นคนละภาษากับ segmented ที่หน้าอื่นใช้ (มติผู้ใช้ 2026-08-08) */}
      <div className="scope-row">
        <Segmented
          ariaLabel="มุมมองคิวของฝ่ายวิจัยและพัฒนา"
          className="scope-toggle"
          value={tab}
          onChange={setTab}
          options={DEPT_QUEUE_TABS.map((t) => ({
            value: t.key,
            label: t.label,
            // นับจากชุดเดียวกับที่แท็บนั้นแสดงจริง — ตัวเลขบนแท็บกับตารางข้างล่าง
            // ขัดกันไม่ได้ · ส่งเป็น `count` ไม่ใช่ต่อท้ายป้ายชื่อ (ดู Segmented.js)
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
