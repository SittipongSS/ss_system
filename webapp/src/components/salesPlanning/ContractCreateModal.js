"use client";
// ── โมดัล "ออกสัญญา" — เปิดจากหน้าดีลและหน้าใบเสนอราคา ───────────────────────
//
// ⭐ **สองขั้นโดยตั้งใจ** (docs/form-design-rules §1.5): ที่นี่ถามแค่ *ออกสัญญาอะไร
//    จากใบไหน* แล้วสร้างร่าง จากนั้นพาไปกรอกรายละเอียดที่หน้าสัญญา — เพราะชุดช่องกรอก
//    เปลี่ยนทั้งชุดตามชนิดสัญญา (มาจากแม่แบบ) การกางฟอร์มไว้ก่อนเลือกชนิดคือฟอร์มที่
//    เปลี่ยนรูปใต้มือคนกรอก
//
// ⚠️ ตัวเลือกและเหตุผลที่ออกไม่ได้ มาจาก `/api/sales-planning/contracts/options`
//    ซึ่งเรียกด่านตัวเดียวกับที่ API ใช้ปฏิเสธจริง — ห้ามคิดเงื่อนไขเองที่นี่
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import StatusNotice from "@/components/ui/StatusNotice";
import Button from "@/components/ui/Button";
import OptionTiles from "@/components/ui/OptionTiles";
import Select from "@/components/ui/Select";
import { fmtDate, fmtMoney } from "@/lib/format";
import { notifyToast } from "@/lib/feedback";

export default function ContractCreateModal({ open, dealId, quotationId = "", onClose, onCreated }) {
  const router = useRouter();
  const [options, setOptions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [kind, setKind] = useState("");
  const [quoteId, setQuoteId] = useState(quotationId);

  useEffect(() => {
    if (!open || !dealId) return undefined;
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/sales-planning/contracts/options?dealId=${encodeURIComponent(dealId)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "โหลดตัวเลือกสัญญาไม่สำเร็จ");
        if (!alive) return;
        setOptions(data);
        setError(data.ok ? "" : data.reason || "");
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
  }, [open, dealId, quotationId]);

  const create = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/sales-planning/contracts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dealId, kind, quotationId: quoteId || undefined }),
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
      title="ออกสัญญาจากดีลนี้"
      subtitle="สัญญาออกได้หลังใบเสนอราคาของดีลผ่านการอนุมัติแล้ว"
      footer={(
        <div className="form-actions-buttons">
          <Button onClick={onClose} disabled={busy}>ปิด</Button>
          <Button
            variant="accent"
            onClick={create}
            disabled={busy || loading || blocked || !kind || !chosen?.ready}
          >
            สร้างร่างสัญญา
          </Button>
        </div>
      )}
    >
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
