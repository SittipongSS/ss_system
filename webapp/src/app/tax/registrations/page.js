"use client";
import { useEffect, useMemo, useState } from "react";
import useStickyState from "@/lib/ui/useStickyState";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Plus } from "lucide-react";
import Workspace, { ListPanel } from "@/components/ui/Workspace";
import Button from "@/components/ui/Button";
import Modal from "@/components/Modal";
import StatusNotice from "@/components/ui/StatusNotice";
import { useRole, useCan } from "@/lib/roleContext";
import { fmtDate, fmtMoney, fmtNumber, NA, naText } from "@/lib/format";
import { businessDate } from "@/lib/businessDate";
import { useApiList } from "@/lib/excise/useApiList";
import { sourcesFailureDetail } from "@/lib/ui/loadFailure";
import { deptOf, isTaxWaitingOnMe, ownedStages, REGISTRATION_FILTERS } from "@/lib/excise/workflow";
import { queueExportIds, queueStatusParam } from "@/lib/tax/exportUrl";
import ReportExportActions from "@/components/excise/ReportExportActions";
import DateInput from "@/components/ui/DateInput";
import FilterPopover from "@/components/ui/FilterPopover";
import { Building2 } from "lucide-react";
import { ageLabel, ageTone, registrationAge } from "@/lib/tax/registrationQueue";
import DataList from "@/components/excise/DataList";
import FilterBar from "@/components/excise/FilterBar";
import StatusBadge from "@/components/excise/StatusBadge";
import RegistrationFormModal from "@/components/excise/RegistrationFormModal";
import { brandLabel } from "@/lib/master/brands";
import { customerNameIn } from "@/lib/master/customerName";
import { productDisplayName } from "@/lib/master/productIdentity";
import { toneColor } from "@/lib/ui/tone";
import styles from "./page.module.css";

// ⭐ **ภาษี/ชิ้นกับความพร้อมเอกสารคิดที่ server แล้ว** (`?view=queue`)
// 🐞 ของเดิมคิดฝั่งจอ จึงต้องโหลด `/api/products` (342 แถวเต็ม) + `/api/customers`
// (508 แถวเต็ม) ทุกครั้งที่เปิดหน้า เพื่อใช้จริงแค่ 17 แถว — สองลิสต์นั้นเหลือไว้ให้
// picker ของโมดัลเท่านั้น และโหลด **ตอนเปิดโมดัลครั้งแรก** ไม่ใช่ตอนเปิดหน้า
const registrationBrand = (r) => brandLabel(r.metadata?.brandNameTh, r.metadata?.brandNameEn || r.brandName);
const registrationProduct = (r) => productDisplayName(r);
const taxText = (r) => (r.isExciseTaxable === false ? "ยกเว้น" : fmtMoney(r.taxPerUnit || 0));
// ประโยคของสายที่ป้อนฟอร์มสร้างทะเบียน — ดูมติที่ก้อน sources
const FORM_BLOCKED_NOTE = "ยังสร้างทะเบียนใหม่ไม่ได้ เพราะฟอร์มต้องใช้ข้อมูลชุดนี้เลือกลูกค้าและ FG ที่ยังไม่ขึ้นทะเบียน";
/* ⭐ **คิวเล่าเรื่องเดียวกับรายงาน** (มติผู้ใช้ 2026-08-28) — เดิมต้องเปิด /tax/reports
   อีกหน้าเพื่อดู ขนาด · เลขผู้เสียภาษี · ราคาถอด VAT · ต้นทุน/กำไร ทั้งที่กำลังตัดสินใจ
   อยู่บนคิว · ตัวเลขทุกตัวคิดที่ server (`registrationProductFacts`) จอแค่วาด */
const sizeText = (r) => (r.volume != null ? `${fmtNumber(r.volume)} ${r.volumeUnit || "ml"}` : null);
const retailText = (r) => (r.retailPriceIncVat ? fmtMoney(r.retailPriceIncVat) : null);
const retailExText = (r) => (r.retailPriceExVat ? `ถอด VAT ${fmtMoney(r.retailPriceExVat)}` : null);
/* ราคาผลิต/กำไร: บรรทัดหลักคือสองตัวที่คนดูคิว ๆ ต้องเทียบ · แจกแจงอยู่บรรทัดรอง
   ⚠️ ค่าที่ไม่มีสิทธิ์ถูกตัดตั้งแต่ server (`redactProductMargin`) ⇒ ที่นี่ทดสอบ
   "มีค่าไหม" อย่างเดียว ห้ามตัดสินสิทธิ์ซ้ำที่จอ ไม่งั้นสองชั้นจะเลื่อนออกจากกัน */
