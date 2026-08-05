"use client";
// ── คำร้องข้ามฝ่าย (mig 0173) ──────────────────────────────────────────
//
// ⭐ ที่มา: ระบบเคยมีกลไก "ขอให้ฝ่ายอื่นทำอะไรให้" อยู่สองชุด คนละคำ คนละคิว —
// "สอบถาม RD" (เธรดล้วน) กับ "เคสขอราคาวัสดุ" (มีบรรทัด/เลขที่/คิว) ทั้งที่เป็น
// เรื่องเดียวกัน · RD จึงต้องเฝ้าสองที่ และไม่มีที่ไหนบอกว่างานค้างทั้งหมดมีกี่ชิ้น
//
// หน้านี้คือคิวเดียวของทุกชนิดคำร้อง — ชนิดคุมด้วย lib/master/requestTypes.js
// (สอบถาม · บรีฟกลิ่น · ขอ mockup · ขอราคา F/FB/PM · ขอเอกสาร · ติดตามของเข้า)
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ClipboardList } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import Tabs from "@/components/ui/Tabs";
import RequestQueuePanel from "@/components/requests/RequestQueuePanel";
import { useDepartment, useRole, useTeam } from "@/lib/roleContext";
import Button from "@/components/ui/Button";
import { REQUEST_SCOPES, canUseScope } from "@/lib/requests/scope";
import { SCOPE_LABELS } from "@/components/salesPlanning/ui";
import { cachedFetchJson } from "@/lib/apiCache";
import { canQuoteMaterial } from "@/lib/materialPrices";
import { REQUEST_OPEN_STATUSES, compareRequestUrgency } from "@/lib/deptRequests";

// คิวมีได้ฝ่ายละแท็บ — ปกติคนหนึ่งอยู่ฝ่ายเดียวจึงเห็นแท็บเดียว แต่ admin ตอบแทน
// ได้ทั้งสองฝ่าย (break-glass) ต้องเห็นครบทั้งคู่ ไม่ใช่เห็นแต่ RD แล้วคิว PC หายไปเฉย ๆ
const QUEUE_TAB = (dept) => `queue-${dept}`;
const DEPT_LABEL = { RD: "RD", PC: "จัดซื้อ (PC)" };

const MINE_BLURB = "คำร้องที่คุณเปิดถึงฝ่ายอื่น — สอบถาม บรีฟกลิ่น ขอ Mock-up ขอราคา ขอเอกสาร ติดตามของเข้า";
// มาจากหน้าดีล (`?dealId=`) ต้องบอกว่ากำลังดูแค่ดีลนั้น ไม่ใช่ทั้งหมด — ไม่งั้น
// "ไม่มีคำร้องของคุณ" อ่านเหมือนระบบว่าง ทั้งที่แค่กรองอยู่
const mineBlurb = (deal) => (deal
  ? `คำร้องของดีล ${deal.code || deal.id}${deal.title ? ` — ${deal.title}` : ""} เท่านั้น`
  : MINE_BLURB);
