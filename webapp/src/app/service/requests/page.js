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
import { DEPT_QUEUE_TAB_KEYS, deptQueueRows, deptQueueTabs } from "@/lib/requests/queueBoard";
import { filterQueueRows, queueStripCounts } from "@/lib/requests/queueFilter";
import { compareRequestUrgency } from "@/lib/deptRequests";
import { apiFetch } from "@/lib/apiFetch";

const DEPT = "TS";

const TAB_BLURB = {
  todo: "งานที่รอ TS ทำต่อ — ใบที่ยังไม่มีใครรับขึ้นก่อนเสมอ",
  waiting: "ส่งผลประเมินกลับไปแล้ว รอฝ่ายขายรับและปิดเรื่อง",
  history: "เรื่องที่ปิดครบสองฝั่งหรือยกเลิกแล้วของ TS — ปิดล่าสุดอยู่บนสุด",
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
  /* ⭐ ประวัติเรียง "ปิดล่าสุดก่อน" (ม-145) — ความเร่งไม่มีความหมายกับใบที่จบแล้ว และดัน
     ใบที่ยกเลิกก่อนมีใครรับเรื่องขึ้นบนสุด · ออกจากประวัติกลับไปแบบเรียงตั้งต้นของหน้า
     ⚠️ เฝ้าแค่ "เข้า/ออกประวัติ" ไม่ใช่ทุกแท็บ — ผู้ใช้ยังเปลี่ยนแบบเรียงเองในแท็บเดิมได้ */
  const inHistory = tab === "history";
  const { setSort } = board;
  useEffect(() => { setSort(inHistory ? "closed" : "urgency"); }, [inHistory, setSort]);
  /* ⚠️ **สลับแท็บแล้วล้างตัวกรองตัวเลขทุกครั้ง** (ตรวจตัวเลข 20/10/2026 M3 · ขยายจาก ม-145 ที่ล้างเฉพาะ
     ตอนเข้าประวัติ) — บางช่องมีได้แท็บเดียว ("กำลังดำเนินการ" เป็น 0 เสมอในแท็บรอผู้ขอ · "รอผู้ขอทำต่อ"
     เป็น 0 เสมอในแท็บรอฝ่าย · ประวัติไม่มีแถบเลย) ⇒ ตัวกรองที่ค้างมาให้ตารางว่างทั้งที่เลขบนแท็บบอกว่ามีใบ
     ⭐ กดแท็บที่เปิดอยู่ซ้ำ = "ทั้งแท็บ" · คำค้นกับแผงกรองยังตามไป เพราะเลขบนแท็บนับพร้อมมันแล้ว (`tabCount`) */
  const setTab = (next) => {
    board.setCountFilter(null);
    router.replace(`/service/requests?tab=${next}`, { scroll: false });
  };

  const reload = useCallback(async (opts) => {
    /* โหมดเบื้องหลัง (ดึงเองตอนกลับมามองแท็บ) ห้ามพาหน้าไปอยู่สถานะโหลด —
       จอมีของอยู่แล้วและผู้ใช้ไม่ได้สั่งอะไร ตารางต้องไม่หายแล้วโผล่ใหม่
       ⚠️ รอบที่ล้มในเบื้องหลังต้องเงียบด้วย — ของเดิมบนจอยังใช้ได้อยู่ */
    if (!opts?.background) setLoading(true);
    setLoadError("");
    try {
      const res = await apiFetch(`/api/sa/requests?dept=${DEPT}`, { cache: "no-store" });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error || "โหลดคำร้องไม่สำเร็จ");
      setRequests(Array.isArray(d) ? d : []);
    } catch (e) { if (!opts?.background) setLoadError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);
  // ใบใหม่จาก SA เข้ามาระหว่างที่แท็บเปิดค้าง — กลับมาที่แท็บนี้ต้องเห็นของจริง
  useRevalidateOnFocus(reload);

  /* ⭐ **กดเมนูคิวคำร้องขณะอยู่หน้านี้ = เริ่มคิวใหม่** (ตรวจตัวเลข 20/10/2026 M3 · เหตุผลเต็มที่ `/rd/requests`)
     — ป้ายบนเมนูนับแท็บ "รอ TS ตอบ" ทั้งแท็บ แต่เมนูเป็น <Link> ไป URL เปล่าซึ่งไม่ mount หน้าใหม่ ⇒ คำค้น/
     ตัวกรองที่ค้างตามมา · URL เปล่ามาจากเมนูทางเดียว (`setTab` เขียน `?tab=` เสมอ) ⇒ ล้างทุกชั้นแล้วเขียน
     `?tab=todo` ทับ ให้กดเมนูครั้งถัดไปจับได้ */
  const bareUrl = searchParams.toString() === "";
  const { setSearch, clearFilters, setCountFilter } = board;
  useEffect(() => {
    if (!bareUrl) return;
    setSearch(""); clearFilters(); setCountFilter(null);
    router.replace("/service/requests?tab=todo", { scroll: false });
  }, [bareUrl, setSearch, clearFilters, setCountFilter, router]);

  const rows = useMemo(
    () => deptQueueRows(requests, { dept: DEPT, tab }).slice().sort(compareRequestUrgency),
    [requests, tab],
  );
  /* ⭐ **ทุกตัวเลขบนหน้านับด้วยตัวตัดสินเดียวกับตาราง** (`queueFilter.js` · ตรวจตัวเลข 20/10/2026 M2 M3)
     · แถบตัวเลข = แท็บนี้ + คำค้น + แผงกรอง (ไม่รวมช่องที่กดค้าง) ⇒ กดช่องไหนก็ได้แถวเท่าเลขช่องนั้น
     · เลขบนแท็บ = แท็บนั้น + คำค้น + แผงกรอง (ไม่รวมตัวกรองตัวเลข เพราะ `setTab` ล้างมัน)
     ⚠️ `filters` ชุดเดียวกับที่พาเนลใช้ (`tools` ตั้งต้น "full") */
  const queueState = {
    countFilter: board.countFilter, search: board.search, filters: board.filters, todayIso: businessDate(),
  };
  const counts = queueStripCounts(rows, queueState);
  const tabCount = (key) => filterQueueRows(deptQueueRows(requests, { dept: DEPT, tab: key }), queueState, { except: "count" }).length;

  return (
    <Workspace
      icon={<MessageCircleQuestion size={22} />}
      /* ชื่อฝ่ายสะกดแบบเดียวกับเมนูและ `DEPARTMENT_NAMES_TH` — ฝ่ายเดียวต้องมีชื่อเดียว */
      title="คิวคำร้องฝ่ายธุรกิจบริการ"
      subtitle={TAB_BLURB[tab]}
      /* ⚠️ **ไม่มีปุ่ม "เปิดคำร้อง"** — คิวของฝ่ายเป็นที่ *ตอบ* ไม่ใช่ที่เปิด (ม-29)
         ⭐ ตัวสลับมุมมองอยู่ในแถบเครื่องมือของแผงคิว (`toolbarEnd` · มติผู้ใช้ 2026-09-15) */
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
            // นับจากชุดเดียวกับที่แท็บนั้นแสดงจริง (รวมคำค้น/แผงกรองที่ตามไป) — ตัวเลขบนแท็บกับตารางข้างล่างขัดกันไม่ได้
            count: tabCount(t.key),
          }))}
        />
      </div>

      {/* ไม่มีแถบตัวเลขในประวัติ — ทุกช่องเป็นศูนย์ (ม-145 · ม-80 ข้อ 3) */}
      {!loading && !loadError && tab !== "history" && (
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
        /* ป้ายตัวเลือกที่ติ๊กอยู่แต่ไม่มีในแท็บนี้ (เช่น `?owner=` หลังสลับแท็บ) อ่านจากทุกแท็บ */
        labelRows={requests}
        /* หัวแผงรายการกลับมา (มติผู้ใช้ 2026-09-15 · D1 — แทนมติถอดหัวการ์ด 2026-09-07) */
        icon={<MessageCircleQuestion size={17} aria-hidden="true" />}
        sectionTitle="รายการคำร้องถึงฝ่ายธุรกิจบริการ"
        toolbarEnd={(
          <ViewSwitcher
            value={board.view} onChange={board.setView}
            modes={["table", "list"]} ariaLabel="มุมมองคิวคำร้อง"
          />
        )}
        /* ประวัติโชว์ "วันที่ปิดเรื่อง" สองฝั่งแทนกำหนดส่ง (ม-145 · preset `history`) */
        columns={tab === "history" ? "history" : "queue"}
        emptyText={tab === "history" ? `ยังไม่มีเรื่องของ ${DEPT} ที่จบแล้ว` : null}
        loading={loading} loadError={loadError} reload={reload}
      />
      </div>
    </Workspace>
  );
}
