"use client";

// หน้าสร้างใบเสนอราคา (เต็มหน้า, ไม่มี modal — มติผู้ใช้ Q2): เลือกลูกค้า → ดีล
// (โครงการมาจากดีลเอง ไม่ใช่ขั้นที่ต้องกรอก — มติผู้ใช้ 2026-08-06 ยุบเป็น DealPicker
// ตัวกลางสองชั้น) แล้วดึงข้อมูลลูกค้ามาแสดง "อ่านอย่างเดียว"
// (แก้ที่ฐานข้อมูลลูกค้าเท่านั้น) → กดสร้าง → ออกใบ (snapshot ฝั่ง server) → ไปหน้าแก้ไข
// เพื่อเพิ่มรายการ/ส่วนลด/VAT/งวดชำระ. ใช้ component กลางเท่านั้น.
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, CalendarDays, CircleDollarSign, ExternalLink, FileText, Package, Plus, UserRound } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import { DetailPageLayout } from "@/components/ui/DetailPage";
import { DocumentControlCard, DocumentReadinessList, DocumentSummaryCard } from "@/components/ui/DocumentControlPanel";
import SearchableSelect from "@/components/ui/SearchableSelect";
import DealPicker from "@/components/pm/DealPicker";
import Select from "@/components/ui/Select";
import DateInput from "@/components/ui/DateInput";
import Input from "@/components/ui/Input";
import SalesDetailOverview, { DetailStateBadge as SalesStateBadge } from "@/components/ui/DetailOverview";
import QuotationInstallments from "@/components/salesPlanning/QuotationInstallments";
import QuotationPaymentTerms from "@/components/salesPlanning/QuotationPaymentTerms";
import QuotationNotes from "@/components/salesPlanning/QuotationNotes";
import QuotationLineItems, { newManualLine, newProductLine } from "@/components/salesPlanning/QuotationLineItems";
import { customerSelectOptions } from "@/components/master/customerOption";
import { useCan } from "@/lib/roleContext";
import { DEAL_TYPE_LABELS, dealTypeOf, quoteTotals } from "@/lib/salesPlanning";
import { fmtDate, fmtMoney, naText, NA } from "@/lib/format";
import {
  addressLabel, customerAddresses, isBillingAddress, isShippingAddress, pickDocumentAddresses,
} from "@/lib/master/addresses";
import { branchValue } from "@/lib/master/thaiAddress";
import { businessDate } from "@/lib/businessDate";
import { addValidityDays, validityDaysBetween } from "@/lib/sales/quoteValidity";
import { validatePaymentPlan } from "@/lib/sales/paymentPlan";
import { blockedQuotationCustomers, eligibleQuotationDeals, unassignedQuotationDeals } from "@/lib/sales/quotationSourcePicker";
import { dealAwaitsCustomer, dealCustomerAdoptNote, isQuotableCustomer } from "@/lib/sales/dealCustomerAdopt";
import { cachedFetchJson } from "@/lib/apiCache";
import styles from "./page.module.css";
import SkeletonRows from "@/components/ui/Skeleton";