const queueBlurb = (dept) => `คำร้องที่ฝ่าย ${DEPT_LABEL[dept] || dept} ต้องรับเรื่องและตอบ`
  + " — เรื่องที่ยังไม่มีใครรับขึ้นก่อนเสมอ";

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
  const myDepts = useMemo(() => ["RD", "PC"].filter((d) => canQuoteMaterial(me, d)), [me]);

  const [requests, setRequests] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [products, setProducts] = useState([]);
  const [projects, setProjects] = useState([]);
  const [deals, setDeals] = useState([]);
  const [salesOrders, setSalesOrders] = useState([]);
  const [productTypes, setProductTypes] = useState([]);
  const [scents, setScents] = useState([]);
  const [formulas, setFormulas] = useState([]);
  const [mentionPeople, setMentionPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // แท็บอยู่ใน URL — ลิงก์ตรงจากที่อื่นและปุ่มย้อนกลับของเบราว์เซอร์ทำงานได้จริง
  // ค่าตั้งต้นของ RD/PC = คิวของฝ่ายตน เพราะนั่นคืองานประจำวัน
  const tabKeys = [...myDepts.map(QUEUE_TAB), "mine"];
  const defaultTab = myDepts.length ? QUEUE_TAB(myDepts[0]) : "mine";
  const urlTab = searchParams.get("tab");
  const wanted = urlTab === "queue" ? defaultTab : urlTab;
  const tab = tabKeys.includes(wanted) ? wanted : defaultTab;
  const queueDept = tab.startsWith("queue-") ? tab.slice("queue-".length) : null;
  const setTab = (next) => router.replace(`/requests?tab=${next}`, { scroll: false });

  // ⭐ ตัวสลับขอบเขต — **กรองที่ API ไม่ใช่ที่จอ** (กับดักข้อ 9 ของแผน)
  // กรองที่จอแปลว่าคำร้องของทีมอื่นถูกส่งถึงเบราว์เซอร์แล้วค่อยซ่อน เปิดดูได้จาก
  // แท็บ Network โดยไม่ต้องมีความรู้อะไรเลย
  const [scope, setScope] = useState("mine");
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
  // ฟอร์มเปิดคำร้องอ้างของจากหลายทะเบียนตามหัวข้อ — โครงการ+ดีล (บังคับทุกหัวข้อ) ·
  // วัสดุ/สินค้า (ขอราคา) · กลิ่น (F) · สูตร (FB) · รายชื่อคนที่ @ ได้
  // → โหลดไว้ให้ครบตั้งแต่เปิดหน้า
  useEffect(() => {
    cachedFetchJson("/api/products").then((d) => setProducts(d || [])).catch(() => {});
    const asArray = (d) => (Array.isArray(d) ? d : []);
    fetch("/api/sa/materials", { cache: "no-store" })
      .then((r) => r.json()).then((d) => setMaterials(asArray(d))).catch(() => {});
    fetch("/api/master/scents?status=developing,active", { cache: "no-store" })
      .then((r) => r.json()).then((d) => setScents(asArray(d))).catch(() => {});
    fetch("/api/master/formulas?status=active", { cache: "no-store" })
      .then((r) => r.json()).then((d) => setFormulas(asArray(d))).catch(() => {});
    fetch("/api/sales-planning/deals", { cache: "no-store" })
      .then((r) => r.json()).then((d) => setDeals(asArray(d))).catch(() => {});
    fetch("/api/pm/projects", { cache: "no-store" })
      .then((r) => r.json()).then((d) => setProjects(asArray(d))).catch(() => {});
    // บรีฟกลิ่นยึด SO (ค่าบริการออกแบบกลิ่น) · Mock-up ยึดหมวดสินค้า
    fetch("/api/sales-planning/sales-orders", { cache: "no-store" })
      .then((r) => r.json()).then((d) => setSalesOrders(asArray(d))).catch(() => {});
    cachedFetchJson("/api/product-types").then((d) => setProductTypes(d || [])).catch(() => {});
    // รายชื่อกรองด้วยด่านของเธรดคำร้องมาจาก server แล้ว (ห้ามกรองเองที่ client —
    // @คนที่เปิดคำร้องไม่ได้ = เขาได้แจ้งเตือนที่กดแล้วเจอ 404)
    fetch("/api/sa/requests/mentionable", { cache: "no-store" })
      .then((r) => r.json()).then((d) => setMentionPeople(asArray(d))).catch(() => {});
  }, []);

  const mine = useMemo(() => requests.filter((r) => r._mine), [requests]);
  const queues = useMemo(() => Object.fromEntries(myDepts.map((d) => [
    d, requests.filter((r) => r.dept === d && REQUEST_OPEN_STATUSES.includes(r.status))
      // 🐞 subtitle ของหน้านี้บอกไว้ตั้งแต่ต้นว่า "เรื่องที่ยังไม่มีใครรับขึ้นก่อน
      // เสมอ" แต่ไม่มีใครเรียงจริง — API คืนมาเรียง createdAt ล้วน · ตัวเรียงมีอยู่
      // แล้วใน lib (compareRequestUrgency) แต่มีแค่หน้า dashboard RD ที่เรียก
      .sort(compareRequestUrgency),
  ])), [requests, myDepts]);

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
      subtitle={queueDept ? queueBlurb(queueDept) : mineBlurb(dealParam)}
    >
      <Tabs
        value={tab} onChange={setTab}
        tabs={[
          ...myDepts.map((d) => ({
            key: QUEUE_TAB(d),
            label: `คิวฝ่าย ${DEPT_LABEL[d] || d} (${queues[d].length})`,
          })),
          { key: "mine", label: `คำร้องที่ฉันเปิด (${visibleMine.length})` },
        ]}
        ariaLabel="มุมมองหน้าคำร้อง"
      />

      {/* ⚠️ ตัวเลือกที่ไม่มีสิทธิ์ **จางและกดไม่ได้ ไม่ใช่ซ่อน** — ซ่อนแล้วคนจะไม่รู้
          ว่ามีของที่ตัวเองเข้าไม่ถึงอยู่ และจะอ่านคิวสั้น ๆ ว่า "ไม่มีงาน" */}
      {tab === "mine" && (
        <div className="toolbar">
          <span className="toolbar-label">ขอบเขต</span>
          {REQUEST_SCOPES.map((s) => (
            <Button
              key={s} size="sm"
              tone={activeScope === s ? "primary" : undefined}
              disabled={!canUseScope(me, s)}
              title={canUseScope(me, s) ? undefined : "ไม่มีสิทธิ์ดูขอบเขตนี้"}
              onClick={() => setScope(s)}
            >
              {SCOPE_LABELS[s]}
            </Button>
          ))}
          {activeScope !== scope && (
            <span className="toolbar-label">
              สิทธิ์ไม่พอสำหรับ &quot;{SCOPE_LABELS[scope]}&quot; — แสดง &quot;{SCOPE_LABELS[activeScope]}&quot; แทน
            </span>
          )}
        </div>
      )}

      <RequestQueuePanel
        scope={queueDept ? "queue" : "mine"} dept={queueDept}
        rows={queueDept ? queues[queueDept] : visibleMine}
        materials={materials} products={products}
        projects={projects} deals={deals} salesOrders={salesOrders}
        scents={scents} formulas={formulas} productTypes={productTypes}
        mentionPeople={mentionPeople}
        newRequestDefaults={newRequestDefaults}
        loading={loading} loadError={loadError} reload={reload}
      />
    </Workspace>
  );
}
