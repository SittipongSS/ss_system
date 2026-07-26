"use client";
// วัสดุ — ทะเบียนวัสดุ + เคสขอราคาวัสดุ อยู่หน้าเดียวกัน (มติผู้ใช้ 2026-07-26)
//
// เดิมแยกเป็นสองเมนู แต่มันคือของชิ้นเดียวกันคนละจังหวะ: ทะเบียนคือข้อมูลหลัก
// เคสคือวิธี "เติมราคา" ให้ทะเบียน — คนใช้เด้งไปมาตลอด และชื่อเมนู "เคสขอราคา"
// อ่านแล้วสับสนกับ "ขอราคาผลิต" ที่เป็นคนละเอกสาร
//
// หน้านี้เป็นเจ้าของข้อมูลทั้งสองชุด เพราะทั้งสองแท็บใช้ทะเบียนร่วมกัน (ฟอร์มเปิดเคส
// ก็เลือกวัสดุจากทะเบียน) และตัวนับบนแท็บต้องสดแม้จะยังไม่ได้เปิดแท็บนั้น
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Boxes } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import Tabs from "@/components/ui/Tabs";
import MaterialRegistryPanel from "@/components/materials/MaterialRegistryPanel";
import MaterialAsksPanel from "@/components/materials/MaterialAsksPanel";
import { useDepartment, useRole } from "@/lib/roleContext";
import { cachedFetchJson } from "@/lib/apiCache";
import { canQuoteMaterial } from "@/lib/materialPrices";
import { ASK_OPEN_STATUSES } from "@/lib/materialAsks";

// คิวมีได้ฝ่ายละแท็บ — ปกติคนหนึ่งอยู่ฝ่ายเดียวจึงเห็นแท็บเดียว แต่ admin ตอบแทน
// ได้ทั้งสองฝ่าย (break-glass) ต้องเห็นครบทั้งคู่ ไม่ใช่เห็นแต่ RD แล้วคิว PC หายไปเฉย ๆ
const QUEUE_TAB = (dept) => `queue-${dept}`;
const DEPT_LABEL = { RD: "RD", PC: "จัดซื้อ (PC)" };

const REGISTRY_BLURB = "ข้อมูลหลักของราคาวัตถุดิบและบรรจุภัณฑ์ — ใบขอราคาผลิตเลือกวัสดุจากที่นี่ "
  + "แต่ละราคาเป็นรุ่น (rev) เก็บประวัติครบ และมีได้หลายชั้นจำนวน";
const MINE_BLURB = "เคสที่คุณเปิดถามราคาบรรจุภัณฑ์ (PM-) กับฝ่ายจัดซื้อ และหัวน้ำหอม/เนื้อสาร (RM-) กับ RD";
const queueBlurb = (dept) => `เคสที่ฝ่าย ${DEPT_LABEL[dept] || dept} ต้องตอบราคา`
  + " — ตอบแล้วราคาเข้าทะเบียนให้ใช้ซ้ำได้ทุกงานทันที";

