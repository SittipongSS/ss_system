"use client";
import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import Modal from "@/components/Modal";
import ReadableText from "@/components/ui/ReadableText";
import SearchableSelect from "@/components/ui/SearchableSelect";
import DateInput from "@/components/ui/DateInput";
import { fmtMoney, naText, NA } from "@/lib/format";
import { CUSTOMER_NAME_LABEL } from "@/lib/uiLabels";
import { productSelectOptions } from "@/components/master/productOption";
import { exciseTaxLineForRegistration, exciseTaxTotals, untaxedFilingItems } from "@/lib/tax/exciseBilling";
import Textarea from "@/components/ui/Textarea";
import StatusNotice from "@/components/ui/StatusNotice";
import Button from "@/components/ui/Button";
import { customerSelectOptions } from "@/components/master/customerOption";
import { taxSiblingIdsFromRows } from "@/lib/master/customerTaxSiblings";
import { apiFetch } from "@/lib/apiFetch";
import { TableScroll } from "@/components/ui/Table";
import { productDisplayName } from "@/lib/master/productIdentity";
import styles from "./OrderFormModal.module.css";

const blankItem = () => ({ registrationId: "", quantity: "" });

// Create a new tax-filing order, or edit/resubmit an existing one. Lines bind an
// approved registration of the chosen customer + quantity. The excise tax is
// ad valorem and snapshotted at registration time (from the product retail
// price) — the per-unit tax comes from the registration, so the filing form does
// not ask for a sale price.
//
// ⭐ โหมด "ใบยื่นจากใบสั่งขาย" (`order.salesOrderId` · ตรวจระบบ 2026-10-26 ข้อ 3) — ฟอร์มตัวเดียวกัน
// แต่รายการ **อ่านอย่างเดียว** และแก้ได้ทางเดียวคือ "คิดภาษีใหม่จากใบสั่งขาย" (PATCH
// `recalcFromSalesOrder`) · 🐞 เดิมใช้ช่องเลือกทะเบียนแบบใบยื่นมือ ⇒ บรรทัดที่ยังไม่มีทะเบียน
// (มติ 2026-07-22 ข้อ 4 ยอมให้มี) ถูกทิ้งตอนบันทึก ยอดภาษีหดเงียบ ๆ · ทุกบรรทัดไม่มีทะเบียน = ส่งกลับไม่ได้
export default function OrderFormModal({ open, onClose, onSaved, order, registrations = [], customers = [], products = [], userName }) {
  const editing = !!order;
  const fromSalesOrder = editing && !!order.salesOrderId;
  // ผลคิดใหม่จากใบสั่งขายที่ผู้ใช้กดดูแล้ว — มีค่า = ตอนบันทึกจะแทนรายการเดิมด้วยชุดนี้
  const [recalc, setRecalc] = useState(null);
  const [customerId, setCustomerId] = useState("");
  const [form, setForm] = useState({ quotationRef: "", poReference: "", deliveryDate: "", remarks: "" });
  const [items, setItems] = useState([blankItem()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setCustomerId(order.customerId || "");
      setForm({
        quotationRef: order.quotationRef === "-" ? "" : order.quotationRef || "",
        poReference: order.poReference || "",
        deliveryDate: order.deliveryDate && /^\d{4}-\d{2}-\d{2}/.test(order.deliveryDate) ? order.deliveryDate.slice(0, 10) : "",
        remarks: order.remarks === "-" ? "" : order.remarks || "",
      });
      setItems((order.items || []).map((it) => ({
        registrationId: it.registrationId || "", quantity: String(it.quantity || ""),
      })) || [blankItem()]);
    } else {
      setCustomerId("");
      setForm({ quotationRef: "", poReference: "", deliveryDate: "", remarks: "" });
      setItems([blankItem()]);
    }
    setRecalc(null);
    setError(null);
  }, [open, order?.id]);

  /* Only the chosen customer's approved registrations are selectable — no
     customer picked yet means an empty list (pick a customer first).
     ⭐ "ลูกค้ารายนี้" = **นิติบุคคล** ไม่ใช่ใบลูกค้าใบเดียว (มติผู้ใช้ 2026-09-07) —
     ใบยื่นที่ออกจาก SO อ้างทะเบียนของใบลูกค้าที่เป็นเจ้าของ FG ได้ ถ้าลิสต์นี้ยังแคบ
     กว่าด่าน server ใบที่ถูกตีกลับจะเปิดมาเจอช่องทะเบียนว่างเปล่าโดยไม่มีคำอธิบาย
     กรองจากทะเบียนลูกค้าที่จอโหลดมาแล้ว ไม่ยิง query เพิ่ม */
  const ownerIds = useMemo(
    () => new Set(taxSiblingIdsFromRows(customers, customerId)),
    [customers, customerId],
  );
  const approvedRegs = useMemo(
    () => (customerId ? registrations.filter((r) => r.status === "approved" && ownerIds.has(r.customerId)) : []),
    [registrations, customerId, ownerIds],
  );

  // Sale price (retail incl VAT) is pulled from the master product via the
  // registration's productId — shown read-only for reference, never entered.
  const productOf = (reg) => products.find((p) => p.id === reg?.productId) || null;
  const priceOf = (reg) => productOf(reg)?.retailPriceIncVat || 0;
  // ภาษี/ชิ้น ต้องคิดด้วยตัวคิดกลางตัวเดียวกับที่ API บันทึก — เดิมฟอร์มคิดเองจาก
  // snapshot บนทะเบียน (reg.exciseTax + reg.localTax ปัดรวมครั้งเดียว) ส่วน API
  // อ่านอัตราจากสินค้า → เลขบนจอกับเลขที่บันทึกจะเดินหนีกันทันทีที่ราคาสินค้าเปลี่ยน
  const regTaxLine = (reg, quantity = 1) =>
    exciseTaxLineForRegistration({ registration: reg, product: productOf(reg), quantity });
  const regTax = (reg) => regTaxLine(reg, 1).totalTax;

  const setItem = (i, patch) => setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const addItem = () => setItems((arr) => [...arr, blankItem()]);
  const removeItem = (i) => setItems((arr) => (arr.length === 1 ? arr : arr.filter((_, idx) => idx !== i)));

  const totalTax = exciseTaxTotals(items.map((it) => {
    const r = approvedRegs.find((x) => x.id === it.registrationId);
    return regTaxLine(r, parseInt(it.quantity) || 0);
  })).totalTax;

  /* ตัวอย่างผลคิดใหม่ — GET ตัวเดียวกับที่หน้า SO ใช้ (resolver เดียวกับตอนสร้างใบ) จึงเห็นเลขเดียวกับที่ server
     จะเขียนตอนบันทึก · ไม่เขียนอะไรจนกว่าจะกดบันทึก */
  const previewRecalc = async () => {
    setRecalc({ loading: true });
    try {
      const res = await apiFetch(`/api/tax/orders/from-sales-order?salesOrderId=${encodeURIComponent(order.salesOrderId)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "คิดภาษีจากใบสั่งขายไม่สำเร็จ");
      if (!data.lines?.length) throw new Error("ใบสั่งขายต้นทางไม่มีรายการสินค้าสรรพสามิตให้คิดภาษีแล้ว");
      setRecalc({ lines: data.lines, totalTax: Number(data.totalTax || 0), warnings: data.warnings || [] });
    } catch (err) {
      setRecalc({ error: err.message });
    }
  };
  const recalcReady = !!recalc?.lines;
  const shownTotal = fromSalesOrder ? (recalcReady ? recalc.totalTax : Number(order.totalTax || 0)) : totalTax;

  const submit = async (e) => {
    e.preventDefault();
    if (fromSalesOrder) {
      setBusy(true);
      setError(null);
      try {
        const body = { ...form };
        if (recalcReady) body.recalcFromSalesOrder = true;
        if (order.status === "rejected") body.status = "received"; // resubmit
        const res = await apiFetch(`/api/orders/${order.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "บันทึกไม่สำเร็จ");
        onSaved?.();
        onClose();
      } catch (err) {
        setError(err.message);
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!customerId) { setError("กรุณาเลือกลูกค้า"); return; }
    const clean = items
      .filter((it) => it.registrationId && it.quantity)
      .map((it) => ({ registrationId: it.registrationId, quantity: it.quantity }));
    if (!clean.length) { setError("กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ"); return; }
    setBusy(true);
    setError(null);
    try {
      let res;
      if (editing) {
        const body = { ...form, items: clean };
        if (order.status === "rejected") body.status = "received"; // resubmit
        res = await apiFetch(`/api/orders/${order.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      } else {
        res = await apiFetch("/api/orders", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customerId, ...form, items: clean, assignee: userName }),
        });
      }
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "บันทึกไม่สำเร็จ");
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const title = editing
    ? (order.status === "rejected" ? "แก้ไขและส่งกลับ" : "แก้ไขใบยื่นชำระ")
    : "ยื่นชำระภาษีใหม่";

  return (
    <Modal open={open} onClose={() => !busy && onClose()} title={title} size="lg">
      <form onSubmit={submit}>
        <div className="drawer-section flex flex-col gap-4">
          {editing && order.status === "rejected" && order.rejectionReason && (
            <div style={{ fontSize: "var(--fs-7)", color: "var(--red)" }} className="bg-[var(--red-soft)] rounded p-2">
              <strong>เหตุผลที่ตีกลับ: </strong><ReadableText text={order.rejectionReason} lines={4} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="form-group col-span-2">
              <label>{CUSTOMER_NAME_LABEL} <span style={{ color: "var(--red)" }}>*</span></label>
              {editing ? (
                <input className="premium-input w-full" value={naText(order.customerName)} disabled />
              ) : (
                <SearchableSelect
                  entity="customer"
                  value={customerId}
                  onChange={(v) => { setCustomerId(v); setItems([blankItem()]); }}
                  placeholder="ค้นหารหัส / ชื่อลูกค้า..."
                  options={customerSelectOptions(customers)}
                />
              )}
            </div>
            <div className="form-group">
              <label>เลขที่ใบเสนอราคา <span style={{ color: "var(--red)" }}>*</span></label>
              <input className="premium-input w-full" value={form.quotationRef} required
                onChange={(e) => setForm((f) => ({ ...f, quotationRef: e.target.value }))} placeholder="เช่น QT-2026-001" />
            </div>
            <div className="form-group">
              <label>PO Reference</label>
              <input className="premium-input w-full" value={form.poReference}
                onChange={(e) => setForm((f) => ({ ...f, poReference: e.target.value }))} placeholder="เลขที่ใบสั่งซื้อลูกค้า" />
            </div>
            <div className="form-group">
              <label>วันที่คาดว่าจะส่ง</label>
              <DateInput className="w-full" value={form.deliveryDate}
                onChange={(value) => setForm((f) => ({ ...f, deliveryDate: value }))} />
            </div>
            <div className="form-group">
              <label>หมายเหตุ</label>
              <Textarea className="w-full" rows={3} value={form.remarks}
                onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} placeholder="ข้อมูลเพิ่มเติม" />
            </div>
          </div>

          {fromSalesOrder ? (
            <SalesOrderLines
              order={order}
              recalc={recalc}
              onPreview={previewRecalc}
              onDiscard={() => setRecalc(null)}
              busy={busy}
            />
          ) : (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label style={{ margin: 0 }}>รายการสินค้า <span style={{ color: "var(--red)" }}>*</span></label>
              <button type="button" onClick={addItem} className="btn btn-secondary flex items-center gap-1" style={{ height: 30 }}>
                <Plus size={14} /> เพิ่มรายการ
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {items.map((it, idx) => {
                const reg = approvedRegs.find((r) => r.id === it.registrationId);
                return (
                  <div key={idx} className="flex flex-col gap-1">
                    <div className="flex gap-2 items-start">
                      <div style={{ flex: 1 }}>
                        <SearchableSelect
                          entity="product"
                          value={it.registrationId}
                          onChange={(v) => setItem(idx, { registrationId: v })}
                          placeholder={customerId ? "เลือกสินค้า (อนุมัติแล้ว)" : "เลือกลูกค้าก่อน"}
                          options={productSelectOptions(
                            // ทะเบียนมีแค่ fgCode+ชื่อ → map เข้า shape มาตรฐาน (แบรนด์/ปริมาตรไม่มีใน snapshot)
                            approvedRegs.map((r) => ({ id: r.id, fgCode: r.fgCode, name: r.productName })),
                          )}
                          emptyText="ไม่มีสินค้าที่อนุมัติแล้วของลูกค้านี้"
                        />
                      </div>
                      <input type="number" min="1" placeholder="จำนวน" className="premium-input font-mono" style={{ width: 110 }}
                        value={it.quantity} onChange={(e) => setItem(idx, { quantity: e.target.value })} required />
                      <button type="button" onClick={() => removeItem(idx)} disabled={items.length === 1}
                        className="btn-icon danger" title="ลบรายการ"><X size={15} /></button>
                    </div>
                    {reg && (
                      <div style={{ fontSize: "var(--fs-3)", color: "var(--text-3)", marginLeft: 2 }} className="font-mono flex gap-4 flex-wrap">
                        <span>ราคาขาย/ชิ้น: {priceOf(reg) > 0 ? fmtMoney(priceOf(reg)) : NA}</span>
                        {/* ภาษี 0 ≠ ยกเว้น — "ยกเว้น" เฉพาะทะเบียนที่ RA ตัดสินไว้ · ที่เหลือคือสินค้ายังไม่มีราคาขายปลีก */}
                        <span>ภาษี/ชิ้น: {reg.isExciseTaxable === false
                          ? "ยกเว้น"
                          : regTax(reg) > 0 ? fmtMoney(regTax(reg)) : `${fmtMoney(0)} (ไม่มีราคาขายปลีก)`}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          )}

          <div className="flex justify-end" style={{ fontSize: "var(--fs-7)" }}>
            <span style={{ color: "var(--text-3)" }}>ยอดชำระภาษีสรรพสามิตรวม (ไม่รวมภาษีมูลค่าเพิ่ม):&nbsp;</span>
            <span className="font-mono font-bold" style={{ color: "var(--red)" }}>{fmtMoney(shownTotal)}</span>
          </div>

          {error && <div style={{ fontSize: "var(--fs-7)", color: "var(--red)" }} className="bg-[var(--red-soft)] rounded p-2">{error}</div>}
        </div>

        <div className="form-action-bar">
          <button type="button" onClick={onClose} className="btn" disabled={busy}>ยกเลิก</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "กำลังบันทึก..." : editing ? (order.status === "rejected" ? "บันทึกและส่งกลับ" : "บันทึกการแก้ไข") : "บันทึกรายการยื่นชำระ"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* รายการของใบยื่นจากใบสั่งขาย — อ่านอย่างเดียว (จำนวนมาจากบรรทัด SO · อัตรามาจากสินค้า)
   ปุ่มเดียวที่เปลี่ยนรายการได้คือ "คิดภาษีใหม่จากใบสั่งขาย" ⇒ ใช้หลังเติมราคาขายปลีก/ทะเบียนแก้แล้ว
   ⚠️ บรรทัดที่ยังไม่มีทะเบียนอยู่ครบทั้งก่อนและหลังคิดใหม่ — ทะเบียนเป็นคำเตือน ไม่ใช่เงื่อนไข (มติ 2026-07-22 ข้อ 4) */
function SalesOrderLines({ order, recalc, onPreview, onDiscard, busy }) {
  const ready = !!recalc?.lines;
  // รายการ ฿0 ที่ไม่ได้รับยกเว้น — ตัวตัดสินเดียวกับหน้ารายละเอียดใบยื่น (ไม่เดาจากยอด 0 เอง)
  const untaxed = new Set(untaxedFilingItems(order).map((item) => item.id));
  const rows = ready
    ? recalc.lines.map((line) => ({
      key: line.salesOrderLineId || line.productId,
      fgCode: line.fgCode,
      name: line.description,
      quantity: line.quantity,
      perUnit: Number(line.exciseRatePerUnit || 0) + Number(line.localTaxRatePerUnit || 0),
      total: line.totalTax,
      noRegistration: !line.registrationId,
      noTaxBase: !!line.taxBaseMissing,
    }))
    : (order.items || []).map((item) => ({
      key: item.id,
      fgCode: item.product?.fgCode || item.registration?.fgCode,
      name: productDisplayName(item.product || item.registration || {}),
      quantity: item.quantity,
      perUnit: Number(item.exciseRatePerUnit || 0) + Number(item.localTaxRatePerUnit || 0),
      total: item.totalTax,
      noRegistration: !item.registrationId,
      noTaxBase: untaxed.has(item.id),
    }));
  const taxBaseWarnings = ready ? recalc.warnings.filter((w) => w.code === "missing_tax_base").length : 0;
  return (
    <div>
      <div className={styles.soLinesHead}>
        <label>รายการสินค้า (จากใบสั่งขาย){ready ? " — ชุดที่คิดใหม่" : ""}</label>
        {ready ? (
          <Button onClick={onDiscard} disabled={busy}>ใช้รายการเดิม</Button>
        ) : (
          <Button tone="neutral" onClick={onPreview} disabled={busy || recalc?.loading}>
            {recalc?.loading ? "กำลังคิด…" : "คิดภาษีใหม่จากใบสั่งขาย"}
          </Button>
        )}
      </div>
      <p className={styles.hint}>
        {ready
          ? <>บันทึกแล้วรายการทั้งหมดจะถูกแทนด้วยชุดนี้ (อัตราภาษีล่าสุดของสินค้า) · ยอดเดิม {fmtMoney(order.totalTax || 0)} → <span className={styles.changed}>{fmtMoney(recalc.totalTax)}</span></>
          : "จำนวนมาจากใบสั่งขาย แก้ที่นี่ไม่ได้ · เติมราคาขายปลีก/แก้ทะเบียนแล้ว กด \"คิดภาษีใหม่จากใบสั่งขาย\" ให้ใบนี้ใช้อัตราล่าสุด"}
      </p>
      {recalc?.error && <StatusNotice tone="error">{recalc.error}</StatusNotice>}
      {taxBaseWarnings > 0 && (
        <StatusNotice tone="warning">ยังมี {taxBaseWarnings} รายการที่สินค้าไม่มีราคาขายปลีก — คิดใหม่แล้วก็ยังเป็น ฿0</StatusNotice>
      )}
      <TableScroll family="list" surface="embedded" minWidth={420}>
        <table className={styles.lineTable}>
          <thead>
            <tr>
              <th>รหัส / รายการ</th>
              <th className="num">จำนวน</th>
              <th className="num">ภาษี/ชิ้น</th>
              <th className="num">ภาษีรวม</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td>
                  <span className={styles.lineCode}>{naText(row.fgCode)}</span>
                  <div className={styles.lineName}>{naText(row.name)}</div>
                  {row.noRegistration && <span className={styles.lineGap}>ยังไม่มีทะเบียนอนุมัติ (เตือน ไม่บล็อก)</span>}
                  {row.noTaxBase && <span className={styles.lineGap}>ไม่มีราคาขายปลีก · ภาษี ฿0</span>}
                </td>
                <td className="num mono">{naText(row.quantity)}</td>
                <td className="num mono">{fmtMoney(row.perUnit)}</td>
                <td className="num mono">{fmtMoney(row.total || 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
    </div>
  );
}
