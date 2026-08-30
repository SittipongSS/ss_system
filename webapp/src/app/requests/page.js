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
  QUEUE_TABS, queueCounts, queueTabRows, startHereRequest, visibleQueueRows, waitingOnMeRows,
} from "@/lib/requests/queueBoard";
import StartHereCard from "@/components/requests/StartHereCard";
import AlertBanner from "@/components/ui/AlertBanner";
import { bouncedDaysText } from "@/lib/requests/queueBoard";
import { businessDate } from "@/lib/businessDate";

// คำโปรยของแต่ละแท็บ — บอกว่ากำลังดูอะไรอยู่ ไม่ใช่ชื่อแท็บซ้ำอีกรอบ
const TAB_BLURB = {
  todo: "เรื่องที่รอคุณหรือฝ่ายของคุณทำต่อ — เรื่องที่ยังไม่มีใครรับขึ้นก่อนเสมอ",
  history: "เรื่องที่จบแล้ว — เลือกขอบเขตได้ตามสิทธิ์",
};
import { SCOPE_LABELS } from "@/components/salesPlanning/ui";
import { REQUEST_ANSWER_DEPARTMENTS, canAnswerRequestsFor } from "@/lib/permissions";
import { REQUEST_DEPT_LABELS } from "@/lib/master/requestTypes";
import { deptsInSharedQueue } from "@/lib/requests/modules";
import { compareRequestUrgency } from "@/lib/deptRequests";
import { apiFetch } from "@/lib/apiFetch";

// คิวมีได้ฝ่ายละแท็บ — ปกติคนหนึ่งอยู่ฝ่ายเดียวจึงเห็นแท็บเดียว แต่ admin ตอบแทน
// ได้ทั้งสองฝ่าย (break-glass) ต้องเห็นครบทั้งคู่ ไม่ใช่เห็นแต่ RD แล้วคิว PC หายไปเฉย ๆ

