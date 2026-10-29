"use client";
// ── คำร้องข้ามฝ่าย (mig 0173) ──────────────────────────────────────────
//
// ⭐ ที่มา: ระบบเคยมีกลไก "ขอให้ฝ่ายอื่นทำอะไรให้" อยู่สองชุด คนละคำ คนละคิว —
// "สอบถาม RD" (เธรดล้วน) กับ "เคสขอราคาวัสดุ" (มีบรรทัด/เลขที่/คิว) ทั้งที่เป็น
// เรื่องเดียวกัน · RD จึงต้องเฝ้าสองที่ และไม่มีที่ไหนบอกว่างานค้างทั้งหมดมีกี่ชิ้น
//
// หน้านี้คือคิวเดียวของทุกชนิดคำร้อง — ชนิดคุมด้วย lib/master/requestTypes.js
// (สอบถาม · พัฒนากลิ่น · พัฒนาสูตร · ขอเอกสาร · ติดตามของเข้า)
import { useCallback, useEffect, useMemo, useState } from "react";
import useLatestRun from "@/lib/ui/useLatestRun";
import useRevalidateOnFocus from "@/lib/ui/useRevalidateOnFocus";
import { useRouter, useSearchParams } from "next/navigation";
import { MessageCircleQuestion, Plus, Undo2 } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import Segmented from "@/components/ui/Segmented";
import ViewSwitcher from "@/components/ui/ViewSwitcher";
import Button from "@/components/ui/Button";
import RequestQueuePanel from "@/components/requests/RequestQueuePanel";
import MyTeamsFilter from "@/components/ui/MyTeamsFilter";
import useMyTeamsFilter from "@/lib/useMyTeamsFilter";
import QueueCountStrip from "@/components/requests/QueueCountStrip";
import { useQueueBoard } from "@/lib/requests/useQueueBoard";
import { useDepartment, useRole, useTeam, useTeams } from "@/lib/roleContext";
import { REQUEST_SCOPES, canUseScope } from "@/lib/requests/scope";
import {
  QUEUE_TABS, REQUESTS_NAV_COUNT_PARAM, REQUESTS_NAV_LANDING_LABEL, matchesQueueCount, queueTabRows, requestsNavLanding,
  startHereRequest, visibleQueueRows, waitingOnMeRows,
} from "@/lib/requests/queueBoard";
import { filterQueueRows, queueStripCounts } from "@/lib/requests/queueFilter";
import StartHereCard from "@/components/requests/StartHereCard";
import AlertBanner from "@/components/ui/AlertBanner";
import { bouncedDaysText } from "@/lib/requests/queueBoard";
import { businessDate } from "@/lib/businessDate";

// คำโปรยของแต่ละแท็บ — บอกว่ากำลังดูอะไรอยู่ ไม่ใช่ชื่อแท็บซ้ำอีกรอบ
const TAB_BLURB = {
  todo: "เรื่องที่รอคุณหรือฝ่ายของคุณทำต่อ — เรื่องที่ยังไม่มีใครรับขึ้นก่อนเสมอ",
  // ⭐ "เลือกขอบเขตได้" เป็นจริงแล้ว (ม-145) — ทีม/ทั้งหมดมีประวัติของตัวเอง
  history: "เรื่องที่ปิดครบสองฝั่งหรือยกเลิกแล้ว — ปิดล่าสุดอยู่บนสุด · เลือกขอบเขตได้ตามสิทธิ์",
};
import { SCOPE_LABELS } from "@/components/salesPlanning/ui";
import { REQUEST_ANSWER_DEPARTMENTS, canAnswerRequestsFor, defaultScope } from "@/lib/permissions";
import { REQUEST_DEPT_LABELS } from "@/lib/master/requestTypes";
import { deptsInSharedQueue } from "@/lib/requests/modules";
import { compareRequestUrgency } from "@/lib/deptRequests";
import { apiFetch } from "@/lib/apiFetch";
import {
  dealRequestsLinkLabel, filterByDealRequestsLink, readDealRequestsLink, requestsQueueHref,
} from "@/lib/requests/dealLink";

// คิวมีได้ฝ่ายละแท็บ — ปกติคนหนึ่งอยู่ฝ่ายเดียวจึงเห็นแท็บเดียว แต่ admin ตอบแทน
// ได้ทั้งสองฝ่าย (break-glass) ต้องเห็นครบทั้งคู่ ไม่ใช่เห็นแต่ RD แล้วคิว PC หายไปเฉย ๆ

// มุมมองลงจากป้ายเมนู (`?count=requests` · L20) — บอกว่าเป็นชุดเดียวกับเลขบนเมนู ไม่ใช่แท็บ "รอฉันตอบ" เฉย ๆ
const NAV_LANDING_BLURB = "เรื่องที่รอคุณหรือฝ่ายของคุณทำต่อ รวมใบตีกลับที่รอคุณแก้ — ชุดเดียวกับตัวเลขบนเมนู \"คำร้อง\"";

// ⚠️ "ที่ยังไม่จบ" (ม-145) — ใบที่ปิดครบ/ยกเลิกแล้วย้ายไปแท็บประวัติ ไม่ปนในแท็บนี้อีก
const MINE_BLURB = "คำร้องที่คุณเปิดถึงฝ่ายอื่นและยังไม่จบ — ใบที่ปิดครบแล้วอยู่แท็บ \"ประวัติ\"";
// มาจากหน้าดีล (`?dealId=`) ต้องบอกว่ากำลังดูแค่ดีลนั้น ไม่ใช่ทั้งหมด — ไม่งั้น
// "ไม่มีคำร้องของคุณ" อ่านเหมือนระบบว่าง ทั้งที่แค่กรองอยู่
const mineBlurb = (deal) => (deal
  ? `คำร้องของดีล ${deal.code || deal.id}${deal.title ? ` — ${deal.title}` : ""} เท่านั้น`
  : MINE_BLURB);

