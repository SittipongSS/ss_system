"use client";

// หน้าสร้างใบเสนอราคา (เต็มหน้า, ไม่มี modal — มติผู้ใช้ Q2): เลือกตามลำดับ
// ลูกค้า → โครงการ → ดีล (บังคับสามขั้น) แล้วดึงข้อมูลลูกค้ามาแสดง "อ่านอย่างเดียว"
// (แก้ที่ฐานข้อมูลลูกค้าเท่านั้น) → กดสร้าง → ออกใบ (snapshot ฝั่ง server) → ไปหน้าแก้ไข
// เพื่อเพิ่มรายการ/ส่วนลด/VAT/งวดชำระ. ใช้ component กลางเท่านั้น.
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText, ArrowLeft, ExternalLink, Plus, Save, Trash2 } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import SearchableSelect from "@/components/ui/SearchableSelect";
import Select from "@/components/ui/Select";
import MoneyInput from "@/components/ui/MoneyInput";
import DateInput from "@/components/ui/DateInput";
import { useCan } from "@/lib/roleContext";
import { quoteLineNet, quoteTotals } from "@/lib/salesPlanning";
import { QUOTE_APPROVAL_AMOUNT_THRESHOLD } from "@/lib/quotationApproval";
import { fmtDate, fmtMoney } from "@/lib/format";
import { businessDate } from "@/lib/businessDate";
import { addValidityDays } from "@/lib/sales/quoteValidity";

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
  const [productPick, setProductPick] = useState("");
  const [lines, setLines] = useState([]);
  const [quoteDate, setQuoteDate] = useState(() => businessDate());
  const [validityDays, setValidityDays] = useState(30);
  const [discountType, setDiscountType] = useState("");
  const [discountValue, setDiscountValue] = useState(0);
  const [vatRate, setVatRate] = useState(7);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [notes, setNotes] = useState("");

  // โหลดดีล + โครงการ (ดึงรหัสโครงการมาโชว์ในตัวเลือก)
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [dRes, pRes, productRes] = await Promise.all([
          fetch("/api/sales-planning/deals").catch(() => null),
          fetch("/api/pm/projects").catch(() => null),
          fetch("/api/products").catch(() => null),
        ]);
        const dealsData = dRes?.ok ? await dRes.json() : [];
        const projData = pRes?.ok ? await pRes.json() : [];
        const productData = productRes?.ok ? await productRes.json() : [];
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

  // ดีลที่ออกใบได้: ผูกโครงการ + มีลูกค้า + สถานะยังเปิด
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
  const selectedProject = projectId ? projectsById[projectId] : null;
  const selectedDeal = useMemo(() => eligible.find((deal) => deal.id === dealId) || null, [eligible, dealId]);

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

  const productOptions = useMemo(() => products.map((product) => {
    const description = product.productDescription || product.productDescriptionEn || "สินค้า";
    const label = [product.fgCode, description].filter(Boolean).join(" · ");
    return { value: product.id, label, search: `${product.fgCode || ""} ${description}` };
  }), [products]);

  const totals = useMemo(() => quoteTotals(lines, {
    discountType: discountType || null,
    discountValue,
    vatRate,
  }), [lines, discountType, discountValue, vatRate]);
  const requiresApproval = totals.totalAmount >= QUOTE_APPROVAL_AMOUNT_THRESHOLD;
  const validUntil = useMemo(() => addValidityDays(quoteDate, validityDays), [quoteDate, validityDays]);

  const addProductLine = () => {
    const product = products.find((item) => item.id === productPick);
    if (!product) return;
    setLines((current) => [...current, {
      productId: product.id,
      fgCode: product.fgCode || null,
      description: product.productDescription || product.productDescriptionEn || product.fgCode || "สินค้า",
      qty: 1,
      unitPrice: Number(product.retailPriceIncVat || 0),
      discountType: null,
      discountValue: 0,
      source: "manual",
    }]);
    setProductPick("");
  };

  const addManualLine = () => setLines((current) => [...current, {
    productId: null, fgCode: null, description: "", qty: 1, unitPrice: 0,
    discountType: null, discountValue: 0, source: "manual",
  }]);
  const setLine = (index, patch) => setLines((current) => current.map((line, lineIndex) => (
    lineIndex === index ? { ...line, ...patch } : line
  )));
  const removeLine = (index) => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index));

  const create = useCallback(async (status) => {
    if (!dealId) return;
    if (status === "sent" && !lines.length) {
      setError("ต้องมีอย่างน้อย 1 รายการก่อนส่งลูกค้า");
      return;
    }
    if (status === "sent" && !(totals.totalAmount > 0)) {
      setError("ยอดรวมต้องมากกว่า 0 ก่อนส่งลูกค้า");
      return;
    }
    if (status === "sent" && requiresApproval) {
      setError("ยอดนี้ต้องบันทึกร่างและรออนุมัติก่อนส่งลูกค้า");
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
          status,
          lines,
          quoteDate,
          validUntil: validUntil || null,
          discountType: discountType || null,
          discountValue,
          vatRate,
          paymentTerms,
          notes,
          paymentPlan: { type: "full", paymentMethod },
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
  }, [dealId, contactIndex, lines, quoteDate, validUntil, discountType, discountValue, vatRate, paymentMethod, paymentTerms, notes, totals.totalAmount, requiresApproval, router]);

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
      subtitle="กรอกข้อมูลลูกค้า รายการสินค้า ราคา เงื่อนไข และยอดรวมในหน้าเดียว"
      headerRight={<Link href="/sa/quotations" className="btn ghost"><ArrowLeft size={15} aria-hidden="true" /> กลับรายการ</Link>}
    >
      <div className="flex flex-col gap-5">
        {error && (
          <div className="glass-panel" role="alert" style={{ padding: "12px 14px", borderColor: "var(--red)", color: "var(--red)" }}>{error}</div>
        )}

        {!loading && !eligible.length && (
          <div className="glass-panel" style={{ padding: 16, color: "var(--text-2)", fontSize: 13.5 }}>
            ยังไม่มีดีลที่พร้อมออกใบเสนอราคา — ดีลต้อง<strong> ผูกโครงการ </strong>และ<strong> มีลูกค้า </strong>ก่อน แล้วจึงออกใบได้
            <div style={{ marginTop: 8 }}>
              <Link href="/sa/deals" className="btn ghost sm"><ExternalLink size={13} aria-hidden="true" /> ไปหน้าดีล</Link>
            </div>
          </div>
        )}

        {/* Header — ที่มาของใบ + snapshot ลูกค้า */}
        <section className="glass-panel" style={{ overflow: "hidden" }}>
          <div style={{ padding: 18, borderBottom: "1px solid var(--border)", background: "var(--panel-2)" }}>
            <div className="flex items-center gap-2" style={{ marginBottom: 14, flexWrap: "wrap" }}>
              <FileText size={18} aria-hidden="true" />
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 750 }}>ข้อมูลใบเสนอราคา</h2>
              <span className="ui-badge" style={{ color: "var(--text-3)" }}>เลขที่สร้างอัตโนมัติเมื่อบันทึก</span>
            </div>
            <div className="form-grid cols-2">
              <label style={{ gridColumn: "1 / -1" }}>ลูกค้า *
                <SearchableSelect entity="customer" value={customerId} onChange={onCustomer} ariaLabel="เลือกลูกค้า"
                  placeholder={loading ? "กำลังโหลด…" : (customerOptions.length ? "ค้นหาลูกค้า…" : "ยังไม่มีดีลที่พร้อมออกใบ")}
                  options={customerOptions} />
              </label>
              <label>โครงการ *
                <SearchableSelect entity="project" value={projectId} onChange={onProject} disabled={!customerId} ariaLabel="เลือกโครงการ"
                  placeholder={!customerId ? "เลือกลูกค้าก่อน" : "ค้นหาโครงการ…"} options={projectOptions} />
              </label>
              <label>ดีล *
                <SearchableSelect entity="deal" value={dealId} onChange={setDealId} disabled={!projectId} ariaLabel="เลือกดีล"
                  placeholder={!projectId ? "เลือกโครงการก่อน" : "ค้นหาดีล…"} options={dealOptions} />
              </label>
              <label>วันที่ใบเสนอราคา
                <DateInput value={quoteDate} onChange={setQuoteDate} required className="w-full" />
              </label>
              <label>กำหนดยืนราคา (วัน)
                <input type="number" min="1" step="1" className="premium-input w-full" value={validityDays} onChange={(event) => setValidityDays(event.target.value)} />
                <small style={{ color: "var(--text-3)", marginTop: 4 }}>ยืนราคาถึง {validUntil ? fmtDate(validUntil) : "-"}</small>
              </label>
            </div>
            {(selectedProject || selectedDeal) && (
              <div style={{ marginTop: 12, fontSize: 12.5, color: "var(--text-2)" }}>
                โครงการ: <strong>{selectedProject?.name || selectedProject?.code || "-"}</strong>
                {selectedProject?.code ? ` · ${selectedProject.code}` : ""}
                {selectedDeal ? ` · ดีล: ${selectedDeal.title}` : ""}
              </div>
            )}
          </div>

          {dealId && customer && (
            <div style={{ padding: 18 }}>
              <div className="flex items-center gap-2" style={{ marginBottom: 12, flexWrap: "wrap" }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>ข้อมูลลูกค้าในเอกสาร</h3>
                <span className="ui-badge" style={{ color: "var(--text-3)" }}>Snapshot ณ วันที่สร้าง</span>
                <div className="spacer" />
                <Link href={`/database/customers/${customerId}`} className="btn ghost sm" target="_blank">
                  <ExternalLink size={13} aria-hidden="true" /> แก้ที่ฐานข้อมูลลูกค้า
                </Link>
              </div>
              <div className="form-grid cols-2">
                <label>ที่อยู่ออกบิล<textarea className="premium-input" readOnly value={billingAddress || "-"} rows={2} style={{ resize: "none" }} /></label>
                <label>ที่อยู่จัดส่ง<textarea className="premium-input" readOnly value={shippingAddress || "-"} rows={2} style={{ resize: "none" }} /></label>
                <label>สาขา<input className="premium-input" readOnly value={customer.branchCode || "00000"} /></label>
                <label>ผู้ติดต่อ
                  {contacts.length ? (
                    <Select className="premium-select" value={contactIndex} onChange={(e) => setContactIndex(Number(e.target.value))}>
                      {contacts.map((contact, index) => <option key={index} value={index}>{[contact.name, contact.role, contact.phone].filter(Boolean).join(" · ") || `ผู้ติดต่อ ${index + 1}`}</option>)}
                    </Select>
                  ) : <input className="premium-input" readOnly value={customer.contactPerson || "-"} />}
                </label>
              </div>
            </div>
          )}
        </section>

        {/* Body — รายการสินค้า ราคา และส่วนลดรายบรรทัด */}
        <section className="glass-panel" style={{ padding: 18 }}>
          <div className="flex items-center gap-2" style={{ marginBottom: 14, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 750 }}>รายละเอียดสินค้าและบริการ</h2>
            <div className="spacer" />
            <div style={{ width: 300, maxWidth: "100%" }}>
              <SearchableSelect entity="product" value={productPick} onChange={setProductPick} ariaLabel="ค้นหาสินค้า"
                placeholder="ค้นหา FG / ชื่อสินค้า…" options={productOptions} />
            </div>
            <button type="button" className="btn btn-primary sm" onClick={addProductLine} disabled={!productPick}><Plus size={13} /> เพิ่มสินค้า</button>
            <button type="button" className="btn ghost sm" onClick={addManualLine}><Plus size={13} /> รายการเอง</button>
          </div>
          <div className="premium-glass-table table-responsive">
            <table className="w-full text-sm">
              <thead><tr><th style={{ width: 42 }}>#</th><th>รายละเอียด</th><th style={{ width: 100 }}>จำนวน</th><th style={{ width: 140 }}>ราคา/หน่วย</th><th style={{ width: 190 }}>ส่วนลดรายการ</th><th className="num" style={{ width: 140 }}>จำนวนเงิน</th><th style={{ width: 44 }}></th></tr></thead>
              <tbody>
                {lines.map((line, index) => (
                  <tr key={`${line.productId || "manual"}-${index}`} className="premium-row">
                    <td style={{ textAlign: "center", color: "var(--text-3)" }}>{index + 1}</td>
                    <td>
                      <input className="premium-input" value={line.description || ""} placeholder="รายละเอียดสินค้า/บริการ" onChange={(event) => setLine(index, { description: event.target.value })} style={{ width: "100%" }} />
                      {line.fgCode && <span style={{ display: "block", marginTop: 3, fontSize: 11, color: "var(--text-3)" }}>FG: {line.fgCode}</span>}
                    </td>
                    <td><MoneyInput min="0" value={line.qty} onChange={(value) => setLine(index, { qty: value ?? "" })} aria-label={`จำนวน รายการ ${index + 1}`} /></td>
                    <td><MoneyInput min="0" value={line.unitPrice} onChange={(value) => setLine(index, { unitPrice: value ?? "" })} aria-label={`ราคาต่อหน่วย รายการ ${index + 1}`} /></td>
                    <td><div style={{ display: "flex", gap: 5 }}>
                      <Select className="premium-select" value={line.discountType || ""} onChange={(event) => setLine(index, { discountType: event.target.value || null, discountValue: event.target.value ? line.discountValue : 0 })} style={{ width: 78 }}>
                        <option value="">ไม่ลด</option><option value="percent">%</option><option value="amount">บาท</option>
                      </Select>
                      <MoneyInput min="0" value={line.discountValue || ""} disabled={!line.discountType} onChange={(value) => setLine(index, { discountValue: value ?? "" })} style={{ width: 105 }} aria-label={`ส่วนลด รายการ ${index + 1}`} />
                    </div></td>
                    <td className="num mono">{fmtMoney(quoteLineNet(line).lineTotal)}</td>
                    <td><button type="button" className="btn-icon danger" onClick={() => removeLine(index)} aria-label={`ลบรายการ ${index + 1}`}><Trash2 size={14} /></button></td>
                  </tr>
                ))}
                {!lines.length && <tr><td colSpan={7} style={{ padding: 28, textAlign: "center", color: "var(--text-3)" }}>ยังไม่มีรายการ — ค้นหาสินค้าหรือเพิ่มรายการเองด้านบน</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        {/* Footer — เงื่อนไข หมายเหตุ ส่วนลดท้ายใบ และยอดรวม */}
        <section className="glass-panel" style={{ padding: 18, marginTop: 12 }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 17, fontWeight: 750 }}>เงื่อนไขและสรุปยอด</h2>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(300px, 420px)", gap: 24, alignItems: "start" }} className="quotation-create-footer">
            <div className="flex flex-col gap-4">
              <label>วิธีการชำระเงิน<input className="premium-input w-full" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} placeholder="เช่น โอนเงินเข้าบัญชีธนาคาร / เช็ค / เงินสด" /></label>
              <label>เงื่อนไขการชำระเงิน<textarea className="premium-input w-full" rows={3} value={paymentTerms} onChange={(event) => setPaymentTerms(event.target.value)} placeholder="เช่น มัดจำ 50% ก่อนเริ่มงาน · ส่วนที่เหลือก่อนส่งมอบ" /></label>
              <label>หมายเหตุ<textarea className="premium-input w-full" rows={5} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="หมายเหตุที่ต้องการแสดงในใบเสนอราคา" /></label>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13.5 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span>รวมเป็นเงิน</span><strong className="mono">{fmtMoney(totals.subtotal)}</strong></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 82px 112px", gap: 6, alignItems: "center" }}>
                <span>ส่วนลดท้ายใบ</span>
                <Select className="premium-select" value={discountType} onChange={(event) => { setDiscountType(event.target.value); if (!event.target.value) setDiscountValue(0); }}>
                  <option value="">ไม่ลด</option><option value="percent">%</option><option value="amount">บาท</option>
                </Select>
                <MoneyInput min="0" value={discountValue || ""} disabled={!discountType} onChange={(value) => setDiscountValue(value ?? 0)} aria-label="ส่วนลดท้ายใบ" />
              </div>
              {totals.discountAmount > 0 && <div style={{ display: "flex", justifyContent: "space-between", color: "var(--red)" }}><span>หักส่วนลด</span><strong className="mono">-{fmtMoney(totals.discountAmount)}</strong></div>}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 112px", gap: 6, alignItems: "center" }}>
                <span>ภาษีมูลค่าเพิ่ม</span>
                <Select className="premium-select" value={String(vatRate)} onChange={(event) => setVatRate(Number(event.target.value))}>
                  <option value="0">รวม VAT แล้ว</option><option value="7">+ VAT 7% ท้ายใบ</option>
                </Select>
              </div>
              {Number(vatRate) > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span>VAT {vatRate}%</span><strong className="mono">{fmtMoney(totals.vatAmount)}</strong></div>}
              <div style={{ display: "flex", justifyContent: "space-between", borderTop: "2px solid var(--border)", paddingTop: 12, fontSize: 18 }}><strong>ยอดรวมทั้งสิ้น</strong><strong className="mono">{fmtMoney(totals.totalAmount)}</strong></div>
              {requiresApproval && <div className="ui-badge" style={{ justifyContent: "center", color: "var(--amber)", padding: "7px 10px" }}>ยอดนี้ต้องอนุมัติก่อนส่งลูกค้า</div>}
            </div>
          </div>
        </section>

        <div className="form-action-bar page">
          <Link href="/sa/quotations" className="btn">ยกเลิก</Link>
          <button type="button" className="btn" onClick={() => create("draft")} disabled={!dealId || creating}><Save size={14} /> {creating ? "กำลังบันทึก…" : "บันทึกร่าง"}</button>
          <button type="button" className="btn btn-primary" onClick={() => create("sent")} disabled={!dealId || !lines.length || !(totals.totalAmount > 0) || requiresApproval || creating} title={requiresApproval ? "บันทึกร่างและรออนุมัติก่อนส่งลูกค้า" : undefined}><Save size={14} /> {creating ? "กำลังบันทึก…" : "บันทึกและส่งลูกค้า"}</button>
        </div>
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
