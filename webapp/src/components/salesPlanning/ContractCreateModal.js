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
//    มี `dealId` = เปิดจากในดีล/ใบเสนอราคา (ดีลถูกกำหนดมาแล้ว) ·
//    ไม่มี = เปิดจากหัวทะเบียน แล้วถามเรียง **ลูกค้า → ชนิดสัญญา → ดีล**
//
// ⭐ **ลำดับคำถามคือมติผู้ใช้ 2026-08-22 รอบสอง** — เดิมถามดีลก่อนแล้วเลือกดีลแรกให้เอง
//    ตั้งแต่เปิดโมดัล ซึ่งผิดสองชั้น: คนเริ่มจาก *ลูกค้า* ไม่ใช่ดีล และการเลือกให้ล่วงหน้า
//    ทำให้ฟอร์มกระโดด (โหลดตัวเลือกของดีลที่ไม่มีใครเลือก แล้วชนิด/ใบเสนอราคาเด้งตาม)
//    ⇒ ไม่มีค่าตั้งต้นให้ช่องไหนอีก · ทุกช่องอยู่ครบตั้งแต่เปิด แค่ยังกดไม่ได้จนกว่าจะถึงคิว
//      (ช่องโผล่ทีหลังคือความสูงที่เปลี่ยนใต้มือคน = อาการ "ดีดเด้ง" ที่ถูกร้องมา)
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import StatusNotice from "@/components/ui/StatusNotice";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import OptionTiles from "@/components/ui/OptionTiles";
import FormZone from "@/components/ui/FormZone";
import SearchableSelect from "@/components/ui/SearchableSelect";
import Select from "@/components/ui/Select";
import { fmtDate, fmtMoney } from "@/lib/format";
import { notifyToast } from "@/lib/feedback";
import {
  CONTRACT_KINDS, CONTRACT_KIND_LABELS, EXTERNAL_DOC_KINDS, EXTERNAL_DOC_KIND_LABELS,
} from "@/lib/sales/contracts";
import { hasContractTemplate, MISSING_TEMPLATE_NOTE } from "@/lib/sales/contractTemplates";
import { apiFetch } from "@/lib/apiFetch";

// โทนเดียวกับป้ายชนิดสัญญาในตาราง — ป้ายกดกับป้ายอ่านต้องเป็นสีเดียวกัน
const KIND_TONE = { scent_design: "amber", manufacturing: "blue", service: "teal" };

