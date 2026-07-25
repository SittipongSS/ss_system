"use client";
// เคสขอราคาวัสดุ (mig 0158) — รายการเคสของฉัน + คิวของฝ่ายตน
//
// เซลเปิดเคสถามราคาไป PC (บรรจุภัณฑ์) หรือ RD (หัวน้ำหอม/เนื้อสาร)
// RD/PC เห็นคิวงานที่รอตอบที่เดียว — ของเดิมไม่มีคิวเลย ต้องรอให้เซลตามเอง
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ClipboardList, RefreshCw, Plus, Boxes } from "lucide-react";
import SkeletonRows from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import Workspace from "@/components/ui/Workspace";
import Modal from "@/components/Modal";
import Toast from "@/components/ui/Toast";
import Tabs from "@/components/ui/Tabs";
import AskForm, { emptyAskForm } from "@/components/materials/AskForm";
import { useDepartment, useRole } from "@/lib/roleContext";
import { cachedFetchJson } from "@/lib/apiCache";
import { fmtDate } from "@/lib/format";
import { canQuoteMaterial } from "@/lib/materialPrices";
import { ASK_OPEN_STATUSES, ASK_STATUS_LABELS, askProgress } from "@/lib/materialAsks";

const STATUS_TONE = {
  draft: "var(--text-3)",
  pending: "var(--amber)",
  acknowledged: "var(--blue)",
  answered: "var(--green)",
  closed: "var(--text-3)",
  cancelled: "var(--text-3)",
};

