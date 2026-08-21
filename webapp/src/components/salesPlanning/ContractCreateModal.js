"use client";
// ── โมดัล "ออกสัญญา" — เปิดจากหน้าดีล หน้าใบเสนอราคา และหัวทะเบียนสัญญา ──────
//
// ⭐ **สองขั้นโดยตั้งใจ** (docs/form-design-rules §1.5): ที่นี่ถามแค่ *ออกสัญญาอะไร
//    จากใบไหน* แล้วสร้างร่าง จากนั้นพาไปกรอกรายละเอียดที่หน้าสัญญา — เพราะชุดช่องกรอก
//    เปลี่ยนทั้งชุดตามชนิดสัญญา (มาจากแม่แบบ) การกางฟอร์มไว้ก่อนเลือกชนิดคือฟอร์มที่
//    เปลี่ยนรูปใต้มือคนกรอก
//
// ⚠️ ตัวเลือกและเหตุผลที่ออกไม่ได้ มาจาก `/api/sales-planning/contracts/options`
//    ซึ่งเรียกด่านตัวเดียวกับที่ API ใช้ปฏิเสธจริง — ห้ามคิดเงื่อนไขเองที่นี่
//
// ⭐ **สองโหมด ฟอร์มเดียว** (กติกาในเอกสารโปรเจกต์: ต่างกันได้แค่โหมดผ่าน props)
//    มี `dealId` = เปิดจากในดีล/ใบเสนอราคา · ไม่มี = เปิดจากหัวทะเบียน แล้วมีช่องเลือกดีล
//    เพิ่มมาข้างบนสุด (รายการดีลที่ *ออกได้จริง* จาก options แบบไม่ระบุดีล)
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import StatusNotice from "@/components/ui/StatusNotice";
import Button from "@/components/ui/Button";
import OptionTiles from "@/components/ui/OptionTiles";
import SearchableSelect from "@/components/ui/SearchableSelect";
import Select from "@/components/ui/Select";
import { fmtDate, fmtMoney } from "@/lib/format";
import { notifyToast } from "@/lib/feedback";

