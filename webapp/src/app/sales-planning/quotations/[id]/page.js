"use client";
import Select from "@/components/ui/Select";

// Editor ใบเสนอราคา FM-SA-01 (/sa/quotations/[id] — เฟส D):
// แก้รายการ+ส่วนลดรายบรรทัด · ส่วนลดท้ายใบ · VAT · เงื่อนไขชำระ · หมายเหตุ (เลือกจาก
// template ต่อบริการ) · ส่ง/รับ/Revise/พิมพ์/ขออนุมัติ. ยอดเงินคิดจริงที่ server —
// หน้านี้พรีวิวด้วยสูตรเดียวกัน (quoteTotals จาก lib กลาง).
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FileText, Plus, Printer, Save, Send, Trash2, CheckCircle2, GitBranch, ClipboardList } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import FormActions from "@/components/ui/FormActions";
import MoneyInput from "@/components/ui/MoneyInput";
import DateInput from "@/components/ui/DateInput";
import SaveStatus from "@/components/ui/SaveStatus";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Modal from "@/components/Modal";
import { useCan, useRole } from "@/lib/roleContext";
import { canReviewSalesForecast, dealTypeOf, quoteLineNet, quoteTotals } from "@/lib/salesPlanning";
import { fmtMoney } from "@/lib/format";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";
import { openQuotePrintWindow } from "@/lib/sales/quotePrint";

const money = (v) => fmtMoney(v);
const EDITABLE = new Set(["draft", "sent", "rejected"]);

