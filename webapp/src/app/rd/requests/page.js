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
import Tabs from "@/components/ui/Tabs";
import RequestQueuePanel from "@/components/requests/RequestQueuePanel";
import { DEPT_QUEUE_TABS, deptQueueRows } from "@/lib/requests/queueBoard";
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

  const rows = useMemo(
    () => deptQueueRows(requests, { dept: DEPT, tab }).slice().sort(compareRequestUrgency),
    [requests, tab],
  );

  return (
    <Workspace
      icon={<FlaskConical size={22} />}
      title="คิวคำร้องของฝ่าย R&D"
      subtitle={TAB_BLURB[tab]}
    >
      <Tabs
        value={tab} onChange={setTab}
        tabs={DEPT_QUEUE_TABS.map((t) => ({
          key: t.key,
          // นับจากชุดเดียวกับที่แท็บนั้นแสดงจริง — ตัวเลขบนแท็บกับตารางข้างล่าง
          // ขัดกันไม่ได้
          label: `${t.label} (${deptQueueRows(requests, { dept: DEPT, tab: t.key }).length})`,
        }))}
        ariaLabel="มุมมองคิวของฝ่าย R&D"
      />

      <RequestQueuePanel
        scope="queue" dept={DEPT} rows={rows}
        showNewRequest={false}
        loading={loading} loadError={loadError} reload={reload}
      />
    </Workspace>
  );
}