const MINE_BLURB = "คำร้องที่คุณเปิดถึงฝ่ายอื่น — พัฒนากลิ่น พัฒนาสูตร ขอเอกสาร สอบถามข้อมูล ติดตามของเข้า";
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
  // ⚠️ ลิงก์เก่ายังชี้ `queue-RD` / `queue` อยู่หลายที่ (การ์ดคำร้องบนหน้าดีล ·
  // แจ้งเตือน · /go/DR-…) — เด้งเข้าแท็บที่กลืนมันไป ไม่ใช่ตกลง "ที่ฉันเปิด" เงียบ ๆ
  const wanted = String(urlTab || "").startsWith("queue") ? "todo" : urlTab;
  const tab = tabKeys.includes(wanted) ? wanted : defaultTab;

  const setTab = (next) => router.replace(`/requests?tab=${next}`, { scroll: false });

  // ⭐ ตัวสลับขอบเขต — **กรองที่ API ไม่ใช่ที่จอ** (กับดักข้อ 9 ของแผน)
  // กรองที่จอแปลว่าคำร้องของทีมอื่นถูกส่งถึงเบราว์เซอร์แล้วค่อยซ่อน เปิดดูได้จาก
  // แท็บ Network โดยไม่ต้องมีความรู้อะไรเลย
  // 🐞 **ตั้งต้นที่ขอบเขตกว้างสุดที่สิทธิ์ยอม ไม่ใช่ "ของฉัน" ตายตัว** — ผู้ดูแลระบบ
  // ที่ไม่ได้เปิดใบเองเห็นหน้าว่างเปล่าทั้งสามแท็บ · #1038 แก้ฝั่ง API ไว้แล้วแต่
  // **หน้านี้ส่ง `?scope=mine` มาเสมอ** ⇒ ด่านฝั่ง API ไม่มีวันได้ทำงาน
  /* ⭐ **ลิงก์ที่ระบุแท็บมาเปิดที่ขอบเขต "ของฉัน" เสมอ** (มติผู้ใช้ 2026-08-15) —
     แท็บบทบาทมีผลเฉพาะขอบเขตนี้ (ดู `visibleQueueRows`) · เปิด `?tab=history` ด้วย
     ขอบเขตกว้างเมื่อไร แท็บถูกซ่อนและพารามิเตอร์ถูกเมินเงียบ ๆ ⇒ คนส่งลิงก์ "ประวัติ"
     กับคนกดเปิดเห็นคนละหน้ากันโดยไม่มีอะไรบอก
     ⚠️ **ตั้งครั้งเดียวตอนเปิดหน้า ไม่เฝ้าค่าต่อ** — เฝ้าเมื่อไรผู้ใช้จะสลับไป
     ทีม/ทั้งหมดไม่ได้เลย เพราะ `setTab` เขียน `?tab=` ลง URL ทุกครั้งที่กดแท็บ
     (บทเรียนเดียวกับ `?owner=` และ `?count=` ในไฟล์นี้)
     ⚠️ ยอมรับเฉพาะค่าที่เป็นแท็บจริง — `?tab=อะไรก็ไม่รู้` ต้องไม่บีบขอบเขตให้แคบลง */
  const [scope, setScope] = useState(() => (
    // ใช้ `wanted` ไม่ใช่ `urlTab` ดิบ ⇒ ลิงก์เก่า (`?tab=queue-RD`) ที่ถูกแปลงเป็น
    // "todo" ได้ขอบเขตที่ทำให้แท็บนั้นมีผลด้วยเหมือนกัน
    tabKeys.includes(wanted)
      ? "mine"
      : REQUEST_SCOPES.filter((s) => canUseScope(me, s)).pop() || "mine"
  ));
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
  const [deptFilter, setDeptFilter] = useState("all");
  const requests = useMemo(
    () => (deptFilter === "all" ? scopedRequests : scopedRequests.filter((r) => r.dept === deptFilter)),
    [scopedRequests, deptFilter],
  );
  const mine = useMemo(() => requests.filter((r) => r._mine), [requests]);
  // 🐞 subtitle ของหน้านี้บอกไว้ตั้งแต่ต้นว่า "เรื่องที่ยังไม่มีใครรับขึ้นก่อนเสมอ"
  // แต่ไม่มีใครเรียงจริง — API คืนมาเรียง createdAt ล้วน · ตัวเรียงมีอยู่แล้วใน lib
  // (compareRequestUrgency) แต่มีแค่หน้า dashboard RD ที่เรียก
  /* ⭐ **ขอบเขตเป็นตัวตัดสินแถว แท็บบทบาทเป็นตัวรอง** — โครงเดียวกับหน้า "งานของฉัน"
     (มติผู้ใช้ 2026-08-11) · ที่นั่นตัวสลับ "บทบาทของฉันในงาน" โผล่เฉพาะตอนเลือก
     "ของฉัน" เพราะพอเลือกทีม/ทั้งหมดแล้ว คำถามไม่ใช่ "บทบาทฉันคืออะไร" อีกต่อไป
     🐞 ของเดิมกรองด้วยแท็บเสมอ ⇒ ใบที่ขอบเขตทีม/ทั้งหมดโหลดมาไม่มีแท็บไหนรับ
     หน้าจึงว่างเปล่าทั้งที่ API ส่งมา 15 ใบ (ผู้ใช้ส่งภาพมา) */
  const roleTabsApply = activeScope === "mine";
  const tabRows = useMemo(
    () => visibleQueueRows(requests, { scope: activeScope, tab, myDepts })
      .slice().sort(compareRequestUrgency),
    [requests, activeScope, tab, myDepts],
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
  const today = businessDate();
  const startHere = useMemo(
    () => startHereRequest(waitingOnMeRows(requests, { myDepts }), { todayIso: today }),
    [requests, myDepts, today],
  );

  // 🐞 `?dealId=` เคยเป็นพารามิเตอร์ตาย: หน้าดีลลิงก์มาพร้อมดีล แต่หน้านี้อ่านแค่
  // `tab` — กดมาแล้วได้คิวทั้งก้อน ไม่ได้กรองและไม่ได้เติมดีลให้ฟอร์ม
  // ตอนนี้ดีลบังคับทุกหัวข้อแล้ว การเติมล่วงหน้าจึงมีค่ากว่าเดิม: มาจากหน้าดีลไหน
  // ก็เปิดคำร้องของดีลนั้นได้เลยไม่ต้องไล่หาในโครงการ
  const dealIdParam = searchParams.get("dealId");
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
  const visibleMine = useMemo(
    () => (dealIdParam ? mine.filter((r) => r.dealId === dealIdParam) : mine),
    [mine, dealIdParam],
  );

  // prefill ปุ่มเปิดคำร้อง — `returnTo` พากลับมาที่คิวหลังกดยกเลิก
  const newRequestQuery = (() => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(newRequestDefaults || {})) if (v) q.set(k, v);
    q.set("returnTo", "/requests");
    return `?${q.toString()}`;
  })();

  /* ⚠️ แท็บ "ที่ฉันเปิด" มีเส้นทางของตัวเอง (กรองด้วย `?dealId=` ตอนมาจากหน้าดีล)
     — ใช้ได้เฉพาะขอบเขต "ของฉัน" · ขอบเขตทีม/ทั้งหมดต้องผ่าน `tabRows` เสมอ ไม่งั้น
     ใบของเพื่อนร่วมทีมโดนกรองทิ้งอีกชั้นแล้วหน้าว่างเหมือนเดิม */
  /* ── ตัวเลือกของตัวสลับฝ่าย ────────────────────────────────────────────
     ⚠️ **นับจากชุดที่มุมมองนี้จะแสดงจริง (ก่อนกรองฝ่าย)** — เลขข้างชิปต้องทำนาย
     ได้ว่ากดแล้วจะเห็นกี่ใบ · นับจากทั้งขอบเขตจะได้ "RD 12" แล้วกดไปเจอ 3 ใบ
     เพราะแท็บตัดที่เหลือทิ้งไปแล้ว
     ⚠️ **ตัวเลือกสร้างจากแถวที่มีจริง ไม่ใช่จากทะเบียนฝ่าย** (กติกาเดียวกับ
     `requestFacetOptions`) — ฝ่ายที่ไม่มีใบเลยคือปุ่มที่กดแล้วได้ตารางว่างเสมอ
     ⚠️ **ฝ่ายที่เลือกอยู่ต้องอยู่ในลิสต์เสมอ แม้เหลือศูนย์ใบ** — ไม่งั้นสลับแท็บแล้ว
     ปุ่มที่กดค้างไว้หายไปจากจอ พร้อมกับตารางที่ว่างโดยไม่มีอะไรบอกว่ายังกรองอยู่ */
  const deptCountBase = useMemo(() => {
    const base = visibleQueueRows(scopedRequests, { scope: activeScope, tab, myDepts });
    return (roleTabsApply && tab === "mine" && dealIdParam)
      ? base.filter((r) => r.dealId === dealIdParam)
      : base;
  }, [scopedRequests, activeScope, tab, myDepts, roleTabsApply, dealIdParam]);
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

  const rows = (roleTabsApply && tab === "mine") ? visibleMine : tabRows;
  const counts = queueCounts(rows, { todayIso: today });

  /* ⭐ **แถบเตือนใบตีกลับ** (แบบ จ · 2026-08-11) — ตัวเลขบนแถบบอกว่ามีกี่ใบ แต่
     แถบตัวเลขคือของที่ตาเลื่อนผ่าน · ใบที่ฝ่ายส่งคืนมาแล้วค้างหลายวันคือของที่
     **ไม่มีใครกำลังทำอยู่เลย** (ฝ่ายปล่อยมือแล้ว ผู้ขอยังไม่รู้ตัว) ⇒ ต้องมีอะไร
     สักอย่างที่อ่านไม่ผ่าน · ปุ่มพาไปตัวกรองเลย ไม่ใช่บอกเฉย ๆ แล้วให้ไปหาเอง
     ⚠️ นับจาก **ใบของตัวเอง** เท่านั้น — ใบตีกลับของเพื่อนร่วมทีมไม่ใช่ของค้างของเรา */
  const bouncedRows = useMemo(
    () => requests.filter((r) => r._mine && r.status === "draft" && r.bouncedAt),
    [requests],
  );
  const bouncedWorst = useMemo(() => bouncedRows
    .map((r) => bouncedDaysText(r, { todayIso: today }))
    .filter(Boolean)
    .sort((a, b) => b.days - a.days)[0] || null, [bouncedRows, today]);

  return (
    <Workspace
      icon={<MessageCircleQuestion size={22} />}
      title="คำร้องข้ามฝ่าย"
      subtitle={!roleTabsApply
        ? `ทุกใบใน${SCOPE_LABELS[activeScope]} — เรื่องที่ยังไม่มีใครรับขึ้นก่อนเสมอ`
        : tab === "todo" ? TAB_BLURB.todo
          : tab === "history" ? TAB_BLURB.history
            : mineBlurb(dealParam)}
      /* ⭐ **ตัวสลับมุมมอง + ปุ่มหลักอยู่ในหัวการ์ด** ตามต้นแบบหน้างานของฉัน
         (มติผู้ใช้ 2026-08-08) — ของเดิมปุ่ม "เปิดคำร้อง" ลอยอยู่กลางหน้าใต้แท็บ
         และตัวสลับมุมมองลอยเดี่ยวใต้แถบตัวเลข ⇒ ของสองชิ้นที่เป็น "เครื่องมือของ
         ทั้งหน้า" กระจายอยู่สามระดับความสูง
         ⚠️ **เปลือกเดียว** — ฟอร์มอยู่ที่ /requests/new ทั้งก้อน (ห้ามครอบ
         RequestForm ไว้สองที่ · โรคเดียวกับที่ AGENTS.md ห้ามเรื่องฟอร์มสร้าง/แก้) */
      headerRight={(
        <div className="flex gap-3 items-center flex-wrap">
          <ViewSwitcher
            value={board.view} onChange={board.setView}
            modes={["table", "list"]} ariaLabel="มุมมองคิวคำร้อง"
          />
          <Button
            tone="accent" icon={<Plus size={16} />}
            onClick={() => router.push(`/requests/new${newRequestQuery}`)}
          >
            เปิดคำร้อง
          </Button>
        </div>
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
          onChange={setScope}
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
          value={tab}
          onChange={setTab}
          options={QUEUE_TABS.map((t) => ({
            value: t.key,
            label: t.label,
            // นับจากชุดเดียวกับที่แท็บนั้นจะแสดงจริง — ตัวเลขบนแท็บกับตารางข้างล่าง
            // ขัดกันไม่ได้ (เดิมนับคนละที่กัน)
            // ⚠️ ส่งเป็น `count` ไม่ใช่ต่อ "(6)" ท้ายป้ายชื่อ — เหตุผลอยู่ใน Segmented.js
            count: queueTabRows(requests, { tab: t.key, myDepts }).length,
          }))}
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
            <Button size="sm" onClick={() => { setTab("mine"); board.setCountFilter("bounced"); }}>
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

      {/* แถบตัวเลข — component เดียวกับภาพรวมฝ่าย · ที่นี่กดแล้ว **กรองในที่** */}
      {!loading && !loadError && (
        <QueueCountStrip
          counts={counts}
          filter activeKey={board.countFilter}
          note="กดเพื่อกรองรายการ"
          ariaLabel="ตัวเลขสรุปคิวคำร้อง — กดเพื่อกรอง"
          /* ตีกลับเป็นงานของผู้ขอ — แท็บคิวฝ่ายไม่ต้องมีกล่องที่เป็น 0 ตลอด */
          scope={tab === "todo" ? "dept" : "requester"}
          onSelect={(key, on) => board.setCountFilter(on ? null : key)}
        />
      )}

      <RequestQueuePanel
        scope={tab === "mine" ? "mine" : "queue"} dept={null}
        rows={rows} board={board}
        /* กรองฝ่ายอยู่แล้วไม่เจอ = บอกว่าไม่มี **และบอกทางออก** — ข้อความตั้งต้นของ
           พาเนลพูดถึงคิวทั้งก้อน ซึ่งอ่านเหมือนระบบว่างทั้งที่แค่กรองอยู่ */
        emptyText={deptLabel
          ? `ไม่มีคำร้องถึงฝ่าย ${deptLabel} ในมุมมองนี้ — กด "ทุกฝ่าย" เพื่อดูทั้งหมด`
          : null}
        loading={loading} loadError={loadError} reload={reload}
      />
      </div>
    </Workspace>
  );
}