export default function MaterialAsksPage() {
  const router = useRouter();
  const role = useRole();
  const department = useDepartment();
  const me = useMemo(() => ({ role, department }), [role, department]);
  const myDept = ["RD", "PC"].find((d) => canQuoteMaterial(me, d)) || null;

  const [asks, setAsks] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState(myDept ? "queue" : "mine");
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const res = await fetch("/api/sa/materials/asks", { cache: "no-store" });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error || "โหลดเคสไม่สำเร็จ");
      setAsks(Array.isArray(d) ? d : []);
    } catch (e) { setLoadError(e.message); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/sa/materials", { cache: "no-store" })
      .then((r) => r.json()).then((d) => setMaterials(Array.isArray(d) ? d : [])).catch(() => {});
    cachedFetchJson("/api/customers").then((d) => setCustomers(d || [])).catch(() => {});
    cachedFetchJson("/api/products").then((d) => setProducts(d || [])).catch(() => {});
  }, []);

  const mine = useMemo(() => asks.filter((a) => a._mine), [asks]);
  const queue = useMemo(
    () => asks.filter((a) => a.dept === myDept && ASK_OPEN_STATUSES.includes(a.status)),
    [asks, myDept],
  );
  const rows = tab === "queue" ? queue : mine;

  const create = async () => {
    setSaving(true);
    try {
      const payload = {
        customerId: form.customerId || null,
        customerName: customers.find((c) => c.id === form.customerId)?.name || null,
        productId: form.productId || null,
        productName: products.find((p) => p.id === form.productId)?.name || null,
        formulaCode: form.formulaCode || null,
        formulaName: form.formulaName || null,
        note: form.note,
        items: (form.items || []).map((it) => ({
          kind: it.kind,
          materialId: it.material?.materialId || null,
          label: it.material?.label || "",
          spec: it.spec,
          tiers: it.tiers,
        })),
      };
      const res = await fetch("/api/sa/materials/asks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "เปิดเคสไม่สำเร็จ");
      router.push(`/sa/materials/asks/${d.id}`);
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
      setSaving(false);
    }
  };

  const formReady = form
    && (form.items || []).length > 0
    && (form.items || []).every((it) => it.material?.materialId || (it.material?.label || "").trim());

  return (
    <Workspace hideHeader>
      <div className="premium-header">
        <div className="header-content">
          <h1>
            <span className="premium-header-icon"><ClipboardList size={22} /></span>{" "}
            เคสขอราคาวัสดุ
          </h1>
          <p>
            ขอราคาบรรจุภัณฑ์จากฝ่ายจัดซื้อ (PM-) และราคาหัวน้ำหอม/เนื้อสารจาก RD (RM-) —
            ราคาที่ตอบกลับเข้าทะเบียนวัสดุให้ใช้ซ้ำได้ทุกงาน
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/sa/materials" className="btn"><Boxes size={14} /> ทะเบียนวัสดุ</Link>
          <button type="button" className="btn btn-accent" onClick={() => setForm(emptyAskForm())}>
            <Plus size={14} /> เปิดเคสขอราคา
          </button>
        </div>
      </div>

      <Tabs
        value={tab} onChange={setTab}
        tabs={[
          myDept && { key: "queue", label: `คิวฝ่าย ${myDept} (${queue.length})` },
          { key: "mine", label: `เคสของฉัน (${mine.length})` },
        ]}
        ariaLabel="มุมมองเคสขอราคา"
      />

      <div className="toolbar">
        <span className="spacer" />
        <button type="button" className="btn" onClick={load} disabled={loading}>
          <RefreshCw size={14} /> รีเฟรช
        </button>
      </div>

      {loading ? (
        <SkeletonRows rows={4} />
      ) : loadError ? (
        <div className="glass-panel" style={{ padding: 24, color: "var(--red)" }}>{loadError}</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={ClipboardList}>
          {tab === "queue"
            ? "ไม่มีเคสรอฝ่ายคุณตอบ"
            : "ยังไม่มีเคสของคุณ — กด \"เปิดเคสขอราคา\" เพื่อเริ่ม"}
        </EmptyState>
      ) : (
        <div className="premium-table-wrapper">
          <table className="premium-table">
            <thead>
              <tr>
                <th style={{ width: 140 }}>เลขที่</th>
                <th>ลูกค้า / หมายเหตุ</th>
                <th style={{ width: 90 }}>ถึงฝ่าย</th>
                <th style={{ width: 120 }}>รายการ</th>
                <th style={{ width: 190 }}>สถานะ</th>
                <th style={{ width: 110 }}>อัปเดต</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((ask) => {
                const p = askProgress(ask.items || []);
                return (
                  <tr
                    key={ask.id} style={{ cursor: "pointer" }}
                    onClick={() => router.push(`/sa/materials/asks/${ask.id}`)}
                  >
                    <td style={{ fontWeight: 500 }}>{ask.docNo || "ร่าง"}</td>
                    <td>
                      <div>{ask.customerName || <span style={{ color: "var(--text-3)" }}>ราคากลาง</span>}</div>
                      {ask.formulaCode && (
                        <div style={{ fontSize: 11, color: "var(--text-3)" }}>สูตร {ask.formulaCode}</div>
                      )}
                    </td>
                    <td style={{ fontSize: 12 }}>{ask.dept}</td>
                    <td style={{ fontSize: 12 }}>{p.done}/{p.total} ตอบแล้ว</td>
                    <td>
                      <span className="status-pill" style={{ color: STATUS_TONE[ask.status], borderColor: "currentColor" }}>
                        {ASK_STATUS_LABELS[ask.status] || ask.status}
                      </span>
                    </td>
                    <td style={{ fontSize: 12 }}>{fmtDate(ask.updatedAt || ask.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={!!form} onClose={() => setForm(null)} size="lg" dismissible={!saving}
        title="เปิดเคสขอราคาวัสดุ"
      >
        {form && (
          <>
            <AskForm
              value={form} onChange={setForm} disabled={saving}
              materials={materials} customers={customers} products={products}
            />
            <div className="glass-panel" style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-2)" }}>
              เคสจะถูกสร้างเป็น <b>ร่าง</b> ก่อน — เลขที่จะออกตอนกดส่ง (ร่างที่ทิ้งไว้จะไม่กินเลข)
            </div>
            <div className="action-bar" style={{ marginTop: 16 }}>
              <button type="button" className="btn ghost" onClick={() => setForm(null)} disabled={saving}>ยกเลิก</button>
              <button type="button" className="btn btn-accent" onClick={create} disabled={saving || !formReady}>
                สร้างเคส (ร่าง)
              </button>
            </div>
          </>
        )}
      </Modal>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}
