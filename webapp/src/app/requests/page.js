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
import { useRouter, useSearchParams } from "next/navigation";
import { ClipboardList } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import Tabs from "@/components/ui/Tabs";
import Segmented from "@/components/ui/Segmented";
import RequestQueuePanel from "@/components/requests/RequestQueuePanel";
import { useDepartment, useRole, useTeam } from "@/lib/roleContext";
import { REQUEST_SCOPES, canUseScope } from "@/lib/requests/scope";
import { QUEUE_TABS, queueTabRows } from "@/lib/requests/queueBoard";

// คำโปรยของแต่ละแท็บ — บอกว่ากำลังดูอะไรอยู่ ไม่ใช่ชื่อแท็บซ้ำอีกรอบ
const TAB_BLURB = {
  todo: "เรื่องที่รอคุณหรือฝ่ายของคุณทำต่อ — เรื่องที่ยังไม่มีใครรับขึ้นก่อนเสมอ",
  history: "เรื่องที่จบแล้ว — เลือกขอบเขตได้ตามสิทธิ์",
};
import { SCOPE_LABELS } from "@/components/salesPlanning/ui";
import { REQUEST_ANSWER_DEPARTMENTS, canAnswerRequestsFor } from "@/lib/permissions";
import { deptsInSharedQueue } from "@/lib/requests/modules";
import { compareRequestUrgency } from "@/lib/deptRequests";

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
  // ⚠️ `team` ต้องอยู่ในนี้ด้วย — `canUseScope` ตัดสิน "ทีม" จากมัน · ขาดไปแล้วปุ่ม
  // "ทีม" จะจางตลอดกาลสำหรับทุกคน ทั้งที่ server ยอมให้ใช้
  const me = useMemo(() => ({ role, department, team }), [role, department, team]);
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

  const [requests, setRequests] = useState([]);
  // ⚠️ เหลือ **ดีลอย่างเดียว** — ใช้เติมค่าตั้งต้นให้ปุ่ม "เปิดคำร้อง" ตอนมาจากหน้าดีล
  // (`?dealId=`) · ทะเบียนที่เหลือเคยโหลดไว้ส่งให้ `RequestQueuePanel` ซึ่ง **ไม่เคย
  // อ่านมันเลย** ⇒ 8 endpoint ต่อการเปิดคิวหนึ่งครั้ง โดยไม่มีอะไรบนจอเปลี่ยน
  const [deals, setDeals] = useState([]);
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
  const [scope, setScope] = useState(
    () => REQUEST_SCOPES.filter((s) => canUseScope(me, s)).pop() || "mine",
  );
  const [activeScope, setActiveScope] = useState("mine");

  const reload = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const res = await fetch(`/api/sa/requests?scope=${scope}`, { cache: "no-store" });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error || "โหลดคำร้องไม่สำเร็จ");
      setRequests(Array.isArray(d) ? d : []);
      // ⚠️ server เป็นคนตัดสินขอบเขตจริง (สิทธิ์ไม่พอ = ถอยลงมา ไม่ปฏิเสธ) ⇒ อ่าน
      // ค่าที่ได้จริงกลับมาแสดง ไม่ใช่โชว์สิ่งที่ผู้ใช้ *ขอ* ซึ่งอาจไม่ใช่สิ่งที่ได้
      setActiveScope(res.headers.get("X-Request-Scope") || scope);
    } catch (e) { setLoadError(e.message); }
    setLoading(false);
  }, [scope]);

  useEffect(() => { reload(); }, [reload]);
  // ดีลใช้เติมค่าตั้งต้นของปุ่มเปิดคำร้องเมื่อมาจากหน้าดีล — ทะเบียนที่ฟอร์มต้องใช้
  // จริงโหลดที่ `/requests/new` ซึ่งเป็นที่ที่ฟอร์มอยู่ ไม่ใช่ที่คิว
  useEffect(() => {
    fetch("/api/sales-planning/deals", { cache: "no-store" })
      .then((r) => r.json()).then((d) => setDeals(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const mine = useMemo(() => requests.filter((r) => r._mine), [requests]);
  // 🐞 subtitle ของหน้านี้บอกไว้ตั้งแต่ต้นว่า "เรื่องที่ยังไม่มีใครรับขึ้นก่อนเสมอ"
  // แต่ไม่มีใครเรียงจริง — API คืนมาเรียง createdAt ล้วน · ตัวเรียงมีอยู่แล้วใน lib
  // (compareRequestUrgency) แต่มีแค่หน้า dashboard RD ที่เรียก
  const tabRows = useMemo(
    () => queueTabRows(requests, { tab, myDepts }).slice().sort(compareRequestUrgency),
    [requests, tab, myDepts],
  );

  // 🐞 `?dealId=` เคยเป็นพารามิเตอร์ตาย: หน้าดีลลิงก์มาพร้อมดีล แต่หน้านี้อ่านแค่
  // `tab` — กดมาแล้วได้คิวทั้งก้อน ไม่ได้กรองและไม่ได้เติมดีลให้ฟอร์ม
  // ตอนนี้ดีลบังคับทุกหัวข้อแล้ว การเติมล่วงหน้าจึงมีค่ากว่าเดิม: มาจากหน้าดีลไหน
  // ก็เปิดคำร้องของดีลนั้นได้เลยไม่ต้องไล่หาในโครงการ
  const dealIdParam = searchParams.get("dealId");
  const dealParam = useMemo(
    () => deals.find((d) => d.id === dealIdParam) || null,
    [deals, dealIdParam],
  );
  const newRequestDefaults = useMemo(() => (dealParam?.projectId
    ? { projectId: dealParam.projectId, dealId: dealParam.id }
    : null), [dealParam]);
  const visibleMine = useMemo(
    () => (dealIdParam ? mine.filter((r) => r.dealId === dealIdParam) : mine),
    [mine, dealIdParam],
  );

  return (
    <Workspace
      icon={<ClipboardList size={22} />}
      title="คำร้องข้ามฝ่าย"
      subtitle={tab === "todo" ? TAB_BLURB.todo
        : tab === "history" ? TAB_BLURB.history
          : mineBlurb(dealParam)}
    >
      {/* ⭐ ขอบเขตอยู่ **เหนือแท็บ** — มันคุมว่าข้อมูลชุดไหนถูกดึงมา ส่วนแท็บแบ่งชุด
          นั้นอีกที ⇒ วางใต้แท็บทำให้อ่านเหมือนว่าใช้กับแท็บเดียว
          ⚠️ ใช้ `Segmented` + คลาส `scope-toggle` ชุดเดียวกับคิวลีด/ดีล — ตัวสลับ
          ขอบเขตหน้าตาต้องเหมือนกันทุกหน้า (PR #969 รวมไว้แล้ว อย่าเขียนใหม่)
          ⚠️ ตัวเลือกที่ไม่มีสิทธิ์ **จางและกดไม่ได้ ไม่ใช่ซ่อน** — ซ่อนแล้วคนจะไม่รู้ว่า
          มีของที่ตัวเองเข้าไม่ถึงอยู่ แล้วอ่านคิวสั้น ๆ ว่า "ไม่มีงาน" */}
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
        {activeScope !== scope && (
          <span className="toolbar-label">
            สิทธิ์ไม่พอสำหรับ &quot;{SCOPE_LABELS[scope]}&quot; — แสดง &quot;{SCOPE_LABELS[activeScope]}&quot; แทน
          </span>
        )}
      </div>

      <Tabs
        value={tab} onChange={setTab}
        tabs={QUEUE_TABS.map((t) => ({
          key: t.key,
          // นับจากชุดเดียวกับที่แท็บนั้นจะแสดงจริง — ตัวเลขบนแท็บกับตารางข้างล่าง
          // ขัดกันไม่ได้ (เดิมนับคนละที่กัน)
          label: `${t.label} (${queueTabRows(requests, { tab: t.key, myDepts }).length})`,
        }))}
        ariaLabel="มุมมองหน้าคำร้อง"
      />

      <RequestQueuePanel
        scope={tab === "mine" ? "mine" : "queue"} dept={null}
        rows={tab === "mine" ? visibleMine : tabRows}
        newRequestDefaults={newRequestDefaults}
        loading={loading} loadError={loadError} reload={reload}
      />
    </Workspace>
  );
}