function NewQuotationInner() {
  const router = useRouter();
  const params = useSearchParams();
  const canEdit = useCan("salesplan:edit");

  /* ⭐ **กลับไปที่เดิมเมื่อยกเลิก** — แพตเทิร์นเดียวกับ `/requests/new` และปุ่มบรีฟกลิ่น
     บนหน้าใบสั่งขาย (`salesOrderWorkTrack`: "กลับมาที่ใบเดิม ไม่ใช่โยนไปหน้าคิวรวม")
     🐞 เดิมทั้งปุ่มยกเลิกและปุ่มกลับ hardcode `/sa/quotations` ⇒ คนที่กด "สร้างใบเสนอราคา"
     จากหน้าดีลแล้วเปลี่ยนใจ ไปโผล่คิวใบเสนอราคา ต้องไล่หาดีลเดิมกลับเอง
     ⚠️ ค่าที่ไม่ใช่เส้นทางภายในถูกทิ้ง — open redirect จากโดเมนของเราเองคือของจริงที่
     เคยหลุดมาแล้ว (ด่านตัวเดียวกับ `/requests/new`) */
  const backRaw = params.get("returnTo");
  const returnTo = backRaw && backRaw.startsWith("/") && !backRaw.startsWith("//") ? backRaw : "/sa/quotations";
  const returnLabel = returnTo === "/sa/quotations" ? "กลับหน้าใบเสนอราคา" : "กลับ";

  const [deals, setDeals] = useState([]);
  const [projectsById, setProjectsById] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [customerId, setCustomerId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [dealId, setDealId] = useState("");

  const [customer, setCustomer] = useState(null); // snapshot preview (read-only)
  /* ⭐ ทุกช่องในบล็อก "ข้อมูลลูกค้าในเอกสาร" เริ่มที่ **ยังไม่เลือก** (มติผู้ใช้ 2026-08-27)
     ค่าตั้งต้นที่ระบบเดาให้ = คนทำใบผ่านตาไปโดยไม่ได้อ่าน แล้วใบออกไปผิดคนผิดที่
     "" = ยังไม่เลือก (ไม่ใช่ 0 ซึ่งเป็นผู้ติดต่อคนแรกที่ใช้ได้จริง) */
  const [contactIndex, setContactIndex] = useState("");
  // ที่อยู่ที่ใบนี้จะใช้ (0202/0203) — ตั้งต้นเป็นที่อยู่หลักของลูกค้าตอนโหลด snapshot
  const [billingAddressId, setBillingAddressId] = useState("");
  const [shippingAddressId, setShippingAddressId] = useState("");
  const [creating, setCreating] = useState(false);
  const [prefilled, setPrefilled] = useState(false);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]); // ใช้ตอบเหตุผลเท่านั้น ไม่ใช่ตัวเลือกในลิสต์
  const [registryCustomers, setRegistryCustomers] = useState([]); // ทะเบียนทั้งหมด — ตอบเหตุ "ไม่โผล่ในลิสต์เลย"
  const [lines, setLines] = useState([]);
  const [quoteDate, setQuoteDate] = useState(() => businessDate());
  const [validityDays, setValidityDays] = useState(30);
  const [validUntil, setValidUntil] = useState(() => addValidityDays(businessDate(), 30));
  const [discountType, setDiscountType] = useState("");
  const [discountValue, setDiscountValue] = useState(0);
  const [vatRate, setVatRate] = useState(7);
  const [payment, setPayment] = useState({ type: "full", paymentMethod: "", paymentTerms: "", installments: [] });
  const [notes, setNotes] = useState("");
  const [notesPresetVersionId, setNotesPresetVersionId] = useState(null);
  // เอกสารอ้างอิง (mig 0267) — ข้อความอิสระ ไม่ผูกกับเอกสารจริงในระบบ (มติผู้ใช้)
  const [referenceNote, setReferenceNote] = useState("");

  // โหลดดีล + โครงการ (ดึงรหัสโครงการมาโชว์ในตัวเลือก) + ทะเบียนลูกค้าไว้ตอบว่า
  // "ลูกค้าที่ค้นมีในทะเบียนแต่ออกใบไม่ได้เพราะอะไร" (ลิสต์นี้กรองทีมอยู่แล้วตามกติกา)
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [dRes, pRes, customerData, registryData] = await Promise.all([
          fetch("/api/sales-planning/deals").catch(() => null),
          fetch("/api/pm/projects").catch(() => null),
          cachedFetchJson("/api/customers").catch(() => []),
          // ทะเบียนทั้งหมด — ใช้ตอบ "ทำไมลูกค้ารายนี้ไม่โผล่ในลิสต์เลย" เท่านั้น
          // (รออนุมัติ/พักใช้/ทีมอื่นดูแล) **ห้ามใช้เป็นตัวเลือกให้เลือก**
          cachedFetchJson("/api/customers?manage=1").catch(() => []),
        ]);
        const dealsData = dRes?.ok ? await dRes.json() : [];
        const projData = pRes?.ok ? await pRes.json() : [];
        if (!alive) return;
        setDeals(Array.isArray(dealsData) ? dealsData : []);
        const map = {};
        (Array.isArray(projData) ? projData : []).forEach((p) => { map[p.id] = p; });
        setProjectsById(map);
        setCustomers(Array.isArray(customerData) ? customerData : []);
        setRegistryCustomers(Array.isArray(registryData) ? registryData : []);
      } catch (e) {
        if (alive) setError(e.message || "โหลดข้อมูลไม่สำเร็จ");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // FG ของ **ลูกค้าที่เลือก** เท่านั้น (มติผู้ใช้ 2026-08-17) — เดิมดึงทั้งทะเบียน
  // แล้วดรอปดาวน์โชว์สินค้าของลูกค้าทุกราย หยิบข้ามรายได้เงียบ ๆ
  // ?customerId= ตั้งใจข้าม team scope ฝั่ง API (FG ของลูกค้ารายนี้อาจถูกขึ้นทะเบียน
  // โดยทีมอื่น) — ด่านอนุมัติ/พักใช้/redact กำไร ยังทำงานเหมือนเดิม
  useEffect(() => {
    if (!customerId) { setProducts([]); return; }
    let alive = true;
    cachedFetchJson(`/api/products?customerId=${encodeURIComponent(customerId)}`)
      .then((rows) => { if (alive) setProducts(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (alive) setProducts([]); });
    return () => { alive = false; };
  }, [customerId]);

  // ดีลที่ออกใบได้: ผูกโครงการ + มีลูกค้า + สถานะยังเปิด (won/lost = ล็อก) + แก้ไขได้
  // มติผู้ใช้ 2026-07-15: 1 ดีลมีใบเสนอราคาได้หลายใบจนกว่าจะ Won — ไม่กรองดีลที่มีใบแล้ว
  // เงื่อนไขอยู่ที่ lib/sales/quotationSourcePicker.js ที่เดียว เพราะตัวบอกเหตุ
  // "ทำไมลูกค้าไม่อยู่ในลิสต์" ต้องใช้เงื่อนไขชุดเดียวกันเป๊ะ ไม่งั้นสองฝั่งเถียงกัน
  const eligible = useMemo(() => eligibleQuotationDeals(deals), [deals]);

  // ตัวเลือกลูกค้าโชว์ "รหัส · ชื่อ" และค้นเจอทั้งรหัสและชื่อ (มติผู้ใช้ 2026-08-18 —
  // ทรงเดียวกับ entity อื่นทั้งระบบ) · ลิสต์นี้ derive จาก **ดีล** ซึ่งมีแต่ชื่อลูกค้า
  // จึงต้อง join กับทะเบียนลูกค้าที่หน้านี้โหลดไว้อยู่แล้วเพื่อเอา arCode (ไม่ยิงเพิ่ม)
  // ลูกค้าที่ไม่อยู่ในทะเบียนที่มองเห็น (เช่นเพิ่งตกไปรออนุมัติ) = โชว์ชื่อจากดีลไปก่อน
  const customerById = useMemo(() => {
    const map = new Map();
    (Array.isArray(customers) ? customers : []).forEach((c) => { if (c?.id) map.set(c.id, c); });
    return map;
  }, [customers]);

  // ดีลที่ยังไม่มีลูกค้า — เลือกลูกค้าแล้วดีลกลุ่มนี้จะโผล่ต่อท้ายให้เลือกได้
  // (บันทึกใบ = ตั้งลูกค้ารายนั้นให้ดีลด้วย — ดู lib/sales/dealCustomerAdopt)
  const unassigned = useMemo(() => unassignedQuotationDeals(deals), [deals]);

  const customerOptions = useMemo(() => {
    const seen = new Map();
    eligible.forEach((deal) => {
      if (!deal.customerId || seen.has(deal.customerId)) return;
      const master = customerById.get(deal.customerId);
      seen.set(deal.customerId, {
        id: deal.customerId,
        arCode: master?.arCode || "",
        name: master?.name || deal.customerName || "ไม่มีชื่อลูกค้า",
      });
    });
    /* ⭐ **มีดีลที่ยังไม่มีลูกค้าอยู่ = ลูกค้าทุกรายที่มองเห็นเลือกได้** — ไม่งั้นดีลกลุ่มนั้น
       เข้าถึงไม่ได้เลยเมื่อลูกค้าของมันยังไม่เคยมีดีลอื่น (เคสที่เจอบ่อยที่สุด: ลูกค้าใหม่)
       ⚠️ `customers` คือลิสต์ที่ API กรองมาแล้ว (อนุมัติแล้ว + ไม่ถูกพักใช้ + ทีมที่ดูแล)
       จึงไม่ทำให้ลูกค้าที่ออกใบไม่ได้กลายเป็นตัวเลือก — กรองซ้ำด้วย `isQuotableCustomer`
       เพื่อไม่ต้องเชื่อฝั่ง API ข้างเดียว (ด่านจริงอยู่ที่ server ตอนบันทึก) */
    if (unassigned.length) {
      (Array.isArray(customers) ? customers : []).forEach((c) => {
        if (!c?.id || seen.has(c.id) || !isQuotableCustomer(c)) return;
        seen.set(c.id, { id: c.id, arCode: c.arCode || "", name: c.name || "ไม่มีชื่อลูกค้า" });
      });
    }
    return customerSelectOptions([...seen.values()]);
  }, [eligible, customerById, customers, unassigned]);

  // ดีลของลูกค้าที่เลือก + รายชื่อโครงการ — ป้อนให้ DealPicker (ตัวเลือกกลางสองชั้น)
  // แทนคู่ช่อง "โครงการ → ดีล" เดิม
  const dealsOfCustomer = useMemo(
    () => (customerId
      ? [...eligible.filter((d) => d.customerId === customerId), ...unassigned]
      : []),
    [eligible, customerId, unassigned],
  );
  const projectList = useMemo(() => Object.values(projectsById || {}), [projectsById]);
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
      const next = data?.customer || data || null;
      setCustomer(next);
      /* ⭐ **ไม่เลือกให้ล่วงหน้าเลยสักช่อง** (มติผู้ใช้ 2026-08-27)
         เดิมตั้งต้นเป็น "ที่อยู่หลัก / ผู้ติดต่อคนแรก" ให้ทันที ⇒ คนทำใบเห็นช่องที่กรอก
         ไว้แล้วก็ผ่านไปโดยไม่ได้อ่าน ⇒ ใบออกไปผิดที่ผิดคนโดยไม่มีใครรู้ตัว — ที่อยู่
         ออกบิลขึ้นบนใบกำกับภาษีด้วย (สาขา/คลังคนละที่กัน)
         ⚠️ **ไม่ยกเว้นแม้มีตัวเลือกเดียว** — กติกาเดียวทั้งบล็อก อ่านง่ายกว่ามีข้อยกเว้น
         และการกดยืนยันหนึ่งครั้งคือการอ่านหนึ่งครั้ง ซึ่งคือสิ่งที่ต้องการ */
      setContactIndex("");
      setBillingAddressId("");
      setShippingAddressId("");
    })();
    return () => { alive = false; };
  }, [dealId, customerId]);

  const contacts = Array.isArray(customer?.contacts) ? customer.contacts : [];
  // ตัวเลือกที่อยู่ของลูกค้ารายนี้ — แยกตามหน้าที่ (ที่อยู่ "จัดส่งอย่างเดียว" ต้องไม่
  // โผล่ในช่องออกบิล และกลับกัน) · ลูกค้าที่ยังไม่ backfill อ่านจากช่องเดี่ยวเดิม
  const addressOptions = customerAddresses(customer);
  const billingOptions = addressOptions.filter(isBillingAddress);
  const shippingOptions = addressOptions.filter(isShippingAddress);
  const pickedAddresses = pickDocumentAddresses(customer, { billingAddressId, shippingAddressId });
  const billingAddress = pickedAddresses.snapshot.billingAddress || "";
  const shippingAddress = pickedAddresses.snapshot.shippingAddress || "";

  // ค้นชื่อลูกค้าแล้วไม่เจอในลิสต์ = ตอบตรงนั้นว่าเพราะอะไร + ทางไปแก้ (มติผู้ใช้
  // 2026-07-26: คงการกรองไว้ แต่ห้ามตัน) — ก่อนหน้านี้ลูกค้าหายเงียบ ๆ ต้องมาสืบทีละเคส
  const customerEmptyText = useCallback((search) => {
    const blocked = blockedQuotationCustomers({ search, customers, registryCustomers, deals });
    if (!blocked.length) {
      return search.length < 2
        ? "พิมพ์ชื่อลูกค้าเพื่อค้นหา"
        : "ไม่พบลูกค้าชื่อนี้ในทะเบียน — ตรวจการสะกด หรือเพิ่มลูกค้าที่หน้าฐานข้อมูลลูกค้า";
    }
    return (
      <div className={styles.blockedList}>
        {blocked.map((row) => (
          <div key={row.customerId} className={styles.blockedRow}>
            <strong>{row.customerName}</strong>
            <span>
              {row.dealTitle ? `ดีล “${row.dealTitle}” — ` : ""}{row.reason}
            </span>
            <Link href={row.href} className="linklike">{row.actionLabel} →</Link>
          </div>
        ))}
      </div>
    );
  }, [customers, registryCustomers, deals]);

  // เปลี่ยนลูกค้า = บรรทัดที่ผูก FG ของลูกค้าเดิมใช้ต่อไม่ได้ (server ตีกลับตอนบันทึก)
  // ⇒ ทิ้งเฉพาะบรรทัดที่ผูกสินค้า แล้วบอกให้รู้ว่าทิ้งไปกี่บรรทัด · บรรทัดที่พิมพ์เอง
  // (ค่าบริการ ฯลฯ) ไม่ผูกลูกค้า เก็บไว้ — ลบงานที่คนพิมพ์เองทิ้งเงียบ ๆ ไม่ได้
  const onCustomer = (v) => {
    setCustomerId(v);
    setProjectId("");
    setDealId("");
    setCustomer(null);
    setLines((current) => {
      const kept = current.filter((line) => !line.productId && !line.fgCode);
      const dropped = current.length - kept.length;
      setError(dropped
        ? `เปลี่ยนลูกค้าแล้ว — เอารายการสินค้าของลูกค้าเดิมออก ${dropped} รายการ (เลือก FG ของลูกค้าใหม่อีกครั้ง)`
        : "");
      return kept;
    });
  };
  // โครงการมาจากดีลเสมอ — ไม่มีช่องให้เลือกเองอีกแล้ว (ยังเก็บ state ไว้เพราะหัวใบ
  // แสดงชื่อ/รหัสโครงการของดีลที่เลือก)
  const onDeal = (v, deal) => { setDealId(v); setProjectId(deal?.projectId || ""); };

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
    /* ต้องเลือกที่อยู่ออกบิลเองก่อนเสมอเมื่อลูกค้ามีให้เลือกหลายที่ (มติผู้ใช้ 2026-08-27)
       ⚠️ ด่านนี้อยู่ฝั่งจอเท่านั้นโดยตั้งใจ — ฝั่ง server ยังถอยไปที่อยู่หลักเมื่อไม่ส่ง id
       มา เพราะสายที่ไม่มีหน้าจอให้เลือก (ยืนยัน PO สหมิตร → ออก QT) ต้องออกใบได้ต่อ
       ที่อยู่จัดส่งไม่บังคับ: ว่าง = ใช้ที่อยู่ออกบิล ซึ่งเป็นความหมายเดิมของช่องนี้ */
    const unpicked = [
      billingOptions.length && !billingAddressId ? "ที่อยู่ออกบิล" : null,
      shippingOptions.length && !shippingAddressId ? "ที่อยู่จัดส่ง" : null,
      contacts.length && contactIndex === "" ? "ผู้ติดต่อ" : null,
    ].filter(Boolean);
    if (unpicked.length) {
      setError(`เลือก${unpicked.join(" · ")}ก่อน — ข้อมูลชุดนี้ถูกตรึงลงใบและขึ้นบนใบกำกับภาษี`);
      return;
    }
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
          /* ดีลที่ยังไม่มีลูกค้า: ส่งลูกค้าที่เลือกบนฟอร์มไปให้ server ตั้งให้ดีลด้วย
             (ด่านจริงอยู่ที่นั่น — ที่นี่แค่ไม่ปล่อยให้ค่าหาย) */
          ...(dealAwaitsCustomer(selectedDeal) ? { customerId } : {}),
          ...(contactIndex === "" ? {} : { contactIndex }),
          // ที่อยู่ที่ใบนี้เลือก (0203) — server ตรวจซ้ำว่า id เป็นของลูกค้ารายนี้จริง
          // และใช้ได้กับหน้าที่นั้น ไม่งั้นถอยไปที่อยู่หลัก
          billingAddressId: billingAddressId || null,
          shippingAddressId: shippingAddressId || null,
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
          referenceNote,
          paymentPlan,
          // ชุดเงื่อนไขการค้าที่หยิบมาเป็นค่าตั้งต้น — server ตรวจว่ามีจริง+เผยแพร่ก่อนตรึง
          metadata: {
            paymentPresetVersionId: payment.presetVersionId || null,
            remarksPresetVersionId: notesPresetVersionId || null,
          },
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
  }, [dealId, selectedDeal, customerId, contactIndex, contacts.length, billingAddressId, billingOptions.length, shippingAddressId, shippingOptions.length, lines, quoteDate, validUntil, discountType, discountValue, vatRate, payment, paymentPlan, notes, referenceNote, notesPresetVersionId, router]);

  if (!canEdit) {
    return (
      <Workspace icon={<FileText size={22} />} title="สร้างใบเสนอราคา">
        <div className="glass-panel" style={{ padding: 16, color: "var(--text-3)" }}>ไม่มีสิทธิ์สร้างใบเสนอราคา</div>
      </Workspace>
    );
  }

  const overviewDescription = (
    <>
      <span>โครงการ: {selectedProject?.name || selectedProject?.code || "ยังไม่เลือก"}</span>
      {" · "}
      <span>ดีล: {selectedDeal?.title || "ยังไม่เลือก"}</span>
      {selectedDealType ? <>{" · "}<span>ประเภท: {selectedDealType} · {DEAL_TYPE_LABELS[selectedDealType]}</span></> : null}
    </>
  );
  const summaryRows = [
    { id: "subtotal", label: "รวมรายการ", value: fmtMoney(totals.subtotal) },
    { id: "discount", label: "ส่วนลด", value: totals.discountAmount > 0 ? `-${fmtMoney(totals.discountAmount)}` : NA },
    ...(vatRate > 0 ? [{ id: "vat", label: `VAT ${vatRate}%`, value: fmtMoney(totals.vatAmount) }] : []),
  ];
  // เช็คลิสต์เก็บเฉพาะ "เงื่อนไขที่บล็อกการบันทึกจริง" — เดิมมีแถว "เพิ่มรายการสินค้า"
  // ที่ตัวมันเองเขียนว่ายังไม่ต้องทำก็บันทึกได้ ⇒ เป็นวงกลมว่างที่ไม่มีวันต้องติ๊ก
  // อ่านแล้วเหมือนงานค้างทั้งที่ไม่ใช่ · ข้อความนั้นย้ายไปอยู่คำอธิบายใต้หัวการ์ดแทน
  // ⚠️ "โครงการ" ไม่ใช่ขั้นให้เลือกแล้วตั้งแต่ยุบเข้า DealPicker (มติ 2026-08-06) —
  // เดิมเขียน "เลือกลูกค้า โครงการ และดีลตามลำดับ" ซึ่งเถียงกับหัวข้อฝั่งซ้ายของหน้าเอง
  const readinessItems = [
    {
      id: "source",
      label: "เลือกดีล",
      detail: dealId ? selectedDeal?.title : "เลือกลูกค้า แล้วเลือกดีล",
      ready: Boolean(dealId),
    },
  ];
  const rightRail = (
    <>
      {/* ⚠️ ไม่ส่ง `status` ให้การ์ดยอด — หน้านี้สถานะเป็น "ฉบับใหม่" ตายตัว เปลี่ยนไม่ได้
          ⇒ สองการ์ดในรางขวาเคยขึ้นคำเดียวกันติดกัน (บวกป้ายบนหัวใบอีก = 3 ที่ในหน้าเดียว)
          หน้ารายละเอียดใบ ([id]) ยังส่งเหมือนเดิม — ที่นั่นสถานะเปลี่ยนได้จริงและเป็น
          แพตเทิร์นเดียวกับ SO/ภาษี/ต้นทุน ถอดที่นั่นจะทำให้ใบเสนอราคาแปลกกว่าโมดูลอื่น */}
      <DocumentSummaryCard
        title="ยอดสุทธิใบเสนอราคา"
        total={fmtMoney(totals.totalAmount)}
        rows={summaryRows}
      />
      <DocumentControlCard
        eyebrow="QUOTATION CONTROL"
        title="จัดการใบเสนอราคา"
        status="ฉบับใหม่"
        statusColor="var(--accent)"
        statusDescription="บันทึกเป็นฉบับร่างได้เลย — รายการสินค้าเพิ่มภายหลังได้"
        notices={<DocumentReadinessList items={readinessItems} />}
        primaryAction={{
          id: "save",
          kind: "save",
          label: creating ? "กำลังบันทึก…" : "บันทึก",
          disabled: !dealId,
          // ⚠️ ไม่ส่ง `disabledReason` ที่นี่โดยเจตนา — การ์ดนี้มีเช็คลิสต์อยู่เหนือปุ่มแล้ว
          // ซึ่งบอกเหตุเดียวกัน ("เลือกดีล") ห่างกันสามบรรทัด · กติกาของ component ที่ว่า
          // เหตุผลต้องเป็นตัวหนังสือไม่ใช่ tooltip ยังอยู่ครบสำหรับการ์ดที่ไม่มีเช็คลิสต์
          onClick: create,
        }}
        secondaryActions={[{
          id: "cancel",
          kind: "open",
          icon: null,
          label: "ยกเลิก",
          variant: "ghost",
          href: returnTo,
        }]}
        busy={creating}
        footer="เลขที่ใบเสนอราคาจะสร้างอัตโนมัติเมื่อบันทึก · ส่งลูกค้าได้หลังเจ้าของดีลอนุมัติ"
      />
    </>
  );

  return (
    <Workspace
      icon={<FileText size={22} />}
      title="สร้างใบเสนอราคา"
      subtitle={selectedDeal ? `${naText(selectedDeal.customerName)} · ${selectedProject?.name || naText(selectedProject?.code)} · ${selectedDeal.title}` : "เลือกที่มาของเอกสารและจัดทำใบเสนอราคาในหน้าเดียว"}
      back={{ href: returnTo, label: returnLabel }}
    >
      {error && <div className={styles.errorPanel} role="alert">{error}</div>}
      {!loading && !eligible.length && (
        <div className={styles.emptyPanel}>ยังไม่มีดีลที่พร้อมออกใบเสนอราคา — ดีลต้องมีลูกค้า ยังไม่ Won/ไม่หลุด และเป็นดีลที่คุณแก้ไขได้ (ตามทีม/เจ้าของดีล) <Link href="/sa/deals" className="btn ghost sm"><ExternalLink size={13} /> ไปหน้าดีล</Link></div>
      )}

      <DetailPageLayout
        aside={rightRail}
        asideLabel="สรุปและจัดการใบเสนอราคาใหม่"
      >
          <SalesDetailOverview
            eyebrow="FM-SA-01 · NEW QUOTATION"
            title={selectedDeal?.customerName || "เลือกข้อมูลเพื่อเริ่มสร้างใบเสนอราคา"}
            description={overviewDescription}
            badges={<SalesStateBadge label="ฉบับใหม่" color="var(--accent)" />}
            facts={[
              { key: "quote-date", icon: CalendarDays, label: "วันที่ออกใบ", value: fmtDate(quoteDate) },
              { key: "valid-until", icon: CalendarDays, label: "ยืนราคาถึง", value: validUntil ? fmtDate(validUntil) : NA },
              { key: "tax", icon: CircleDollarSign, label: "ภาษี", value: vatRate > 0 ? `+ VAT ${vatRate}%` : "รวม VAT แล้ว" },
              { key: "items", icon: Package, label: "รายการ", value: `${lines.length} รายการ` },
            ]}
          />

          <section className={styles.card}>
            <div className={styles.sectionHeading}><Building2 size={17} /><h2>ที่มาของใบเสนอราคา</h2><span>เลือกลูกค้า แล้วเลือกดีล — โครงการมาจากดีลเอง</span></div>
            <div className={styles.sourceGrid}>
              <label className={styles.customerSource}>ชื่อลูกค้า *<SearchableSelect className={styles.sourceSelect} entity="customer" value={customerId} onChange={onCustomer} ariaLabel="เลือกชื่อลูกค้า" placeholder={loading ? "กำลังโหลด…" : "ค้นหาชื่อลูกค้า…"} options={customerOptions} emptyText={customerEmptyText} /></label>
              {/* โครงการ+ดีล ยุบเป็นตัวเลือกกลางตัวเดียว (มติผู้ใช้ 2026-08-06) —
                  โครงการเป็นหัวข้อฝั่งซ้ายในแผง ไม่ใช่ช่องที่ต้องเลือกก่อน · projectId
                  ยังถูกเก็บไว้ให้หัวใบแสดงชื่อโครงการ แค่มาจากดีลแทนการเลือกเอง */}
              <label className={styles.dealSource}>ดีล *
                <DealPicker
                  deals={dealsOfCustomer}
                  projects={projectList}
                  value={dealId}
                  disabled={!customerId}
                  onChange={onDeal}
                  placeholder={!customerId ? "เลือกชื่อลูกค้าก่อน" : "— เลือกดีล —"}
                  ariaLabel="เลือกดีลที่จะออกใบเสนอราคา"
                />
              </label>
            </div>
            {/* ลิสต์ลูกค้าที่นี่ไม่ใช่ทะเบียนลูกค้า แต่มาจากดีลที่ออกใบได้ — ไม่มีคำอธิบาย
                แล้วคนหาไม่เจอจะคิดว่าระบบพัง (ทะเบียนมีลูกค้าเยอะกว่านี้มาก) */}
            {!loading && eligible.length > 0 && (
              <p className={styles.sourceHint}>
                เลือกได้ {customerOptions.length} ราย จากดีลที่พร้อมออกใบ {eligible.length} ดีล —
                ไม่เจอลูกค้าที่ต้องการ? พิมพ์ชื่อในช่องด้านบน ระบบจะบอกว่าติดอะไรและไปแก้ที่ไหน
              </p>
            )}
            {/* ⚠️ **บอกก่อนกด ไม่ใช่บอกหลังบันทึก** — การตั้งลูกค้าให้ดีลเป็นการแก้ของที่
                อยู่นอกใบนี้ ผู้ใช้ต้องเห็นล่วงหน้าว่ากดแล้วจะเกิดอะไรกับดีล */}
            {dealAwaitsCustomer(selectedDeal) && customerId && (
              <p className={styles.sourceHintWarn}>
                {dealCustomerAdoptNote(selectedDeal, customerById.get(customerId) || { id: customerId })}
              </p>
            )}
          </section>

          {dealId && customer && (
            <section className={styles.card}>
              <div className={styles.sectionHeading}><UserRound size={17} /><h2>ข้อมูลลูกค้าในเอกสาร</h2><span>Snapshot ณ วันที่สร้าง</span><div className="spacer" /><Link href={`/database/customers/${customerId}`} className="btn ghost sm" target="_blank"><ExternalLink size={13} /> แก้ที่ฐานข้อมูลลูกค้า</Link></div>
              <div className={styles.customerGrid}>
                {/* ที่อยู่เลือกได้ (0202) — ลูกค้ารายเดียวมีได้หลายที่/หลายสาขา ตั้งต้นเป็น
                    ที่อยู่หลัก · ตัวข้อความโชว์ไว้ใต้ช่องเพราะป้ายชื่อบอกไม่ได้ว่าที่ไหนจริง ๆ */}
                <label className={styles.contactField}>ที่อยู่ออกบิล
                  {billingOptions.length
                    ? <Select value={billingAddressId} onChange={(e) => setBillingAddressId(e.target.value)} aria-label="เลือกที่อยู่ออกบิล">
                        <option value="">— เลือกที่อยู่ออกบิล —</option>
                        {billingOptions.map((a) => <option key={a.id} value={a.id}>{addressLabel(a)}</option>)}
                      </Select>
                    : null}
                  <span className={styles.addressPreview}>
                    {billingOptions.length && !billingAddressId
                      ? "ยังไม่ได้เลือก — ที่อยู่นี้จะขึ้นบนใบกำกับภาษี เลือกให้ตรงกับที่ลูกค้าจะออกบิล"
                      : (billingAddress || "ลูกค้ารายนี้ยังไม่มีที่อยู่ — เพิ่มที่ฐานข้อมูลลูกค้า")}
                  </span>
                </label>
                <label className={styles.contactField}>ที่อยู่จัดส่ง
                  {shippingOptions.length
                    ? <Select value={shippingAddressId} onChange={(e) => setShippingAddressId(e.target.value)} aria-label="เลือกที่อยู่จัดส่ง">
                        <option value="">— เลือกที่อยู่จัดส่ง —</option>
                        {shippingOptions.map((a) => <option key={a.id} value={a.id}>{addressLabel(a)}</option>)}
                      </Select>
                    : null}
                  <span className={styles.addressPreview}>
                    {shippingOptions.length && !shippingAddressId
                      ? "ยังไม่ได้เลือก — เลือกให้ตรงกับที่ลูกค้าจะรับของ"
                      : naText(shippingAddress)}
                  </span>
                </label>
                {/* สาขา = ของ **ที่อยู่ออกบิลที่ใบนี้เลือก** (มติผู้ใช้ 2026-08-06 กลับมติ
                    2026-08-05 — ดูเหตุผลยาวที่ lib/master/addresses.js)
                    🐞 เดิมอ่าน `customer.branchCode` ซึ่งเป็น "กระจกของที่อยู่ออกบิล**หลัก**"
                    ⇒ สลับช่องที่อยู่ไปสาขา ข้อความที่อยู่ใต้ช่องเปลี่ยนตาม แต่ช่องนี้ค้างที่
                    "สำนักงานใหญ่" ตลอด ทั้งที่ server ตรึง branchCode ของสาขาลงใบไปแล้ว
                    = จอบอกคนละเรื่องกับกระดาษที่พิมพ์ออกมา
                    ⚠️ ผ่าน branchValue เสมอ — ค่าดิบ '00000' ต้องอ่านว่า "สำนักงานใหญ่"
                    ให้ตรงกับตัวเอกสาร · ใช้ branchValue ไม่ใช่ branchLabel เพราะช่องนี้
                    มีป้าย "สาขา" กำกับอยู่แล้ว เติม "สาขาที่" อีกคือพูดซ้ำสองรอบ */}
                <div className={styles.infoBlock}><Building2 size={16} /><span><small>สาขา</small>{billingAddressId ? branchValue(pickedAddresses.snapshot.branchCode) : naText("")}</span></div>
                <label className={styles.contactField}>ผู้ติดต่อ{contacts.length ? <Select className="premium-select" value={contactIndex} onChange={(e) => setContactIndex(e.target.value === "" ? "" : Number(e.target.value))} aria-label="เลือกผู้ติดต่อ"><option value="">— เลือกผู้ติดต่อ —</option>{contacts.map((contact, index) => <option key={index} value={index}>{[contact.name, contact.role, contact.phone].filter(Boolean).join(" · ") || `ผู้ติดต่อ ${index + 1}`}</option>)}</Select> : <input className="premium-input" readOnly value={naText(customer.contactPerson)} />}</label>
              </div>
            </section>
          )}

          <section className={`${styles.card} ${styles.documentMeta}`}>
            <label>วันที่ออกใบ<DateInput className={styles.documentDateInput} value={quoteDate} onChange={(value) => { setQuoteDate(value); setValidUntil(addValidityDays(value, validityDays)); }} required /></label>
            <label>ยืนราคาถึง<DateInput className={styles.documentDateInput} value={validUntil} onChange={(value) => { setValidUntil(value); setValidityDays(validityDaysBetween(quoteDate, value)); }} min={quoteDate || undefined} /></label>
            <label>กำหนดยืนราคา (จำนวนวัน)<input type="number" min="1" step="1" className={`premium-input ${styles.documentDateInput}`} value={validityDays} onChange={(event) => { const days = event.target.value; setValidityDays(days); setValidUntil(addValidityDays(quoteDate, days)); }} /></label>
            {/* เอกสารอ้างอิง (mig 0267) — ข้อความอิสระ ขึ้นเป็นแถวหนึ่งในบล็อกอ้างอิงบน
                เอกสาร · บรรทัดเดียวโดยเจตนา: เอกสารเรนเดอร์เป็นแถว label/value แถวเดียว
                ช่องหลายบรรทัดจะสัญญาสิ่งที่เอกสารทำไม่ได้ */}
            <label className={styles.referenceField}>เอกสารอ้างอิง
              <Input
                value={referenceNote}
                placeholder="เช่น อ้างถึง PO-1234 ลว. 5 ส.ค. 69"
                onChange={(event) => setReferenceNote(event.target.value)}
              />
            </label>
          </section>

          <section className={styles.card}>
            <div className={styles.sectionHeading}><Package size={17} /><h2>รายการสินค้า/บริการ</h2><div className="spacer" />{/* ลิสต์ FG ผูกกับลูกค้าแล้ว (มติ 2026-08-17) — ยังไม่เลือกลูกค้า = ดรอปดาวน์ว่าง
                ปิดปุ่มพร้อมบอกเหตุ ดีกว่าให้กดแล้วเจอช่องเปล่า · "เพิ่มรายการเอง" ไม่ผูกลูกค้า กดได้ตลอด */}
            <div className={styles.lineActions}><button type="button" className="btn btn-primary sm" onClick={addProductLine} disabled={!customerId} title={!customerId ? "เลือกลูกค้าก่อน — รายการสินค้าเป็นของลูกค้าแต่ละราย" : undefined}><Plus size={13} /> เพิ่มสินค้า</button><button type="button" className="btn ghost sm" onClick={addManualLine}><Plus size={13} /> เพิ่มรายการเอง</button></div></div>
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
            <QuotationInstallments value={payment} onChange={setPayment} totalAmount={totals.totalAmount} />
          </section>

          <section className={styles.card}>
            <QuotationPaymentTerms value={payment} onChange={setPayment} />
          </section>

          <section className={styles.card}>
            <QuotationNotes
              value={notes}
              onChange={setNotes}
              presetVersionId={notesPresetVersionId}
              onPresetVersionIdChange={setNotesPresetVersionId}
            />
          </section>
      </DetailPageLayout>
    </Workspace>
  );
}

export default function NewQuotationPage() {
  return (
    <Suspense fallback={<SkeletonRows rows={7} />}>
      <NewQuotationInner />
    </Suspense>
  );
}