export default function ContractCreateModal({
  open,
  dealId = "",
  quotationId = "",
  // จำกัดตัวเลือกดีลไว้ที่ชุดนี้ (หน้าโครงการส่ง id ของดีลในโครงการมา) — null = ไม่จำกัด
  dealIds = null,
  onClose,
  onCreated,
}) {
  const router = useRouter();
  const [options, setOptions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [kind, setKind] = useState("");
  /* ที่มาของสัญญา (mig 0322 · มติผู้ใช้ 2026-08-30) — ค่าตั้งต้นคือเส้นเดิมเสมอ
     ⚠️ อย่าเดาให้เป็น external แม้ชนิดนั้นจะไม่มีแม่แบบ: "ใช้เอกสารอื่นแทนสัญญา"
     เป็นการตัดสินใจของคน ไม่ใช่ทางหนีที่ระบบเลือกให้เพราะของขาด */
  const [source, setSource] = useState("generated");
  const [externalDocKind, setExternalDocKind] = useState("");
  const [externalRef, setExternalRef] = useState("");
  const [quoteId, setQuoteId] = useState(quotationId);
  const [deals, setDeals] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [pickedDeal, setPickedDeal] = useState(dealId);
  const dealPicker = !dealId;
  const activeDeal = dealId || pickedDeal;

  // โหมดเลือกเอง: โหลดดีลที่ออกสัญญาได้ทั้งหมดครั้งเดียว แล้วกรองในจอ
  // (ลูกค้ากับชนิดสัญญาเป็นสองด่านของชุดเดียวกัน ยิงถามฐานทุกครั้งที่เปลี่ยนคือรอเปล่า)
  useEffect(() => {
    if (!open || !dealPicker) return undefined;
    let alive = true;
    (async () => {
      try {
        const res = await apiFetch("/api/sales-planning/contracts/options");
        const data = await res.json().catch(() => ({}));
        /* ⚠️ `dealIds` = ขอบเขตของ *ที่ที่กดมา* ไม่ใช่ด่านสิทธิ์ — เปิดจากหน้าโครงการ
           ต้องเห็นเฉพาะดีลของโครงการนั้น · ด่านจริง (`contractEligibility`) ยังกรอง
           มาจาก server เหมือนเดิม ที่นี่แค่ตัดของที่ไม่เกี่ยวกับหน้าที่ผู้ใช้ยืนอยู่ */
        const rows = data?.deals || [];
        if (alive) setDeals(dealIds ? rows.filter((row) => dealIds.includes(row.id)) : rows);
      } catch {
        if (alive) setDeals([]);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dealPicker, dealIds?.join(",")]);

  // ปิดโมดัลแล้วต้องกลับไปเริ่มใหม่ — ไม่งั้นเปิดรอบหน้าได้ค่าค้างของรอบก่อน
  useEffect(() => {
    if (open) return;
    setCustomerId("");
    setPickedDeal(dealId);
    setKind("");
    setQuoteId(quotationId);
    setOptions(null);
    setError("");
  }, [open, dealId, quotationId]);

  /* ตัวเลือกของดีลที่เลือกอยู่ — ใช้ทั้งสองโหมด
     โหมดเลือกเอง: ชนิดสัญญาถูกเลือกไปก่อนหน้าแล้ว ที่ต้องการจากรอบนี้คือ *ใบเสนอราคา*
     โหมดในดีล: ชนิดสัญญามาจากรอบนี้ (ดีลถูกกำหนดมาตั้งแต่ต้น) */
  useEffect(() => {
    if (!open || !activeDeal) return undefined;
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const res = await apiFetch(`/api/sales-planning/contracts/options?dealId=${encodeURIComponent(activeDeal)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "โหลดตัวเลือกสัญญาไม่สำเร็จ");
        if (!alive) return;
        setOptions(data);
        setError(data.ok ? "" : data.reason || "");
        if (!dealPicker) {
          // มีชนิดเดียวที่ออกได้ = เลือกให้เลย (ไม่ใช่การเดา — มันคือตัวเลือกเดียวจริง ๆ)
          const ready = (data.kinds || []).filter((item) => item.ready);
          setKind(ready.length === 1 ? ready[0].kind : "");
        }
        setQuoteId(quotationId || data.quotations?.[0]?.id || "");
      } catch (err) {
        if (alive) setError(err.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [open, activeDeal, quotationId, dealPicker]);

  // ลูกค้าที่มีดีลออกสัญญาได้ — เรียงตามชื่อ เพราะคนหาจากชื่อ ไม่ใช่จากรหัส
  const customers = useMemo(() => {
    const map = new Map();
    for (const deal of deals) {
      const key = deal.customerId || deal.customerName;
      if (!key || map.has(key)) continue;
      map.set(key, { value: key, label: deal.customerName || "ไม่ระบุลูกค้า" });
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, "th"));
  }, [deals]);

  const dealsOfCustomer = useMemo(
    () => deals.filter((deal) => (deal.customerId || deal.customerName) === customerId),
    [deals, customerId],
  );
  // ดีลที่ตอบได้ทั้ง "ลูกค้ารายนี้" และ "สัญญาชนิดนี้"
  const dealChoices = useMemo(
    () => dealsOfCustomer.filter((deal) => !kind || (deal.kinds || []).includes(kind)),
    [dealsOfCustomer, kind],
  );

  /* เลือกลูกค้า/ชนิดใหม่แล้วดีลเดิมต้องหลุด — ไม่งั้นค่าที่ค้างอยู่จะขัดกับตัวกรองที่เห็น
     (และปุ่มสร้างจะกดได้ทั้งที่ดีลนั้นไม่อยู่ในลิสต์แล้ว) */
  useEffect(() => {
    if (!dealPicker || !pickedDeal) return;
    if (!dealChoices.some((deal) => deal.id === pickedDeal)) setPickedDeal("");
  }, [dealPicker, pickedDeal, dealChoices]);

  const create = async () => {
    setBusy(true);
    try {
      const res = await apiFetch("/api/sales-planning/contracts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dealId: activeDeal, kind, quotationId: quoteId || undefined,
          source,
          ...(source === "external"
            ? { externalDocKind, externalRef: externalRef.trim() || undefined }
            : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "สร้างร่างสัญญาไม่สำเร็จ");
      notifyToast.success(source === "external"
        ? "สร้างร่างแล้ว — แนบไฟล์เอกสารแล้วให้ AE Supervisor อนุมัติ"
        : "สร้างร่างสัญญาแล้ว — กรอกรายละเอียดแล้วกดออกสัญญา");
      onCreated?.(data);
      onClose?.();
      router.push(`/sa/contracts/${data.id}`);
    } catch (err) {
      notifyToast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const dealKinds = options?.kinds || [];
  const blocked = !dealPicker && !!options && !options.ok;
  const external = source === "external";
  /* ⭐ **สาย external ไม่ผ่านด่านแม่แบบ** — เหตุผลทั้งหมดที่มันมีอยู่คือใบที่ไม่มีแม่แบบ
     ให้เจน (สัญญาบริการยังไม่มีต้นฉบับ) ถ้ายังบังคับ `hasContractTemplate` ทางนี้ก็ตัน
     เหมือนเดิม · ด่านที่เหลือ (ดีล/ใบเสนอราคาอนุมัติแล้ว) ยังต้องผ่านครบเหมือนกัน */
  const chosenReady = external
    ? !!kind && EXTERNAL_DOC_KINDS.includes(externalDocKind)
    : dealPicker
      ? hasContractTemplate(kind)
      : dealKinds.find((item) => item.kind === kind)?.ready;

  /* ป้ายกดสามป้ายเสมอในโหมดเลือกเอง (มติผู้ใช้: "สัญญาเป็นป้ายกดสามป้ายก็ได้")
     ⚠️ ชนิดที่ลูกค้ารายนี้ไม่มีดีลรองรับ **ยังต้องเห็น** แต่กดไม่ได้พร้อมเหตุผล —
        ซ่อนทิ้งแล้วคนจะไม่รู้ว่ามันมีอยู่ และไม่รู้ว่าต้องไปทำอะไรมาก่อน */
  /* ⚠️ **ทุกแผ่นต้องมีคำอธิบายเสมอ ห้ามปล่อย null** — แผ่นในกริดเดียวกันสูงเท่ากัน
     (`grid-auto-rows: 1fr`) แต่ถ้าแผ่นหนึ่งไม่มีบรรทัดคำอธิบาย ป้ายชื่อของมันจะลอย
     อยู่คนละระดับกับเพื่อน (ผู้ใช้ทักจากจอจริง 2026-08-31: แผ่นที่กดได้ป้ายลอยกลาง
     ขณะที่แผ่นเทาป้ายชิดบน) · กติกาเดียวกับที่ `.option-groups` จองไว้สองบรรทัด
     ⚠️ เหตุผลบนแผ่นเทาต้อง **สั้นและต่างกัน** — ของเดิมยาวเท่ากันสองแผ่นจนอ่านเหมือน
     สาเหตุเดียวกัน ทั้งที่ "ไม่มีต้นฉบับ" กับ "ไม่มีดีล" แก้คนละทาง */
  const kindTiles = dealPicker
    ? CONTRACT_KINDS.map((item) => {
      const usable = dealsOfCustomer.filter((deal) => (deal.kinds || []).includes(item)).length;
      /* ความพร้อมของแม่แบบเป็นเรื่องของ **ที่มา** ที่เลือกไว้ข้างบน ไม่ใช่ของชนิดสัญญา
         ⇒ สาย external ข้ามด่านนี้ · สายเจนยังต้องมีต้นฉบับเหมือนเดิม */
      const needsTemplate = !external && !hasContractTemplate(item);
      return {
        value: item,
        label: CONTRACT_KIND_LABELS[item],
        tone: KIND_TONE[item],
        disabled: !customerId || !usable || needsTemplate,
        description: needsTemplate
          ? "ยังไม่มีต้นฉบับในระบบ — เลือกที่มาเป็นเอกสารภายนอกแทนได้"
          : !customerId
            ? "เลือกลูกค้าก่อน"
            : usable
              ? `${usable} ดีลของลูกค้ารายนี้รองรับ`
              : "ลูกค้ารายนี้ไม่มีดีลที่รองรับ",
      };
    })
    : dealKinds.map((item) => ({
      value: item.kind,
      label: item.label,
      tone: KIND_TONE[item.kind],
      // สาย external: เหตุที่ "ยังไม่พร้อม" ของฝั่ง server คือเรื่องแม่แบบ ซึ่งไม่เกี่ยว
      description: external
        ? "ใช้เอกสารภายนอกแทนได้"
        : (item.ready ? "ออกจากแม่แบบได้" : item.note),
      disabled: external ? false : !item.ready,
    }));

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
            disabled={busy || loading || blocked || !activeDeal || !kind || !chosenReady || !quoteId}
          >
            สร้างร่างสัญญา
          </Button>
        </div>
      )}
    >
      {/* เหตุผลที่ออกไม่ได้ต้องเป็นตัวหนังสือบนจอ ไม่ใช่ปุ่มจางที่ไม่บอกอะไร */}
      {(error || blocked) && (
        <StatusNotice tone="warning" title="ยังออกสัญญาจากดีลนี้ไม่ได้">{error || options?.reason}</StatusNotice>
      )}

      {/* ── สามโซนตามลำดับที่คนคิด (docs/form-design-rules §1) ────────────────
          "ออกให้ใคร" → "สัญญาอะไร มาจากไหน" → "อ้างอิงจากงานไหน"
          ⚠️ โซนขึ้นเฉพาะโหมดเลือกเอง — เปิดจากในดีลเหลือ 2–3 ช่อง การใส่หัวโซน
             ให้ของที่มีช่องเดียวใต้หัวคือพิธีที่ไม่ช่วยอะไร (กติกาใน `ui/FormZone`)
          ⚠️ **คอลัมน์เดียวโดยตั้งใจ ห้ามยัด `.cols-2`** — กติกาทั่วไปคือฟอร์มไม่ควร
             เต็มแถวทุกช่อง (docs/form-design-rules §5) แต่ที่นี่ทุกช่องเป็นตัวเลือกที่
             **ป้ายยาวจริง** · วัดบนจอ 2026-08-31: โมดัลกว้าง 560px ⇒ สองคอลัมน์เหลือ
             ที่ให้ข้อความ 243px ขณะที่ป้ายดีลจริงต้องการ 450px และป้ายใบเสนอราคา 289px
             ⇒ จับคู่เมื่อไรได้ "DL-26080386 · SV_บริษัท สยาม…" ตัดกลางทั้งสองช่อง
             ซึ่งแย่กว่าฟอร์มยาว · สิ่งที่ทำให้ฟอร์มสั้นลงจริงคือหัวโซนกับคำอธิบายที่สั้นลง */}
      <div className="form-grid">
        {dealPicker && <FormZone title="ออกสัญญาให้ใคร" className="col-span-2" />}
        {dealPicker && (
          <label className="form-field span-2">
            <span className="form-field-label">ลูกค้า <span className="required-mark">*</span></span>
            {/* ลูกค้ามีเป็นร้อยราย ⇒ ช่องค้นหา ไม่ใช่ดรอปดาวน์ยาว */}
            <SearchableSelect
              ariaLabel="ลูกค้าที่จะออกสัญญาให้"
              value={customerId}
              onChange={setCustomerId}
              disabled={busy || !customers.length}
              placeholder="เลือกลูกค้า"
              searchPlaceholder="ค้นหาลูกค้า"
              options={customers}
            />
            {/* ลิสต์ว่าง = ยังไม่มีดีลไหนผ่านด่าน ไม่ใช่จอพัง ⇒ ต้องบอกเป็นตัวหนังสือ */}
            <span className="hint">
              {customers.length
                ? "แสดงเฉพาะลูกค้าที่มีดีลซึ่งใบเสนอราคาอนุมัติแล้ว"
                : "ยังไม่มีลูกค้าที่ออกสัญญาได้ — ต้องมีใบเสนอราคาที่อนุมัติแล้วก่อน"}
            </span>
          </label>
        )}

        {dealPicker && <FormZone title="สัญญาอะไร มาจากไหน" className="col-span-2" />}

        {/* ── ที่มาของสัญญา — ถามก่อนชนิด (มติผู้ใช้ 2026-08-30) ────────────────
            ⭐ เป็น "ตัวกำหนดบริบท" ตาม docs/form-design-rules §1 ข้อ 1: คำตอบ
              เปลี่ยน **ชุดตัวเลือก** ของชนิดสัญญาข้างล่าง (เจนต้องมีแม่แบบ ·
              เอกสารภายนอกไม่ต้อง) ⇒ ต้องถามก่อน ไม่ใช่ถามทีหลังแล้วชนิดเด้ง
            ⚠️ สองตัวเลือก = ป้ายกด ไม่ใช่ดรอปดาวน์ */}
        <div className="form-field span-2">
          <span className="form-field-label">ที่มาของสัญญา <span className="required-mark">*</span></span>
          <OptionTiles
            ariaLabel="ที่มาของสัญญา"
            value={source}
            onChange={setSource}
            disabled={busy}
            options={[
              {
                value: "generated",
                label: "ระบบเจนจากแม่แบบ",
                tone: "blue",
                description: "ออกเลขแล้วพิมพ์ไปเซ็น — เส้นทางปกติ",
              },
              {
                value: "external",
                label: "เอกสารภายนอกใช้แทนสัญญา",
                tone: "amber",
                description: "PO · อีเมล · สัญญากระดาษเก่า — ต้องผ่าน AE Supervisor",
              },
            ]}
          />
        </div>

        <div className="form-field span-2">
          <span className="form-field-label">ชนิดสัญญา <span className="required-mark">*</span></span>
          <OptionTiles
            ariaLabel="ชนิดสัญญา"
            value={kind}
            onChange={setKind}
            disabled={busy}
            options={kindTiles}
          />
          {!dealPicker && !dealKinds.length && !loading
            ? <span className="hint">ดีลนี้ยังไม่มีชนิดสัญญาที่ออกได้</span>
            : null}
        </div>

        {/* ⚠️ **บล็อกนี้อยู่ใต้ "ชนิดสัญญา" โดยตั้งใจ ไม่ใช่ใต้ "ที่มา" ทันที** —
            กติกาคือช่องที่โผล่ตามเงื่อนไขต้องอยู่ใต้ตัวที่ทำให้มันโผล่ (§1 ข้อ 3)
            ซึ่งยังจริงอยู่ · แต่ถ้าแทรกคั่นกลางระหว่างสองคำถามที่คนอ่านคู่กัน
            (ที่มา ↔ ชนิด) การกดสลับที่มาจะดันแผ่นชนิดสัญญาลงไป ~200px ใต้มือ
            คนที่กำลังจะจิ้มต่อ — อาการ "ฟอร์มเปลี่ยนรูปใต้มือ" ที่หัวไฟล์เตือนไว้เอง */}
        {external && (
          <>
            <div className="form-field span-2">
              <span className="form-field-label">ใช้เอกสารอะไรแทน <span className="required-mark">*</span></span>
              <OptionTiles
                ariaLabel="ชนิดเอกสารที่ใช้แทนสัญญา"
                value={externalDocKind}
                onChange={setExternalDocKind}
                disabled={busy}
                options={EXTERNAL_DOC_KINDS.map((item) => ({
                  value: item,
                  label: EXTERNAL_DOC_KIND_LABELS[item],
                }))}
              />
            </div>
            <label className="form-field span-2">
              <span className="form-field-label">เลขที่/หัวข้ออ้างอิง</span>
              <Input
                value={externalRef}
                onChange={(e) => setExternalRef(e.target.value)}
                disabled={busy}
                maxLength={200}
                autoComplete="off"
                placeholder="เช่น PO-2569-0142 หรือหัวข้ออีเมลที่ลูกค้ายืนยัน"
              />
              <span className="hint">ตัวไฟล์แนบทีหลังที่หน้าสัญญา — ยังไม่ต้องมีตอนนี้</span>
            </label>
          </>
        )}

        {dealPicker && <FormZone title="อ้างอิงจากงานไหน" className="col-span-2" />}

        {dealPicker && (
          <label className="form-field span-2">
            <span className="form-field-label">ดีล <span className="required-mark">*</span></span>
            {/* ดีลเก่าหลายใบไม่มีรหัส ⇒ ประกอบป้ายจากค่าที่มีจริง ห้ามพิมพ์ "null" นำหน้า */}
            <SearchableSelect
              ariaLabel="ดีลที่จะออกสัญญา"
              value={pickedDeal}
              onChange={setPickedDeal}
              disabled={busy || !customerId || !kind || !dealChoices.length}
              placeholder="เลือกดีล"
              searchPlaceholder="ค้นหาดีล"
              options={dealChoices.map((deal) => ({
                value: deal.id,
                label: [deal.code, deal.title].filter(Boolean).join(" · "),
              }))}
            />
            <span className="hint">
              {!customerId || !kind
                ? "เลือกลูกค้าและชนิดสัญญาก่อน"
                : dealChoices.length
                  ? `${dealChoices.length} ดีลที่ออกสัญญาชนิดนี้ได้`
                  : "ไม่มีดีลที่ออกสัญญาชนิดนี้ได้"}
            </span>
          </label>
        )}

        <label className="form-field span-2">
          <span className="form-field-label">ใบเสนอราคาที่อ้างถึง <span className="required-mark">*</span></span>
          <Select
            value={quoteId}
            onChange={(event) => setQuoteId(event.target.value)}
            disabled={busy || !activeDeal || loading}
            options={(options?.quotations || []).map((quote) => ({
              value: quote.id,
              label: `${quote.quoteNumber} · ${fmtMoney(quote.totalAmount)} บาท · ${fmtDate(quote.createdAt)}`,
            }))}
          />
          <span className="hint">
            {loading
              ? "กำลังโหลดใบเสนอราคาของดีลนี้…"
              : activeDeal
                ? "แสดงเฉพาะใบที่อนุมัติแล้วและยังมีผล"
                : "เลือกดีลก่อน"}
          </span>
        </label>
      </div>
    </Modal>
  );
}
