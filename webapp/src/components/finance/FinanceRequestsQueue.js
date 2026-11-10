"use client";
// ── คิวคำร้องของฝ่ายบัญชีและการเงิน — แท็บ "คิวคำร้อง" ของหน้างานบัญชี (รื้อ PR-4b · มติเจ้าของ 09/11/2026 ข้อ 2) ─────────
//
// ⭐ ยกมาจากหน้า `/finance/requests` เดิม (B-1 · ม-ก) ทั้งก้อน — หน้านั้นกลายเป็นทางเด้ง (next.config.mjs) มาที่
//   `/finance/payments?view=requests` · ลิงก์เก่า (ปุ่มย้อนกลับบนใบคำร้อง `DEPT_MODULE_QUEUE` · bookmark · `?owner=` `?count=`) ยังถึงครบ
// ⭐ **มุมของฝ่าย ไม่ใช่มุมของคน** — `/requests` ตอบว่า "ตอนนี้เป็นตาใคร" (รวมใบที่ฉันเปิดถึงฝ่ายอื่น) ส่วนแท็บนี้ตอบว่า
//   "งานของฝ่ายเราค้างตรงไหน" ⇒ กรองด้วยฝ่ายก่อนเสมอ ไม่ดูว่าใครเป็นคนเปิด
// ⚠️ **ฝาแฝดของ `/rd/requests` และ `/service/requests` โดยตั้งใจ** (ม-34) — ต่างกันแค่ค่า `DEPT` กับป้ายชื่อ ·
//   ของกลางทั้งหมด (`RequestQueuePanel` · `queueBoard` · `useQueueBoard`) ใช้ตัวเดิม **ห้ามโคลนของกลาง**
// ⚠️ ตัวใบยังเป็นจอเดียวกันทั้งระบบ (`/requests/[id]` · ม-31) — ที่แยกคือคิว ไม่ใช่ใบ
// ⚠️ คีย์ใน URL ของแท็บนี้ (`tab` `owner` `count`) ไม่ชนคีย์ของทะเบียน (FILTER_KEYS + group/sort/dir) — สองชุดอยู่ใน URL เดียวกันได้
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Receipt } from "lucide-react";
import Segmented from "@/components/ui/Segmented";
import ViewSwitcher from "@/components/ui/ViewSwitcher";
import RequestQueuePanel from "@/components/requests/RequestQueuePanel";
import QueueCountStrip from "@/components/requests/QueueCountStrip";
import { useQueueBoard } from "@/lib/requests/useQueueBoard";
import { businessDate } from "@/lib/businessDate";
import { DEPT_QUEUE_TAB_KEYS, deptQueueRows, deptQueueTabs } from "@/lib/requests/queueBoard";
import { filterQueueRows, queueStripCounts } from "@/lib/requests/queueFilter";
import { compareRequestUrgency } from "@/lib/deptRequests";
import { apiFetch } from "@/lib/apiFetch";

const DEPT = "FN";
/* ปลายทางของแท็บนี้ — ตัวเดียวกับทางเด้งของ `/finance/requests` (next.config.mjs) */
export const FINANCE_REQUESTS_HREF = "/finance/payments?view=requests";

export const FINANCE_REQUESTS_BLURB = {
  todo: "งานที่รอ FN ทำต่อ — เรื่องที่ยังไม่มีใครรับขึ้นก่อนเสมอ",
  waiting: "ออกเอกสารไปแล้ว รอผู้ขอรับ/ส่งลูกค้า — ไม่ใช่งานค้างของเรา แต่ต้องตามได้",
  history: "เรื่องที่ปิดครบสองฝั่งหรือยกเลิกแล้วของ FN — ปิดล่าสุดอยู่บนสุด",
};

