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

const TAB_KEYS = ["registry", "queue", "mine"];

const BLURB = {
  registry: "ข้อมูลหลักของราคาวัตถุดิบและบรรจุภัณฑ์ — ใบขอราคาผลิตเลือกวัสดุจากที่นี่ "
    + "แต่ละราคาเป็นรุ่น (rev) เก็บประวัติครบ และมีได้หลายชั้นจำนวน",
  queue: "เคสที่ฝ่ายคุณต้องตอบราคา — ตอบแล้วราคาเข้าทะเบียนให้ใช้ซ้ำได้ทุกงานทันที",
  mine: "เคสที่คุณเปิดถามราคาบรรจุภัณฑ์ (PM-) กับฝ่ายจัดซื้อ และหัวน้ำหอม/เนื้อสาร (RM-) กับ RD",
};

export default function MaterialsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const role = useRole();
  const department = useDepartment();
  const me = useMemo(() => ({ role, department }), [role, department]);
  const myDept = ["RD", "PC"].find((d) => canQuoteMaterial(me, d)) || null;

  const [materials, setMaterials] = useState([]);
  const [asks, setAsks] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // แท็บอยู่ใน URL — ลิงก์ตรงจากที่อื่น (เช่น redirect ของ /sa/materials/asks) และ
  // ปุ่มย้อนกลับของเบราว์เซอร์ทำงานได้จริง. ค่าตั้งต้นของ RD/PC = คิวของฝ่ายตน
  // เพราะนั่นคืองานประจำวัน (ก่อนรวมเมนู มันเป็นเมนูของตัวเอง ห้ามทำให้หายาก)
  const urlTab = searchParams.get("tab");
  const defaultTab = myDept ? "queue" : "registry";
  const tab = TAB_KEYS.includes(urlTab) ? urlTab : defaultTab;
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
  const queue = useMemo(
    () => asks.filter((a) => a.dept === myDept && ASK_OPEN_STATUSES.includes(a.status)),
    [asks, myDept],
  );

  return (
    <Workspace hideHeader>
      <div className="premium-header">
        <div className="header-content">
          <h1>
            <span className="premium-header-icon"><Boxes size={22} /></span>{" "}
            วัสดุ
          </h1>
          <p>{BLURB[tab]}</p>
        </div>
      </div>

      <Tabs
        value={tab} onChange={setTab}
        tabs={[
          { key: "registry", label: "ทะเบียนวัสดุ" },
          myDept && { key: "queue", label: `คิวเคสฝ่าย ${myDept} (${queue.length})` },
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
          scope={tab} rows={tab === "queue" ? queue : mine}
          materials={materials} customers={customers} products={products}
          loading={loading} loadError={loadError} reload={reload}
        />
      )}
    </Workspace>
  );
}