const factoryMain = (f) => [
  f.costPrice != null && `ราคาผลิต ${fmtMoney(f.costPrice)}`,
  f.factoryProfit != null && `กำไร ${fmtMoney(f.factoryProfit)}`,
].filter(Boolean).join(" · ");
const factoryParts = (f) => [
  f.materialCost != null && `วัตถุดิบ ${fmtMoney(f.materialCost)}`,
  f.laborCost != null && `ค่าแรง ${fmtMoney(f.laborCost)}`,
  f.shippingCost != null && `ค่าจัดส่ง ${fmtMoney(f.shippingCost)}`,
].filter(Boolean).join(" · ");

export default function RegistrationsPage() {
  const role = useRole();
  const router = useRouter();
  const canEdit = useCan("products:edit");   // SA: create / edit / resubmit / delete

  const { data: regs, loading, error: regsError, staleError: regsStale, errorDetail: regsDetail, loaded: regsLoaded, reload } = useApiList("/api/excise-registrations?view=queue");

  /* ⚠️ "วันนี้" อ่านครั้งเดียวตอน mount จากนาฬิกา **ไทย** — ห้ามอ่านนาฬิกาตอนเรนเดอร์
     (ค่าจะขยับระหว่างเรนเดอร์ และเครื่องที่ตั้งโซนเวลาอื่นจะได้คนละวัน) */
  const todayIso = useMemo(() => businessDate(), []);

  const [userName, setUserName] = useState("");
  // RA lands on their queue; everyone else sees all. A ?status= deep-link
  // (from the dashboard) overrides the default after mount.
  /* เลนของผู้ใช้ (SA / RA) — ตัวเดียวกับที่ `?status=mine` และป้ายบนเมนูใช้ (ม-117)
     AD เห็นทั้งสองเลนแต่ไม่เป็นเจ้าของขั้นไหน ⇒ ชิป "รอฉันลงมือ" จะได้ 0 เสมอ จึงซ่อนทิ้ง */
  const myDept = deptOf(role);
  const filterOptions = useMemo(
    () => REGISTRATION_FILTERS.filter((f) => f.key !== "mine" || myDept === "SA" || myDept === "RA"),
    [myDept],
  );
  const [filter, setFilter] = useState(() => (deptOf(role) === "RA" ? "pending_legal" : "all"));
  useEffect(() => {
    setUserName(localStorage.getItem("userName") || "SA User");
    const params = new URLSearchParams(window.location.search);
    const s = params.get("status");
    if (s && REGISTRATION_FILTERS.some((f) => f.key === s)) setFilter(s);
    // Legacy ?open=<id> deep-link → go straight to the detail page.
    const openId = params.get("open");
    if (openId) router.replace(`/tax/registrations/${openId}`);
  }, [router]);
  const [search, setSearch] = useStickyState("search", "");
  const [formOpen, setFormOpen] = useState(false);
  /* ⭐ ตัวกรองที่ย้ายมาจากหน้า /tax/reports ที่ถูกยุบทิ้ง (มติผู้ใช้ 2026-08-29)
     — ลูกค้า + ช่วงวันที่ · ทำงานร่วมกับชิปและช่องค้นหาเป็น **ชุดเดียว**
     ไม่มีตัวกรองชุดที่สองสำหรับ "รายงาน" ให้ตั้งค่าซ้ำแล้วสงสัยว่าอันไหนมีผล */
  const [customerIds, setCustomerIds] = useState([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  /* ลิสต์ลูกค้าโหลดเมื่อ **กางตัวกรอง** หรือเปิดโมดัลครั้งแรก — ไม่ใช่ตอนเปิดหน้า
     (508 แถว · เหตุผลเดียวกับ picker ของโมดัล) */
  const [pickerReady, setPickerReady] = useState(false);
  const { data: products, loading: lProducts, error: productsError, staleError: productsStale, errorDetail: productsDetail, loaded: productsLoaded, reload: reloadProducts } = useApiList(pickerReady ? "/api/products" : null);
  const { data: customers, loading: lCustomers, error: customersError, staleError: customersStale, errorDetail: customersDetail, loaded: customersLoaded, reload: reloadCustomers } = useApiList(pickerReady ? "/api/customers" : null);
  const openForm = () => { setPickerReady(true); setFormOpen(true); };

  /* ── โหลดพัง ≠ ไม่มีการขึ้นทะเบียน · picker ที่ดึงไม่ได้ ≠ "ไม่มีลูกค้า/สินค้าให้เลือก" ────────────────────
     ป้ายเดียวของจอ (ท่าเดียวกับ /tax · /database) — ทุก useApiList ของหน้านี้อยู่ในก้อน sources ⇒ ได้ประโยคเดียวกัน
     ปุ่มลองใหม่ตัวเดียวกัน และรอบเบื้องหลังที่ล้ม (`staleError`) ถึงป้ายทุกสาย

     ⭐ **มติของจอนี้: สายไหนกระทบอะไร**
        · การขึ้นทะเบียน (ลิสต์หลัก) — ไม่เคยโหลดสำเร็จ = ซ่อนตาราง เหลือป้าย ("ยังไม่มีการขึ้นทะเบียน" ใต้ป้าย
          อ่านว่าระบบว่างจริง) · มีแคชอยู่ = ตารางยังอยู่ ป้ายบอกว่าเป็นของรอบก่อน
          ⚠️ ฟอร์มสร้างทะเบียนก็กินลิสต์นี้ — ใช้ซ่อน FG ที่ขึ้นทะเบียนกับลูกค้ารายนั้นแล้ว (กันเลือกไปชน 409)
             ลิสต์หายแล้วฟอร์มยังเปิด = ตัวเลือกเต็มไปด้วย FG ที่ server จะตีกลับ
        · ทะเบียนสินค้า (picker ของฟอร์มอย่างเดียว) — ล้มแล้วช่อง FG ขึ้น "ลูกค้ารายนี้ยังไม่มี FG — สร้างที่ฐานข้อมูลก่อน"
          = คำตอบผิดที่พาคนไปสร้างสินค้าซ้ำ · ⚠️ พูดเฉพาะคนที่มีปุ่มสร้าง (`canEdit`) — สายนี้ถูกโหลดตอนกางตัวกรองด้วย
          (pickerReady ตัวเดียวกัน) ⇒ คนดูอย่างเดียวที่แค่กางตัวกรองต้องไม่เจอป้าย "ยังสร้างทะเบียนไม่ได้" ของปุ่มที่ตัวเองไม่มี
        · รายชื่อลูกค้า (picker ของตัวกรอง + ฟอร์ม) — ล้มแล้วแผงตัวกรองขึ้น "ไม่มีตัวเลือก" และช่องลูกค้าในฟอร์มขึ้น
          "ไม่พบลูกค้า — สร้างที่ฐานข้อมูลก่อน" ⇒ ป้ายบอกว่าตัวกรองลูกค้ายังใช้ไม่ได้ · หัวหมวดในแผงตัวกรองบอกสถานะเอง
          (`customerGroupLabel` — แผงลอยทับป้ายตอนกางอยู่) · ตารางไม่ต้องหลบ (ภาษี/เอกสาร/ชื่อลูกค้าบนแถวคิดที่ server)
     ⭐ **ฟอร์มไม่เปิดบนข้อมูลครึ่งเดียว** (ท่าเดียวกับหน้าแก้ PO / ลงรอบ FC ที่คืนป้ายแทนฟอร์ม) — ทั้งสามสายป้อน
        RegistrationFormModal ⇒ เปิดฟอร์มจริงเมื่อทุกสายเคยโหลดสำเร็จแล้วเท่านั้น (`formReady`) · ระหว่างนั้นโมดัลหัวเดียวกัน
        วางป้ายตัวเดียวกันพร้อมปุ่มลองใหม่ (ล้ม) หรือบรรทัด "กำลังโหลด…" (ยังมาไม่ครบ) แทนช่องเลือกที่ว่าง — ปุ่มบันทึกจึงไม่มี
        ให้กดบนข้อมูลที่ขาด · 🐞 ทรงเดิมเปิดฟอร์มทันทีตอนกด แม้แต่ตอนโหลดปกติก็เห็น "ไม่พบลูกค้า — สร้างที่ฐานข้อมูลก่อน"
        อยู่ครู่หนึ่ง · มีแคชอยู่ (รอบเบื้องหลังล้ม) = ฟอร์มเปิดได้ ป้ายหน้าจอบอกว่าเป็นของรอบก่อน (server ยังเป็นด่านจริง)
     ⚠️ ป้ายกับการซ่อนคนละคำถาม: มี `error`/`staleError` = ขึ้นป้ายเสมอ · ซ่อน/พักเฉพาะตอนไม่เคยโหลดสำเร็จ (`loaded`)
        — ห้ามวัดด้วย `!regs.length`: ลิสต์ที่ตอบ `200 []` คือรู้แล้วว่ายังไม่มีการขึ้นทะเบียน */
  const sources = [
    {
      label: "การขึ้นทะเบียน", error: regsError || regsStale, empty: !regsLoaded, detail: regsDetail, reload, blocks: "list",
      blockedNote: "รายการยังแสดงไม่ได้ (ไม่ได้แปลว่ายังไม่มีการขึ้นทะเบียน)",
      staleNote: "รายการที่เห็นอยู่เป็นของรอบก่อน ไม่ใช่ล่าสุด",
    },
    {
      label: "ทะเบียนสินค้า", error: canEdit ? productsError || productsStale : null, empty: !productsLoaded, detail: productsDetail, reload: reloadProducts, blocks: "form",
      blockedNote: FORM_BLOCKED_NOTE,
      staleNote: "รายการสินค้าเป็นของรอบก่อน ไม่ใช่ล่าสุด",
    },
    {
      label: "รายชื่อลูกค้า", error: customersError || customersStale, empty: !customersLoaded, detail: customersDetail, reload: reloadCustomers, blocks: "filter",
      blockedNote: "ตัวกรองลูกค้ายังใช้ไม่ได้ (ไม่ได้แปลว่าไม่มีลูกค้าให้เลือก)",
      staleNote: "รายชื่อลูกค้าเป็นของรอบก่อน ไม่ใช่ล่าสุด",
    },
  ];
  const failing = sources.filter((s) => s.error);
  const blocked = failing.filter((s) => s.empty);
  const listBlocked = blocked.some((s) => s.blocks === "list");
  const filterBlocked = blocked.some((s) => s.blocks === "filter");
  // 🪤 พ่วงทุกข้อความ ไม่ใช่ตัวแรก — สองสายล้มพร้อมกันมักคนละเหตุ และตัวที่ถูกทิ้งมักเป็นตัวที่ไขคดีได้
  const causes = [...new Set(failing.map((s) => s.error))].join(" · ");
  /* ประโยคท้ายผูกกับสายที่ล้มทีละสาย (ไม่มีของในมือ = blockedNote · มีแคช = staleNote) · ทุกสายที่ถูกบล็อกป้อนฟอร์ม
     สร้างทะเบียนด้วย ⇒ คนที่มีปุ่มสร้างได้ประโยค "ยังสร้างไม่ได้" ต่อท้ายครั้งเดียว (Set กันซ้ำกับ blockedNote ของสายสินค้า)
     — ประโยคนี้คือเหตุผลที่โมดัลสร้างทะเบียนโชว์แทนฟอร์ม เพราะโมดัลวางป้ายตัวเดียวกันนี้ */
  const loadError = failing.length
    ? `ดึงข้อมูลไม่ได้: ${failing.map((s) => s.label).join(" · ")} — ${[
      ...new Set([
        ...failing.map((s) => (s.empty ? s.blockedNote : s.staleNote)),
        canEdit && blocked.length ? FORM_BLOCKED_NOTE : null,
      ].filter(Boolean)),
    ].join(" · ")} · ${causes}`
    : null;
  // ⭐ สตริงดิบของทุกสายที่ล้ม — บรรทัดรองของกล่อง (มติ 23/09 "ไทยนำ + ดิบเป็นบรรทัดเล็ก")
  const loadErrorDetail = sourcesFailureDetail(failing);
  /* ลองสาย picker ไม่ได้พาแผงเข้า skeleton (ตารางยังอยู่ · และป้ายในโมดัลไม่มี skeleton เลย) ⇒ ปุ่มต้องบอกเอง
     ว่ากำลังลองอยู่ ไม่งั้นกดแล้วจอนิ่งสนิทและคนกดซ้ำรัว ๆ */
  const retrying = loading || lProducts || lCustomers;
  const notice = loadError ? (
    <StatusNotice
      tone="error"
      className="mb-4"
      detail={loadErrorDetail}
      action={(
        <Button size="sm" variant="ghost" onClick={() => failing.forEach((s) => s.reload())} disabled={retrying}>
          {retrying ? "กำลังลองใหม่…" : "ลองใหม่"}
        </Button>
      )}
    >
      {loadError}
    </StatusNotice>
  ) : null;
  // ทุกสายป้อนฟอร์ม (ดูมติข้างบน) ⇒ ฟอร์มจริงเปิดเมื่อไม่มีสายไหน "ไม่เคยโหลดสำเร็จ" · มีแคช = ใช้ได้
  const formReady = !sources.some((s) => s.empty);
  /* หัวหมวดในแผงตัวกรอง — แผงวาด "ไม่มีตัวเลือก" เองเมื่อลิสต์ว่าง (FilterPopover ยังไม่มีช่องให้บอกเหตุ)
     ⇒ ป้ายหมวดบอกแทนว่าว่างเพราะอะไร · ป้ายเต็มพร้อมปุ่มลองใหม่อยู่ใต้แถบเครื่องมือ */
  const customerGroupLabel = customersLoaded ? "ลูกค้า" : filterBlocked ? "ลูกค้า (ดึงไม่ได้)" : "ลูกค้า (กำลังโหลด…)";

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return regs.filter((r) => {
      if (filter === "mine") {
        if (!isTaxWaitingOnMe(r, "registration", myDept)) return false;
      } else if (filter !== "all" && r.status !== filter) return false;
      if (customerIds.length && !customerIds.includes(r.customerId)) return false;
      // ช่วงวันที่นับจาก **วันที่สร้าง** เหมือนที่รายงานเดิมใช้ (ตัดเป็นวันก่อนเทียบ)
      const day = (r.createdAt || "").slice(0, 10);
      if (from && day && day < from) return false;
      if (to && day && day > to) return false;
      if (!q) return true;
      return [r.fgCode, r.productName, r.brandName, r.customerName, r.taxId, r.approvalNumber, r.assignee,
        r.metadata?.productNameTh, r.metadata?.productNameEn,
        r.metadata?.brandNameTh, r.metadata?.brandNameEn]
        .some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [regs, filter, search, myDept, customerIds, from, to]);

  /* เลือกไว้แล้วตัวกรองขยับ → ที่เลือกอาจไม่อยู่บนจอแล้ว ⇒ ล้างทิ้ง
     ไม่งั้นจะโหลดแถวที่มองไม่เห็นออกไปโดยไม่รู้ตัว */
  useEffect(() => { setSelected(new Set()); }, [filter, search, customerIds, from, to]);

  // After saving the form: a freshly created draft opens its full detail page so
  // the user lands on the attachment cards and can submit once they're complete.
  const handleSaved = async (saved, { created } = {}) => {
    await reload();
    if (created && saved?.id) router.push(`/tax/registrations/${saved.id}`);
  };

  const ageOf = (r) => registrationAge(r, todayIso);

  /* ── ป้ายอายุงาน ────────────────────────────────────────────────────────
     🐞 คิวเดิมไม่มีวันที่เลย ⇒ ใบที่ค้าง 34 วันหน้าตาเหมือนใบที่เพิ่งยื่นเมื่อวาน
     (ตรวจระบบ 2026-08-28: 9 ใบค้าง 28–34 วันโดยไม่มีอะไรฟ้อง) */
  const AgeCell = ({ row }) => {
    const days = ageOf(row);
    const tone = ageTone(days);
    return (
      <div>
        {/* โทนมาจากข้อมูล (จำนวนวัน) จึงเป็น inline style โดยเจตนา */}
        <div className={tone === "neutral" ? "muted" : undefined} style={tone === "neutral" ? undefined : { color: toneColor(tone), fontWeight: "var(--fw-semibold)" }}>
          {naText(ageLabel(days))}
        </div>
        <div className="cell-sub">{naText(fmtDate(row.updatedAt || row.createdAt, { short: true }))}</div>
      </div>
    );
  };

  /* เอกสาร: บอกว่า "ขาดอะไร" ไม่ใช่แค่ "ไม่ครบ" — ไม่งั้นต้องเปิดใบถึงจะรู้
     ⚠️ ใบที่อนุมัติแล้วไม่ต้องทวงเอกสาร ด่านนี้มีผลเฉพาะก่อนยื่น */
  const DocsCell = ({ row }) => {
    if (row.status === "approved" || row.docsReady === null || row.docsReady === undefined) {
      return <span className="cell-quiet">{NA}</span>;
    }
    if (row.docsReady) return <span className={styles.docsReady}>ครบ</span>;
    const labels = row.missingLabels || [];
    return (
      <span className={styles.docsMissing} title={labels.join("\n")}>
        ขาด {labels.length}
      </span>
    );
  };

  /* คอลัมน์ต้นทุน/กำไรขึ้นเฉพาะคนที่ server ส่งค่ามาให้ — ถามจากชุดเต็ม (`regs`)
     ไม่ใช่ `rows` ที่ผ่านตัวกรอง ไม่งั้นคอลัมน์จะโผล่ ๆ หาย ๆ ตามชิปที่กด */
  const showFactory = useMemo(() => regs.some((r) => r.factory), [regs]);

  const allIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const allChecked = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const toggleOne = (id) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  /* ── สิ่งที่ปุ่มโหลดจะได้ ────────────────────────────────────────────────
     ตัวกรองของจอ → พารามิเตอร์ที่ server เข้าใจ · คำค้น/การติ๊กเลือก → ids
     (ดูเหตุผลเต็มใน lib/tax/exportUrl.js) */
  const exportParams = useMemo(() => ({
    status: queueStatusParam(filter, ownedStages("registration", myDept)),
    customerId: customerIds,
    from,
    to,
  }), [filter, myDept, customerIds, from, to]);
  const exportIds = useMemo(
    () => queueExportIds({ selected, visibleIds: allIds, searching: !!search.trim() }),
    [selected, allIds, search],
  );

  const selectColumn = {
    key: "_sel",
    label: (
      <input
        type="checkbox"
        checked={allChecked}
        onChange={() => setSelected(allChecked ? new Set() : new Set(allIds))}
        aria-label="เลือกทั้งหมด"
      />
    ),
    sortValue: null,
    align: "center",
    thStyle: { width: 34 },
    // หยุด event ไม่ให้ไหลไปเปิดหน้ารายละเอียด (ทั้งแถวกดได้)
    render: (r) => (
      <span onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleOne(r.id)} aria-label={`เลือก ${r.fgCode}`} />
      </span>
    ),
  };

  const columns = [
    selectColumn,
    {
      /* `link: true` = เซลล์ทางเข้าของคีย์บอร์ด — DataList ห่อด้วย <Link href เดียวกับ
         แถว> ให้เอง ⇒ บรรทัดแรกต้องเป็น <strong> ที่เป็นลูก **ตรง** ของลิงก์
         ไม่งั้น `.linklike-block` ไม่ขีดเส้นใต้ให้ (ดูหัวไฟล์ components/excise/DataList.js) */
      key: "fgCode", label: "รหัสสินค้า (FG)", link: true,
      render: (r) => (
        <>
          <strong className="font-semibold font-mono">{r.fgCode}</strong>
          <div className="cell-sub">{registrationProduct(r)} ({naText(registrationBrand(r))})</div>
        </>
      ),
    },
    { key: "size", label: "ขนาด", sortValue: (r) => r.volume ?? -1, render: (r) => naText(sizeText(r)) },
    {
      key: "customerName", label: "ลูกค้า",
      render: (r) => (
        <div>
          <div className="muted">{naText(r.customerName)}</div>
          {/* เลขผู้เสียภาษีคือสิ่งที่ต้องตรงกับเอกสารสรรพสามิต — อยู่บนแถวเดียวกับชื่อ */}
          <div className="cell-sub font-mono">{naText(r.taxId)}</div>
        </div>
      ),
    },
    {
      key: "tax", label: "ภาษี/ชิ้น", align: "right",
      sortValue: (r) => r.taxPerUnit || 0,
      render: (r) => <span className="font-mono">{taxText(r)}</span>,
    },
    {
      /* ฐานที่ใช้คิดภาษี — ฝ่าย RA อนุมัติโดยเห็นที่มาของตัวเลข ไม่ใช่ตัวเลขลอย ๆ
         (เดิมเป็นบรรทัดรองใต้ "ภาษี/ชิ้น" และมีแต่ราคารวม VAT) */
      key: "retail", label: "ราคาขายปลีก", align: "right",
      sortValue: (r) => r.retailPriceIncVat ?? -1,
      render: (r) => (
        <div>
          <div className="font-mono">{naText(retailText(r))}</div>
          <div className="cell-sub font-mono">{naText(retailExText(r))}</div>
        </div>
      ),
    },
    ...(showFactory ? [{
      key: "factory", label: "ราคาผลิต / กำไร", align: "right",
      sortValue: (r) => r.factory?.costPrice ?? -1,
      render: (r) => (r.factory ? (
        <div>
          <div className="font-mono">{naText(factoryMain(r.factory) || null)}</div>
          <div className="cell-sub font-mono">{naText(factoryParts(r.factory) || null)}</div>
        </div>
      ) : <span className="cell-quiet">{NA}</span>),
    }] : []),
    { key: "docs", label: "เอกสาร", align: "center", sortValue: (r) => (r.docsReady ? 1 : 0), render: (r) => <DocsCell row={r} /> },
    {
      key: "assignee", label: "ผู้ยื่น",
      render: (r) => (
        <div>
          <div className="muted">{naText(r.assignee)}</div>
          <div className="cell-sub">{naText(r.team)}</div>
        </div>
      ),
    },
    { key: "age", label: "ค้างมา", sortValue: (r) => ageOf(r) ?? -1, render: (r) => <AgeCell row={r} /> },
    {
      key: "status", label: "สถานะ",
      render: (r) => (
        <div className={styles.stack}>
          <StatusBadge status={r.status} />
          {r.approvalNumber && <span className="cell-sub mono">{r.approvalNumber}</span>}
        </div>
      ),
    },
  ];

  const card = (r) => {
    const days = ageOf(r);
    return (
      <div className="flex flex-col gap-2">
        <div className={styles.cardHead}>
          <div className="min-w-0">
            <div className={styles.cardCode}>{r.fgCode}</div>
            {/* ⚠️ ขนาดขึ้น **ก่อน** ชื่อสินค้า — ชื่อยาวกว่าการ์ดเสมอบนจอแคบและถูก
                truncate ⇒ อะไรที่ต่อท้ายชื่อจะหายไปกับ "…" ทุกแถว (ต่อท้ายรหัส FG ก็
                ตกบรรทัดเป็น "· 5 ml" ลอย ๆ เพราะรหัสยาวเต็มความกว้างพอดี) */}
            <div className="cell-sub truncate">
              {sizeText(r) ? `${sizeText(r)} · ` : ""}{registrationProduct(r)} ({naText(registrationBrand(r))})
            </div>
          </div>
          <StatusBadge status={r.status} />
        </div>
        <div className={styles.cardLine}>
          <span className="muted truncate">
            {naText(r.customerName)}
            {r.taxId ? <span className="cell-sub font-mono"> · {r.taxId}</span> : null}
          </span>
          <span className="font-mono">{taxText(r)}</span>
        </div>
        {/* ตัวเลขชุดเดียวกับตาราง — การ์ดกับตารางต้องเล่าเรื่องเดียวกัน ไม่ใช่คนละชุด
            ⚠️ ป้ายอยู่ซ้าย ค่าอยู่ขวาแบบซ้อนสองบรรทัด (ทรงเดียวกับ `cardLine` อื่น) —
            เอาบรรทัดรองไปต่อท้ายบรรทัดเดียวกันแล้วมันตัดบรรทัดเอง ทิ้ง "·" ค้างหัวบรรทัด */}
        {retailText(r) && (
          <div className={styles.cardLine}>
            <span className="cell-sub">ราคาขายปลีก</span>
            <span className={styles.cardStack}>
              <span className="font-mono">{retailText(r)}</span>
              {retailExText(r) && <span className="cell-sub font-mono">{retailExText(r)}</span>}
            </span>
          </div>
        )}
        {r.factory && (
          <div className={styles.cardLine}>
            <span className="cell-sub">ราคาผลิต / กำไร</span>
            <span className={styles.cardStack}>
              <span className="font-mono">{naText(factoryMain(r.factory) || null)}</span>
              {factoryParts(r.factory) && <span className="cell-sub font-mono">{factoryParts(r.factory)}</span>}
            </span>
          </div>
        )}
        <div className={styles.cardMeta}>
          <span className="truncate">{naText(r.assignee)}</span>
          <span className="flex items-center gap-2">
            <DocsCell row={r} />
            {/* โทนมาจากข้อมูล (จำนวนวัน) */}
            <span style={ageTone(days) === "neutral" ? undefined : { color: toneColor(ageTone(days)) }}>
              ค้างมา {naText(ageLabel(days))}
            </span>
          </span>
        </div>
      </div>
    );
  };

  const customerName = customerIds.length === 1
    ? customerNameIn(customers.find((c) => c.id === customerIds[0]))
    : (customerIds.length > 1 ? `ลูกค้า ${customerIds.length} ราย` : undefined);

  /* ⭐ ป้ายจำนวนย้ายจากหัวหน้าเข้าหัวแผงรายการ (มติผู้ใช้ 2026-09-15 · ด่าน LP9)
     นับ **รายการที่เหลือหลังกรอง** = ยอดของ Pager · กำลังเลือกแถว = "เลือก x/y รายการ"
     ยังไม่มีข้อมูล (โหลดครั้งแรก/โหลดพัง) = null ⇒ ขีด
     ⚠️ "ยังไม่มีข้อมูล" = ไม่เคยโหลดสำเร็จ (`loaded`) ไม่ใช่ลิสต์ยาวศูนย์ — `200 []` คือรู้แล้วว่า 0 รายการ */
  const noData = !regsLoaded;
  const count = noData ? null
    : selected.size ? `เลือก ${selected.size}/${rows.length} รายการ` : `${rows.length} รายการ`;

  const headerRight = (
    <>
      <ReportExportActions
        type="registration"
        params={exportParams}
        ids={exportIds}
        rowCount={rows.length}
        printMeta={{ from, to, customerName }}
      />
      {canEdit && (
        <button className="btn btn-primary flex items-center gap-1.5" onClick={openForm}>
          <Plus size={16} /> สร้างทะเบียน
        </button>
      )}
    </>
  );

  return (
    <Workspace
      icon={<ClipboardCheck size={22} />}
      title="การขึ้นทะเบียนสรรพสามิต"
      subtitle="ยื่น ตรวจสอบ และอนุมัติการขึ้นทะเบียนภาษีสรรพสามิต (สินค้า + ลูกค้า)"
      headerRight={headerRight}
    >
      {/* แผงรายการ (มติผู้ใช้ 2026-09-15) — `FilterBar` คืน fragment เข้า `toolbar` · `loading`
          แทนที่เฉพาะเนื้อ ⇒ ช่องค้นหา/ชิปยังอยู่ระหว่างโหลด ไม่หลุดโฟกัส */}
      <ListPanel
        icon={<ClipboardCheck size={17} aria-hidden="true" />}
        title="รายการขึ้นทะเบียนสรรพสามิต"
        subtitle="ค้นหา กรอง และเปิดทะเบียนเพื่อตรวจหรือยื่นต่อ · เรียงจากค้างนานสุด"
        count={count}
        loading={loading && !regsLoaded}
        toolbar={(
        <FilterBar
          filters={filterOptions}
          activeFilter={filter}
          onFilter={setFilter}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="ค้นหา FG / ลูกค้า / เลขผู้เสียภาษี / ผู้ยื่น / เลขอนุมัติ..."
          searchLabel="ค้นหาการขึ้นทะเบียน"
        >
          <FilterPopover
            count={customerIds.length}
            onOpen={() => setPickerReady(true)}
            onClear={() => setCustomerIds([])}
            groups={[{
              key: "customer", label: customerGroupLabel, icon: Building2,
              /* ป้ายต้องผ่านกติกาสองภาษา — ลูกค้าที่มีแต่ชื่ออังกฤษเคยได้ตัวเลือกว่างเปล่า
                 (ป้ายที่นี่เป็นชื่อเปล่า ไม่ใช่ "รหัส · ชื่อ" แบบ dropdown เลือกลูกค้า) */
              options: customers.map((c) => ({ value: c.id, label: customerNameIn(c) })),
              selected: customerIds,
              onChange: setCustomerIds,
            }]}
          />
          {/* จาก–ถึง เป็นก้อนเดียว — แถบเครื่องมือในแผงแคบกว่าเดิม ถ้าตัดบรรทัดต้องลงไปทั้งคู่
              ไม่ใช่ "จาก" ค้างแถวบนแล้ว "ถึง" ห้อยแถวล่าง */}
          <span className={styles.rangeGroup}>
            <label className={styles.rangeLabel}>
              จาก <DateInput value={from} onChange={setFrom} />
            </label>
            <label className={styles.rangeLabel}>
              ถึง <DateInput value={to} onChange={setTo} />
            </label>
          </span>
        </FilterBar>
        )}
      >
      {notice}
      {/* โหลดพังและยังไม่มีข้อมูลเลย = โชว์แค่ข้อความผิดพลาด ไม่ใช่ "ยังไม่มีการขึ้นทะเบียน"
          ⚠️ ถามสายการขึ้นทะเบียนสายเดียว — picker ล้มไม่ได้ทำให้ตารางผิด (ดูมติที่ก้อน sources) */}
      {!listBlocked && (
      <DataList
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/tax/registrations/${r.id}`}
        card={card}
        /* เรียงเก่าสุดขึ้นก่อน — คิวงานที่เรียงตามรหัสสินค้าไม่ได้ตอบว่า "ทำอันไหนก่อน" */
        initialSort={{ key: "age", dir: "desc" }}
        empty={search || filter !== "all" ? "ไม่พบรายการ" : "ยังไม่มีการขึ้นทะเบียน"}
        emptyIcon={ClipboardCheck}
      />
      )}
      </ListPanel>

      {/* registrations = ชุดเต็ม (ไม่ใช่ rows ที่ผ่านตัวกรองจอ) — โมดัลใช้เช็คว่า
          FG ไหนขึ้นทะเบียนกับลูกค้าที่เลือกไปแล้ว จะได้ไม่ให้เลือกไปชน 409 */}
      <RegistrationFormModal
        open={formOpen && formReady}
        onClose={() => setFormOpen(false)}
        onSaved={handleSaved}
        registration={null}
        products={products}
        customers={customers}
        registrations={regs}
        userName={userName}
      />
      {/* ฟอร์มยังเปิดไม่ได้ (สายที่มันกินยังมาไม่ครบ/ล้ม) — โมดัลหัวเดียวกับฟอร์ม วางป้ายแทนช่องเลือกที่ว่าง
          ⚠️ ป้ายตัวเดียวกับบนจอ (มีปุ่มลองใหม่) — ลองสำเร็จครบเมื่อไร `formReady` พลิก แล้วฟอร์มจริงเปิดแทนที่ตรงนี้เอง */}
      <Modal
        open={formOpen && !formReady}
        onClose={() => setFormOpen(false)}
        title="สร้างทะเบียน (ร่าง)"
        footer={<Button onClick={() => setFormOpen(false)}>ปิด</Button>}
      >
        {blocked.length ? notice : <p className="muted">กำลังโหลดข้อมูลที่ฟอร์มต้องใช้ (รายชื่อลูกค้า · รายการสินค้า · ทะเบียนที่มีอยู่)…</p>}
      </Modal>
    </Workspace>
  );
}