export default function ContractCreateModal({ open, dealId = "", quotationId = "", onClose, onCreated }) {
  const router = useRouter();
  const [options, setOptions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [kind, setKind] = useState("");
  const [quoteId, setQuoteId] = useState(quotationId);
  const [deals, setDeals] = useState([]);
  const [pickedDeal, setPickedDeal] = useState(dealId);
  const dealPicker = !dealId;
  const activeDeal = dealId || pickedDeal;

  // โหมดเลือกดีล: โหลดรายการดีลที่ออกสัญญาได้ก่อน แล้วเลือกใบแรกให้ (ไม่ใช่ปล่อยว่าง)
  useEffect(() => {
    if (!open || !dealPicker) return undefined;
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/sales-planning/contracts/options");
        const data = await res.json().catch(() => ({}));
        if (!alive) return;
        const list = data?.deals || [];
        setDeals(list);
        setPickedDeal((current) => current || list[0]?.id || "");
      } catch {
        if (alive) setDeals([]);
      }
    })();
    return () => { alive = false; };
  }, [open, dealPicker]);

  // ปิดโมดัลแล้วต้องกลับไปเริ่มใหม่ — ไม่งั้นเปิดรอบหน้าได้ค่าค้างของดีลเดิม
  useEffect(() => {
    if (open) return;
    setPickedDeal(dealId);
    setKind("");
    setQuoteId(quotationId);
    setOptions(null);
  }, [open, dealId, quotationId]);

  useEffect(() => {
    if (!open || !activeDeal) return undefined;
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/sales-planning/contracts/options?dealId=${encodeURIComponent(activeDeal)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "โหลดตัวเลือกสัญญาไม่สำเร็จ");
        if (!alive) return;
        setOptions(data);
        setError(data.ok ? "" : data.reason || "");
        setKind("");
        // มีชนิดเดียวที่ออกได้ = เลือกให้เลย (ไม่ใช่การเดา — มันคือตัวเลือกเดียวจริง ๆ)
        const ready = (data.kinds || []).filter((item) => item.ready);
        if (ready.length === 1) setKind(ready[0].kind);
        if (!quotationId && data.quotations?.length) setQuoteId(data.quotations[0].id);
      } catch (err) {
        if (alive) setError(err.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [open, activeDeal, quotationId]);

  const create = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/sales-planning/contracts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dealId: activeDeal, kind, quotationId: quoteId || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "สร้างร่างสัญญาไม่สำเร็จ");
      notifyToast.success("สร้างร่างสัญญาแล้ว — กรอกรายละเอียดแล้วกดออกสัญญา");
      onCreated?.(data);
      onClose?.();
      router.push(`/sa/contracts/${data.id}`);
    } catch (err) {
      notifyToast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const kinds = options?.kinds || [];
  const blocked = !!options && !options.ok;
  const chosen = kinds.find((item) => item.kind === kind);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={dealPicker ? "สร้างสัญญา" : "ออกสัญญาจากดีลนี้"}
      subtitle="สัญญาออกได้หลังใบเสนอราคาของดีลผ่านการอนุมัติแล้ว"
      footer={(
        <div className="form-actions-buttons">
          <Button onClick={onClose} disabled={busy}>ปิด</Button>
          <Button
            variant="accent"
            onClick={create}
            disabled={busy || loading || blocked || !activeDeal || !kind || !chosen?.ready}
          >
            สร้างร่างสัญญา
          </Button>
        </div>
      )}
    >
      {dealPicker && (
        <div className="form-grid">
          <label className="form-field span-2">
            <span className="form-field-label">ดีล <span className="required-mark">*</span></span>
            {/* ดีลมีเป็นร้อยใบ ⇒ ต้องค้นได้ · ดีลเก่าหลายใบไม่มีรหัส ห้ามพิมพ์ "null" นำหน้า */}
            <SearchableSelect
              ariaLabel="ดีลที่จะออกสัญญา"
              value={pickedDeal}
              onChange={setPickedDeal}
              disabled={busy || !deals.length}
              searchPlaceholder="ค้นหาดีล / ลูกค้า"
              options={deals.map((deal) => ({
                value: deal.id,
                label: [deal.code, deal.title, deal.customerName].filter(Boolean).join(" · "),
              }))}
            />
            {/* ลิสต์ว่าง = ยังไม่มีดีลไหนผ่านด่าน ไม่ใช่จอพัง ⇒ ต้องบอกเป็นตัวหนังสือ */}
            <span className="hint">
              {deals.length
                ? "แสดงเฉพาะดีลที่มีใบเสนอราคาอนุมัติแล้วและยังออกสัญญาได้"
                : "ยังไม่มีดีลที่ออกสัญญาได้ — ต้องมีใบเสนอราคาที่อนุมัติแล้วก่อน"}
            </span>
          </label>
        </div>
      )}

      {loading && <p className="hint">กำลังโหลด…</p>}

      {/* เหตุผลที่ออกไม่ได้ต้องเป็นตัวหนังสือบนจอ ไม่ใช่ปุ่มจางที่ไม่บอกอะไร */}
      {(error || blocked) && (
        <StatusNotice tone="warning" title="ยังออกสัญญาจากดีลนี้ไม่ได้">{error || options?.reason}</StatusNotice>
      )}

      {!loading && !blocked && (
        <div className="form-grid">
          <div className="form-field span-2">
            <span className="form-field-label">ชนิดสัญญา <span className="required-mark">*</span></span>
            <OptionTiles
              ariaLabel="ชนิดสัญญา"
              value={kind}
              onChange={setKind}
              disabled={busy}
              options={kinds.map((item) => ({
                value: item.kind,
                label: item.label,
                description: item.ready ? null : item.note,
                disabled: !item.ready,
              }))}
            />
            {!kinds.length && <span className="hint">ดีลนี้ยังไม่มีชนิดสัญญาที่ออกได้</span>}
          </div>

          <label className="form-field span-2">
            <span className="form-field-label">ใบเสนอราคาที่อ้างถึง <span className="required-mark">*</span></span>
            <Select
              value={quoteId}
              onChange={(event) => setQuoteId(event.target.value)}
              disabled={busy}
              options={(options?.quotations || []).map((quote) => ({
                value: quote.id,
                label: `${quote.quoteNumber} · ${fmtMoney(quote.totalAmount)} บาท · ${fmtDate(quote.createdAt)}`,
              }))}
            />
            <span className="hint">แสดงเฉพาะใบที่อนุมัติแล้วและยังมีผล</span>
          </label>
        </div>
      )}
    </Modal>
  );
}