export default function MaterialsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const role = useRole();
  const department = useDepartment();
  const me = useMemo(() => ({ role, department }), [role, department]);
  // filter ไม่ใช่ find — admin ตอบได้ทั้ง RD และ PC (isSuperuser ผ่านทุกฝ่าย)
  // ถ้าใช้ find คิวของ PC จะหายไปทั้งก้อนโดยไม่มีอะไรบอก
  const myDepts = useMemo(() => ["RD", "PC"].filter((d) => canQuoteMaterial(me, d)), [me]);

  const [materials, setMaterials] = useState([]);
  const [asks, setAsks] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // แท็บอยู่ใน URL — ลิงก์ตรงจากที่อื่น (เช่น redirect ของ /sa/materials/asks) และ
  // ปุ่มย้อนกลับของเบราว์เซอร์ทำงานได้จริง. ค่าตั้งต้นของ RD/PC = คิวของฝ่ายตน
  // เพราะนั่นคืองานประจำวัน (ก่อนรวมเมนู มันเป็นเมนูของตัวเอง ห้ามทำให้หายาก)
  const tabKeys = ["registry", ...myDepts.map(QUEUE_TAB), "mine"];
  const defaultTab = myDepts.length ? QUEUE_TAB(myDepts[0]) : "registry";
  const urlTab = searchParams.get("tab");
  // "queue" เฉย ๆ = ทางลัดของลิงก์เก่า/ปุ่มย้อนกลับหน้ารายละเอียด → คิวแรกที่มีสิทธิ์
  const wanted = urlTab === "queue" ? defaultTab : urlTab;
  const tab = tabKeys.includes(wanted) ? wanted : defaultTab;
  const queueDept = tab.startsWith("queue-") ? tab.slice("queue-".length) : null;
  const setTab = (next) => router.replace(`/sa/materials?tab=${next}`, { scroll: false });

  const loadMaterials = useCallback(async () => {
    const res = await fetch("/api/sa/materials", { cache: "no-store" });
    const d = await res.json().catch(() => null);
    if (!res.ok) throw new Error(d?.error || "โหลดทะเบียนไม่สำเร็จ");
    setMaterials(Array.isArray(d) ? d : []);
  }, []);

  const loadAsks = useCallback(async () => {
    const res = await fetch("/api/sa/materials/asks", { cache: "no-store" });
    const d = await res.json().catch(() => null);
    if (!res.ok) throw new Error(d?.error || "โหลดเคสไม่สำเร็จ");
    setAsks(Array.isArray(d) ? d : []);
  }, []);

  // โหลดคู่กันเสมอ: ตัวนับบนแท็บต้องสดทุกแท็บ และการตอบเคสไปเปลี่ยนราคาในทะเบียน
  const reload = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      await Promise.all([loadMaterials(), loadAsks()]);
    } catch (e) { setLoadError(e.message); }
    setLoading(false);
  }, [loadMaterials, loadAsks]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    cachedFetchJson("/api/customers").then((d) => setCustomers(d || [])).catch(() => {});
    cachedFetchJson("/api/products").then((d) => setProducts(d || [])).catch(() => {});
  }, []);

  const mine = useMemo(() => asks.filter((a) => a._mine), [asks]);
  // คิวของแต่ละฝ่ายที่ผู้ใช้คนนี้ตอบได้ — { RD: [...], PC: [...] }
  const queues = useMemo(() => Object.fromEntries(myDepts.map((d) => [
    d, asks.filter((a) => a.dept === d && ASK_OPEN_STATUSES.includes(a.status)),
  ])), [asks, myDepts]);

  return (
    <Workspace hideHeader>
      <div className="premium-header">
        <div className="header-content">
          <h1>
            <span className="premium-header-icon"><Boxes size={22} /></span>{" "}
            วัสดุ
          </h1>
          <p>
            {tab === "registry" ? REGISTRY_BLURB : queueDept ? queueBlurb(queueDept) : MINE_BLURB}
          </p>
        </div>
      </div>

      <Tabs
        value={tab} onChange={setTab}
        tabs={[
          { key: "registry", label: "ทะเบียนวัสดุ" },
          ...myDepts.map((d) => ({
            key: QUEUE_TAB(d),
            label: `คิวเคสฝ่าย ${DEPT_LABEL[d] || d} (${queues[d].length})`,
          })),
          { key: "mine", label: `เคสที่ฉันขอ (${mine.length})` },
        ]}
        ariaLabel="มุมมองหน้าวัสดุ"
      />

      {tab === "registry" ? (
        <MaterialRegistryPanel
          materials={materials} customers={customers}
          loading={loading} loadError={loadError} reload={reload}
        />
      ) : (
        <MaterialAsksPanel
          scope={queueDept ? "queue" : "mine"} dept={queueDept}
          rows={queueDept ? queues[queueDept] : mine}
          materials={materials} customers={customers} products={products}
          loading={loading} loadError={loadError} reload={reload}
        />
      )}
    </Workspace>
  );
}
