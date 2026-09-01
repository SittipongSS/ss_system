"use client";
// ── เปิดคำร้อง — เป็น "หน้า" ไม่ใช่โมดัล ────────────────────────────────
//
// ⭐ **เหตุผลไม่ใช่ความกว้าง** (`Modal size="xl"` = 1040px มีอยู่แล้ว พอสำหรับตาราง)
// แต่เป็นสองข้อนี้:
//
//   1 **ขั้นทบทวนก่อนเลขที่ออก** — หน้านี้จบที่ "บันทึกร่าง" แล้วส่งที่หน้ารายละเอียด
//     ⇒ ได้ตรวจของก่อนกดส่งซึ่งย้อนไม่ได้ · โมดัลเดินสามขั้นรวดจึงไม่มีจังหวะนั้น
//     ⭐ ไฟล์แนบได้ตั้งแต่ฟอร์มนี้แล้ว (มติผู้ใช้ 2026-08-08) — เก็บใน `form.files`
//     แล้ว `saveDraft` อัปให้หลังได้ id · หน้ารายละเอียดยังแนบเพิ่ม/ลบได้เหมือนเดิม
//   2 **prefill จากหน้าดีล** — `/requests/new?kind=product_dev&dealId=…`
//     โมดัลต้องส่ง props ผ่านทุกจุดที่เปิดมัน = เพิ่มทางที่ต้องดูแล
//
// ⚠️ **ห้ามทำทั้งสองเปลือก** — ครอบ `RequestForm` ตัวเดียวกันได้ก็จริง แต่จะได้แถบปุ่ม
// กับข้อความ blocker สองชุดที่ต้องคอยดูแลให้ตรงกัน ซึ่งเป็นโรคเดียวกับที่กฎ
// AGENTS.md ห้ามไว้เรื่องฟอร์มสร้าง/แก้ ⇒ โมดัลในคิวถูกถอดออกพร้อมกับ PR นี้
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MessageCircleQuestion } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import { DetailPageLayout } from "@/components/ui/DetailPage";
import { DocumentControlCard, DocumentReadinessList } from "@/components/ui/DocumentControlPanel";
import { requiredChecks } from "@/lib/requests/formTabs";
import Toast from "@/components/ui/Toast";
import RequestForm, { emptyRequestForm } from "@/components/requests/RequestForm";
import { createRequestDraft, requestFormBlocker, uploadDraftFiles } from "@/lib/master/requestCreate";
import { requestKindLabel } from "@/lib/master/requestTypes";
import { scentCountForOrder } from "@/lib/requests/scentDesignOrders";
import { cachedFetchJson } from "@/lib/apiCache";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";
import styles from "./page.module.css";
import { apiFetch } from "@/lib/apiFetch";

const asArray = (d) => (Array.isArray(d) ? d : []);

