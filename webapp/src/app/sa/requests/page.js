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
import { useDepartment, useRole } from "@/lib/roleContext";
import { cachedFetchJson } from "@/lib/apiCache";
import { canQuoteMaterial } from "@/lib/materialPrices";
import { REQUEST_OPEN_STATUSES } from "@/lib/deptRequests";

// คิวมีได้ฝ่ายละแท็บ — ปกติคนหนึ่งอยู่ฝ่ายเดียวจึงเห็นแท็บเดียว แต่ admin ตอบแทน
// ได้ทั้งสองฝ่าย (break-glass) ต้องเห็นครบทั้งคู่ ไม่ใช่เห็นแต่ RD แล้วคิว PC หายไปเฉย ๆ
const QUEUE_TAB = (dept) => `queue-${dept}`;
const DEPT_LABEL = { RD: "RD", PC: "จัดซื้อ (PC)" };

const MINE_BLURB = "คำร้องที่คุณเปิดถึงฝ่ายอื่น — สอบถาม บรีฟกลิ่น ขอ Mock-up ขอราคา ขอเอกสาร ติดตามของเข้า";
const queueBlurb = (dept) => `คำร้องที่ฝ่าย ${DEPT_LABEL[dept] || dept} ต้องรับเรื่องและตอบ`
  + " — เรื่องที่ยังไม่มีใครรับขึ้นก่อนเสมอ";

export default function RequestsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const role = useRole();
  const department = useDepartment();
  const me = useMemo(() => ({ role, department }), [role, department]);
  // filter ไม่ใช่ find — admin ตอบได้ทั้ง RD และ PC (isSuperuser ผ่านทุกฝ่าย)
  // ถ้าใช้ find คิวของ PC จะหายไปทั้งก้อนโดยไม่มีอะไรบอก
  const myDepts = useMemo(() => ["RD", "PC"].filter((d) => canQuoteMaterial(me, d)), [me]);

  const [requests, setRequests] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [deals, setDeals] = useState([]);
  const [scents, setScents] = useState([]);
  const [formulas, setFormulas] = useState([]);
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
  const setTab = (next) => router.replace(`/sa/requests?tab=${next}`, { scroll: false });

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
  // ฟอร์มเปิดคำร้องอ้างของจากหลายทะเบียนตามชนิด — วัสดุ (ขอราคา) · กลิ่น (F) ·
  // สูตร (FB) · ดีล (บรีฟกลิ่น/mockup/ขอเอกสาร) → โหลดไว้ให้ครบตั้งแต่เปิดหน้า
  useEffect(() => {
    cachedFetchJson("/api/customers").then((d) => setCustomers(d || [])).catch(() => {});
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
  }, []);

  const mine = useMemo(() => requests.filter((r) => r._mine), [requests]);
  const queues = useMemo(() => Object.fromEntries(myDepts.map((d) => [
    d, requests.filter((r) => r.dept === d && REQUEST_OPEN_STATUSES.includes(r.status)),
  ])), [requests, myDepts]);

  return (
    <Workspace
      icon={<ClipboardList size={22} />}
      title="คำร้องข้ามฝ่าย"
      subtitle={queueDept ? queueBlurb(queueDept) : MINE_BLURB}
    >
      <Tabs
        value={tab} onChange={setTab}
        tabs={[
          ...myDepts.map((d) => ({
            key: QUEUE_TAB(d),
            label: `คิวฝ่าย ${DEPT_LABEL[d] || d} (${queues[d].length})`,
          })),
          { key: "mine", label: `คำร้องที่ฉันเปิด (${mine.length})` },
        ]}
        ariaLabel="มุมมองหน้าคำร้อง"
      />

      <RequestQueuePanel
        scope={queueDept ? "queue" : "mine"} dept={queueDept}
        rows={queueDept ? queues[queueDept] : mine}
        materials={materials} customers={customers} products={products}
        deals={deals} scents={scents} formulas={formulas}
        loading={loading} loadError={loadError} reload={reload}
      />
    </Workspace>
  );
}