export default function FinanceRequestsQueue() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const board = useQueueBoard();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // แท็บย่อยอยู่ใน URL — ลิงก์ตรงและปุ่มย้อนกลับของเบราว์เซอร์ทำงานได้จริง
  const tabKeys = DEPT_QUEUE_TAB_KEYS;
  const urlTab = searchParams.get("tab");
  const tab = tabKeys.includes(urlTab) ? urlTab : "todo";
  /* ⭐ ประวัติเรียง "ปิดล่าสุดก่อน" (ม-145) — ความเร่งไม่มีความหมายกับใบที่จบแล้ว · ออกจากประวัติกลับไปเรียงตั้งต้น
     ⚠️ เฝ้าแค่ "เข้า/ออกประวัติ" ไม่ใช่ทุกแท็บ — ผู้ใช้ยังเปลี่ยนแบบเรียงเองในแท็บเดิมได้ */
  const inHistory = tab === "history";
  const { setSort } = board;
  useEffect(() => { setSort(inHistory ? "closed" : "urgency"); }, [inHistory, setSort]);
  /* ⚠️ **สลับแท็บแล้วล้างตัวกรองตัวเลขทุกครั้ง** (ตรวจตัวเลข 20/10/2026 M3) — บางช่องมีได้แท็บเดียว ⇒ ตัวกรองที่ค้างมาให้ตารางว่าง
     ทั้งที่เลขบนแท็บบอกว่ามีใบ · กดแท็บที่เปิดอยู่ซ้ำ = "ทั้งแท็บ" · คำค้นกับแผงกรองยังตามไป (เลขบนแท็บนับพร้อมมันแล้ว) */
  const setTab = (next) => {
    board.setCountFilter(null);
    router.replace(`${FINANCE_REQUESTS_HREF}&tab=${next}`, { scroll: false });
  };

  // ⚠️ **ไม่มีตัวสลับขอบเขต** — API คืนคิวของฝ่ายที่ผู้ใช้ตอบได้มาให้อยู่แล้ว ด่านจริงอยู่ที่นั่น
  const reload = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const res = await apiFetch(`/api/sa/requests?dept=${DEPT}`, { cache: "no-store" });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error || "โหลดคำร้องไม่สำเร็จ");
      setRequests(Array.isArray(d) ? d : []);
    } catch (e) { setLoadError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  /* `?owner=` / `?count=` มาจากลิงก์ภายนอก — ตั้งครั้งเดียวตอนเปิดจากลิงก์ แล้วปล่อยให้ผู้ใช้แก้ตัวกรองต่อได้เอง */
  const ownerParam = searchParams.get("owner");
  const { setFilter, setCountFilter } = board;
  useEffect(() => {
    if (ownerParam) setFilter("owner", [ownerParam]);
  }, [ownerParam, setFilter]);

  const countParam = searchParams.get("count");
  useEffect(() => {
    if (countParam) setCountFilter(countParam);
  }, [countParam, setCountFilter]);

  /* ⭐ **กดเมนูคิวคำร้องขณะอยู่แท็บนี้ = เริ่มคิวใหม่** (ตรวจตัวเลข 20/10/2026 M3) — ป้ายบนเมนูนับแท็บ "รอ FN ตอบ" ทั้งแท็บ แต่เมนูเป็น
     <Link> ไป `/finance/requests` ซึ่งเด้งมา `?view=requests` เปล่า (ไม่ mount ใหม่) ⇒ คำค้น/ตัวกรองที่ค้างตามมา · URL ที่มีแค่ `view`
     มาจากเมนูทางเดียว (`setTab` เขียน `&tab=` เสมอ) ⇒ ล้างทุกชั้นแล้วเขียน `&tab=todo` ทับ ให้กดเมนูครั้งถัดไปจับได้ */
  const bareUrl = searchParams.toString() === "view=requests";
  const { setSearch, clearFilters } = board;
  useEffect(() => {
    if (!bareUrl) return;
    setSearch(""); clearFilters(); setCountFilter(null);
    router.replace(`${FINANCE_REQUESTS_HREF}&tab=todo`, { scroll: false });
  }, [bareUrl, setSearch, clearFilters, setCountFilter, router]);

  const rows = useMemo(
    () => deptQueueRows(requests, { dept: DEPT, tab }).slice().sort(compareRequestUrgency),
    [requests, tab],
  );

  /* ⭐ **ทุกตัวเลขนับด้วยตัวตัดสินเดียวกับตาราง** (`queueFilter.js` · ตรวจตัวเลข 20/10/2026 M2 M3) */
  const queueState = {
    countFilter: board.countFilter, search: board.search, filters: board.filters, todayIso: businessDate(),
  };
  const counts = queueStripCounts(rows, queueState);
  const tabCount = (key) => filterQueueRows(deptQueueRows(requests, { dept: DEPT, tab: key }), queueState, { except: "count" }).length;

  return (
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
            // นับจากชุดเดียวกับที่แท็บนั้นแสดงจริง (รวมคำค้น/แผงกรองที่ตามไป)
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
        icon={<Receipt size={17} aria-hidden="true" />}
        sectionTitle="รายการคำร้องถึงฝ่ายบัญชีและการเงิน"
        sectionSubtitle={FINANCE_REQUESTS_BLURB[tab]}
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
  );
}
