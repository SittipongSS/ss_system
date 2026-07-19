"use client";

// หน้าสร้างใบเสนอราคา (เต็มหน้า, ไม่มี modal — มติผู้ใช้ Q2): เลือกตามลำดับ
// ลูกค้า → โครงการ → ดีล (บังคับสามขั้น) แล้วดึงข้อมูลลูกค้ามาแสดง "อ่านอย่างเดียว"
// (แก้ที่ฐานข้อมูลลูกค้าเท่านั้น) → กดสร้าง → ออกใบ (snapshot ฝั่ง server) → ไปหน้าแก้ไข
// เพื่อเพิ่มรายการ/ส่วนลด/VAT/งวดชำระ. ใช้ component กลางเท่านั้น.
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, CalendarDays, CircleDollarSign, ClipboardList, ExternalLink, FileText, MapPin, Plus, Save, UserRound } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import SearchableSelect from "@/components/ui/SearchableSelect";
import Select from "@/components/ui/Select";
import DateInput from "@/components/ui/DateInput";
import QuotationPaymentTerms from "@/components/salesPlanning/QuotationPaymentTerms";
import QuotationPeopleFields from "@/components/salesPlanning/QuotationPeopleFields";
import QuotationLineItems, { newManualLine, newProductLine } from "@/components/salesPlanning/QuotationLineItems";
import { useCan } from "@/lib/roleContext";
import { DEAL_TYPE_LABELS, dealTypeOf, quoteTotals } from "@/lib/salesPlanning";
import { fmtDate, fmtMoney } from "@/lib/format";
import { businessDate } from "@/lib/businessDate";
import { addValidityDays, validityDaysBetween } from "@/lib/sales/quoteValidity";
import { validatePaymentPlan } from "@/lib/sales/paymentPlan";
import { cachedFetchJson } from "@/lib/apiCache";
import styles from "./page.module.css";

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
  const [creating, setCreating] = useState(false);
  const [prefilled, setPrefilled] = useState(false);
  const [products, setProducts] = useState([]);
  const [lines, setLines] = useState([]);
  const [quoteDate, setQuoteDate] = useState(() => businessDate());
  const [validityDays, setValidityDays] = useState(30);
  const [validUntil, setValidUntil] = useState(() => addValidityDays(businessDate(), 30));
  const [discountType, setDiscountType] = useState("");
  const [discountValue, setDiscountValue] = useState(0);
  const [vatRate, setVatRate] = useState(7);
  const [payment, setPayment] = useState({ type: "full", paymentMethod: "", paymentTerms: "", installments: [] });
  const [notes, setNotes] = useState("");
  // ผู้รับผิดชอบเอกสาร (เหมือนไทม์ไลน์ — มติผู้ใช้ 2026-07-15) เก็บใน metadata
  const [people, setPeople] = useState({ aeOwner: "", preparedBy: "", aeSupervisor: "" });

  // โหลดดีล + โครงการ (ดึงรหัสโครงการมาโชว์ในตัวเลือก)
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [dRes, pRes, productData] = await Promise.all([
          fetch("/api/sales-planning/deals").catch(() => null),
          fetch("/api/pm/projects").catch(() => null),
          cachedFetchJson("/api/products").catch(() => []),
        ]);
        const dealsData = dRes?.ok ? await dRes.json() : [];
        const projData = pRes?.ok ? await pRes.json() : [];
        if (!alive) return;
        setDeals(Array.isArray(dealsData) ? dealsData : []);
        const map = {};
        (Array.isArray(projData) ? projData : []).forEach((p) => { map[p.id] = p; });
        setProjectsById(map);
        setProducts(Array.isArray(productData) ? productData : []);
      } catch (e) {
        if (alive) setError(e.message || "โหลดข้อมูลไม่สำเร็จ");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // ดีลที่ออกใบได้: ผูกโครงการ + มีลูกค้า + สถานะยังเปิด (won/lost = ล็อก)
  // มติผู้ใช้ 2026-07-15: 1 ดีลมีใบเสนอราคาได้หลายใบจนกว่าจะ Won — ไม่กรองดีลที่มีใบแล้ว
  // ต้องเป็นดีลที่ "แก้ไขได้" (canEdit จาก API — edit-scope) ไม่ใช่แค่ view-scope;
  // ไม่งั้นเลือกดีลทีมอื่นแล้ว POST คืน forbidden (server เช็ค inSalesEditScope).
  const eligible = useMemo(
    () => deals.filter((d) => d.projectId && d.customerId && d.canEdit && !EXCLUDE_STAGES.includes(d.stage)),
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
        const label = [p?.code, p?.name].filter(Boolean).join(" · ") || d.projectId;
        seen.set(d.projectId, label);
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
  const selectedProject = projectId ? projectsById[projectId] : null;
  const selectedDeal = useMemo(() => eligible.find((deal) => deal.id === dealId) || null, [eligible, dealId]);
  const selectedDealType = selectedDeal ? dealTypeOf(selectedDeal) : null;

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

  // ตั้งต้นผู้ดูแล/ผู้ตรวจสอบจากโครงการที่เลือก (แก้ทับได้ก่อนสร้างใบ) —
  // ผู้ประสานงาน (AC) เลือกเองจากผู้ใช้จริง ไม่ตั้งต้นจากโครงการ
  useEffect(() => {
    const p = projectId ? projectsById[projectId] : null;
    setPeople({ aeOwner: p?.aeOwner || "", preparedBy: "", aeSupervisor: p?.aeSupervisor || "" });
  }, [projectId, projectsById]);

  const contacts = Array.isArray(customer?.contacts) ? customer.contacts : [];
  const billingAddress = customer?.address || "";
  const shippingAddress = customer?.shippingAddress || customer?.address || "";

  const onCustomer = (v) => { setCustomerId(v); setProjectId(""); setDealId(""); setCustomer(null); };
  const onProject = (v) => { setProjectId(v); setDealId(""); setCustomer(null); };

  const totals = useMemo(() => quoteTotals(lines, {
    discountType: discountType || null,
    discountValue,
    vatRate,
  }), [lines, discountType, discountValue, vatRate]);

  const addProductLine = () => setLines((current) => [...current, newProductLine()]);
  const addManualLine = () => setLines((current) => [...current, newManualLine()]);

  const paymentPlan = useMemo(() => (payment.type === "installment"
    ? { type: "installment", paymentMethod: payment.paymentMethod.trim() || null, installments: payment.installments.map((row) => ({ label: row.label, percent: Number(row.percent) || 0, note: row.note })) }
    : { type: "full", paymentMethod: payment.paymentMethod.trim() || null }), [payment]);

  // หน้าสร้างบันทึกได้เฉพาะร่าง (มติผู้ใช้ 2026-07-18): ใบต้องผ่านอนุมัติจากเจ้าของดีล
  // ก่อนจึงส่งลูกค้าได้ — ปุ่ม "ส่งให้ลูกค้า" อยู่ที่หน้าใบหลังอนุมัติแล้วเท่านั้น
  const create = useCallback(async () => {
    if (!dealId) return;
    const paymentValidation = validatePaymentPlan(paymentPlan);
    if (!paymentValidation.ok) {
      setError(paymentValidation.error);
      return;
    }
    setCreating(true);
    setError("");
    try {
      const res = await fetch(`/api/sales-planning/deals/${dealId}/quotations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactIndex,
          status: "draft",
          lines: lines.map(({ _lineKind, _noteOpen, ...line }) => {
            // หมายเหตุรายบรรทัดเก็บใน metadata.note — ตัดช่องว่าง/คีย์เปล่าก่อนส่ง
            const note = (line.metadata?.note || "").trim();
            const metadata = { ...(line.metadata || {}) };
            if (note) metadata.note = note; else delete metadata.note;
            return { ...line, metadata };
          }),
          quoteDate,
          validUntil: validUntil || null,
          discountType: discountType || null,
          discountValue,
          vatRate,
          paymentTerms: payment.paymentTerms,
          notes,
          paymentPlan,
          metadata: { ...people },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error === "forbidden"
          ? "ดีลนี้ไม่อยู่ในสิทธิ์แก้ไขของคุณ (เจ้าของ/ทีมอื่น) — ออกใบได้เฉพาะดีลที่คุณดูแล"
          : (data.error || "สร้างใบเสนอราคาไม่สำเร็จ");
        throw new Error(msg);
      }
      router.push(`/sa/quotations/${data.id}`);
    } catch (e) {
      setError(e.message || "สร้างใบเสนอราคาไม่สำเร็จ");
      setCreating(false);
    }
  }, [dealId, contactIndex, lines, quoteDate, validUntil, discountType, discountValue, vatRate, payment, paymentPlan, notes, people, router]);

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
      subtitle={selectedDeal ? `${selectedDeal.customerName || "-"} · ${selectedProject?.name || selectedProject?.code || "-"} · ${selectedDeal.title}` : "เลือกที่มาของเอกสารและจัดทำใบเสนอราคาในหน้าเดียว"}
      back={{ href: "/sa/quotations", label: "กลับหน้าใบเสนอราคา" }}
    >
      {error && <div className={styles.errorPanel} role="alert">{error}</div>}
      {!loading && !eligible.length && (
        <div className={styles.emptyPanel}>ยังไม่มีดีลที่พร้อมออกใบเสนอราคา — ดีลต้องผูกโครงการ มีลูกค้า และยังไม่มีใบเสนอราคาที่ใช้งานอยู่ <Link href="/sa/deals" className="btn ghost sm"><ExternalLink size={13} /> ไปหน้าดีล</Link></div>
      )}

      <div className={styles.detailLayout}>
        <div className={styles.documentColumn}>
          <section className={`${styles.card} ${styles.overviewCard}`}>
            <div className={styles.overviewHeading}>
              <div>
                <span className={styles.eyebrow}>FM-SA-01 · NEW QUOTATION</span>
                <h2>{selectedDeal?.customerName || "เลือกข้อมูลเพื่อเริ่มสร้างใบเสนอราคา"}</h2>
                <p>
                  <span>โครงการ: {selectedProject?.name || selectedProject?.code || "ยังไม่เลือก"}</span>
                  <span>ดีล: {selectedDeal?.title || "ยังไม่เลือก"}</span>
                  {selectedDealType && <span>ประเภท: {selectedDealType} · {DEAL_TYPE_LABELS[selectedDealType]}</span>}
                </p>
              </div>
              <span className={styles.newBadge}>ฉบับใหม่</span>
            </div>
            <div className={styles.quickFacts}>
              <div><CalendarDays size={16} /><span><small>วันที่ออกใบ</small>{fmtDate(quoteDate)}</span></div>
              <div><CalendarDays size={16} /><span><small>ยืนราคาถึง</small>{validUntil ? fmtDate(validUntil) : "-"}</span></div>
              <div><CircleDollarSign size={16} /><span><small>ภาษี</small>{vatRate > 0 ? `+ VAT ${vatRate}%` : "รวม VAT แล้ว"}</span></div>
              <div><ClipboardList size={16} /><span><small>รายการ</small>{lines.length} รายการ</span></div>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.sectionHeading}><Building2 size={17} /><h2>ที่มาของใบเสนอราคา</h2><span>เลือกตามลำดับ ลูกค้า → โครงการ → ดีล</span></div>
            <div className={styles.sourceGrid}>
              <label className={styles.customerSource}>ชื่อลูกค้า *<SearchableSelect className={styles.sourceSelect} entity="customer" value={customerId} onChange={onCustomer} ariaLabel="เลือกชื่อลูกค้า" placeholder={loading ? "กำลังโหลด…" : "ค้นหาชื่อลูกค้า…"} options={customerOptions} /></label>
              <label>โครงการ *<SearchableSelect className={styles.sourceSelect} entity="project" value={projectId} onChange={onProject} disabled={!customerId} ariaLabel="เลือกโครงการ" placeholder={!customerId ? "เลือกชื่อลูกค้าก่อน" : "ค้นหารหัสหรือชื่อโครงการ…"} options={projectOptions} /></label>
              <label>ดีล *<SearchableSelect className={styles.sourceSelect} entity="deal" value={dealId} onChange={setDealId} disabled={!projectId} ariaLabel="เลือกดีล" placeholder={!projectId ? "เลือกโครงการก่อน" : "ค้นหาดีล…"} options={dealOptions} /></label>
            </div>
          </section>

          {dealId && customer && (
            <section className={styles.card}>
              <div className={styles.sectionHeading}><UserRound size={17} /><h2>ข้อมูลลูกค้าในเอกสาร</h2><span>Snapshot ณ วันที่สร้าง</span><div className="spacer" /><Link href={`/database/customers/${customerId}`} className="btn ghost sm" target="_blank"><ExternalLink size={13} /> แก้ที่ฐานข้อมูลลูกค้า</Link></div>
              <div className={styles.customerGrid}>
                <div className={styles.infoBlock}><MapPin size={16} /><span><small>ที่อยู่ออกบิล</small>{billingAddress || "-"}</span></div>
                <div className={styles.infoBlock}><MapPin size={16} /><span><small>ที่อยู่จัดส่ง</small>{shippingAddress || "-"}</span></div>
                <div className={styles.infoBlock}><Building2 size={16} /><span><small>สาขา</small>{customer.branchCode || "00000"}</span></div>
                <label className={styles.contactField}>ผู้ติดต่อ{contacts.length ? <Select className="premium-select" value={contactIndex} onChange={(e) => setContactIndex(Number(e.target.value))}>{contacts.map((contact, index) => <option key={index} value={index}>{[contact.name, contact.role, contact.phone].filter(Boolean).join(" · ") || `ผู้ติดต่อ ${index + 1}`}</option>)}</Select> : <input className="premium-input" readOnly value={customer.contactPerson || "-"} />}</label>
              </div>
            </section>
          )}

          <section className={`${styles.card} ${styles.documentMeta}`}>
            <label>วันที่ออกใบ<DateInput className={styles.documentDateInput} value={quoteDate} onChange={(value) => { setQuoteDate(value); setValidUntil(addValidityDays(value, validityDays)); }} required /></label>
            <label>ยืนราคาถึง<DateInput className={styles.documentDateInput} value={validUntil} onChange={(value) => { setValidUntil(value); setValidityDays(validityDaysBetween(quoteDate, value)); }} min={quoteDate || undefined} /></label>
            <label>กำหนดยืนราคา (จำนวนวัน)<input type="number" min="1" step="1" className={`premium-input ${styles.documentDateInput}`} value={validityDays} onChange={(event) => { const days = event.target.value; setValidityDays(days); setValidUntil(addValidityDays(quoteDate, days)); }} /></label>
          </section>

          {/* ผู้รับผิดชอบเอกสาร — ชุดเดียวกับไทม์ไลน์ ตั้งต้นจากโครงการที่เลือก */}
          <section className={styles.card}>
            <div className={styles.sectionHeading}><UserRound size={17} /><h2>ผู้รับผิดชอบเอกสาร</h2><span>เลือกจากผู้ใช้จริง · ผู้ดูแล/ผู้ตรวจสอบตั้งต้นจากโครงการ</span></div>
            <div className={styles.documentMeta}>
              <QuotationPeopleFields value={people} onChange={setPeople} />
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.sectionHeading}><ClipboardList size={17} /><h2>รายการสินค้า/บริการ</h2><div className="spacer" /><div className={styles.lineActions}><button type="button" className="btn btn-primary sm" onClick={addProductLine}><Plus size={13} /> เพิ่มสินค้า</button><button type="button" className="btn ghost sm" onClick={addManualLine}><Plus size={13} /> เพิ่มรายการเอง</button></div></div>
            <QuotationLineItems
              lines={lines}
              onChange={setLines}
              products={products}
              discountType={discountType}
              discountValue={discountValue}
              vatRate={vatRate}
              onDiscountChange={({ type, value }) => { setDiscountType(type); setDiscountValue(value); }}
              onVatRateChange={setVatRate}
            />
          </section>

          <section className={styles.card}>
            <QuotationPaymentTerms value={payment} onChange={setPayment} totalAmount={totals.totalAmount} />
          </section>

          <section className={styles.card}><div className={styles.sectionHeading}><FileText size={17} /><h2>หมายเหตุ</h2></div><textarea className="premium-input" rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="หมายเหตุที่ต้องการแสดงในใบเสนอราคา" /></section>
        </div>

        <aside className={styles.sidebar}>
          <section className={`${styles.card} ${styles.summaryCard}`}>
            <div className={styles.summaryLabel}>ยอดสุทธิใบเสนอราคา</div><div className={styles.totalAmount}>{fmtMoney(totals.totalAmount)}</div>
            <div className={styles.totalRows}><div><span>รวมรายการ</span><strong>{fmtMoney(totals.subtotal)}</strong></div><div><span>ส่วนลด</span><strong>{totals.discountAmount > 0 ? `-${fmtMoney(totals.discountAmount)}` : "-"}</strong></div>{vatRate > 0 && <div><span>VAT {vatRate}%</span><strong>{fmtMoney(totals.vatAmount)}</strong></div>}</div>
            <div className={styles.readiness}><div className={dealId ? styles.ready : ""}><span />เลือกดีล</div><div className={lines.length ? styles.ready : ""}><span />เพิ่มรายการสินค้า/บริการ</div></div>
            <div className={styles.workflowActions}><button type="button" className="btn btn-primary" onClick={create} disabled={!dealId || creating}><Save size={14} /> {creating ? "กำลังบันทึก…" : "บันทึก"}</button><Link href="/sa/quotations" className="btn ghost">ยกเลิก</Link></div>
            <p className={styles.autoNumberNote}>เลขที่ใบเสนอราคาจะสร้างอัตโนมัติเมื่อบันทึก · ส่งลูกค้าได้หลังเจ้าของดีลอนุมัติ</p>
          </section>
        </aside>
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