export default function QuotationEditorPage() {
  const { id } = useParams();
  const router = useRouter();
  const canEditCap = useCan("salesplan:edit");
  const role = useRole();
  const isReviewer = canReviewSalesForecast({ role });

  const [quote, setQuote] = useState(null);
  const [lines, setLines] = useState([]);
  const [form, setForm] = useState({ quoteDate: "", validUntil: "", paymentTerms: "", notes: "", discountType: "", discountValue: "", vatRate: 0 });
  const [templates, setTemplates] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [tplOpen, setTplOpen] = useState(false);
  const [confirmState, setConfirmState] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [tplForm, setTplForm] = useState({ serviceType: "general", title: "", body: "" });
  // เพิ่มรายการจากรหัส FG (feedback ผู้ใช้: ใส่รหัส FG ตอนทำใบ) — ราคา freeze จาก master ณ ตอนเพิ่ม
  const [products, setProducts] = useState([]);
  const [fgPick, setFgPick] = useState("");

  useUnsavedChanges(dirty);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch(`/api/sales-planning/quotations/${id}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "โหลดใบเสนอราคาไม่สำเร็จ");
      const q = await res.json();
      setQuote(q);
      setLines((q.lines || []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
      setForm({
        quoteDate: q.quoteDate || "",
        validUntil: q.validUntil || "",
        paymentTerms: q.paymentTerms || "",
        notes: q.notes || "",
        discountType: q.discountType || "",
        discountValue: q.discountValue ?? "",
        vatRate: Number(q.vatRate || 0),
      });
      setDirty(false);
    } catch (e) {
      setError(e.message || "โหลดใบเสนอราคาไม่สำเร็จ");
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/sales-planning/quote-note-templates").then((r) => (r.ok ? r.json() : [])).then((d) => setTemplates(Array.isArray(d) ? d : [])).catch(() => {});
    fetch("/api/products").then((r) => (r.ok ? r.json() : [])).then((d) => setProducts(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const editable = !!quote && canEditCap && EDITABLE.has(quote.status);

  const totals = useMemo(() => quoteTotals(lines, {
    discountType: form.discountType || null,
    discountValue: form.discountValue || 0,
    vatRate: form.vatRate || 0,
  }), [lines, form.discountType, form.discountValue, form.vatRate]);

  const setLine = (i, patch) => {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
    setDirty(true);
  };
  const addLine = () => { setLines((prev) => [...prev, { description: "", qty: 1, unitPrice: 0, discountType: null, discountValue: 0 }]); setDirty(true); };
  const addFgLine = () => {
    const p = products.find((x) => x.id === fgPick);
    if (!p) return;
    setLines((prev) => [...prev, {
      productId: p.id,
      fgCode: p.fgCode || null,
      description: p.productDescription || p.productDescriptionEn || p.fgCode || "สินค้า",
      qty: 1,
      unitPrice: Number(p.retailPriceIncVat || 0),
      discountType: null,
      discountValue: 0,
    }]);
    setFgPick("");
    setDirty(true);
  };
  const removeLine = (i) => { setLines((prev) => prev.filter((_, idx) => idx !== i)); setDirty(true); };
  const setF = (patch) => { setForm((f) => ({ ...f, ...patch })); setDirty(true); };

  const save = async (extra = {}) => {
    setBusy("save");
    setError("");
    try {
      const res = await fetch(`/api/sales-planning/quotations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines,
          quoteDate: form.quoteDate,
          validUntil: form.validUntil || null,
          paymentTerms: form.paymentTerms,
          notes: form.notes,
          discountType: form.discountType || null,
          discountValue: form.discountValue || 0,
          vatRate: form.vatRate,
          ...extra,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "บันทึกไม่สำเร็จ");
      await load();
      return true;
    } catch (e) {
      setError(e.message || "บันทึกไม่สำเร็จ");
      return false;
    } finally {
      setBusy("");
    }
  };

  const act = async (label, url, opts = { method: "POST" }) => {
    setBusy(label);
    setError("");
    try {
      const res = await fetch(url, opts);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "ทำรายการไม่สำเร็จ");
      return data;
    } catch (e) {
      setError(e.message || "ทำรายการไม่สำเร็จ");
      return null;
    } finally {
      setBusy("");
    }
  };

  const runConfirmed = async () => {
    const action = confirmState?.action;
    if (!action) return;
    setConfirmBusy(true);
    try {
      const completed = await action();
      if (completed !== false) setConfirmState(null);
    } finally {
      setConfirmBusy(false);
    }
  };

  const doAccept = () => {
    setConfirmState({
      title: "ยืนยันการรับใบเสนอราคา",
      description: `ลูกค้ารับใบเสนอราคา ${quote.quoteNumber}`,
      detail: `ยอด ${money(quote.totalAmount)} จะถูกตั้งเป็นมูลค่าดีล การดำเนินการนี้มีผลต่อยอดขายและสถานะดีล`,
      confirmLabel: "ยืนยันว่าลูกค้ารับ",
      action: async () => {
        if (!(await act("accept", `/api/sales-planning/quotations/${id}/accept`))) return false;
        await load();
        return true;
      },
    });
  };
  const doRevise = async () => {
    if (dirty && !(await save())) return;
    const data = await act("revise", `/api/sales-planning/quotations/${id}/revise`);
    if (data?.id) router.push(`/sa/quotations/${data.id}`);
  };
  const doApproval = async (action) => {
    if (await act(action, `/api/sales-planning/quotations/${id}/approval`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
    })) await load();
  };
  const doDelete = () => {
    setConfirmState({
      title: "ลบใบเสนอราคาฉบับร่าง",
      description: `ต้องการลบ ${quote.quoteNumber} ใช่หรือไม่`,
      detail: "ใบเสนอราคาฉบับนี้จะถูกลบและไม่สามารถเรียกคืนจากหน้าจอนี้ได้",
      confirmLabel: "ลบฉบับร่าง",
      tone: "danger",
      action: async () => {
        if (!(await act("delete", `/api/sales-planning/quotations/${id}`, { method: "DELETE" }))) return false;
        router.push("/sa/quotations");
        return true;
      },
    });
  };
  const doPrint = async () => {
    if (dirty && editable && !(await save())) return;
    const res = await fetch(`/api/sales-planning/quotations/${id}`);
    if (res.ok) openQuotePrintWindow(await res.json());
  };

  // template หมายเหตุ: กรองตามประเภทดีล + general
  const dealType = quote?.deal ? dealTypeOf(quote.deal) : null;
  const visibleTemplates = templates.filter((t) => t.active && (t.serviceType === "general" || !dealType || t.serviceType === dealType));
  const applyTemplate = (tpl) => setF({ notes: form.notes ? `${form.notes}\n${tpl.body}` : tpl.body });

  const saveTemplate = async () => {
    if (!tplForm.title.trim() || !tplForm.body.trim()) return;
    const res = await fetch("/api/sales-planning/quote-note-templates", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(tplForm),
    });
    if (res.ok) {
      setTplForm({ serviceType: "general", title: "", body: "" });
      const d = await fetch("/api/sales-planning/quote-note-templates").then((r) => r.json()).catch(() => []);
      setTemplates(Array.isArray(d) ? d : []);
    } else setError((await res.json().catch(() => ({}))).error || "บันทึก template ไม่สำเร็จ");
  };
  const deleteTemplate = (tpl) => {
    setConfirmState({
      title: "ลบ Template หมายเหตุ",
      description: `ต้องการลบ “${tpl.title}” ใช่หรือไม่`,
      detail: "Template จะหายจากตัวเลือกของใบเสนอราคาทุกฉบับ แต่ข้อความที่นำไปใช้แล้วจะไม่ถูกลบ",
      confirmLabel: "ลบ Template",
      tone: "danger",
      action: async () => {
        const res = await fetch(`/api/sales-planning/quote-note-templates/${tpl.id}`, { method: "DELETE" });
        if (!res.ok) {
          setError((await res.json().catch(() => ({}))).error || "ลบ template ไม่สำเร็จ");
          return false;
        }
        setTemplates((prev) => prev.filter((t) => t.id !== tpl.id));
        return true;
      },
    });
  };

  return (
    <Workspace
      icon={<FileText size={22} />}
      title={quote ? `ใบเสนอราคา ${quote.quoteNumber}` : "ใบเสนอราคา"}
      subtitle={quote ? `${quote.customerName || "-"}${quote.deal ? ` · ดีล: ${quote.deal.title}` : ""}${quote.revisionNo > 0 ? ` · ฉบับแก้ไข R${quote.revisionNo}` : ""}` : ""}
      back={{ href: "/sa/quotations", label: "กลับหน้าใบเสนอราคา" }}
      headerRight={quote && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {editable && <SaveStatus status={error ? "error" : busy === "save" ? "saving" : dirty ? "dirty" : "saved"} />}
          {editable && <button type="button" className="btn btn-primary" onClick={() => save()} disabled={!!busy || !dirty}><Save size={14} aria-hidden="true" /> {busy === "save" ? "กำลังบันทึก…" : "บันทึก"}</button>}
          {editable && quote.status === "draft" && <button type="button" className="btn" onClick={async () => { if (await save({ status: "sent" })) {} }} disabled={!!busy}><Send size={14} aria-hidden="true" /> ส่งลูกค้า</button>}
          {["sent", "draft"].includes(quote.status) && canEditCap && <button type="button" className="btn btn-success" onClick={doAccept} disabled={!!busy || quote.approvalStatus === "pending"} title={quote.approvalStatus === "pending" ? "รออนุมัติก่อนรับใบ" : "ลูกค้ารับใบนี้"}><CheckCircle2 size={14} aria-hidden="true" /> ลูกค้ารับ</button>}
          {EDITABLE.has(quote.status) && canEditCap && <button type="button" className="btn ghost" onClick={doRevise} disabled={!!busy}><GitBranch size={14} aria-hidden="true" /> Revise</button>}
          <button type="button" className="btn ghost" onClick={doPrint} disabled={!!busy}><Printer size={14} aria-hidden="true" /> พิมพ์</button>
          {quote.status === "draft" && canEditCap && <button type="button" className="btn-icon danger" onClick={doDelete} title="ลบฉบับร่าง" aria-label="ลบฉบับร่าง"><Trash2 size={15} aria-hidden="true" /></button>}
        </div>
      )}
    >
      {error && (
        <div className="glass-panel" role="alert" style={{ padding: "12px 14px", borderColor: "var(--red)", color: "var(--red)", marginBottom: 16 }}>{error}</div>
      )}

      {quote && (
        <div className="flex flex-col gap-5">
          {/* สถานะ + อนุมัติ */}
          <section className="glass-panel" style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span className="ui-badge" style={{ color: { draft: "var(--text-3)", sent: "var(--blue)", accepted: "var(--green)", rejected: "var(--red)", cancelled: "var(--red)", revised: "var(--amber)" }[quote.status] }}>
              {{ draft: "ฉบับร่าง", sent: "ส่งลูกค้าแล้ว", accepted: "ลูกค้ารับแล้ว", rejected: "ถูกปฏิเสธ", cancelled: "ยกเลิก", revised: "ถูกแก้ไข (มีฉบับใหม่)" }[quote.status] || quote.status}
            </span>
            {quote.approvalStatus !== "not_required" && (
              <span className="ui-badge" style={{ color: quote.approvalStatus === "approved" ? "var(--green)" : quote.approvalStatus === "rejected" ? "var(--red)" : "var(--amber)" }}>
                {{ pending: `รออนุมัติ (${quote.approvalReason || "เกินเงื่อนไข"})`, approved: "อนุมัติแล้ว", rejected: "ไม่อนุมัติ" }[quote.approvalStatus]}
              </span>
            )}
            {quote.approvalStatus === "pending" && isReviewer && (
              <>
                <button type="button" className="btn btn-success sm" onClick={() => doApproval("approve")} disabled={!!busy}>อนุมัติ</button>
                <button type="button" className="btn sm" onClick={() => doApproval("reject")} disabled={!!busy}>ไม่อนุมัติ</button>
              </>
            )}
            <div className="spacer" style={{ flex: 1 }} />
            {quote.deal && <Link href={`/sa/deals/${quote.deal.id}`} className="linklike" style={{ fontSize: 13 }}>เปิดดีล →</Link>}
            {!editable && <span style={{ fontSize: 12.5, color: "var(--text-3)" }}>ใบนี้แก้ไขไม่ได้ — ใช้ Revise เพื่อออกฉบับใหม่</span>}
          </section>

          {/* หัวใบ */}
          <section className="glass-panel form-grid" style={{ padding: 16 }}>
            <label>วันที่ออกใบ
              <DateInput value={form.quoteDate} disabled={!editable} onChange={(value) => setF({ quoteDate: value })} />
            </label>
            <label>ยืนราคาถึง
              <DateInput value={form.validUntil || ""} disabled={!editable} onChange={(value) => setF({ validUntil: value })} />
            </label>
            <label>ภาษีมูลค่าเพิ่ม
              <Select className="premium-select" value={form.vatRate} disabled={!editable} onChange={(e) => setF({ vatRate: Number(e.target.value) })}>
                <option value={0}>ราคารวม VAT แล้ว (ไม่บวกเพิ่ม)</option>
                <option value={7}>+ VAT 7% ท้ายใบ</option>
              </Select>
            </label>
            <label style={{ gridColumn: "1 / -1" }}>เงื่อนไขการชำระเงิน
              <input className="premium-input" value={form.paymentTerms} disabled={!editable} placeholder="เช่น มัดจำ 50% ก่อนเริ่มงาน · ส่วนที่เหลือก่อนส่งมอบ · เครดิต 30 วัน" onChange={(e) => setF({ paymentTerms: e.target.value })} />
            </label>
          </section>

          {/* รายการ */}
          <section className="glass-panel" style={{ padding: 16 }}>
            <div className="flex items-center gap-2 mb-3">
              <ClipboardList size={17} aria-hidden="true" />
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>รายการสินค้า/บริการ</h2>
              <div className="spacer" />
              {editable && (
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <Select className="premium-select" value={fgPick} onChange={(e) => setFgPick(e.target.value)} style={{ width: 260 }} aria-label="เลือกสินค้า (FG)">
                    <option value="">— เพิ่มจากรหัส FG —</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.fgCode ? `${p.fgCode} · ` : ""}{p.productDescription || p.productDescriptionEn || "-"}</option>
                    ))}
                  </Select>
                  <button type="button" className="btn btn-primary sm" onClick={addFgLine} disabled={!fgPick}><Plus size={13} aria-hidden="true" /> เพิ่ม FG</button>
                  <button type="button" className="btn ghost sm" onClick={addLine}><Plus size={13} aria-hidden="true" /> รายการเอง</button>
                </div>
              )}
            </div>
            <div className="premium-glass-table table-responsive">
              <table className="w-full text-sm">
                <thead>
                  <tr><th style={{ width: 36 }}>#</th><th>รายการ</th><th style={{ width: 90 }}>จำนวน</th><th style={{ width: 120 }}>ราคา/หน่วย</th><th style={{ width: 170 }}>ส่วนลดรายการ</th><th className="num" style={{ width: 120 }}>จำนวนเงิน</th>{editable && <th style={{ width: 40 }}></th>}</tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={l.id || i} className="premium-row">
                      <td style={{ textAlign: "center", color: "var(--text-3)" }}>{i + 1}</td>
                      <td>
                        <input className="premium-input" value={l.description || ""} disabled={!editable} placeholder="รายละเอียด" onChange={(e) => setLine(i, { description: e.target.value })} style={{ width: "100%" }} />
                        {l.fgCode && <span style={{ fontSize: 11, color: "var(--text-3)" }}>{l.fgCode}</span>}
                      </td>
                      <td><input type="number" min="0" step="1" className="premium-input mono" value={l.qty} disabled={!editable} onChange={(e) => setLine(i, { qty: e.target.value })} /></td>
                      <td><MoneyInput min="0" value={l.unitPrice} disabled={!editable} onChange={(value) => setLine(i, { unitPrice: value ?? "" })} aria-label={`ราคาต่อหน่วย รายการ ${i + 1}`} /></td>
                      <td>
                        <div style={{ display: "flex", gap: 4 }}>
                          <Select className="premium-select" value={l.discountType || ""} disabled={!editable} onChange={(e) => setLine(i, { discountType: e.target.value || null, discountValue: e.target.value ? l.discountValue : 0 })} style={{ width: 74 }}>
                            <option value="">ไม่ลด</option>
                            <option value="percent">%</option>
                            <option value="amount">บาท</option>
                          </Select>
                          <MoneyInput min="0" value={l.discountValue || ""} disabled={!editable || !l.discountType} onChange={(value) => setLine(i, { discountValue: value ?? "" })} style={{ width: 104 }} aria-label={`ส่วนลด รายการ ${i + 1}`} />
                        </div>
                      </td>
                      <td className="num mono">{money(quoteLineNet(l).lineTotal)}</td>
                      {editable && (
                        <td><button type="button" className="btn-icon danger" onClick={() => removeLine(i)} aria-label={`ลบรายการ ${i + 1}`}><Trash2 size={14} aria-hidden="true" /></button></td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* สรุปยอด + ส่วนลดท้ายใบ */}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
              <div style={{ width: 340, display: "flex", flexDirection: "column", gap: 8, fontSize: 13.5 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span>รวมเป็นเงิน</span><strong className="mono">{money(totals.subtotal)}</strong></div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    ส่วนลดท้ายใบ
                    <Select className="premium-select" value={form.discountType} disabled={!editable} onChange={(e) => setF({ discountType: e.target.value, discountValue: e.target.value ? form.discountValue : "" })} style={{ width: 74, height: 30 }}>
                      <option value="">ไม่ลด</option>
                      <option value="percent">%</option>
                      <option value="amount">บาท</option>
                    </Select>
                    <MoneyInput min="0" value={form.discountValue || ""} disabled={!editable || !form.discountType} onChange={(value) => setF({ discountValue: value ?? "" })} style={{ width: 110, height: 30 }} aria-label="ส่วนลดท้ายใบ" />
                  </span>
                  <strong className="mono" style={{ color: totals.discountAmount > 0 ? "var(--red)" : "inherit" }}>{totals.discountAmount > 0 ? `-${money(totals.discountAmount)}` : "-"}</strong>
                </div>
                {form.vatRate > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span>VAT {form.vatRate}%</span><strong className="mono">{money(totals.vatAmount)}</strong></div>}
                <div style={{ display: "flex", justifyContent: "space-between", borderTop: "2px solid var(--border)", paddingTop: 8, fontSize: 16 }}>
                  <strong>ยอดรวมทั้งสิ้น</strong><strong className="mono">{money(totals.totalAmount)}</strong>
                </div>
              </div>
            </div>
          </section>

          {/* หมายเหตุ + template */}
          <section className="glass-panel" style={{ padding: 16 }}>
            <div className="flex items-center gap-2 mb-3" style={{ flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>หมายเหตุ</h2>
              <div className="spacer" />
              {editable && visibleTemplates.map((t) => (
                <button key={t.id} type="button" className="btn ghost sm" onClick={() => applyTemplate(t)} title={t.body}>+ {t.title}</button>
              ))}
              {isReviewer && <button type="button" className="btn ghost sm" onClick={() => setTplOpen(true)}>จัดการ template</button>}
            </div>
            <textarea className="premium-input" rows={4} value={form.notes} disabled={!editable} placeholder="เงื่อนไข/หมายเหตุประกอบใบเสนอราคา" onChange={(e) => setF({ notes: e.target.value })} style={{ width: "100%" }} />
          </section>

          {editable && (
            <FormActions
              dirty={dirty}
              saving={busy === "save"}
              error={!!error}
              onSave={() => save()}
            />
          )}
        </div>
      )}

      {/* จัดการ template หมายเหตุ (supervisor) */}
      <Modal open={tplOpen} onClose={() => setTplOpen(false)} title="Template หมายเหตุ (ต่อประเภทบริการ)" size="lg">
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="premium-glass-table table-responsive">
            <table className="w-full text-sm">
              <thead><tr><th>ประเภท</th><th>ชื่อ</th><th>เนื้อหา</th><th></th></tr></thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id} className="premium-row">
                    <td><span className="ui-badge">{t.serviceType}</span></td>
                    <td>{t.title}</td>
                    <td style={{ fontSize: 12.5, color: "var(--text-2)", whiteSpace: "pre-wrap" }}>{t.body}</td>
                    <td><button type="button" className="btn-icon danger" onClick={() => deleteTemplate(t)} aria-label={`ลบ ${t.title}`}><Trash2 size={14} aria-hidden="true" /></button></td>
                  </tr>
                ))}
                {!templates.length && <tr><td colSpan={4} style={{ padding: 18, textAlign: "center", color: "var(--text-3)" }}>ยังไม่มี template</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="form-grid" style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            <label>ประเภทบริการ
              <Select className="premium-select" value={tplForm.serviceType} onChange={(e) => setTplForm({ ...tplForm, serviceType: e.target.value })}>
                {["general", "SCENT", "NPD", "RE-ORDER", "diffuser", "workshop"].map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </label>
            <label>ชื่อ template
              <input className="premium-input" value={tplForm.title} onChange={(e) => setTplForm({ ...tplForm, title: e.target.value })} />
            </label>
            <label style={{ gridColumn: "1 / -1" }}>เนื้อหา
              <textarea className="premium-input" rows={3} value={tplForm.body} onChange={(e) => setTplForm({ ...tplForm, body: e.target.value })} />
            </label>
            <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-primary" onClick={saveTemplate} disabled={!tplForm.title.trim() || !tplForm.body.trim()}><Plus size={14} aria-hidden="true" /> เพิ่ม template</button>
            </div>
          </div>
        </div>
      </Modal>
      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title}
        description={confirmState?.description}
        detail={confirmState?.detail}
        confirmLabel={confirmState?.confirmLabel}
        tone={confirmState?.tone}
        busy={confirmBusy}
        onClose={() => !confirmBusy && setConfirmState(null)}
        onConfirm={runConfirmed}
      />
    </Workspace>
  );
}