export default function RequestsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const role = useRole();
  const department = useDepartment();
  const team = useTeam();
  const teams = useTeams();
  // อยู่หลายทีม → เลือกได้ว่าคิว "ทีม" จะรวมทีมไหนบ้าง
  const myTeams = useMyTeamsFilter();
  // ⚠️ `team` ต้องอยู่ในนี้ด้วย — `canUseScope` ตัดสิน "ทีม" จากมัน · ขาดไปแล้วปุ่ม
  // "ทีม" จะจางตลอดกาลสำหรับทุกคน ทั้งที่ server ยอมให้ใช้
  const me = useMemo(() => ({ role, department, team, teams }), [role, department, team, teams]);
  // filter ไม่ใช่ find — admin ตอบได้ทั้ง RD และ PC (isSuperuser ผ่านทุกฝ่าย)
  // ถ้าใช้ find คิวของ PC จะหายไปทั้งก้อนโดยไม่มีอะไรบอก
  // ⚠️ ห้ามสะกดรายชื่อฝ่ายที่นี่ — ฝ่ายที่สี่จะได้คิวว่างเปล่าโดยไม่มีใครรู้
  // ⭐ **ตัดฝ่ายที่มีโมดูลของตัวเองออก** (ม-29) — งานของ RD อยู่ที่ `/rd/requests`
  // ที่เดียว · ปล่อยให้โผล่ทั้งสองที่คือความผิดเดิมที่ `cross-department-requests-plan`
  // ใช้ 20 PR แก้ (ฝ่ายต้องเฝ้าสองที่ แล้วไม่มีที่ไหนบอกว่างานค้างมีกี่ชิ้น)
  // ⚠️ **ไม่ใช่ด่านสิทธิ์** — AE Supervisor ยังเห็นใบที่รอเขายืนยันในแท็บนี้เหมือนเดิม
  // (ม-32) เพราะใบพวกนั้นเข้ามาทางสาขา `owner === 'requester'` ซึ่งไม่เกี่ยวกับฝ่าย
  const myDepts = useMemo(
    () => deptsInSharedQueue(REQUEST_ANSWER_DEPARTMENTS.filter((d) => canAnswerRequestsFor(me, d))),
    [me],
  );

  // สถานะร่วมของหัวการ์ดกับตาราง (ตัวสลับมุมมอง · ตัวกรองตัวเลข · ค้นหา)
  const board = useQueueBoard();
  // วันไทย (ไม่ใช่วัน UTC) — ตัดสิน "เลยกำหนด" ของตัวเลขทุกตัวบนหน้าและการ์ดเริ่มที่นี่
  const today = businessDate();
  /* ⭐ **สถานะตัวกรองชุดเดียวกับที่พาเนลกรองตาราง** (`queueFilter.js` · ตรวจตัวเลข 20/10/2026 M4) — เลขบนแท็บ ·
     "ในคิว/ประวัติ" · ชิปฝ่าย · แถบตัวเลข นับผ่าน `filterQueueRows` ด้วยชุดนี้ ⇒ ตรงกับตารางที่กดแล้วเห็น
     ⚠️ `filters` ต้องเป็นชุดที่พาเนลใช้จริง (`tools` ตั้งต้น "full" = ใช้ทั้งชุด) */
  const queueState = useMemo(() => ({
    countFilter: board.countFilter, search: board.search, filters: board.filters, todayIso: today,
  }), [board.countFilter, board.search, board.filters, today]);
  const [rawRequests, setRequests] = useState([]);
  // ⚠️ เหลือ **ดีลอย่างเดียว** — ใช้เติมค่าตั้งต้นให้ปุ่ม "เปิดคำร้อง" ตอนมาจากหน้าดีล
  // (`?dealId=`) · ทะเบียนที่เหลือเคยโหลดไว้ส่งให้ `RequestQueuePanel` ซึ่ง **ไม่เคย
  // อ่านมันเลย** ⇒ 8 endpoint ต่อการเปิดคิวหนึ่งครั้ง โดยไม่มีอะไรบนจอเปลี่ยน
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // แท็บอยู่ใน URL — ลิงก์ตรงจากที่อื่นและปุ่มย้อนกลับของเบราว์เซอร์ทำงานได้จริง
  // ค่าตั้งต้นของ RD/PC = คิวของฝ่ายตน เพราะนั่นคืองานประจำวัน
  // ⭐ แท็บคงที่ 3 ตัว ไม่โตตามจำนวนฝ่าย (R-4) — ของเดิมเป็นคิวรายฝ่าย ซึ่งจะ
  // กลายเป็นสี่แท็บทันทีที่ฝ่ายบัญชีเข้ามาใน P7
  const tabKeys = QUEUE_TABS.map((t) => t.key);
  const defaultTab = myDepts.length ? "todo" : "mine";
  const urlTab = searchParams.get("tab");
  /* ⭐ **ป้ายเมนู "คำร้อง" → `?count=requests`** (ตรวจตัวเลข L20 · 2026-10-26 · ม-115 แบบ A) — ป้ายนับ `waitingOnMeRows`
     ที่ขอบเขต "ของฉัน" (แท็บ "รอฉันตอบ" + ใบตีกลับของตัวเอง · ม-112) ⇒ ลงที่ **มุมมองลงจอด** ซึ่งแถว = ตัวตัดสินเดียวกับป้าย
     🐞 เดิมเมนูพาไป `/requests` เปล่า: แท็บตั้งต้นไม่มีใบตีกลับ (ม-102 ข้อ 4) · superuser ที่ไม่ใช่ AC ลงขอบเขต "ทั้งหมด"
        ⇒ ป้าย 3 ตารางขึ้นอีกเลข
     ⚠️ มุมมองนี้ **ไม่ใช่แท็บที่สี่** (R-4) — เลขบนแท็บ/ใบตีกลับในแท็บ "ที่ฉันเปิด" เท่าเดิม · กดแท็บ/ขอบเขต/ชิป × = ออก
     ⚠️ ถอด `count` ออกจาก URL ทันทีหลังตั้งค่า (แพตเทิร์น M9 ของงานของฉัน) — กดป้ายซ้ำขณะอยู่หน้านี้ต้องลงใหม่ทุกครั้ง */
  const countParam = searchParams.get("count") || "";
  const [navLanding, setNavLanding] = useState(() => countParam === REQUESTS_NAV_COUNT_PARAM);
  /* ลงจอดครั้งที่เท่าไร — ใส่ใน `key` ของแผงรายการ ⇒ **ทุกครั้งที่กดป้าย** แผงเริ่มหน้า 1 (รีวิว L20 · 26/10)
     🐞 ไม่มีตัวนี้: อยู่แท็บ "รอฉันตอบ" หน้า 2 ไม่มีตัวกรอง → กดป้าย = คีย์รีเซ็ตหน้าของแผง (ขอบเขต/คอลัมน์/คำค้น/ตัวกรอง)
        เท่าเดิมทุกตัว ⇒ ลงหน้า 2 ของมุมมองลงจอด · ใบเร่งที่สุด (รวมใบตีกลับที่มุมมองนี้มีไว้โชว์) อยู่หน้า 1 มองไม่เห็น
        · กดป้ายซ้ำขณะอยู่ในมุมมองแล้วก็เหมือนกัน (`navLanding` true อยู่แล้ว) จึงต้องนับรอบ ไม่ใช่ใช้ธงอย่างเดียว */
  const [navLandingSeq, setNavLandingSeq] = useState(0);
  // ⚠️ ลิงก์เก่ายังชี้ `queue-RD` / `queue` อยู่หลายที่ (การ์ดคำร้องบนหน้าดีล ·
  // แจ้งเตือน · /go/DR-…) — เด้งเข้าแท็บที่กลืนมันไป ไม่ใช่ตกลง "ที่ฉันเปิด" เงียบ ๆ
  const wanted = String(urlTab || "").startsWith("queue") ? "todo" : urlTab;
  const tab = tabKeys.includes(wanted) ? wanted : defaultTab;
  /* ⭐ ประวัติเรียง "ปิดล่าสุดก่อน" (ม-145) — ความเร่งไม่มีความหมายกับใบที่จบแล้ว และดัน
     ใบที่ยกเลิกก่อนมีใครรับเรื่องขึ้นบนสุด · ออกจากประวัติกลับไปแบบเรียงตั้งต้นของหน้า
     ⚠️ เฝ้าแค่ "เข้า/ออกประวัติ" ไม่ใช่ทุกแท็บ — ผู้ใช้ยังเปลี่ยนแบบเรียงเองในแท็บเดิมได้ */
  const inHistory = tab === "history";
  const { setSort } = board;
  useEffect(() => { setSort(inHistory ? "closed" : "urgency"); }, [inHistory, setSort]);

  /* ⚠️ **สลับแท็บแล้วล้างตัวกรองตัวเลขทุกครั้ง** (ตรวจตัวเลข 20/10/2026 M4 · ขยายจาก ม-145 ที่ล้างเฉพาะตอน
     เข้าประวัติ) — แถบในแท็บ "รอฉันตอบ" ไม่มีกล่อง "ตีกลับ" · แท็บ "ที่ฉันเปิด" ไม่มีกล่อง "ยังไม่ได้ให้วัน" ·
     ประวัติไม่มีแถบเลย ⇒ ตัวกรองที่ค้างมาให้ตารางว่างโดยไม่มีกล่องให้กดล้าง ทั้งที่เลขบนแท็บบอกว่ามีใบ
     ⚠️ ล้าง **ในตัวจัดการนี้** ไม่ใช่ใน useEffect ที่เฝ้า `tab` — ปุ่ม "ดูใบที่ตีกลับ" เรียก `setTab` แล้วตั้ง
     ตัวกรองต่อในจังหวะเดียวกัน (setState ตัวหลังชนะ) · ย้ายไป effect เมื่อไรตัวกรองของแถบเตือนจะถูกล้างทิ้ง */
  // `next` ว่าง = ถอด `?tab=` ออก — ใช้กับ "ในคิว" ของทีม/ทั้งหมด (เหตุผลอยู่ที่ตัวสลับ)
  /* ⚠️ **พาตัวกรองดีลไปด้วย** (ตรวจตัวเลข H1 2026-10-19) — เลขบนแท็บนับจากชุดที่กรองดีลแล้ว ถ้ากดแท็บแล้ว
     `?dealId=` หลุด ชุดจะกลายเป็นทั้งคิวเงียบ ๆ ทั้งที่เลขบนแท็บที่เพิ่งกดพูดถึงดีลเดียว · ถอดได้ที่ปุ่ม × เท่านั้น */
  const setTab = (next) => {
    board.setCountFilter(null);
    setNavLanding(false); // กดแท็บ = ออกจากมุมมองลงจอดของป้ายเมนู (L20)
    router.replace(requestsQueueHref({ tab: next, link: dealLink }), { scroll: false });
  };

  // ⭐ ตัวสลับขอบเขต — **กรองที่ API ไม่ใช่ที่จอ** (กับดักข้อ 9 ของแผน)
  // กรองที่จอแปลว่าคำร้องของทีมอื่นถูกส่งถึงเบราว์เซอร์แล้วค่อยซ่อน เปิดดูได้จาก
  // แท็บ Network โดยไม่ต้องมีความรู้อะไรเลย
  // 🐞 **#1038** — ผู้ดูแลระบบที่ไม่ได้เปิดใบเองเคยเห็นหน้าว่างเปล่าทั้งสามแท็บ
  // เพราะหน้านี้ส่ง `?scope=mine` มาเสมอ ⇒ ด่านฝั่ง API ไม่มีวันได้ทำงาน
  // กติกาตั้งต้นปัจจุบันอยู่ในบล็อกข้างล่าง (`defaultScope`) ซึ่งกันเคสนั้นไว้ด้วยการ
  // ไม่ให้ superuser/ผู้สังเกตการณ์ตกมาที่ "ของฉัน"
  /* ลิงก์จากหน้าดีล (`?dealId=` · หมุดไทม์ไลน์ `&step=` · ใบกลางของโครงการ `?project=`) — ต้องอ่านก่อน
     ตั้งค่าขอบเขต ดูเหตุผลใต้บล็อกนี้ · ตัวอ่านกับตัวประกอบลิงก์อยู่คู่กันที่ `lib/requests/dealLink.js`
     ⚠️ **อ่านสดจาก URL ไม่ใช่ตั้งครั้งเดียว** — ต่างจากขอบเขต: ปุ่ม × ถอดตัวกรองด้วยการเขียน URL ใหม่ */
  const dealLink = useMemo(() => readDealRequestsLink(searchParams), [searchParams]);
  const dealIdParam = dealLink?.dealId || null;
  /* ⭐ **ลิงก์ที่ระบุแท็บมาเปิดที่ขอบเขต "ของฉัน" เสมอ** (มติผู้ใช้ 2026-08-15) —
     แท็บบทบาทมีผลเฉพาะขอบเขตนี้ (ดู `visibleQueueRows`) · เปิด `?tab=todo` ด้วย
     ขอบเขตกว้างเมื่อไร แท็บถูกซ่อนและพารามิเตอร์ถูกเมินเงียบ ๆ ⇒ คนส่งลิงก์กับคนกดเปิด
     เห็นคนละหน้ากันโดยไม่มีอะไรบอก (⚠️ ยกเว้น `history` ตั้งแต่ ม-145 — ดูในบล็อก)
     ⚠️ **ตั้งครั้งเดียวตอนเปิดหน้า ไม่เฝ้าค่าต่อ** — เฝ้าเมื่อไรผู้ใช้จะสลับไป
     ทีม/ทั้งหมดไม่ได้เลย เพราะ `setTab` เขียน `?tab=` ลง URL ทุกครั้งที่กดแท็บ
     (บทเรียนเดียวกับ `?owner=` และ `?count=` ในไฟล์นี้)
     ⚠️ ยอมรับเฉพาะค่าที่เป็นแท็บจริง — `?tab=อะไรก็ไม่รู้` ต้องไม่บีบขอบเขตให้แคบลง
     ⭐ เปิดเปล่า ๆ (ไม่มี `?tab=`) ใช้ `defaultScope` = **แคบสุดที่ไม่ว่างโดยโครงสร้าง**
     (มติผู้ใช้ 2026-09-08 · แทน `.pop()` เดิมที่ให้ตัวกว้างสุดเสมอ) — คนที่เปิดใบเอง
     เป็นงานประจำได้ "ของฉัน" · แอดมิน/หัวหน้าฝ่าย/ผู้สังเกตการณ์ไม่มีใบของตัวเอง
     และไม่มีทีม ⇒ ได้ "ทั้งหมด" เท่าเดิม (กัน #1038 หน้าว่างไว้เหมือนเดิม)
     🐞 **`?dealId=` ต้องได้ขอบเขตกว้างสุดเหมือนเดิม ไม่ใช่ `defaultScope`** — คำร้อง
     ของดีลใบหนึ่งเปิดโดยใครก็ได้ในทีม (AC เปิดแทน AE เป็นเรื่องปกติ) แต่ "ของฉัน"
     ฝั่ง API = `requestedById` ของเราเท่านั้น ⇒ กด "ดูคำร้อง" จากหน้าดีลแล้วเจอ
     รายการว่างใต้หัวข้อ "คำร้องของดีล … เท่านั้น" ทั้งที่ดีลมีใบค้างอยู่ */
  const [scope, setScope] = useState(() => {
    // ใช้ `wanted` ไม่ใช่ `urlTab` ดิบ ⇒ ลิงก์เก่า (`?tab=queue-RD`) ที่ถูกแปลงเป็น
    // "todo" ได้ขอบเขตที่ทำให้แท็บนั้นมีผลด้วยเหมือนกัน
    /* ⭐ **`?tab=history` ไม่บีบขอบเขตแล้ว** (ม-145) — ทีม/ทั้งหมดมีประวัติของตัวเอง
       (`visibleQueueRows`) ⇒ เหตุผลเดิม ("แท็บถูกซ่อนแล้วพารามิเตอร์ถูกเมิน") ไม่จริง
       สำหรับประวัติอีก · ปล่อยให้ได้ขอบเขตตั้งต้นของคนนั้น แอดมินที่กดกลับจากใบที่
       ปิดแล้วจึงเห็นประวัติของทั้งระบบ ไม่ใช่ "ของฉัน" ที่แทบว่าง (กับดัก #1038) */
    // ลงจากป้ายเมนู = ขอบเขตเดียวกับที่ป้ายนับ ("ของฉัน") — ตั้งตั้งแต่เมานต์ ไม่ยิงขอบเขตตั้งต้นทิ้งหนึ่งรอบ (L20)
    if (countParam === REQUESTS_NAV_COUNT_PARAM) return requestsNavLanding().scope;
    if (tabKeys.includes(wanted) && wanted !== "history") return "mine";
    const allowed = REQUEST_SCOPES.filter((s) => canUseScope(me, s));
    if (dealLink) return allowed[allowed.length - 1] || "mine";
    return defaultScope(allowed, me, "requests") || "mine";
  });
  const [activeScope, setActiveScope] = useState("mine");

  // กันคำตอบมาผิดลำดับเมื่อตัวกรองขยับเร็วกว่าที่ API ตอบ (ดู lib/ui/latestRun)
  const startRun = useLatestRun();
  const reload = useCallback(async (opts) => {
    const isLatest = startRun();
    /* โหมดเบื้องหลัง (ดึงเองตอนกลับมามองแท็บ) ห้ามพาหน้าไปอยู่สถานะโหลด —
       จอมีของอยู่แล้วและผู้ใช้ไม่ได้สั่งอะไร ตารางต้องไม่หายแล้วโผล่ใหม่ */
    if (!opts?.background) setLoading(true);
    setLoadError("");
    try {
      const res = await apiFetch(`/api/sa/requests?scope=${scope}`, { cache: "no-store" });
      const d = await res.json().catch(() => null);
      /* กดสลับ ของฉัน→ทีม→ทั้งหมด รัว ๆ แล้วคำตอบมาสลับลำดับ = **ป้ายขอบเขตกับแถว
         หลุดจากกัน** เพราะป้ายอ่านจากเฮดเดอร์ของคำตอบ (X-Request-Scope) ⇒ ทิ้งทั้งก้อน */
      if (!isLatest()) return;
      if (!res.ok) throw new Error(d?.error || "โหลดคำร้องไม่สำเร็จ");
      setRequests(Array.isArray(d) ? d : []);
      // ⚠️ server เป็นคนตัดสินขอบเขตจริง (สิทธิ์ไม่พอ = ถอยลงมา ไม่ปฏิเสธ) ⇒ อ่าน
      // ค่าที่ได้จริงกลับมาแสดง ไม่ใช่โชว์สิ่งที่ผู้ใช้ *ขอ* ซึ่งอาจไม่ใช่สิ่งที่ได้
      setActiveScope(res.headers.get("X-Request-Scope") || scope);
    } catch (e) { if (isLatest() && !opts?.background) setLoadError(e.message); }
    if (isLatest()) setLoading(false);
  }, [scope, startRun]);

  useEffect(() => { reload(); }, [reload]);
  useRevalidateOnFocus(reload);
  /* ⚠️ ทุกอย่างท้ายน้ำต้องอ่านจาก `requests` ตัวเดียว — ตัวเลขบนแท็บกับตารางข้างล่าง
     ขัดกันไม่ได้ (กติกาเดิมของหน้านี้) ⇒ ตัวกรองทั้งสองชั้น (ทีม แล้วฝ่าย) อยู่ที่นี่
     ไม่ใช่ที่ตาราง · `scopedRequests` = ผ่านตัวกรองทีมแล้ว แต่ยังทุกฝ่าย — มีไว้ให้
     ตัวสลับฝ่ายนับตัวเลือกของตัวเองได้ (ไม่งั้นเลือก RD แล้วปุ่ม FN หายไปเอง)
     คนอยู่ทีมเดียว: `matches` คืน true เสมอ = ชุดเดิมทั้งก้อน ไม่มีอะไรเปลี่ยน */
  const scopedRequests = useMemo(
    () => (activeScope === "team" ? rawRequests.filter((r) => myTeams.matches(r.team)) : rawRequests),
    [rawRequests, activeScope, myTeams],
  );
  /* ⭐ **ตัวสลับ "ถึงฝ่ายไหน"** (มติผู้ใช้ 2026-08-30) — คิวรวมทุกฝ่ายไว้กองเดียว
     ⇒ ใบที่ส่งไป RD/PC/FN/TS ปนกันทั้งตาราง และการแยกดูทีละฝ่ายต้องเปิดแผงกรอง
     แล้วติ๊กเอา ซึ่งเป็นของที่ซ่อนอยู่หลังปุ่มสำหรับคำถามที่ถามทุกวัน
     ⚠️ **ตัวเลือกสั้น = ปุ่มที่เห็นทั้งชุด ไม่ใช่ดรอปดาวน์** (กติกาคอนโทรล v2) ·
     ฝ่ายมีอย่างมาก 4 ตัว ⇒ วางเป็นแถบเดียวคู่กับขอบเขต/แท็บ
     ⚠️ กรองที่นี่ **ชั้นเดียว** เหมือนตัวกรองทีม — ทุกอย่างท้ายน้ำ (เลขบนแท็บ ·
     แถบตัวเลข · การ์ดเริ่มที่นี่ · แบนเนอร์ใบตีกลับ) อ่านจาก `requests` ตัวเดียว
     ⇒ เลือก RD แล้วทั้งหน้าเป็นของ RD ไม่ใช่ตารางอย่างเดียวที่แคบลงแล้วตัวเลข
     ข้างบนยังพูดถึงทุกฝ่าย
     ⚠️ **ไม่ใช่ตัวกรองใน `RequestQueuePanel`** — แผงกรองของพาเนลถอดหมวด "ฝ่าย"
     ออกแล้ว (ดูไฟล์นั้น) · ตัวคุมมิติเดียวกันสองที่ = ติ๊ก RD ที่หนึ่ง PC ที่หนึ่ง
     แล้วได้ตารางว่างโดยไม่มีอะไรบอกว่าใครตัดทิ้ง */
  /* ⭐ **ตัวกรองดีล/ขั้นจากลิงก์ อยู่ชั้นเดียวกับทีมและฝ่าย** (ตรวจตัวเลข H1 · H16 · 2026-10-19)
     🐞 เดิมกรองดีลเฉพาะสาขา "ของฉัน · ที่ฉันเปิด" — แต่ `?dealId=` บังคับขอบเขตกว้างสุด (ทีม/ทั้งหมด) ⇒
     กด "เปิดหน้าคำร้อง" จากดีลแล้วได้คิวทั้งบริษัท 224 เรื่อง · หมุด "คำร้องค้าง 2" ก็พามาที่เดียวกัน
     ⇒ กรองที่ชุดหลักก่อนทุกอย่างท้ายน้ำ (แท็บ · แถบตัวเลข · ตัวสลับฝ่าย · การ์ดเริ่มที่นี่ · ตาราง) */
  const linkedRequests = useMemo(
    () => filterByDealRequestsLink(scopedRequests, dealLink),
    [scopedRequests, dealLink],
  );
  const [deptFilter, setDeptFilter] = useState("all");
  /* ⭐ ลงจากป้ายเมนู (L20) — ตั้ง **ทุกชั้นที่ตัดแถว** จาก `requestsNavLanding` แล้วถอด `?count=` (และลิงก์ดีล/แท็บ) ออกจาก URL
     ⇒ แถว = `waitingOnMeRows` ของชุด "ของฉัน" ทั้งก้อน = เลขบนป้าย · ตัวสลับฝ่าย/คำค้นที่กดต่อจากนี้แคบลงได้ตามปกติ */
  useEffect(() => {
    if (countParam !== REQUESTS_NAV_COUNT_PARAM) return;
    const landing = requestsNavLanding();
    setScope(landing.scope);
    board.setSearch(landing.search);
    board.clearFilters();
    board.setCountFilter(landing.countFilter);
    setDeptFilter(landing.deptFilter);
    setNavLanding(true);
    setNavLandingSeq((n) => n + 1);
    router.replace(requestsQueueHref({ tab: null, link: landing.link }), { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countParam]);
  // ลิงก์ที่ระบุแท็บ/ดีลมาเองระหว่างอยู่ในมุมมองลงจอด (แจ้งเตือน · หน้าดีล) = ออกจากมุมมองนั้น
  useEffect(() => { if (urlTab || dealLink) setNavLanding(false); }, [urlTab, dealLink]);
  const requests = useMemo(
    () => (deptFilter === "all" ? linkedRequests : linkedRequests.filter((r) => r.dept === deptFilter)),
    [linkedRequests, deptFilter],
  );
  /* ⭐ **ตัวสลับ "ในคิว / ประวัติ" ของขอบเขตทีม/ทั้งหมด** (ม-145) — แท็บบทบาทยังซ่อน
     (ม-106) แต่ใบที่จบแล้วต้องออกจากคิวทุกขอบเขต ⇒ สองตัวเลือกที่อ่านจาก `?tab=`
     ตัวเดียวกับแท็บบทบาท (ไม่เพิ่มคีย์แท็บที่สี่ — R-4) */
  /* ⚠️ นับพร้อมคำค้น/แผงกรองที่ตามไป แต่ไม่รวมตัวกรองตัวเลข — กดแล้ว `setTab` ล้างมัน (M4) */
  const openCount = useMemo(
    () => filterQueueRows(
      visibleQueueRows(requests, { scope: activeScope, tab: defaultTab, myDepts }), queueState, { except: "count" },
    ).length,
    [requests, activeScope, defaultTab, myDepts, queueState],
  );
  const historyCount = useMemo(
    () => filterQueueRows(
      visibleQueueRows(requests, { scope: activeScope, tab: "history", myDepts }), queueState, { except: "count" },
    ).length,
    [requests, activeScope, myDepts, queueState],
  );
  // 🐞 subtitle ของหน้านี้บอกไว้ตั้งแต่ต้นว่า "เรื่องที่ยังไม่มีใครรับขึ้นก่อนเสมอ"
  // แต่ไม่มีใครเรียงจริง — API คืนมาเรียง createdAt ล้วน · ตัวเรียงมีอยู่แล้วใน lib
  // (compareRequestUrgency) แต่มีแค่หน้า dashboard RD ที่เรียก
  /* ⭐ **ขอบเขตเป็นตัวตัดสินแถว แท็บบทบาทเป็นตัวรอง** — โครงเดียวกับหน้า "งานของฉัน"
     (มติผู้ใช้ 2026-08-11) · ที่นั่นตัวสลับ "บทบาทของฉันในงาน" โผล่เฉพาะตอนเลือก
     "ของฉัน" เพราะพอเลือกทีม/ทั้งหมดแล้ว คำถามไม่ใช่ "บทบาทฉันคืออะไร" อีกต่อไป
     🐞 ของเดิมกรองด้วยแท็บเสมอ ⇒ ใบที่ขอบเขตทีม/ทั้งหมดโหลดมาไม่มีแท็บไหนรับ
     หน้าจึงว่างเปล่าทั้งที่ API ส่งมา 15 ใบ (ผู้ใช้ส่งภาพมา) */
  const roleTabsApply = activeScope === "mine";
  /* มุมมองลงจอดของป้ายเมนู (L20) = `waitingOnMeRows` ตัวเดียวกับ `requestsTodoCount` — ไม่ใช่แท็บบทบาทตัวไหน */
  const tabRows = useMemo(
    () => (navLanding
      ? waitingOnMeRows(requests, { myDepts })
      : visibleQueueRows(requests, { scope: activeScope, tab, myDepts }))
      .slice().sort(compareRequestUrgency),
    [requests, activeScope, tab, myDepts, navLanding],
  );

  // ── การ์ด "เริ่มที่นี่" ────────────────────────────────────────────────
  //
  // ⭐ ชี้จากแท็บ **"รอฉันตอบ" เสมอ ไม่ใช่แท็บที่กำลังเปิดอยู่** — คำถาม "เริ่มที่ใบไหน"
  // มีคำตอบเดียวต่อคน · เปลี่ยนตามแท็บเมื่อไรมันจะกลายเป็น "ใบบนสุดของสิ่งที่เห็น"
  // ซึ่งซ้ำกับแถวแรกของตารางที่อยู่ข้างใต้อยู่แล้ว
  // ⚠️ ประวัติไม่มีอะไรให้ทำ ⇒ ซ่อนการ์ดทั้งใบในแท็บนั้น (ต่างจาก "ว่าง" ซึ่งต้องบอก)
  // ⭐ **บวกใบที่ถูกตีกลับของตัวเองเข้าไปด้วย** (2026-08-11) — แท็บ "รอฉันตอบ" ตัด
  // ร่างทิ้งทั้งหมด (ไม่งั้นเลขบนแท็บบวกกันเกินจริง) แต่ใบตีกลับคือร่างที่ **ฝ่าย
  // ส่งคืนมาให้เราแก้** ⇒ เป็นของค้างที่ขวางงานตัวเองอยู่จริง ๆ · ปล่อยไว้แบบเดิม
  // การ์ดจะขึ้นว่า "ไม่มีเรื่องรอคุณอยู่ตอนนี้" ทั้งที่มีใบรอเราแก้อยู่
  // ⚠️ ยังบวกนอก `queueTabRows` เหมือนเดิม — ใบยังต้องอยู่แท็บ "ที่ฉันเปิด" ที่เดียว
  // ไม่งั้นนับซ้ำสองแท็บ · แต่ตัวบวกย้ายไป `waitingOnMeRows` (2026-08-12) เพื่อให้
  // **ป้ายตัวเลขบนเมนู** ใช้ชุดเดียวกับการ์ดนี้ — เดิมการ์ดบวกเองในหน้า ป้ายจึงไม่นับ
  const startHere = useMemo(
    () => startHereRequest(waitingOnMeRows(requests, { myDepts }), { todayIso: today }),
    [requests, myDepts, today],
  );

  // 🐞 `?dealId=` เคยเป็นพารามิเตอร์ตาย: หน้าดีลลิงก์มาพร้อมดีล แต่หน้านี้อ่านแค่
  // `tab` — กดมาแล้วได้คิวทั้งก้อน ไม่ได้กรองและไม่ได้เติมดีลให้ฟอร์ม
  // ตอนนี้ดีลบังคับทุกหัวข้อแล้ว การเติมล่วงหน้าจึงมีค่ากว่าเดิม: มาจากหน้าดีลไหน
  // ก็เปิดคำร้องของดีลนั้นได้เลยไม่ต้องไล่หาในโครงการ
  /* ⭐ **โหลดเฉพาะดีลใบที่ลิงก์ส่งมา ไม่ใช่ทะเบียนทั้งระบบ**
     🐞 ของเดิมยิง `/api/sales-planning/deals` (ไม่มีตัวกรองเดือน/ปีเลย = สแกนทั้งตาราง)
     **ทุกครั้งที่เปิดคิว** เพื่อเอามาหาแถวเดียวแล้วทิ้งที่เหลือทั้งหมด — และคนส่วนใหญ่
     เปิดคิวโดยไม่มี `?dealId=` ด้วยซ้ำ ⇒ จ่ายเต็มราคาให้ของที่ไม่ได้ใช้
     ตอนนี้: ไม่มี `?dealId=` = ไม่ยิงเลยสักครั้ง · มี = ยิงใบเดียว
     ⚠️ ธง `alive` กันคำตอบของ dealId เก่ามาทับตอนกดลิงก์ต่อกันเร็ว ๆ */
  const [dealParam, setDealParam] = useState(null);
  useEffect(() => {
    if (!dealIdParam) { setDealParam(null); return undefined; }
    let alive = true;
    apiFetch(`/api/sales-planning/deals/${encodeURIComponent(dealIdParam)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setDealParam(d || null); })
      .catch(() => { if (alive) setDealParam(null); });
    return () => { alive = false; };
  }, [dealIdParam]);
  const newRequestDefaults = useMemo(() => (dealParam?.projectId
    ? { projectId: dealParam.projectId, dealId: dealParam.id }
    : null), [dealParam]);
  // ป้ายตัวกรองดีล — รหัสดีลจากใบที่โหลดมาเติมฟอร์มอยู่แล้ว (ยังไม่มา = ใช้ id ไปก่อน)
  const dealLinkLabel = dealRequestsLinkLabel(dealLink, { dealCode: dealParam?.code });

  // prefill ปุ่มเปิดคำร้อง — `returnTo` พากลับมาที่คิวหลังกดยกเลิก
  const newRequestQuery = (() => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(newRequestDefaults || {})) if (v) q.set(k, v);
    q.set("returnTo", "/requests");
    return `?${q.toString()}`;
  })();

  /* ⚠️ ~~แท็บ "ที่ฉันเปิด" มีเส้นทางของตัวเอง (กรองด้วย `?dealId=`)~~ — ถอดแล้ว (H1 2026-10-19): ตัวกรองดีล
     อยู่ที่ชุดหลัก (`linkedRequests`) ⇒ ทุกแท็บ ทุกขอบเขต ได้ชุดเดียวกันโดยไม่ต้องมีสาขาพิเศษ */
  /* ── ตัวเลือกของตัวสลับฝ่าย ────────────────────────────────────────────
     ⚠️ **นับจากชุดที่มุมมองนี้จะแสดงจริง (ก่อนกรองฝ่าย)** — เลขข้างชิปต้องทำนาย
     ได้ว่ากดแล้วจะเห็นกี่ใบ · นับจากทั้งขอบเขตจะได้ "RD 12" แล้วกดไปเจอ 3 ใบ
     เพราะแท็บตัดที่เหลือทิ้งไปแล้ว
     ⚠️ **ตัวเลือกสร้างจากแถวที่มีจริง ไม่ใช่จากทะเบียนฝ่าย** (กติกาเดียวกับ
     `requestFacetOptions`) — ฝ่ายที่ไม่มีใบเลยคือปุ่มที่กดแล้วได้ตารางว่างเสมอ
     ⚠️ **ฝ่ายที่เลือกอยู่ต้องอยู่ในลิสต์เสมอ แม้เหลือศูนย์ใบ** — ไม่งั้นสลับแท็บแล้ว
     ปุ่มที่กดค้างไว้หายไปจากจอ พร้อมกับตารางที่ว่างโดยไม่มีอะไรบอกว่ายังกรองอยู่ */
  /* ⚠️ **นับพร้อมทุกชั้นที่ตามไป** (ตรวจตัวเลข 20/10/2026 M4) — สลับฝ่ายไม่ล้างตัวกรองตัวเลข คำค้น หรือแผงกรอง
     ⇒ เลขข้างชิปต้องผ่านทั้งสามชั้นเหมือนตาราง · 🐞 เดิมนับก่อนทุกชั้น ⇒ ค้น "ลอรีอัล" อยู่ ชิป "RD 12" กดแล้วได้ 2 */
  const deptCountBase = useMemo(
    () => (navLanding
      ? filterQueueRows(waitingOnMeRows(linkedRequests, { myDepts }), queueState)
      : filterQueueRows(visibleQueueRows(linkedRequests, { scope: activeScope, tab, myDepts }), queueState)),
    [linkedRequests, activeScope, tab, myDepts, queueState, navLanding],
  );
  const deptOptions = useMemo(() => {
    /* ⭐ **ทุกฝ่ายในทะเบียนขึ้นครบเสมอ แม้เหลือศูนย์ใบ** (มติผู้ใช้ 2026-08-30) —
       ของเดิมสร้างจากแถวล้วนตามกติกา `requestFacetOptions` ⇒ วันที่ TS ไม่มีใบค้าง
       ปุ่ม TS หายไปจากแถบ แล้วคนอ่านว่า "ระบบไม่มีฝ่ายนี้" ไม่ใช่ "ฝ่ายนี้ไม่มีงาน"
       ⭐ **รวมฝ่ายที่ยังปิดรับใบใหม่ด้วย** (PC) — ที่นี่เป็น *ตัวกรอง* ไม่ใช่ฟอร์ม
       เปิดใบ · PC มีใบเก่าค้างได้ และคำถาม "PC มีอะไรบ้าง" ต้องตอบได้แม้คำตอบคือ
       ไม่มี ⇒ กดแล้วตารางบอกว่าไม่มี ดีกว่าปุ่มที่หายไปโดยไม่มีคำอธิบาย
       ⚠️ ลิสต์มาจากทะเบียน (`REQUEST_DEPT_LABELS`) ไม่ใช่สะกดชื่อฝ่ายที่นี่ —
       ฝ่ายที่ห้าเข้ามาเมื่อไร ปุ่มมาเองโดยไม่ต้องแก้หน้านี้ */
    const found = new Map(Object.keys(REQUEST_DEPT_LABELS).map((d) => [d, 0]));
    for (const r of deptCountBase) {
      const d = String(r.dept || "").trim();
      if (d) found.set(d, (found.get(d) || 0) + 1);
    }
    if (deptFilter !== "all" && !found.has(deptFilter)) found.set(deptFilter, 0);
    // ลำดับตามทะเบียน (RD · PC · FN · TS) — ฝ่ายที่ไม่รู้จักไปท้าย ไม่ใช่หายไป
    const order = Object.keys(REQUEST_DEPT_LABELS);
    const rank = (d) => (order.indexOf(d) < 0 ? order.length : order.indexOf(d));
    return [...found.entries()]
      .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
      // ป้าย = **รหัสฝ่าย** ตัวเดียวกับที่ตารางเขียน (`→ RD`) ⇒ ปุ่มกับแถวพูดคำเดียวกัน
      // · ชื่อเต็มจากทะเบียนอยู่ใน tooltip ไม่ใช่บนปุ่ม (แถวนี้มีตัวสลับสามชุดแล้ว)
      .map(([d, count]) => ({
        value: d, label: d, count, title: REQUEST_DEPT_LABELS[d]?.name || d,
      }));
  }, [deptCountBase, deptFilter]);

  /* ป้ายฝ่ายที่กำลังกรองอยู่ — "รหัส · ชื่อ" ตามกติกาหน้ารายละเอียดของทั้งระบบ
     ⚠️ ใช้ในข้อความ **ตอนตารางว่าง** เท่านั้น: ฝ่ายที่ไม่มีใบสักใบต้องอ่านได้ว่า
     "กรองอยู่แล้วไม่เจอ" ไม่ใช่ "ยังไม่มีคำร้องของคุณ" ซึ่งเป็นคำตั้งต้นของพาเนล
     และจะกลายเป็นคำโกหกทันทีที่มีตัวกรองค้างอยู่ */
  const deptLabel = deptFilter === "all"
    ? null
    : `${deptFilter}${REQUEST_DEPT_LABELS[deptFilter]?.name ? ` · ${REQUEST_DEPT_LABELS[deptFilter].name}` : ""}`;

  const rows = tabRows;
  // แถบตัวเลข = ชุดของแท็บนี้ + คำค้น + แผงกรอง (ไม่รวมช่องที่กดค้าง) ⇒ กดช่องไหนก็ได้แถวเท่าเลขช่องนั้น (M4)
  const counts = queueStripCounts(rows, queueState);

  /* ⭐ **แถบเตือนใบตีกลับ** (แบบ จ · 2026-08-11) — ตัวเลขบนแถบบอกว่ามีกี่ใบ แต่
     แถบตัวเลขคือของที่ตาเลื่อนผ่าน · ใบที่ฝ่ายส่งคืนมาแล้วค้างหลายวันคือของที่
     **ไม่มีใครกำลังทำอยู่เลย** (ฝ่ายปล่อยมือแล้ว ผู้ขอยังไม่รู้ตัว) ⇒ ต้องมีอะไร
     สักอย่างที่อ่านไม่ผ่าน · ปุ่มพาไปตัวกรองเลย ไม่ใช่บอกเฉย ๆ แล้วให้ไปหาเอง
     ⚠️ นับจาก **ใบของตัวเอง** เท่านั้น — ใบตีกลับของเพื่อนร่วมทีมไม่ใช่ของค้างของเรา
     ⭐ **ตัวตัดสินเดียวกับกล่อง "ตีกลับ รอคุณแก้"** (`matchesQueueCount` ซึ่งดู `_mine` แล้ว · M5) — เดิมแถบนับ
     ของเราแต่กล่องนับทั้งทีม ⇒ ขอบเขตทีม/ทั้งหมดแถบบอก 1 กดแล้วตารางขึ้น 2 */
  const bouncedRows = useMemo(
    () => requests.filter((r) => matchesQueueCount(r, "bounced")),
    [requests],
  );
  /* ⭐ **กดแถบเตือน = ตารางเหลือเท่าเลขบนแถบเป๊ะ** (M5) — ล้างคำค้นกับแผงกรองที่ค้างอยู่ก่อน (แถบนับก่อนสองชั้นนั้น)
     · ตัวกรองระดับหน้า (ดีล · ฝ่าย · ทีม) คงไว้ เพราะแถบนับหลังมันอยู่แล้ว
     ⚠️ ขอบเขตทีม/ทั้งหมด **ไม่เขียน `?tab=mine`** — `?tab=todo|mine` บีบขอบเขตเป็น "ของฉัน" ตอนรีเฟรช (กับดัก
     #1038 เดียวกับตัวสลับ "ในคิว") · ที่นั่นแท็บบทบาทไม่มีผลกับแถวอยู่แล้ว (`visibleQueueRows`) จึงถอด `?tab=` แทน
     ⚠️ `setTab` ล้างตัวกรองตัวเลขก่อน แล้วบรรทัดท้ายตั้งใหม่ในจังหวะเดียวกัน (setState ตัวหลังชนะ) */
  const showBounced = () => {
    board.setSearch("");
    board.clearFilters();
    setTab(roleTabsApply ? "mine" : null);
    board.setCountFilter("bounced");
  };
  const bouncedWorst = useMemo(() => bouncedRows
    .map((r) => bouncedDaysText(r, { todayIso: today }))
    .filter(Boolean)
    .sort((a, b) => b.days - a.days)[0] || null, [bouncedRows, today]);

  return (
    <Workspace
      icon={<MessageCircleQuestion size={22} />}
      title="คำร้องข้ามฝ่าย"
      subtitle={navLanding ? NAV_LANDING_BLURB : !roleTabsApply
        ? (tab === "history"
          ? `ใบที่ปิดครบสองฝั่งหรือยกเลิกแล้วใน${SCOPE_LABELS[activeScope]} — ปิดล่าสุดอยู่บนสุด`
          : `ใบที่ยังไม่จบใน${SCOPE_LABELS[activeScope]} — เรื่องที่ยังไม่มีใครรับขึ้นก่อนเสมอ`)
        : tab === "todo" ? TAB_BLURB.todo
          : tab === "history" ? TAB_BLURB.history
            : mineBlurb(dealParam)}
      /* ⭐ **ปุ่มหลักอยู่ในหัวหน้า** ตามต้นแบบหน้างานของฉัน (มติผู้ใช้ 2026-08-08) — ของเดิม
         ปุ่ม "เปิดคำร้อง" ลอยอยู่กลางหน้าใต้แท็บ
         ⭐ **ตัวสลับมุมมองย้ายลงแถบเครื่องมือของแผงคิว** (`toolbarEnd` · มติผู้ใช้ 2026-09-15
         "รายการทุกชุด = แผงเดียว") — มันคุมแค่ตารางคำร้อง ไม่ใช่ทั้งหน้า
         ⚠️ **เปลือกเดียว** — ฟอร์มอยู่ที่ /requests/new ทั้งก้อน (ห้ามครอบ
         RequestForm ไว้สองที่ · โรคเดียวกับที่ AGENTS.md ห้ามเรื่องฟอร์มสร้าง/แก้) */
      headerRight={(
        <Button
          tone="accent" icon={<Plus size={16} />}
          onClick={() => router.push(`/requests/new${newRequestQuery}`)}
        >
          เปิดคำร้อง
        </Button>
      )}
    >
      <div className="flex flex-col gap-4">

      {/* ⭐ **ตัวเลือกทุกชั้นอยู่แถวเดียวกันและทรงเดียวกัน** ตามต้นแบบ —
          ของเดิมขอบเขตเป็น pill ส่วนแท็บ 3 ตัวเป็นขีดเส้นใต้ ⇒ ตัวเลือกสองชั้น
          วาดคนละภาษาทั้งที่ทำหน้าที่เดียวกัน (คัดชุดข้อมูลให้แคบลง)
          ⚠️ ขอบเขตอยู่ **ก่อน** แท็บเสมอ — มันคุมว่าข้อมูลชุดไหนถูกดึงมา ส่วนแท็บ
          แบ่งชุดนั้นอีกที · สลับที่กันแล้วอ่านเหมือนแท็บคุมขอบเขต
          ⚠️ ตัวเลือกที่ไม่มีสิทธิ์ **จางและกดไม่ได้ ไม่ใช่ซ่อน** */}
      <div className="scope-row">
        <Segmented
          ariaLabel="ขอบเขตของคิวคำร้อง"
          className="scope-toggle"
          value={activeScope}
          // เปลี่ยนขอบเขต = ออกจากมุมมองลงจอดของป้ายเมนู (L20 · ป้ายนับเฉพาะ "ของฉัน")
          onChange={(next) => { if (next !== activeScope) setNavLanding(false); setScope(next); }}
          options={REQUEST_SCOPES.map((s) => ({
            value: s, label: SCOPE_LABELS[s], disabled: !canUseScope(me, s),
          }))}
        />
        {/* แท็บบทบาทมีความหมายเฉพาะขอบเขต "ของฉัน" — ซ่อนไปเลยตอนเลือกทีม/ทั้งหมด
            (ทำแบบเดียวกับตัวสลับ "บทบาทของฉันในงาน" ที่หน้างานของฉัน) ไม่ใช่ทำจาง
            เพราะมันไม่ได้ "ไม่มีสิทธิ์" แต่ "ไม่เกี่ยวกับมุมมองนี้" */}
        {roleTabsApply && <Segmented
          ariaLabel="มุมมองหน้าคำร้อง"
          className="scope-toggle"
          /* มุมมองลงจอดไม่ใช่แท็บไหน (L20) ⇒ ไม่มีแท็บถูกเลือก · ชิป "กรอง: รอฉันลงมือ (รวมใบตีกลับ) ×" บอกแทน */
          value={navLanding ? null : tab}
          onChange={setTab}
          options={QUEUE_TABS.map((t) => ({
            value: t.key,
            label: t.label,
            // นับจากชุดเดียวกับที่แท็บนั้นจะแสดงจริง — ตัวเลขบนแท็บกับตารางข้างล่าง
            // ขัดกันไม่ได้ (เดิมนับคนละที่กัน)
            // ⚠️ ส่งเป็น `count` ไม่ใช่ต่อ "(6)" ท้ายป้ายชื่อ — เหตุผลอยู่ใน Segmented.js
            // ⭐ นับพร้อมคำค้น/แผงกรองที่ตามไป แต่ไม่รวมตัวกรองตัวเลข (`setTab` ล้างมัน · M4)
            count: filterQueueRows(queueTabRows(requests, { tab: t.key, myDepts }), queueState, { except: "count" }).length,
          }))}
        />}
        {/* ⭐ ทีม/ทั้งหมด — แยกคิวกับประวัติ (ม-145) · ตำแหน่งเดียวกับแท็บบทบาท
            (ต่อจากขอบเขต) เพราะทำหน้าที่เดียวกัน: แบ่งชุดที่ขอบเขตโหลดมาอีกชั้น
            ⚠️ "ในคิว" ไม่ใช่ "ยังไม่จบ" — คำนั้นเป็นชื่อปุ่มถอนตราปิดบนหน้าใบอยู่แล้ว */}
        {!roleTabsApply && <Segmented
          ariaLabel="คิวหรือประวัติของคำร้อง"
          className="scope-toggle"
          value={tab === "history" ? "history" : "open"}
          /* ⚠️ "ในคิว" = **ถอด `?tab=` ออก** ไม่ใช่เขียนแท็บบทบาทลง URL — `?tab=todo|mine`
             บีบขอบเขตเป็น "ของฉัน" ตอนเปิดหน้าใหม่ (กติกา set-once ข้างบน) ⇒ รีเฟรช/กดย้อน
             กลับแล้วแอดมินตกไปหน้าเกือบว่างของ #1038 (รีวิวจับได้) */
          onChange={(v) => setTab(v === "history" ? "history" : null)}
          options={[
            { value: "open", label: "ในคิว", count: openCount },
            { value: "history", label: "ประวัติ", count: historyCount },
          ]}
        />}
        {/* ⭐ ฝ่ายปลายทาง — ชั้นที่สามของ "คัดชุดข้อมูลให้แคบลง" ต่อจากขอบเขตกับแท็บ
            ⚠️ อยู่ **หลัง** แท็บ: แท็บตอบว่า "ใบไหนเป็นงานของฉัน" ส่วนฝ่ายตอบว่า
            "ใบพวกนั้นส่งไปที่ไหน" ⇒ สลับที่กันแล้วอ่านเหมือนฝ่ายคุมแท็บ
            ⚠️ มีฝ่ายเดียว = ไม่มีคำตอบอื่นให้เลือก ⇒ ซ่อนทั้งแถบ (แบบเดียวกับ
            `MyTeamsFilter` ของคนที่อยู่ทีมเดียว) · แต่ถ้ากรองค้างอยู่ต้องโชว์เสมอ */}
        {/* เหลือฝ่ายเดียวทั้งระบบเมื่อไร แถบนี้ไม่มีคำตอบอื่นให้เลือก ⇒ ซ่อน
            (เงื่อนไขเดียวกับ `MyTeamsFilter` ของคนที่อยู่ทีมเดียว) */}
        {(deptOptions.length > 1 || deptFilter !== "all") && (
          <Segmented
            ariaLabel="ฝ่ายปลายทางของคำร้อง"
            className="scope-toggle"
            value={deptFilter}
            onChange={setDeptFilter}
            options={[
              { value: "all", label: "ทุกฝ่าย", count: deptCountBase.length },
              ...deptOptions,
            ]}
          />
        )}
        {activeScope === "team" && (
          <MyTeamsFilter teams={myTeams.teams} selected={myTeams.selected} onChange={myTeams.setSelected} />
        )}
        {/* ⭐ ตัวกรองดีล/ขั้นที่มากับลิงก์ — ป้ายที่กดล้างได้ (ทรงเดียวกับ "กรอง: รอฉันลงมือ ×" ของทะเบียน QT)
            อยู่แถวเดียวกับขอบเขต เพราะคุมทั้งหน้า ไม่ใช่แค่ตาราง · ตัวกรองที่มองไม่เห็นคือตัวกรองที่ผู้ใช้
            กล่าวหาว่าข้อมูลหาย (ของเดิมบอกแค่ในคำโปรยของแท็บ "ที่ฉันเปิด" ขอบเขตอื่นไม่บอกเลย) */}
        {/* มุมมองลงจอดของป้ายเมนู (L20) — ตัวกรองที่มองไม่เห็นคือตัวกรองที่คนกล่าวหาว่าข้อมูลหาย · × = กลับแท็บตั้งต้น */}
        {navLanding && (
          <Button size="sm" onClick={() => setNavLanding(false)} title="ล้างตัวกรองนี้ แล้วกลับแท็บตั้งต้นของคุณ">
            กรอง: {REQUESTS_NAV_LANDING_LABEL} ×
          </Button>
        )}
        {dealLink && (
          <Button
            size="sm"
            onClick={() => router.replace(requestsQueueHref({ tab: urlTab }), { scroll: false })}
            title="ล้างตัวกรองนี้ แล้วดูคำร้องทั้งหมดในขอบเขตนี้"
          >
            กรอง: {dealLinkLabel} ×
          </Button>
        )}
        {activeScope !== scope && (
          <span className="toolbar-label">
            สิทธิ์ไม่พอสำหรับ &quot;{SCOPE_LABELS[scope]}&quot; — แสดง &quot;{SCOPE_LABELS[activeScope]}&quot; แทน
          </span>
        )}
      </div>

      {/* ⚠️ อยู่ **เหนือ** การ์ดเริ่มที่นี่ — ใบตีกลับไม่มีใครทำอยู่เลย จึงเร่งกว่า
          ใบที่รอฝ่ายอยู่ · การ์ดเริ่มที่นี่ก็ชี้ใบเดียวกันอยู่แล้วเมื่อมันเร่งที่สุด */}
      {!loading && !loadError && bouncedRows.length > 0 && tab !== "history" && (
        <AlertBanner
          tone="danger"
          icon={Undo2}
          action={(
            <Button size="sm" onClick={showBounced}>
              ดูใบที่ตีกลับ
            </Button>
          )}
        >
          <strong>มีใบตีกลับค้าง {bouncedRows.length} ใบ</strong>
          {bouncedWorst ? ` — ใบที่ค้างนานสุด${bouncedWorst.days > 0 ? ` ${bouncedWorst.days} วัน` : "ตีกลับวันนี้"}` : ""}
          {" · แก้แล้วกดส่งใหม่ได้เลย เลขที่เดิม"}
        </AlertBanner>
      )}

      {/* ⭐ **อยู่ใต้แถวตัวกรอง** — มันเป็นคำตอบของทั้งหน้า ไม่ใช่ของแท็บใดแท็บหนึ่ง
          🪤 เคยแทรกอยู่ **ระหว่าง** ขอบเขตกับแท็บ ⇒ ผ่ากลุ่มตัวเลือกขาดสองท่อน */}
      {!loading && !loadError && tab !== "history" && (
        <StartHereCard
          pick={startHere}
          clearText={deptLabel
            ? `ไม่มีเรื่องของฝ่าย ${deptFilter} รอคุณอยู่ตอนนี้`
            : "ไม่มีเรื่องรอคุณอยู่ตอนนี้"}
        />
      )}

      {/* แถบตัวเลข — component เดียวกับภาพรวมฝ่าย · ที่นี่กดแล้ว **กรองในที่**
          ⚠️ ไม่มีในประวัติ (ม-145 · ม-80 ข้อ 3) — ทุกช่องนับเฉพาะใบที่ยังเดินอยู่ ⇒ ศูนย์
          ทั้งแถบ = ปุ่มกรองที่กดแล้วเงียบ */}
      {!loading && !loadError && tab !== "history" && (
        <QueueCountStrip
          counts={counts}
          filter activeKey={board.countFilter}
          note="กดเพื่อกรองรายการ"
          ariaLabel="ตัวเลขสรุปคิวคำร้อง — กดเพื่อกรอง"
          /* ตีกลับเป็นงานของผู้ขอ — แท็บคิวฝ่ายไม่ต้องมีกล่องที่เป็น 0 ตลอด · มุมมองลงจอดรวมใบตีกลับ ⇒ มีกล่องนั้น (L20) */
          scope={tab === "todo" && !navLanding ? "dept" : "requester"}
          onSelect={(key, on) => board.setCountFilter(on ? null : key)}
        />
      )}

      <RequestQueuePanel
        /* เข้า/ออกมุมมองลงจอด หรือกดป้ายซ้ำ = แผงใหม่ (หน้า 1 · แถวต่อหน้ากลับ 25) — คีย์รีเซ็ตหน้าในแผงไม่รู้จักมุมมองนี้ (L20)
           ⚠️ state อื่นของแผง (มุมมอง/เรียง/จัดกลุ่ม/พับกลุ่ม) อยู่ใน `board` ของหน้านี้ ไม่หายตอนแผงเมานต์ใหม่ */
        key={navLanding ? `nav-landing-${navLandingSeq}` : "queue"}
        scope={tab === "mine" ? "mine" : "queue"} dept={null}
        /* หัวแผงรายการกลับมา (มติผู้ใช้ 2026-09-15 · D1 — แทนมติถอดหัวการ์ด 2026-09-07) */
        icon={<MessageCircleQuestion size={17} aria-hidden="true" />}
        sectionTitle="รายการคำร้อง"
        toolbarEnd={(
          <ViewSwitcher
            value={board.view} onChange={board.setView}
            modes={["table", "list"]} ariaLabel="มุมมองคิวคำร้อง"
          />
        )}
        rows={rows} board={board}
        /* ป้ายตัวเลือกที่ติ๊กอยู่แต่ไม่มีในมุมมองนี้ (สลับแท็บ/ฝ่าย) อ่านจากชุดทั้งขอบเขต */
        labelRows={rawRequests}
        /* ประวัติโชว์ "วันที่ปิดเรื่อง" สองฝั่งแทนกำหนดส่ง (ม-145 · preset `history`) */
        columns={tab === "history" ? "history" : "queue"}
        /* กรองฝ่ายอยู่แล้วไม่เจอ = บอกว่าไม่มี **และบอกทางออก** — ข้อความตั้งต้นของ
           พาเนลพูดถึงคิวทั้งก้อน ซึ่งอ่านเหมือนระบบว่างทั้งที่แค่กรองอยู่ */
        emptyText={deptLabel
          ? `ไม่มีคำร้องถึงฝ่าย ${deptLabel} ในมุมมองนี้ — กด "ทุกฝ่าย" เพื่อดูทั้งหมด`
          : navLanding
            ? "ไม่มีเรื่องรอคุณลงมือตอนนี้ — กดป้าย \"กรอง\" ด้านบนเพื่อกลับแท็บตั้งต้น"
          : dealLink
            ? `ไม่มีคำร้องตามตัวกรอง "${dealLinkLabel}" ในมุมมองนี้ — กดป้าย "กรอง" ด้านบนเพื่อดูทั้งหมด`
          : tab === "history"
            ? "ยังไม่มีเรื่องที่จบแล้วในมุมมองนี้"
            /* ทีม/ทั้งหมด "ในคิว" — ข้อความตั้งต้นของพาเนลพูดถึง "ของคุณ"/"ฝ่ายคุณ" ซึ่งไม่ใช่
               ชุดนี้ · ว่างเพราะทุกใบจบแล้ว ต้องบอกให้ไปดูประวัติ */
            : !roleTabsApply
              ? "ไม่มีใบที่ยังไม่จบในขอบเขตนี้ — ใบที่จบแล้วอยู่ที่ \"ประวัติ\""
              : null}
        loading={loading} loadError={loadError} reload={reload}
      />
      </div>
    </Workspace>
  );
}