export default function NewRequestPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // prefill จากลิงก์ — มาจากหน้าดีลไหนก็เติมดีลนั้นให้ ไม่ต้องเลือกซ้ำ
  // ⭐ `salesOrderId` มาจากการ์ด "บรีฟกลิ่นของใบนี้" บนหน้า SO — งานพัฒนากลิ่นเริ่มที่
  // ใบสั่งขาย คนที่เพิ่งอนุมัติเสร็จจึงกดต่อได้เลย ไม่ต้องจำเลขที่มาไล่หาใน dropdown
  // ⚠️ **เติมค่าให้เฉย ๆ ไม่ได้ปลดด่าน** — `scentDesignOrderError` ที่ POST ยังตรวจ
  // ครบทุกข้อ (อนุมัติแล้ว · มีบรรทัดออกแบบกลิ่น · ยังไม่เคยเปิดใบ) เหมือนตอนเลือกเอง
  // ⭐ `quotationId` + `billAmount` มาจากปุ่ม "ขอใบวางบิลงวดนี้" บนการ์ดการชำระของ SO
  // (B-5) — คนที่เพิ่งดูงวดอยู่กดต่อได้เลย ไม่ต้องมาไล่หาใบเสนอราคาใน dropdown ซ้ำ
  // ⚠️ **เติมค่าไม่ใช่ปลดด่าน** — ใบต้องอนุมัติแล้ว (ม-ง) และยอดต้องไม่เกินใบ ยังตรวจ
  // ครบทั้งที่ฟอร์มและ POST เหมือนเปิดเองจาก /requests
  const defaults = useMemo(() => ({
    kind: searchParams.get("kind") || "",
    dealId: searchParams.get("dealId") || "",
    projectId: searchParams.get("projectId") || "",
    salesOrderId: searchParams.get("salesOrderId") || "",
    quotationId: searchParams.get("quotationId") || "",
    billAmount: searchParams.get("billAmount") ? Number(searchParams.get("billAmount")) : null,
  }), [searchParams]);
  // ⚠️ กลับไปที่เดิมหลังบันทึก — แพตเทิร์นเดียวกับ pm/tasks · ค่าที่ไม่ใช่เส้นทาง
  // ภายในถูกทิ้ง (open redirect จากโดเมนของเราเองคือของจริงที่เคยหลุดมาแล้ว)
  const back = searchParams.get("returnTo");
  const returnTo = back && back.startsWith("/") && !back.startsWith("//") ? back : "/requests";

  const [form, setForm] = useState(() => emptyRequestForm(defaults));
  /* ⭐ **กันงานหายเมื่อออกจากหน้ากลางคัน** — หัวข้อ scent_dev มี PDR 41 ช่อง +
     บรีฟรายกลิ่น รวมทั้งฟอร์มเกิน 50 ช่อง แต่เดิมไม่มีตัวกันเลย
     ⚠️ ทางที่หายเงียบจริงคือ **กดเมนูซ้าย** ไม่ใช่ปิดแท็บ — `useUnsavedChanges`
     ดักทั้ง `beforeunload` และคลิกลิงก์ภายในแอป (Next นำทางฝั่ง client ไม่ยิง
     beforeunload) · แพตเทิร์นเดียวกับใบเสนอราคา/ใบสั่งขาย
     ⚠️ เทียบกับค่าตั้งต้น **ที่คิดจาก `defaults` ชุดเดียวกัน** — มาจากลิงก์ที่เติม
     ดีล/SO มาให้แล้วต้องไม่นับว่าแก้ · ปิดตอน `saving` เพราะกำลังจะพาไปหน้าถัดไป */
  const pristine = useMemo(() => JSON.stringify(emptyRequestForm(defaults)), [defaults]);
  // ⭐ สองขั้น: เลือกฝ่าย+หัวข้อให้จบ → กดแล้วค่อยกางฟอร์มของหัวข้อนั้น
  // มาจากลิงก์ที่ระบุหัวข้อมาแล้ว (เช่นจากหน้าดีล) = ข้ามขั้นแรกไปเลย ไม่ต้องกดซ้ำ
  // สิ่งที่ผู้ใช้เพิ่งเลือกไว้แล้ว
  const [revealed, setRevealed] = useState(!!defaults.kind);
  const [saving, setSaving] = useState(false);
  useUnsavedChanges(!saving && JSON.stringify(form) !== pristine);
  const [toast, setToast] = useState(null);

  const [projects, setProjects] = useState([]);
  const [deals, setDeals] = useState([]);
  const [salesOrders, setSalesOrders] = useState([]);
  // อ้างอิงเพิ่มของขอเอกสาร (ม-88) — QT กรองตามดีลบนจอ · FG ค้นทั้งทะเบียน
  const [quotations, setQuotations] = useState([]);
  const [products, setProducts] = useState([]);
  const [productTypes, setProductTypes] = useState([]);
  const [scents, setScents] = useState([]);
  const [formulas, setFormulas] = useState([]);
  const [mentionPeople, setMentionPeople] = useState([]);
  /* รายชื่อผู้ใช้ตามตำแหน่ง — ช่องผู้เซ็นของแบบฟอร์ม PDR เสนอชื่อคนที่ถือตำแหน่งนั้น
     ⚠️ ล้มแล้วต้องเงียบ (ว่าง) — คนที่ไม่มี `pm:view` ยังต้องเปิดคำร้องได้ตามปกติ */
  const [people, setPeople] = useState([]);
  // ⭐ ทะเบียนลูกค้า — ฟอร์ม PDR เติม "ชื่อผู้ติดต่อ / Phone-Line" จากที่นี่ (มติผู้ใช้)
  const [customers, setCustomers] = useState([]);
  /* ⭐ **ตัวตนของคนที่กำลังเปิดใบ** (มติผู้ใช้ 2026-08-09: "เติมพรีวิวให้เห็นตั้งแต่
     ตอนกรอกฟอร์ม") — ช่อง "ผู้ร้องขอ (AE)" ของแบบฟอร์ม PDR ถอยมาใช้ชื่อคนเปิดใบ
     เมื่อโครงการยังไม่ระบุผู้ดูแล · ไม่ส่งมา = ช่องขึ้นเส้นประค้างจนกว่าจะกดบันทึก
     ทั้งที่ค่านี้รู้ได้ตั้งแต่ยังไม่กรอกอะไรเลย */
  const [me, setMe] = useState(null);

  useEffect(() => {
    const grab = (url, set) => apiFetch(url, { cache: "no-store" })
      .then((r) => r.json()).then((d) => set(asArray(d))).catch(() => {});
    grab("/api/pm/projects", setProjects);
    grab("/api/sales-planning/deals", setDeals);
    grab("/api/sales-planning/sales-orders", setSalesOrders);
    grab("/api/sales-planning/quotations", setQuotations);
    grab("/api/products", setProducts);
    grab("/api/master/scents", setScents);
    grab("/api/master/formulas", setFormulas);
    // รายชื่อกรองด้วยด่านของเธรดคำร้องมาจาก server แล้ว (ห้ามกรองเองที่ client —
    // @คนที่เปิดคำร้องไม่ได้ = เขาได้แจ้งเตือนที่กดแล้วเจอ 404)
    grab("/api/sa/requests/mentionable", setMentionPeople);
    cachedFetchJson("/api/pm/assignable-users").then((d) => setPeople(d || [])).catch(() => {});
    cachedFetchJson("/api/product-types").then((d) => setProductTypes(d || [])).catch(() => {});
    cachedFetchJson("/api/customers").then((d) => setCustomers(d || [])).catch(() => {});
    apiFetch("/api/users/me").then((r) => (r.ok ? r.json() : null)).then(setMe).catch(() => {});
  }, []);

  // ⭐ บล็อกบรีฟของใบที่ prefill มา — ตอนเลือก SO เองในฟอร์ม `onChange` เป็นคนงอก
  // บล็อกให้ตามจำนวนกลิ่นที่ใบนั้นขาย (ม-38) · มาทางลิงก์ `?salesOrderId=` ไม่มีใครกด
  // ⇒ ต้องงอกที่นี่แทน **หลังรายการ SO โหลดเสร็จ** (ตอน mount ยังไม่รู้ว่าใบนั้นขายกี่กลิ่น)
  //
  // 🐞 ไม่ทำ = ฟอร์มเปิดมาพร้อมใบสั่งขายที่เลือกไว้แล้วแต่ **ไม่มีบล็อกบรีฟสักก้อน**
  // ⇒ กรอกต่อไม่ได้เลย และไม่มีอะไรบอกว่าทำไม (ทางเดียวคือสลับ SO ไปกลับให้ onChange ยิง)
  //
  // ⚠️ เงื่อนไข `!form.briefs.length` กันไม่ให้ลบสิ่งที่ผู้ใช้พิมพ์ไปแล้วตอน re-render
  useEffect(() => {
    if (!form.salesOrderId || form.briefs?.length) return;
    const so = salesOrders.find((row) => row.id === form.salesOrderId);
    if (!so) return; // ยังโหลดไม่ถึง หรือใบนั้นอยู่นอกขอบเขตของผู้ใช้
    const count = scentCountForOrder(so.lines || []);
    if (!count) return; // ใบไม่ใช่งานออกแบบกลิ่น — ด่านฝั่ง server เป็นคนบอกเหตุผล
    setForm((prev) => (prev.briefs?.length
      ? prev
      : { ...prev, briefs: Array.from({ length: count }, () => ({ label: "" })) }));
  }, [salesOrders, form.salesOrderId, form.briefs]);

  // ปุ่มส่งเปิดเมื่อกรอกครบ — **ด่านเดียวกับข้อความที่ฟอร์มแสดง**
  // ห้ามเขียนเงื่อนไขเพิ่มที่นี่: เงื่อนไขที่ปุ่มรู้แต่ฟอร์มไม่รู้ = ปุ่มจางแบบไม่บอกเหตุผล
  const blocker = requestFormBlocker(form);

  // ⭐ **บันทึกร่างอย่างเดียว ไม่ส่ง** — เลขที่ออกตอนกดส่งที่หน้ารายละเอียด
  // สองขั้นนี้แยกกันเพราะการออกเลขที่ย้อนไม่ได้ (trigger ทำให้ `docNo` immutable)
  // (ไฟล์ที่แนบในฟอร์มถูกอัปเป็นขั้นสองหลังได้ id — ดู `uploadDraftFiles`)
  // 🐞 **บั๊กที่ผู้ใช้เจอ (2026-08-07): "กดบันทึกร่างไม่ได้ ปุ่มจาง ไม่มีข้อความบอก"**
  //
  // เดิมไม่มี try/catch — `createRequestDraft` โยนได้จริงเมื่อ `fetch` เอง reject
  // (เน็ตหลุด · เซิร์ฟเวอร์ตอบ HTML แทน JSON · deploy กำลังสลับ) ⇒ `setSaving(false)`
  // **ไม่เคยถูกเรียก** ⇒ ปุ่มค้างจางตลอดกาลโดยไม่มีอะไรบอกเหตุผล และผู้ใช้ไม่มีทาง
  // รู้ว่าพลาดเพราะอะไร · หน้ารายละเอียดใช้แพตเทิร์นถูกอยู่แล้ว (`call()` มี finally)
  // — หน้านี้เป็นที่เดียวที่หลุด
  //
  // ⚠️ **`finally` ไม่ใช่ตัวเลือก** — ทุกปุ่มที่ตั้ง `saving` ต้องมีทางคืนค่าเสมอ
  // ไม่งั้นความผิดพลาดหนึ่งครั้งล็อกหน้าจอทิ้งจนกว่าจะรีเฟรช
  const saveDraft = async () => {
    setSaving(true);
    try {
      const { id, error } = await createRequestDraft(form);
      if (error) { setToast({ kind: "error", msg: error }); return; }
      // ⭐ อัปไฟล์ที่แนบไว้ในฟอร์ม (มติผู้ใช้ 2026-08-08: แนบได้ตั้งแต่หน้าสร้าง) —
      // ต้องมี id ก่อนถึงอัปได้ จึงมาหลัง create เสมอ
      // ⚠️ อัปพลาด **ไม่ rollback ร่าง** — ของที่อัปแล้วอยู่ครบ พาไปหน้ารายละเอียด
      // พร้อมบอกว่าไฟล์ไหนไม่เข้า ให้แนบต่อที่นั่น (แถวไฟล์แนบมีอยู่แล้ว)
      if (id) {
        const uploadError = await uploadDraftFiles(id, form.files);
        if (uploadError) setToast({ kind: "error", msg: `${uploadError} — แนบซ้ำได้ที่หน้ารายละเอียด` });
        router.push(`/requests/${id}`);
      }
    } catch (e) {
      setToast({ kind: "error", msg: e?.message || "บันทึกร่างไม่สำเร็จ" });
    } finally {
      setSaving(false);
    }
  };

  /* ── แผงจัดการด้านข้าง — ผังเดียวกับหน้าสร้างใบเสนอราคา (มติผู้ใช้ 2026-08-09)
     ⭐ รายการความพร้อมมาจาก `requiredChecks` **ตัวเดียวกับเกจบนแท็บและด่านส่ง**
     ⇒ สามที่พูดตรงกันเสมอ (แผงบอกว่าครบ แต่ปุ่มกดไม่ได้ = สิ่งที่ทำให้คนเลิกเชื่อจอ)
     ⚠️ ปุ่มลบ/แก้ **ไม่ได้อยู่ที่นี่** — ร่างที่บันทึกแล้วมีชีวิตอยู่ที่หน้ารายละเอียด
     ซึ่งมีทั้งส่ง/ยกเลิก/ลบครบอยู่แล้ว · ทำซ้ำที่นี่ = สองที่ที่ต้องคอยให้ตรงกัน */
  const readinessItems = revealed
    ? requiredChecks(form).map((c) => ({
      id: `${c.tab}-${c.label}`,
      label: c.label,
      ready: c.ok,
      detail: c.ok ? undefined : "ยังไม่ได้กรอก",
    }))
    : [{
      id: "kind",
      label: "เลือกฝ่ายและหัวข้อ",
      ready: !!form.kind,
      detail: form.kind ? requestKindLabel(form.kind) : "เลือกก่อนจึงกางฟอร์มได้",
    }];

  const controlPanel = (
    <DocumentControlCard
      eyebrow="REQUEST CONTROL"
      title="จัดการคำร้อง"
      status="ฉบับใหม่"
      statusColor="var(--accent)"
      statusDescription="ตรวจความพร้อมแล้วบันทึกเป็นร่าง"
      notices={<DocumentReadinessList items={readinessItems} label="ความพร้อมของคำร้อง" />}
      primaryAction={{
        id: "save",
        kind: "save",
        label: saving ? "กำลังบันทึก…" : "บันทึกร่าง",
        disabled: !revealed || !!blocker,
        // ⚠️ ปุ่มที่กดไม่ได้ต้องบอกเหตุผล — ด่านตัวเดียวกับที่ฟอร์มใช้
        disabledReason: !revealed ? "เลือกฝ่ายและหัวข้อก่อน" : blocker || undefined,
        onClick: saveDraft,
      }}
      secondaryActions={[{
        id: "cancel",
        kind: "open",
        icon: null,
        label: "ยกเลิก",
        variant: "ghost",
        href: returnTo,
      }]}
      busy={saving}
      footer="บันทึกแล้วไปต่อที่หน้ารายละเอียด — เลขที่ออกตอนกดส่ง · ร่างที่ยังไม่ส่งลบได้ที่นั่น"
    />
  );

  return (
    <Workspace
      icon={<MessageCircleQuestion size={22} />}
      title="เปิดคำร้อง"
      subtitle="คำร้องจะถูกสร้างเป็นร่างก่อน — เลขที่จะออกตอนกดส่ง"
      back={{ href: returnTo, label: "กลับ" }}
    >
      <DetailPageLayout aside={controlPanel} asideLabel="ความพร้อมและการจัดการคำร้องใหม่">
      <div className={styles.form}>
        <RequestForm
          value={form} onChange={setForm} disabled={saving}
          projects={projects} deals={deals} salesOrders={salesOrders} customers={customers}
          quotations={quotations} products={products} me={me}
          scents={scents} formulas={formulas} productTypes={productTypes}
          mentionPeople={mentionPeople} people={people}
          // @ อยู่ที่หน้ารายละเอียด (แจ้งเตือนออกตอนกดส่ง) · ช่องไฟล์อยู่ในฟอร์มแล้ว
          // — saveDraft อัปให้หลังได้ id (มติผู้ใช้ 2026-08-08)
          deferMentions
          // เหตุผลที่ยังบันทึกไม่ได้ย้ายไปอยู่ติดปุ่ม (ด่านตัวเดียวกัน คนละที่วาง)
          showBlocker={false}
          revealed={revealed}
          // ⭐ ปุ่มคุมหัวข้ออยู่ติดช่องหัวข้อ ไม่ใช่แถบปุ่มล่าง · สลับป้ายตามขั้น
          // ⚠️ "เปลี่ยนหัวข้อ" **ล้างฟอร์มทิ้ง** เหลือแค่ฝ่าย/หัวข้อ — ค่าเดิมค้างอยู่คือ
          // ของที่ถูกส่งไปกับคำร้องหัวข้อใหม่โดยไม่มีใครเห็น · และตอนกางฟอร์มแล้ว
          // ดรอปดาวน์ถูกล็อก ⇒ **ทางเดียวที่เปลี่ยนได้คือกดปุ่มนี้** เปลี่ยนโดยไม่ตั้งใจไม่ได้
          topicAction={revealed ? {
            // บอกให้ครบว่าปลดล็อกอะไร — ปุ่มปลดทั้งฝ่ายและหัวข้อ ไม่ใช่หัวข้ออย่างเดียว
            label: "เปลี่ยนฝ่าย/หัวข้อ",
            onClick: () => {
              setForm(emptyRequestForm({ ...defaults, dept: form.dept, kind: form.kind }));
              setRevealed(false);
            },
          } : {
            // ⭐ ป้ายบอก **สิ่งที่จะได้** ไม่ใช่สิ่งที่ปุ่มทำ — "แสดงฟอร์ม" ไม่ได้บอกว่า
            // ฟอร์มอะไร · ใส่ชื่อหัวข้อลงไปเลยจะเห็นตั้งแต่ยังไม่กดว่ากำลังจะกรอกอะไร
            label: form.kind ? `กรอกฟอร์ม${requestKindLabel(form.kind)}` : "กรอกฟอร์ม",
            // ⭐ **ปุ่มหลักของขั้นนี้** — ขั้นแรกยังไม่มีปุ่ม "บันทึกร่าง" (ยังไม่มีอะไร
            // ให้บันทึกนอกจากฝ่ายกับหัวข้อ) ⇒ นี่คือปุ่มเดียวที่พาไปต่อได้ทั้งหน้า
            // เดิมเป็น quiet ตัวเล็กลอยอยู่มุมขวา อ่านเหมือนข้อความจาง ไม่ใช่ปุ่ม
            tone: "accent",
            variant: "filled",
            size: "md",
            // ⚠️ **ปุ่มที่กดไม่ได้ต้องบอกเหตุผล** (กฎเดียวกับ `requestFormBlocker`) —
            // จางเฉย ๆ คือสิ่งที่ทำให้คนคิดว่าระบบพัง แล้วไปหาสาเหตุผิดที่
            disabled: !form.kind,
            hint: form.kind ? null : "เลือกฝ่ายและหัวข้อก่อน",
            onClick: () => setRevealed(true),
          }}
        />

        {/* ⚠️ **ไม่มีแถบปุ่มล่างแล้ว** — ปุ่มทั้งใบย้ายไปแผงจัดการด้านข้าง (ผังเดียว
            กับหน้าสร้างใบเสนอราคา) · ปุ่มคุมหัวข้อยังอยู่ติดช่องหัวข้อเหมือนเดิม */}
      </div>
      </DetailPageLayout>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}
