"use client";

// หน้าสร้างใบเสนอราคา (เต็มหน้า, ไม่มี modal — มติผู้ใช้ Q2): เลือกตามลำดับ
// ลูกค้า → โครงการ → ดีล (บังคับสามขั้น) แล้วดึงข้อมูลลูกค้ามาแสดง "อ่านอย่างเดียว"
// (แก้ที่ฐานข้อมูลลูกค้าเท่านั้น) → กดสร้าง → ออกใบ (snapshot ฝั่ง server) → ไปหน้าแก้ไข
// เพื่อเพิ่มรายการ/ส่วนลด/VAT/งวดชำระ. ใช้ component กลางเท่านั้น.
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText, ArrowLeft, ExternalLink, Plus } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import SearchableSelect from "@/components/ui/SearchableSelect";
import Select from "@/components/ui/Select";
import { useCan } from "@/lib/roleContext";

const EXCLUDE_STAGES = ["won", "in_project", "lost"];

function NewQuotationInner() {
  const router = useRouter();
  const params = useSearchParams();
  const canEdit = useCan("salesplan:edit");

  const [deals, setDeals] = useState([]);
  const [projectsById, setProjectsById] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [customerId, setCustomerId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [dealId, setDealId] = useState("");

  const [customer, setCustomer] = useState(null); // snapshot preview (read-only)
  const [contactIndex, setContactIndex] = useState(0);
  const [seedFG, setSeedFG] = useState(false);
  const [creating, setCreating] = useState(false);
  const [prefilled, setPrefilled] = useState(false);

  // โหลดดีล + โครงการ (ดึงรหัสโครงการมาโชว์ในตัวเลือก)
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [dRes, pRes] = await Promise.all([
          fetch("/api/sales-planning/deals").catch(() => null),
          fetch("/api/pm/projects").catch(() => null),
        ]);
        const dealsData = dRes?.ok ? await dRes.json() : [];
        const projData = pRes?.ok ? await pRes.json() : [];
        if (!alive) return;
        setDeals(Array.isArray(dealsData) ? dealsData : []);
        const map = {};
        (Array.isArray(projData) ? projData : []).forEach((p) => { map[p.id] = p; });
        setProjectsById(map);
      } catch (e) {
        if (alive) setError(e.message || "โหลดข้อมูลไม่สำเร็จ");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // ดีลที่ออกใบได้: ผูกโครงการ + มีลูกค้า + สถานะยังเปิด
  const eligible = useMemo(
    () => deals.filter((d) => d.projectId && d.customerId && !EXCLUDE_STAGES.includes(d.stage)),
    [deals],
  );

  const customerOptions = useMemo(() => {
    const seen = new Map();
    eligible.forEach((d) => { if (!seen.has(d.customerId)) seen.set(d.customerId, d.customerName || "ไม่มีชื่อลูกค้า"); });
    return [...seen].map(([value, label]) => ({ value, label, search: label }));
  }, [eligible]);

  const projectOptions = useMemo(() => {
    if (!customerId) return [];
    const seen = new Map();
    eligible.filter((d) => d.customerId === customerId).forEach((d) => {
      if (!seen.has(d.projectId)) {
        const p = projectsById[d.projectId];
        seen.set(d.projectId, p?.code || p?.name || d.projectId);
      }
    });
    return [...seen].map(([value, label]) => ({ value, label, search: label }));
  }, [eligible, customerId, projectsById]);

  const dealOptions = useMemo(() => {
    if (!projectId) return [];
    return eligible
      .filter((d) => d.projectId === projectId)
      .map((d) => ({ value: d.id, label: d.title, search: d.title }));
  }, [eligible, projectId]);

  // prefill จาก query (?dealId / ?projectId / ?customerId) — รันครั้งเดียวหลังโหลดดีลเสร็จ
  useEffect(() => {
    if (prefilled || loading || !eligible.length) return;
    const qDeal = params.get("dealId");
    const qProject = params.get("projectId");
    const qCustomer = params.get("customerId");
    if (qDeal) {
      const d = eligible.find((x) => x.id === qDeal);
      if (d) { setCustomerId(d.customerId); setProjectId(d.projectId); setDealId(d.id); }
    } else if (qProject) {
      const d = eligible.find((x) => x.projectId === qProject);
      if (d) { setCustomerId(d.customerId); setProjectId(qProject); }
    } else if (qCustomer) {
      if (eligible.some((x) => x.customerId === qCustomer)) setCustomerId(qCustomer);
    }
    setPrefilled(true);
  }, [prefilled, loading, eligible, params]);

  // โหลด snapshot ลูกค้าเมื่อเลือกดีล (อ่านอย่างเดียว)
  useEffect(() => {
    if (!dealId || !customerId) { setCustomer(null); return; }
    let alive = true;
    (async () => {
      const res = await fetch(`/api/customers/${customerId}`).catch(() => null);
      if (!alive) return;
      const data = res?.ok ? await res.json() : null;
      setCustomer(data?.customer || data || null);
      setContactIndex(0);
    })();
    return () => { alive = false; };
  }, [dealId, customerId]);

  const contacts = Array.isArray(customer?.contacts) ? customer.contacts : [];
  const billingAddress = customer?.address || "";
  const shippingAddress = customer?.shippingAddress || customer?.address || "";

  const onCustomer = (v) => { setCustomerId(v); setProjectId(""); setDealId(""); setCustomer(null); };
  const onProject = (v) => { setProjectId(v); setDealId(""); setCustomer(null); };

  const create = useCallback(async (status) => {
    if (!dealId) return;
    setCreating(true);
    setError("");
    try {
      const res = await fetch(`/api/sales-planning/deals/${dealId}/quotations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seedFromProject: seedFG, contactIndex, status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "สร้างใบเสนอราคาไม่สำเร็จ");
      router.push(`/sa/quotations/${data.id}`);
    } catch (e) {
      setError(e.message || "สร้างใบเสนอราคาไม่สำเร็จ");
      setCreating(false);
    }
  }, [dealId, seedFG, contactIndex, router]);

  if (!canEdit) {
    return (
      <Workspace icon={<FileText size={22} />} title="สร้างใบเสนอราคา">
        <div className="glass-panel" style={{ padding: 16, color: "var(--text-3)" }}>ไม่มีสิทธิ์สร้างใบเสนอราคา</div>
      </Workspace>
    );
  }

  return (
    <Workspace
      icon={<FileText size={22} />}
      title="สร้างใบเสนอราคา"
      subtitle="เลือก ลูกค้า → โครงการ → ดีล แล้วระบบจะดึงข้อมูลลูกค้ามาให้อัตโนมัติ"
      headerRight={<Link href="/sa/quotations" className="btn ghost"><ArrowLeft size={15} aria-hidden="true" /> กลับรายการ</Link>}
    >
      <div className="flex flex-col gap-5" style={{ maxWidth: 820 }}>
        {error && (
          <div className="glass-panel" role="alert" style={{ padding: "12px 14px", borderColor: "var(--red)", color: "var(--red)" }}>{error}</div>
        )}

        {/* 1) เลือกที่มา — cascade บังคับสามขั้น */}
        <section className="glass-panel form-grid" style={{ padding: 16 }}>
          <label style={{ gridColumn: "1 / -1" }}>
            ลูกค้า *
            <SearchableSelect
              entity="customer"
              value={customerId}
              onChange={onCustomer}
              ariaLabel="เลือกลูกค้า"
              placeholder={loading ? "กำลังโหลด…" : (customerOptions.length ? "ค้นหาลูกค้า…" : "ยังไม่มีดีลที่พร้อมออกใบ")}
              options={customerOptions}
            />
          </label>
          <label>
            โครงการ *
            <SearchableSelect
              entity="project"
              value={projectId}
              onChange={onProject}
              disabled={!customerId}
              ariaLabel="เลือกโครงการ"
              placeholder={!customerId ? "เลือกลูกค้าก่อน" : "ค้นหาโครงการ…"}
              options={projectOptions}
            />
          </label>
          <label>
            ดีล *
            <SearchableSelect
              entity="deal"
              value={dealId}
              onChange={setDealId}
              disabled={!projectId}
              ariaLabel="เลือกดีล"
              placeholder={!projectId ? "เลือกโครงการก่อน" : "ค้นหาดีล…"}
              options={dealOptions}
            />
          </label>
        </section>

        {/* 2) ข้อมูลลูกค้า (อ่านอย่างเดียว — แก้ที่ฐานข้อมูลลูกค้า) */}
        {dealId && customer && (
          <section className="glass-panel" style={{ padding: 16 }}>
            <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>ข้อมูลลูกค้า</h2>
              <span className="ui-badge" style={{ color: "var(--text-3)" }}>อ่านอย่างเดียว</span>
              <div className="spacer" />
              <Link href={`/database/customers/${customerId}`} className="btn ghost sm" target="_blank">
                <ExternalLink size={13} aria-hidden="true" /> แก้ที่ฐานข้อมูลลูกค้า
              </Link>
            </div>
            <div className="form-grid">
              <label>ที่อยู่ออกบิล
                <textarea className="premium-input" readOnly value={billingAddress || "-"} rows={2} style={{ resize: "none" }} />
              </label>
              <label>ที่อยู่จัดส่ง
                <textarea className="premium-input" readOnly value={shippingAddress || "-"} rows={2} style={{ resize: "none" }} />
              </label>
              <label>สาขา
                <input className="premium-input" readOnly value={customer.branchCode || "00000"} />
              </label>
              <label>ผู้ติดต่อ
                {contacts.length ? (
                  <Select className="premium-select" value={contactIndex} onChange={(e) => setContactIndex(Number(e.target.value))}>
                    {contacts.map((c, i) => (
                      <option key={i} value={i}>
                        {[c.name, c.role, c.phone].filter(Boolean).join(" · ") || `ผู้ติดต่อ ${i + 1}`}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <input className="premium-input" readOnly value={customer.contactPerson || "-"} />
                )}
              </label>
            </div>
          </section>
        )}

        {/* 3) ตัวเลือกเริ่มต้น + สร้าง */}
        <section className="glass-panel" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={seedFG} onChange={(e) => setSeedFG(e.target.checked)} />
            ดึงรายการตั้งต้นจาก FG ของโครงการ (ไม่ติ๊ก = ใบเปล่า ใส่รหัส FG เองในหน้าแก้ไข)
          </label>
          <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>
            กดสร้างแล้วจะไปหน้าแก้ไขใบ เพื่อเพิ่มรายการ · ส่วนลด · VAT · เงื่อนไขการชำระเงิน
          </div>
          <div className="form-action-bar">
            <button type="button" className="btn" onClick={() => create("draft")} disabled={!dealId || creating}>
              {creating ? "กำลังสร้าง…" : "บันทึกร่าง"}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => create("draft")} disabled={!dealId || creating}>
              <Plus size={14} aria-hidden="true" /> สร้างและไปเพิ่มรายการ
            </button>
          </div>
        </section>
      </div>
    </Workspace>
  );
}

export default function NewQuotationPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, color: "var(--text-3)" }}>กำลังโหลด…</div>}>
      <NewQuotationInner />
    </Suspense>
  );
}
