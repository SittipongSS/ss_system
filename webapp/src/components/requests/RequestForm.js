"use client";
// ── ฟอร์มเปิดคำร้องข้ามฝ่าย ─────────────────────────────────────────────
//
// ⭐ **ลำดับคำถามคือของจริงที่ผู้ใช้สั่งไว้ (แผนฉบับที่ 3, 2026-08-04)** ห้ามสลับ:
//     1 ฝ่าย → 2 หัวข้อ → 3 ของที่หัวข้อนั้นต้องอ้าง → 4 ชื่อเรื่อง + รายละเอียด
//     5 วันที่ต้องการคำตอบ + ด่วน
// เหตุผลที่ลำดับนี้ไม่ใช่เรื่องความสวยงาม: คนเปิดคำร้องคิดจาก **"จะถามใคร"** ก่อน
// "ถามเรื่องอะไร" เสมอ · ของเดิมกลับหัว (เลือกหัวข้อก่อน แล้วระบบเดาฝ่ายจากชนิดวัสดุ)
// ทำให้ฝ่ายผู้ตอบเป็นผลข้างเคียงที่ผู้ใช้มองไม่เห็นว่าตัวเองเลือกอะไรไป
//
// ⚠️ ฝ่ายเป็น **ปุ่มเรียงกัน ไม่ใช่ดรอปดาวน์** — มีสามตัวและเป็นคำถามแรก · ดรอปดาวน์
// ซ่อนจำนวนตัวเลือกไว้จนกว่าจะกด ทำให้คำถามแรกดูเหมือนช่องกรอกเปล่า ๆ · ฝ่ายที่ยัง
// เปิดไม่ได้ (`PLANNED_REQUEST_DEPTS`) แสดงแบบจางและกดไม่ได้ ไม่ใช่ซ่อน
//
// ⚠️ ไม่มีช่อง "หมายเหตุ" แล้ว (มติเดียวกัน) — รายละเอียดช่องเดียวจบ
//
// ⚠️ ฟอร์มเดียวใช้ทั้งหน้าคำร้องและโมดัลในใบขอราคาผลิต (กฎ AGENTS.md) — ต่างกันที่ธง
// ไม่ใช่คนละไฟล์: `lockKind` (บริบทกำหนดหัวข้อเอง) · `deferMentions` (หน้าที่บันทึก
// เป็นร่างก่อน แล้วไปกด @ ที่หน้ารายละเอียด) · `showBlocker` (ใครวางข้อความ
// "ยังกรอกไม่ครบ" — เนื้อฟอร์ม หรือแถบปุ่มของผู้เรียก)
// ⭐ **ช่องแนบไฟล์อยู่ทุกโหมด** (มติผู้ใช้ 2026-08-08: "อยากให้แนบไฟล์ได้ตั้งแต่หน้า
// สร้างคำร้องเลย") — ไฟล์เก็บใน `value.files` แล้วผู้เรียกอัปหลังได้ id ของคำร้อง
import { useState } from "react";
import { Paperclip, Plus, X, AtSign } from "lucide-react";
import Tabs from "@/components/ui/Tabs";
import SectionRail from "@/components/ui/SectionRail";
import OptionTiles from "@/components/ui/OptionTiles";
import Button from "@/components/ui/Button";
import SearchableSelect from "@/components/ui/SearchableSelect";
import DealPicker from "@/components/pm/DealPicker";
import DateInput from "@/components/ui/DateInput";
import Textarea from "@/components/ui/Textarea";
import FormZone from "@/components/ui/FormZone";
import { productIdentity } from "@/lib/master/productIdentity";
import ProductDevLines from "@/components/requests/ProductDevLines";
import DocumentLines from "@/components/requests/DocumentLines";
import PdrForm, { emptyPdr, pdrRailSections } from "@/components/requests/PdrForm";
import { pdrContext } from "@/lib/requests/pdrFields";
import { BILLING_DOC_VOCABULARY } from "@/lib/requests/kinds/fn/billingDocTypes";
import {
  PLANNED_REQUEST_DEPTS, requestOptionalRefs,
  REQUEST_DEPTS, REQUEST_DEPT_LABELS,
  kindsForDept, lineShapeForKind, requestHasItems,
  requestHasPdr,
  requestKindFamily, requestKindLabel, requestKindMeta, requestNeedsRef, requestStepLabel,
} from "@/lib/master/requestTypes";
import { requestFormBlocker } from "@/lib/master/requestCreate";
import { requestFormTabs } from "@/lib/requests/formTabs";
import {
  scentCountForOrder, scentDesignOrderOptions, scentDesignOrderSkipHint, scentDesignOrderSkips,
} from "@/lib/requests/scentDesignOrders";
import { isScentUsable } from "@/lib/master/scents";
import { isFormulaUsable } from "@/lib/master/formulas";
import { MAX_MENTIONS } from "@/lib/master/mentions";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, UPLOAD_ACCEPT_ATTR } from "@/lib/master/attachmentTypes";
import styles from "./requestForm.module.css";


// ช่องที่ **ระบบเติมให้** — เส้นประ อ่านอย่างเดียว ไม่ใช่ดรอปดาวน์ที่จางลง
// (แผนฉบับที่ 3) · ปล่อยให้เลือกซ้ำได้เมื่อไร จะมีวันที่ SO ชี้ดีลหนึ่งแต่คนกรอก
// เลือกอีกดีลหนึ่ง แล้วไม่มีอะไรบอกว่าอันไหนถูก
function DerivedField({ label, value, from }) {
  return (
    <div className="form-group">
      <span className={styles.fieldLabel}>{label}</span>
      <div className={styles.derived} data-empty={value ? undefined : "1"}>
        {value || from}
      </div>
    </div>
  );
}

// ค่าเริ่มต้น: **ไม่เดาหัวข้อให้** — หัวข้อขึ้นกับฝ่ายซึ่งยังไม่ได้เลือก
//
// ⭐ **ฝ่ายเลือกให้เลยเมื่อเปิดใช้จริงอยู่ฝ่ายเดียว** (มติผู้ใช้ 2026-08-08:
// *"การขอเอกสาร มันเป็นคำร้องไป RD นิ จะมีฝ่ายทำไม"*) — ตอนนี้ `REQUEST_DEPTS`
// เหลือ RD ตัวเดียว ⇒ ขั้น "เลือกฝ่าย" ไม่ได้ตัดสินใจอะไร แค่คลิกทิ้งเปล่า ๆ
// ⚠️ **ไม่ได้ซ่อนแถวฝ่าย** — จัดซื้อ/บัญชียังโชว์แบบจางเพื่อบอกว่า "มีอยู่ แต่ยัง
// ไม่เปิด" · เปิดฝ่ายที่สองเมื่อไร บรรทัดนี้จะกลับไปเป็นค่าว่างเองโดยอัตโนมัติ
const onlyDept = () => (REQUEST_DEPTS.length === 1 ? REQUEST_DEPTS[0] : "");

export const emptyRequestForm = (over = {}) => ({
  projectId: "",
  dealId: "",
  salesOrderId: "",   // บรีฟกลิ่น (บังคับ) หรืออ้างอิงของขอเอกสาร (ไม่บังคับ · ม-88)
  quotationId: "",    // อ้างอิงของขอเอกสาร (ไม่บังคับ · ม-88)
  productIds: [],     // FG หลายรายการ (ไม่บังคับ · ม-89)
  productTypeId: "",  // หมวดสินค้าที่จะขึ้นตัวอย่าง
  dept: onlyDept(),
  kind: "",
  title: "",
  body: "",
  urgent: false,
  urgentReason: "",
  requestedDueDate: "",
  scentId: "",
  formulaId: "",
  productId: "",
  formulaCode: "",
  formulaName: "",
  items: [],
  // แบบฟอร์ม PDR + บรีฟรายกลิ่น — ใช้เฉพาะหัวข้อที่ประกาศ `hasPdr`
  pdr: emptyPdr(),
  briefs: [],
  files: [],       // File[] — อัปหลังคำร้องถูกสร้าง (ยังไม่มี entityId ตอนกรอก)
  mentions: [],    // [{ id, name }] ที่ผู้ใช้เลือกจากรายการ
  ...over,
});

// รายการตั้งต้นตามรูปร่างบรรทัดของหัวข้อ
// (ไม่ export: ใช้เฉพาะในไฟล์นี้ · export ที่ไม่มีผู้เรียกคือโค้ดตายที่ lint ไม่จับ)
function itemsForKind() {
  // ⚠️ **เริ่มที่ศูนย์แถวเสมอ** (มติผู้ใช้ 2026-08-09: "กดเพิ่มรายการก่อน ยังไม่ได้มี
  // รายการแรก") — ของเดิมงอกแถวเปล่าให้ทันทีที่เลือกหัวข้อ ⇒ ใบที่คนยังไม่ได้แตะ
  // รายการเลยก็มีแถวว่างติดไปด้วย และเกจ "รายการอย่างน้อย 1 รายการ" ก็ติ๊กเขียว
  // ทั้งที่ยังไม่มีของจริงสักชิ้น
  // ⚠️ สลับหัวข้อยังต้องล้างแถวเดิมอยู่ — บรรทัดแต่ละรูปร่างเป็นคนละโครง ลากข้าม
  // หัวข้อแล้วจะได้แถวที่ไม่มีหมวด/กลิ่น (นี่คือเหตุผลเดิมของฟังก์ชันนี้)
  return [];
}

export default function RequestForm({
  value, onChange,
  // ทะเบียน/รายการที่ฟอร์มอ้างตามหัวข้อ (ดู `needs` ใน lib/master/requestTypes.js)
  projects = [], deals = [], salesOrders = [], scents = [], formulas = [], productTypes = [],
  me = null,               // ผู้ใช้ที่กำลังเปิดใบ — ใช้พรีวิว "ผู้ร้องขอ" ก่อนบันทึก
  customers = [], quotations = [], products = [],
  // ล็อกหัวข้อไว้เมื่อบริบทเป็นตัวกำหนดเอง (เปิดจากบรรทัดในใบขอราคาผลิต)
  lockKind = false, disabled = false,
  mentionPeople = [],
  // ผู้เรียกบันทึกเป็น "ร่าง" ก่อน แล้วให้กล่าวถึง (@) ที่หน้ารายละเอียด —
  // @ ยิงแจ้งเตือนตอน "กดส่ง" ไม่ใช่ตอนบันทึกร่าง ⇒ โชว์ตอนร่างจะเป็นช่องที่กรอกแล้ว
  // ไม่เกิดอะไรขึ้นในจังหวะที่ผู้ใช้คาดว่าเกิด
  // ⚠️ **คุมเฉพาะ @ ไม่คุมช่องไฟล์แล้ว** — เดิมชื่อ `deferAttachments` ซ่อนทั้งคู่
  // ผู้ใช้เจอเองว่า "ต้องบันทึกก่อนถึงแนบได้" (มติ 2026-08-08) · ไฟล์เก็บในฟอร์มได้
  // ตั้งแต่แรกเพราะผู้เรียกอัปให้หลังมี id เสมอ (`uploadDraftFiles`)
  deferMentions = false,
  // ข้อความ "ยังกรอกไม่ครบ" อยู่ในเนื้อฟอร์มหรือไม่ — หน้าเต็มย้ายไปไว้ที่แถบปุ่ม
  // (ด่านตัวเดียวกัน `requestFormBlocker` คนละที่วาง ไม่ใช่คนละกฎ)
  showBlocker = true,
  // ⭐ ถามฝ่าย/หัวข้อให้จบก่อน แล้วค่อยกางฟอร์มของหัวข้อนั้น (มติผู้ใช้ 2026-08-06)
  // ช่องข้างล่างสลับหน้าตาไปทั้งชุดตามหัวข้อ — กางไว้ตั้งแต่ยังไม่เลือกจึงเป็นฟอร์มที่
  // เปลี่ยนรูปใต้มือคนอ่าน · โมดัลที่ล็อกหัวข้อมาแล้วไม่ต้องผ่านขั้นนี้ (ค่าตั้งต้น true)
  revealed = true,
  // ปุ่มที่อยู่ติดช่องหัวข้อ — { label, onClick } · ผู้เรียกตัดสินว่าเป็น "แสดงฟอร์ม"
  // หรือ "เปลี่ยนหัวข้อ" เพราะมันเป็นเรื่องของสองขั้นในหน้านั้น ไม่ใช่กฎของฟอร์ม
  topicAction = null,
}) {
  const set = (patch) => onChange({ ...value, ...patch });
  const items = value.items || [];
  const kind = value.kind || "";
  const meta = requestKindMeta(kind) || {};
  // ⭐ ข้อความทุกช่องมาจาก **ทะเบียนหัวข้อ** ไม่ใช่ `kind === "..."` ในฟอร์ม
  // (ของเดิมผูกกับหัวข้อเก่าที่เปิดใบใหม่ไม่ได้แล้ว หัวข้อที่ใช้จริงเลยไม่เคยได้ข้อความ
  //  ของตัวเอง) · ทะเบียนเติมค่ากลางให้ครบทุกคีย์แล้ว จึงอ่านตรง ๆ ได้ไม่ต้อง fallback
  const copy = meta.form || {};
  const hasItems = requestHasItems(kind);
  // รูปร่างบรรทัดมาจากทะเบียนหัวข้อที่เดียว — ฟอร์มไม่เช็ค `kind === "..."` เอง
  const lineShape = lineShapeForKind(kind);
  const dept = value.dept || "";

  // ช่องที่ต้องกรอกมาจากทะเบียนหัวข้อที่เดียว — ห้ามเขียน `kind === "..."` ในฟอร์ม
  // (ธงเพี้ยนจาก server ไม่ได้ เพราะอ่านตัวเดียวกัน)
  const needsProject = requestNeedsRef(kind, "project");
  const needsSalesOrder = requestNeedsRef(kind, "salesOrder");
  // อ้างอิงเพิ่มไม่บังคับ (ม-88) — QT/SO/FG ของหัวข้อขอเอกสาร
  const optionalRefs = requestOptionalRefs(kind);
  const needsScent = requestNeedsRef(kind, "scent");
  const needsFormula = requestNeedsRef(kind, "formula");
  // ⚠️ **หลับอยู่ตั้งแต่ 0204** — คอลัมน์ `dept_requests.productTypeId` ถูก DROP ทิ้ง
  // `productType` จึงถูกถอดออกจาก REQUEST_NEEDS ⇒ ตัวนี้เป็น false เสมอ และช่อง
  // ข้างล่างไม่เรนเดอร์ · **ตั้งใจไม่ลบโค้ดทิ้ง**: หมวดสินค้ากลับมาแน่ตอนหัวข้อ
  // "พัฒนาผลิตภัณฑ์" มาแทน Mock-up แต่กลับมาเป็น **รายแถว**
  // (`dept_request_items.categoryCode`) ผ่าน ProductCategorySelect ตัวกลาง
  const needsProductType = requestNeedsRef(kind, "productType");

  const selectedProductType = productTypes.find((t) => String(t.id) === String(value.productTypeId));
  // ⚠️ กลิ่นที่เลือกได้ต้องเป็นของลูกค้าเจ้าของดีลเท่านั้น (มติ 9) — ลูกค้ามาจากดีล
  // ที่เลือกไว้ ไม่ใช่จากที่ผู้ใช้พิมพ์ (คำร้องไม่มีช่องลูกค้าให้เลือกเอง)
  const selectedDeal = deals.find((d) => d.id === value.dealId) || null;

  // ── ของที่ "เติมจาก SO" — ลูกค้า · ดีล · ขั้นในไทม์ไลน์ ────────────────────
  // ⚠️ ค่าที่โชว์ตรงนี้เป็น **ตัวอย่างของสิ่งที่ server จะเขียนจริง** ไม่ใช่ของที่ถูก
  // ส่งไปกับ payload (`requestPayload` ไม่ส่ง projectId/customerId เลย) — โชว์เพื่อให้
  // เห็นก่อนกดว่าใบนี้จะไปเกาะดีลไหน ไม่ใช่ให้แก้
  const selectedSo = salesOrders.find((so) => so.id === value.salesOrderId) || null;
  const soDeal = selectedSo ? deals.find((d) => d.id === selectedSo.dealId) || null : null;
  const stepLabel = requestStepLabel(kind);
  const hasPdr = requestHasPdr(kind);
  // ⭐ จำนวนกลิ่นมาจากใบสั่งขาย ไม่ใช่ช่องที่คนกรอก — ใบที่ผ่านด่านย่อมมีจำนวนเสมอ
  // (ดู lib/requests/scentDesignOrders.js) · ผู้เรียกส่งบรรทัดของ SO มาให้
  const scentCount = selectedSo ? scentCountForOrder(selectedSo.lines || []) : null;
  // ⭐ ลิสต์ต้องตรงกับป้าย "ใบสั่งขายออกแบบกลิ่น" — กรองด้วยด่านตัวเดียวกับ server
  // (`scentDesignOrderError`) · ค่าที่เลือกไว้แล้วคงอยู่เสมอผ่าน `keepId`
  // ⚠️ ไม่ใช้ `useMemo` — ไฟล์นี้เป็น component ไร้ hook ทั้งไฟล์โดยตั้งใจ (controlled
  // ล้วน) และงานตรงนี้คือกรองอาเรย์ที่โหลดมาแล้วไม่กี่สิบแถว ไม่คุ้มกับ hook ตัวแรก
  const soOptions = scentDesignOrderOptions(salesOrders, { keepId: value.salesOrderId || null });
  // ตอบคำถาม "ทำไมใบของฉันไม่อยู่ในลิสต์" — สามเหตุผลนี้ทางแก้คนละทางกันหมด
  const soSkips = scentDesignOrderSkips(salesOrders);

  // ⭐ ค่าที่ระบบเติมให้ในแบบฟอร์ม PDR — **ตัวเดียวกับที่ server ใช้** (`pdrContext`)
  //
  // 🐞 ก่อนหน้านี้หน้านี้ส่งแค่ `customer`/`deal` ⇒ ผู้ร้องขอ AC · ชื่อผู้ติดต่อ ·
  // Phone/Line · วันที่คาดหวังตัวอย่าง ขึ้นเป็นเส้นประ "เติมจาก…" ค้างอยู่ทั้งที่
  // เลือกใบสั่งขายแล้ว — ส่วนหน้ารายละเอียดกับเอกสารเติมครบ ⇒ จอเดียวกันคนละคำตอบ
  const pdrDerived = pdrContext({
    // ⚠️ `requestedDueDate`/`urgent` อยู่บนฟอร์ม ไม่ใช่บนแถวที่บันทึกแล้ว — ส่งเข้าไป
    // ในรูปเดียวกับแถวคำร้อง เพื่อให้ตัวคำนวณเป็นตัวเดียวกันจริง ๆ ไม่ใช่แค่คล้ายกัน
    // ⚠️ รูปเดียวกับแถวคำร้องจริง เพื่อให้ตัวคำนวณเป็นตัวเดียวกัน ไม่ใช่แค่คล้ายกัน
    // ⭐ `requestedByName` = คนที่กำลังเปิดใบ — ทำให้ "ผู้ร้องขอ (AE)" พรีวิวได้
    //    ตั้งแต่ยังไม่บันทึก (โครงการที่ระบุผู้ดูแลไว้ยังชนะเสมอ ตามลำดับใน pdrContext)
    request: {
      requestedDueDate: value.requestedDueDate,
      urgent: value.urgent,
      customerName: selectedSo?.customerName || null,
      requestedByName: me?.name || null,
    },
    project: projects.find((p) => p.id === (soDeal?.projectId || value.projectId)) || null,
    customer: customers.find((c) => c.id === selectedSo?.customerId) || null,
    deal: soDeal,
    briefs: value.briefs || [],
    // ⚠️ จำนวนกลิ่นมาจากบรรทัดของใบสั่งขาย ไม่ใช่จำนวนก้อนบรีฟ — ฟอร์มต้องโชว์เลข
    // เดียวกับที่จะพิมพ์ลงกระดาษ ไม่งั้นคนกรอกเห็น 3 แต่เอกสารออกมา 1 (โหมดบรีฟรวม)
    salesOrderLines: selectedSo?.lines || null,
  });

  // ด่านเดียวกับที่ปุ่มส่งใช้ — ฟอร์มไม่คิดกฎเอง (บทเรียน: หน้าจอคำนวณเงื่อนไข
  // action เองแล้วเพี้ยนจาก server จนปุ่มไม่เคยโผล่)
  const shapeError = requestFormBlocker(value);

  // ── แท็บ + เกจ (มติผู้ใช้ 2026-08-09 "แบบ A") ─────────────────────────
  // ⚠️ **state ของแท็บเป็น "ตำแหน่งสายตา" ไม่ใช่ข้อมูลของฟอร์ม** — ค่าที่กรอกยัง
  // controlled ทั้งหมดผ่าน `value/onChange` เหมือนเดิม · เก็บไว้ในนี้เพื่อให้ข้อความ
  // "ยังขาดอะไร" กระโดดไปแท็บนั้นได้ (ผู้เรียกไม่ต้องรู้จักแท็บ)
  const [tab, setTab] = useState("work");
  const [pdrSection, setPdrSection] = useState("request");
  // ⚠️ ตัวที่ "เลือกค้างไว้" ยังไม่ใช่ข้อมูลของคำร้อง — มันเข้า `value.productIds`
  // ตอนกด "เพิ่ม" เท่านั้น · เก็บไว้ในนี้เพื่อให้ฟอร์มยัง controlled ล้วนเหมือนเดิม
  const [fgPick, setFgPick] = useState("");
  const formTabs = requestFormTabs(value, { optionalRefs });
  // หัวข้อเปลี่ยน = ชุดแท็บเปลี่ยน (แท็บ PDR หายไป) ⇒ ถอยไปแท็บแรกแทนจอว่าง
  const activeTab = formTabs.some((t) => t.key === tab) ? tab : (formTabs[0]?.key || "work");
  const missingAll = formTabs.flatMap((t) => t.required.missing.map((m) => ({ ...m, tabLabel: t.label })));
  const requiredTotal = formTabs.reduce((n, t) => n + t.required.total, 0);
  const requiredFilled = formTabs.reduce((n, t) => n + t.required.filled, 0);
  const railSections = hasPdr ? pdrRailSections(value.pdr || {}, value.briefs || []) : [];
  const activeRail = railSections.some((r) => r.key === pdrSection) ? pdrSection : "request";

  /* หัวข้อของฝ่ายนี้ จัดกลุ่มตามตระกูล — ลำดับกลุ่มมาจากลำดับของ `kindsForDept`
     (ทะเบียนเรียงให้แล้ว) ไม่ใช่ลำดับตัวอักษร */
  const kindFamilies = Object.entries(
    kindsForDept(dept).reduce((acc, k) => {
      const family = requestKindFamily(k);
      (acc[family] = acc[family] || []).push(k);
      return acc;
    }, {}),
  );

  // เปลี่ยนหัวข้อ = ล้างช่องเฉพาะหัวข้อทิ้ง (กลิ่น/สูตร/รายการ) ไม่งั้นค่าเก่าค้าง
  // แล้วถูกส่งไปกับคำร้องหัวข้อใหม่
  const pickKind = (next) => set({
    kind: next,
    scentId: "",
    formulaId: "",
    productId: "",
    productTypeId: "",
    salesOrderId: "",
    quotationId: "",
    productIds: [],
    formulaCode: "",
    formulaName: "",
    items: itemsForKind(next),
  });

  const tabItems = formTabs.map((t) => ({
    key: t.key,
    label: (
      <span className="tab-with-meter">
        {/* วงแหวน = ช่องบังคับของแท็บนี้ · แท็บที่ไม่มีช่องบังคับเลย (PDR) ไม่มีวงแหวน
            — วงแหวนเขียวถาวรจะอ่านเหมือน "ครบแล้ว" ทั้งที่ไม่เคยมีอะไรให้ครบ */}
        {t.required.total > 0 && (
          <span
            className="tab-meter"
            data-state={t.required.missing.length ? "missing" : "full"}
            aria-hidden="true"
          />
        )}
        {t.label}
        {t.optional.total > 0 && (
          <span className="tab-count" title="ช่องไม่บังคับที่กรอกแล้ว">{t.optional.filled}/{t.optional.total}</span>
        )}
      </span>
    ),
  }));

  const addFiles = (list) => {
    const picked = Array.from(list || []).filter((f) => f.size <= MAX_UPLOAD_BYTES);
    if (!picked.length) return;
    set({ files: [...(value.files || []), ...picked] });
  };
  const removeFile = (idx) => set({ files: (value.files || []).filter((_, i) => i !== idx) });

  const toggleMention = (person) => {
    const picked = value.mentions || [];
    const on = picked.some((p) => p.id === person.id);
    if (!on && picked.length >= MAX_MENTIONS) return;
    set({
      mentions: on
        ? picked.filter((p) => p.id !== person.id)
        : [...picked, { id: person.id, name: person.name }],
    });
  };

  return (
    <>
      {/* ── ขั้นเลือกฝ่าย/หัวข้อ — **ยุบเป็นแถบบริบทเมื่อกางฟอร์มแล้ว**
          (มติผู้ใช้ 2026-08-09 "แบบ 1")
          ก่อนหน้านี้ขั้นนี้ไม่ยุบเลย: แถวปุ่มฝ่าย 3 ใบ (สองใบจางกดไม่ได้) + ดรอปดาวน์
          หัวข้อที่ถูกล็อก + ปุ่มเปลี่ยน + คำอธิบาย 3 บรรทัดซ้อนกัน = จอแรกของ
          "พัฒนากลิ่น" มีช่องที่กรอกได้จริงช่องเดียว ที่เหลือเป็นของที่ตัดสินใจไปแล้ว
          ⚠️ **ไม่ใช่ซ่อน** — แถบยังบอกฝ่าย/หัวข้อ/เงื่อนไขของหัวข้อ และมีปุ่มเปลี่ยน
          อยู่ในนั้น · เหตุผลที่กดแล้วเสียอะไรย้ายไปเป็น `title` ของปุ่ม ไม่ใช่บรรทัดจาง */}
      {revealed ? (
        <div className={styles.ctxBar}>
          <span className={styles.ctxDept}>{REQUEST_DEPT_LABELS[dept]?.code || dept}</span>
          <span className={styles.ctxKind}>{requestKindLabel(kind)}</span>
          {meta.dealType && <span className={styles.ctxTag}>ดีล {meta.dealType}</span>}
          {stepLabel && <span className={styles.ctxTag}>{stepLabel}</span>}
          {topicAction && (
            <span className={styles.ctxAction}>
              <Button
                variant="quiet" size="sm" disabled={disabled}
                title="ฟอร์มที่กรอกไว้จะถูกล้าง"
                onClick={topicAction.onClick}
              >
                {topicAction.label}
              </Button>
            </span>
          )}
        </div>
      ) : (
      <>
      {/* ── 1) ฝ่าย → 2) หัวข้อ (หัวข้อถูกกรองด้วยฝ่าย) ───────────────────── */}
      <div className="form-group">
        <span className={styles.fieldLabel} id="req-dept-label">ส่งถึงฝ่ายไหน</span>
        <div className={styles.deptPicker} role="radiogroup" aria-labelledby="req-dept-label">
          {REQUEST_DEPTS.map((d) => (
            <button
              key={d} type="button" role="radio" aria-checked={dept === d}
              className={styles.deptOption} data-on={dept === d ? "1" : undefined}
              disabled={disabled || lockKind || revealed}
              onClick={() => {
                // หัวข้อที่เลือกไว้อาจไม่ใช่ของฝ่ายใหม่ — ล้างเมื่อไม่เข้ากัน
                const keep = kindsForDept(d).includes(kind) ? kind : "";
                set({ dept: d, kind: keep, items: itemsForKind(keep, items) });
              }}
            >
              <span className={styles.deptCode}>{REQUEST_DEPT_LABELS[d]?.code || d}</span>
              <span className={styles.deptName}>{REQUEST_DEPT_LABELS[d]?.name || ""}</span>
            </button>
          ))}
          {/* ฝ่ายที่ยังไม่เปิด — จางและกดไม่ได้ **ไม่ใช่ซ่อน** · ซ่อนเมื่อไร คนที่อยาก
              ส่งเรื่องถึงบัญชีจะไปเปิดใบผิดหัวข้อแทน แล้วเราไม่มีทางรู้ว่ามีคนอยากได้ */}
          {PLANNED_REQUEST_DEPTS.map((d) => (
            <button
              key={d} type="button" role="radio" aria-checked={false} disabled
              className={styles.deptOption} title="ยังไม่เปิดใช้"
            >
              <span className={styles.deptCode}>{REQUEST_DEPT_LABELS[d]?.code || d}</span>
              <span className={styles.deptName}>{REQUEST_DEPT_LABELS[d]?.name || ""}</span>
            </button>
          ))}
        </div>
        <small className={styles.hint}>
          คนเปิดคำร้องคิดจาก &ldquo;จะถามใคร&rdquo; ก่อน &ldquo;ถามเรื่องอะไร&rdquo; เสมอ —
          หัวข้อข้างล่างถูกกรองตามฝ่ายนี้
        </small>
      </div>

      <div className="form-grid">
        <div className="form-group col-span-2">
          <span className={styles.fieldLabel} id="req-kind-label">หัวข้อ</span>
          {/* ⭐ **แผ่นเลือก ไม่ใช่ดรอปดาวน์** (มติผู้ใช้ 2026-08-09) — หัวข้อของฝ่ายหนึ่ง
              มี 4 ตัวตายตัว ซึ่งเข้ากติกาคอนโทรล v2 ข้อแรก (ชุดเล็กต้องกางให้เห็น)
              · ดรอปดาวน์ซ่อนไว้ทั้งจำนวนและคำอธิบาย ⇒ คนที่ยังไม่ชินต้องเปิดอ่านทีละอัน
              · แผ่นพก `summary` มาด้วย ⇒ รู้ตั้งแต่ยังไม่กดว่าหัวข้อไหนทำอะไร
              ⚠️ **จัดกลุ่มตามตระกูล** (ทั่วไป / งานพัฒนา) เหมือนที่ดรอปดาวน์เคยทำ —
              ทิ้งหัวกลุ่มเมื่อไร งานพัฒนากับงานทั่วไปจะดูเท่ากันทั้งที่คนละจังหวะของงาน
              ⚠️ ถ้าวันหนึ่งฝ่ายไหนมีหัวข้อเกิน ~6 ตัว ให้ฝ่ายนั้นถอยไป SearchableSelect
              (กติกา "≤6 กางให้เห็น เกินนั้นใช้ช่องค้น") ไม่ใช่ยัดแผ่นต่อไปเรื่อย ๆ */}
          {dept ? (
            <div className="option-groups" role="group" aria-labelledby="req-kind-label">
              {kindFamilies.map(([family, kinds]) => (
                <div className="option-group" key={family}>
                  <span className="option-group-name">{family}</span>
                  <OptionTiles
                    value={kind}
                    onChange={pickKind}
                    disabled={disabled || lockKind || revealed}
                    ariaLabel={`หัวข้อ ${family}`}
                    options={kinds.map((k) => ({
                      value: k,
                      label: requestKindLabel(k),
                      description: requestKindMeta(k)?.summary || undefined,
                    }))}
                  />
                </div>
              ))}
            </div>
          ) : (
            <small className={styles.hint}>เลือกฝ่ายก่อน</small>
          )}
          {topicAction && (
            <div className={styles.topicAction}>
              {/* ⚠️ **เหตุผลที่กดไม่ได้อยู่ติดปุ่ม** — เดิมข้อความไปโผล่ชิดซ้ายใต้ช่อง
                  ห่างจากปุ่มที่ชิดขวาเกือบเต็มความกว้างการ์ด ⇒ อ่านไม่เป็นคู่กัน
                  (กฎเดียวกับ `requestFormBlocker`: ปุ่มที่กดไม่ได้ต้องบอกเหตุผล) */}
              {topicAction.disabled && topicAction.hint && (
                <small className={styles.hint}>{topicAction.hint}</small>
              )}
              {/* ⭐ อยู่ติดช่องที่มันคุม ไม่ใช่ลอยอยู่แถบปุ่มล่างสุด — คนที่อยากเปลี่ยน
                  หัวข้อจะมองที่ช่องหัวข้อก่อนเสมอ · และตอนกางฟอร์มแล้วช่องนี้ถูกล็อก
                  ปุ่มจึงเป็น **ทางเดียว** ที่เปลี่ยนได้ ไม่ใช่ทางที่สอง
                  ⚠️ **น้ำหนักของปุ่มมาจากผู้เรียก** — ขั้นแรก "กรอกฟอร์ม…" คือปุ่มเดียว
                  ที่พาไปต่อได้ทั้งหน้า จึงต้องเป็นปุ่มหลัก · ส่วน "เปลี่ยนฝ่าย/หัวข้อ"
                  เป็นการถอยกลับ จึงเบา · เดิมเป็น quiet ทั้งคู่ ⇒ ขั้นแรกทั้งหน้า
                  ไม่มีปุ่มหลักสักตัว ปุ่มที่ต้องกดอ่านเหมือนข้อความจาง */}
              <Button
                tone={topicAction.tone}
                variant={topicAction.variant || "quiet"}
                size={topicAction.size || "sm"}
                disabled={disabled || topicAction.disabled}
                onClick={topicAction.onClick}
              >
                {topicAction.label}
              </Button>
            </div>
          )}
          {/* คำอธิบายหัวข้ออยู่ที่ **ขั้นเลือก** ที่เดียว — ตอนนี้คือจังหวะที่มันช่วย
              ตัดสินใจ · พอกางฟอร์มแล้วมันกลายเป็นข้อความค้างจอ (ย้ายเงื่อนไขที่ยัง
              ต้องรู้ระหว่างกรอกไปอยู่ติดช่องที่มันคุมแทน เช่น ใบสั่งขายของบรีฟกลิ่น) */}
          {meta.hint && <small className={styles.hint}>{meta.hint}</small>}
          {meta.dealType && (
            <small className={styles.hint}>ใช้กับดีลประเภท {meta.dealType} เป็นหลัก</small>
          )}
        </div>
      </div>
      </>
      )}

      {revealed && (
      <>
      {/* ── แถบแท็บ + เกจ (มติผู้ใช้ 2026-08-09) ──────────────────────────
          ⚠️ **แท็บซ่อนของ ⇒ ต้องมีคนพาไปหาสิ่งที่ขาด** — บรรทัดใต้แท็บบอกว่าขาด
          ช่องไหนอยู่แท็บไหน และกดแล้วกระโดดไปเลย · ไม่มีบรรทัดนี้เมื่อไร ผู้ใช้จะ
          เจอปุ่มส่งที่กดไม่ได้โดยไม่รู้ว่าต้องไปเปิดแท็บไหน */}
      <div className="tabbar-with-meter">
        <Tabs tabs={tabItems} value={activeTab} onChange={setTab} ariaLabel="ส่วนของฟอร์มคำร้อง" />
        <span className="tab-overall">
          ช่องบังคับ {requiredFilled}/{requiredTotal}
          {/* ⭐ ขีดละ "หนึ่งช่องบังคับ" ไม่ใช่เปอร์เซ็นต์ — ทั้งใบมีช่องบังคับ 1–4 ช่อง
              เท่านั้น การนับขีดจึงตรงกว่า % ที่ต้องแปลงกลับในหัว (และไม่ต้องมี
              inline width ซึ่ง ratchet ห้ามเพิ่ม) */}
          <span
            className="tab-overall-seg" role="progressbar"
            aria-valuenow={requiredFilled} aria-valuemax={requiredTotal}
            aria-label="ช่องบังคับที่กรอกแล้ว"
          >
            {Array.from({ length: requiredTotal }, (_, i) => (
              <i key={i} data-ok={i < requiredFilled ? "1" : undefined} />
            ))}
          </span>
        </span>
      </div>
      {missingAll.length > 0 && (
        <p className="tab-missing">
          <span>ยังขาด</span>
          {missingAll.map((m) => (
            <button
              key={`${m.tab}-${m.label}`} type="button" className="tab-missing-jump"
              onClick={() => setTab(m.tab)}
            >
              {m.label}
              {m.tab !== activeTab && <span className="tab-missing-where"> · {m.tabLabel}</span>}
            </button>
          ))}
        </p>
      )}

      {/* ── แท็บ "งาน" — ของที่หัวข้อนั้นต้องอ้าง ─────────────────────────
          → ช่องที่โผล่มาจากธง `needs` ที่เดียว ไม่ใช่ if เขียนตายตัวในฟอร์ม */}
      {activeTab === "work" && (<>
      {needsProject && (
      <div className="form-grid cols-2">
      <div className="form-group col-span-2">
        <span className={styles.fieldLabel}>ดีล</span>
        {/* ตัวเลือกกลางของระบบ (มติผู้ใช้ 2026-08-06) — เดิมเป็นสองช่อง "โครงการ →
            ดีล" ที่บังคับให้รู้ก่อนว่าดีลอยู่โครงการไหน · โครงการของคำร้องมาจากดีล
            อยู่แล้ว จึงเก็บ projectId จากดีลที่เลือกแทนการให้ผู้ใช้กรอกซ้ำ
            ⚠️ ในแผงค้นด้วย **ชื่อลูกค้า** ได้ (`dealSearchText` รวม customerName) —
            คนที่คิดจากลูกค้าก่อนพิมพ์ชื่อลูกค้าลงช่องค้นได้เลย ไม่ต้องมีช่องแยก */}
        <DealPicker
          deals={deals}
          projects={projects}
          value={value.dealId}
          disabled={disabled}
          onChange={(dealId, deal) => set({ dealId, projectId: deal?.projectId || "" })}
          placeholder="เลือกดีลของคำร้อง"
          ariaLabel="ดีลของคำร้อง"
        />
        {/* กรณีที่เกิดจริงบ่อยบน prod (2026-08-03: 122 จาก 136 ดีลยังไม่ผูกโครงการ) —
            คำร้องต้องมีโครงการ ดีลลอยจึงเปิดคำร้องไม่ได้ ต้องบอกตรงนี้ ไม่ใช่ให้ไป
            ตายที่ server */}
        {value.dealId && !value.projectId && (
          <small className={styles.hint}>
            ดีลนี้ยังไม่ผูกโครงการ — ต้องผูกดีลกับโครงการก่อนจึงเปิดคำร้องได้
          </small>
        )}
      </div>
      {/* ⭐ **ลูกค้ากับโครงการโชว์กลับเสมอ** (มติผู้ใช้ 2026-08-08: "ต้องเลือกลูกค้า
          โครงการ ดีล และเลือกขอเอกสาร") — สองค่านี้ derive จากดีลมาตลอดแต่เดิม
          **หายเงียบ**: เลือกดีลแล้วไม่มีอะไรบอกว่าใบนี้จะเกาะลูกค้า/โครงการไหน
          ต่างจากบล็อกบรีฟกลิ่นที่โชว์ของที่เติมจาก SO ครบ · เป็นตัวอย่างของสิ่งที่
          server จะเขียนจริง ไม่ใช่ช่องให้แก้ (`requestPayload` ไม่ส่งสองค่านี้เลย) */}
      <DerivedField
        label="ลูกค้า" from="เติมจากดีลที่เลือก"
        value={selectedDeal?.customerName || ""}
      />
      <DerivedField
        label="โครงการ" from="เติมจากดีลที่เลือก"
        value={(() => {
          const project = projects.find((p) => p.id === selectedDeal?.projectId);
          return project ? `${project.code ? `${project.code} — ` : ""}${project.name || project.id}` : "";
        })()}
      />

      {/* ── อ้างอิงเพิ่ม: QT · SO · FG — "ถ้ามี" (ม-88) ──────────────────────
          ⭐ มติผู้ใช้ 2026-08-08: เอกสารอย่าง COA/IFRA มักผูกกับใบเสนอราคา ใบสั่งขาย
          หรือสินค้า (FG) ตัวใดตัวหนึ่ง — ให้อ้างจากระบบจริง ไม่ใช่พิมพ์เลขที่ลงช่อง
          รายละเอียดแล้วค้นย้อนไม่ได้
          ⚠️ **ว่างได้ทุกช่อง** — ด่านที่ server ตรวจแค่ "ของมีจริง + อยู่ดีลเดียวกัน"
          ⚠️ QT/SO **กรองตามดีลที่เลือก** — อ้างข้ามดีลคือความขัดแย้งที่ต้องกันตั้งแต่จอ */}
      {optionalRefs.length > 0 && (
        <>
          {/* หัวคั่นย่อยในแท็บเดียวกัน — แยก "ของที่ต้องอ้าง" ออกจาก "อ้างอิงเพิ่ม"
              ให้ชัด · ทั้งสองก้อนเป็นเรื่อง "งานไหน" เหมือนกันจึงไม่แยกแท็บ แต่
              ก้อนล่างว่างได้ทุกช่อง ซึ่งต่างกันมากพอที่ต้องบอก */}
          <FormZone title="อ้างอิงเพิ่ม" note="ว่างได้ทุกช่อง" className="col-span-2" />
          {optionalRefs.includes("quotation") && (
            <div className="form-group">
              <span className={styles.fieldLabel}>
                ใบเสนอราคา (QT) <span className={styles.hint}>(ถ้ามี)</span>
              </span>
              <SearchableSelect
                value={value.quotationId} disabled={disabled || !value.dealId}
                onChange={(v) => set({ quotationId: v })}
                options={quotations
                  .filter((q) => q.dealId === value.dealId)
                  .map((q) => ({
                    value: q.id,
                    label: q.quoteNumber || q.id,
                    search: `${q.quoteNumber || ""} ${q.customerName || ""}`,
                  }))}
                placeholder={value.dealId ? "— ไม่อ้าง —" : "เลือกดีลก่อน"}
                emptyText="ดีลนี้ยังไม่มีใบเสนอราคา"
                ariaLabel="ใบเสนอราคาที่อ้างถึง"
              />
            </div>
          )}
          {optionalRefs.includes("salesOrder") && !needsSalesOrder && (
            <div className="form-group">
              <span className={styles.fieldLabel}>
                ใบสั่งขาย (SO) <span className={styles.hint}>(ถ้ามี)</span>
              </span>
              <SearchableSelect
                value={value.salesOrderId} disabled={disabled || !value.dealId}
                onChange={(v) => set({ salesOrderId: v })}
                options={salesOrders
                  .filter((so) => so.dealId === value.dealId)
                  .map((so) => ({
                    value: so.id,
                    label: so.orderNumber || so.id,
                    search: `${so.orderNumber || ""} ${so.customerName || ""}`,
                  }))}
                placeholder={value.dealId ? "— ไม่อ้าง —" : "เลือกดีลก่อน"}
                emptyText="ดีลนี้ยังไม่มีใบสั่งขาย"
                ariaLabel="ใบสั่งขายที่อ้างถึง"
              />
            </div>
          )}
          {optionalRefs.includes("product") && (
            <div className="form-group col-span-2">
              <span className={styles.fieldLabel}>
                สินค้า (FG) <span className={styles.hint}>(ถ้ามี · เพิ่มได้หลายรายการ)</span>
              </span>
              {/* ⭐ หลายรายการ (ม-89) — เลือกทีละตัวจากดรอปดาวน์ ตัวที่เลือกแล้วขึ้น
                  เป็นป้ายถอดได้ข้างล่าง (แพตเทิร์นเดียวกับรายการไฟล์แนบ)
                  · FG ไม่ผูกดีล — ทะเบียนสินค้าค้นด้วยรหัส/ชื่อ/ลูกค้าได้ทั้งชุด
                  ⭐ **เลือกแล้วต้องกด "เพิ่ม" อีกที** (มติผู้ใช้ 2026-08-09) — ทะเบียน
                  สินค้ามีรหัสที่หน้าตาใกล้กันมาก การเลือกผิดแล้วมันเข้าลิสต์ทันที
                  แปลว่าต้องหาปุ่มถอดออกทุกครั้งที่พลาด · ตอนนี้ค่าที่เลือกค้างในช่อง
                  ให้อ่านทวนก่อน แล้วค่อยยืนยัน */}
              <div className={styles.pickAdd}>
                <SearchableSelect
                  value={fgPick} disabled={disabled}
                  onChange={setFgPick}
                  options={products
                    .filter((fg) => !(value.productIds || []).includes(fg.id))
                    .map((fg) => ({
                      value: fg.id,
                      label: [fg.fgCode, fg.productDescription].filter(Boolean).join(" · ") || fg.id,
                      search: `${fg.fgCode || ""} ${fg.productDescription || ""} ${fg.customerName || ""}`,
                    }))}
                  placeholder="— เลือกสินค้า —"
                  emptyText="ยังไม่มีสินค้าในทะเบียน"
                  ariaLabel="เลือกสินค้า (FG) ที่จะเพิ่ม"
                />
                {/* ปุ่มที่กดไม่ได้ต้องบอกเหตุผล (กฎเดียวกับ `requestFormBlocker`) */}
                <Button
                  size="sm" icon={<Plus size={14} aria-hidden="true" />}
                  disabled={disabled || !fgPick}
                  title={fgPick ? undefined : "เลือกสินค้าจากช่องซ้ายก่อน"}
                  onClick={() => {
                    if (!fgPick || (value.productIds || []).includes(fgPick)) return;
                    set({ productIds: [...(value.productIds || []), fgPick] });
                    setFgPick("");
                  }}
                >
                  เพิ่ม
                </Button>
              </div>
              {!!(value.productIds || []).length && (
                <ul className={styles.fileList}>
                  {(value.productIds || []).map((fgId) => {
                    const fg = products.find((x) => x.id === fgId);
                    const label = fg
                      ? [fg.fgCode, fg.productDescription].filter(Boolean).join(" · ")
                      : fgId;
                    return (
                      <li key={fgId} className={styles.fileRow}>
                        <span className={styles.fileName}>{label}</span>
                        <Button
                          iconOnly icon={<X size={13} />} disabled={disabled}
                          onClick={() => set({
                            productIds: (value.productIds || []).filter((x) => x !== fgId),
                          })}
                          aria-label={`เอา ${label} ออก`}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </>
      )}
      </div>
      )}

      {/* ── บรีฟกลิ่น: ยึดใบสั่งขาย (ค่าบริการออกแบบกลิ่น) ─────────────────
          แม่แบบ SCENT ขั้น 6 "ออกแบบกลิ่น" ขึ้นกับขั้น 4 "ใบสั่งขายออกแบบกลิ่น"
          → เลือก SO ที่เดียว ดีล/โครงการ/ลูกค้า server เติมจาก SO เอง ไม่ให้เลือกซ้ำ
          แล้วขัดกันเอง (SO ของดีล A แต่เลือกดีล B) */}
      {needsSalesOrder && (
        <div className="form-grid cols-2">
            <div className="form-group col-span-2">
              <span className={styles.fieldLabel}>ใบสั่งขายออกแบบกลิ่น *</span>
              <SearchableSelect
                value={value.salesOrderId} disabled={disabled}
                onChange={(v) => {
                  // ⭐ บล็อกบรีฟงอกตามจำนวนกลิ่นที่ใบสั่งขายขาย — ไม่มีปุ่มเพิ่ม/ลบ
                  // เพราะจำนวนคือสิ่งที่ลูกค้าจ่ายไปแล้ว · เปลี่ยน SO = เริ่มบรีฟใหม่
                  const so = salesOrders.find((x) => x.id === v) || null;
                  const count = so ? scentCountForOrder(so.lines || []) : null;
                  set({
                    salesOrderId: v,
                    briefs: count ? Array.from({ length: count }, () => ({ label: "" })) : [],
                  });
                }}
                options={soOptions.map((so) => ({
                  value: so.id,
                  label: `${so.orderNumber || so.id}${so.customerName ? ` — ${so.customerName}` : ""}`,
                  search: `${so.orderNumber || ""} ${so.customerName || ""} ${so.dealId || ""}`,
                }))}
                placeholder="เลือกใบสั่งขาย"
                // ⭐ ค้นไม่เจอแล้วต้องรู้ว่า**ทำไม** — ลิสต์นี้กรองแล้ว คนที่พิมพ์เลขที่ใบ
                // ของตัวเองมาแล้วไม่เจอจะคิดว่าระบบพัง ทั้งที่ใบนั้นยังไม่อนุมัติ
                emptyText={(term) => {
                  const hint = scentDesignOrderSkipHint(soSkips);
                  if (term) return `ไม่พบ "${term}" ในใบที่เปิดบรีฟได้${hint ? ` · ${hint}` : ""}`;
                  return hint || "ยังไม่มีใบสั่งขายในระบบ";
                }}
                ariaLabel="ใบสั่งขายของบรีฟกลิ่น"
              />
              {/* ⚠️ prod เคยมี sales_orders = 0 ใบ — ต้องบอกทางออกตรงนี้ ไม่ใช่ปล่อยให้
                  เจอ dropdown ว่างแล้วคิดว่าระบบพัง
                  ⭐ ลิสต์กรองแล้ว ⇒ ต้องบอกด้วยว่า**ซ่อนอะไรไปเพราะอะไร** ตั้งแต่ยังไม่กด
                  เปิด dropdown — คนที่ถือใบในมืออยู่จะได้รู้ทันทีว่าต้องไปทำอะไรก่อน
                  ไม่ใช่ไปเจอตอนค้นแล้วไม่พบ
                  ⭐ อยู่ **ใต้ช่องที่มันคุม** (มติ 2026-08-09) — เดิมลอยท้ายบล็อกรวมกับ
                  คำอธิบายหัวข้ออีกสองบรรทัดจนอ่านไม่ออกว่าอันไหนพูดถึงช่องไหน */}
              <small className={styles.hint}>
                {!salesOrders.length
                  ? "ยังไม่มีใบสั่งขายในระบบ — ต้องออก QT แล้วรับเป็น SO ก่อนจึงเปิดบรีฟกลิ่นได้"
                  : [
                    "ดีลและโครงการเติมจาก SO — ไม่ให้เลือกซ้ำแล้วขัดกันเอง",
                    scentDesignOrderSkipHint(soSkips),
                  ].filter(Boolean).join(" · ")}
              </small>
            </div>
            <DerivedField
              label="ลูกค้า" from="เติมจาก SO"
              value={selectedSo?.customerName || ""}
            />
            <DerivedField
              label="ดีล" from="เติมจาก SO"
              value={soDeal ? `${soDeal.code || soDeal.id}${soDeal.title ? ` — ${soDeal.title}` : ""}` : ""}
            />
        </div>
      )}

      </>)}

      {/* ── แท็บ "เรื่องที่ขอ" — ชื่อเรื่อง + รายละเอียด (ทุกหัวข้อ) ─────────── */}
      {activeTab === "subject" && (
      <div className="form-grid cols-2">
        <div className="form-group col-span-2">
          <label htmlFor="req-title">{copy.titleLabel}</label>
          <input
            id="req-title" className="premium-input" maxLength={200}
            value={value.title} disabled={disabled}
            placeholder={copy.titlePlaceholder}
            onChange={(e) => set({ title: e.target.value })}
          />
        </div>
        {!hasPdr && (
        <div className="form-group col-span-2">
          <label htmlFor="req-body">{copy.bodyLabel}</label>
          <Textarea
            variant="data"
            id="req-body" rows={4} maxLength={4000}
            value={value.body} disabled={disabled}
            placeholder={copy.bodyPlaceholder}
            onChange={(e) => set({ body: e.target.value })}
          />
          {/* วางลิงก์หรือรหัสเอกสารในรายละเอียดได้เลย — เธรดเรนเดอร์เป็นลิงก์ให้เอง
              ผ่าน RichText (/go/<รหัส>) ไม่ต้องมีช่อง "ลิงก์" แยก */}
          <small className={styles.hint}>
            วาง URL หรือรหัสเอกสาร (เช่น QT-26080001) ลงไปได้ — ระบบทำเป็นลิงก์ให้เอง
          </small>
        </div>
        )}

      {/* ── หัวข้อที่ต้องอ้างทะเบียน: F/Mock-up อ้างกลิ่น · FB อ้างสูตร ────────
          อยู่ในโซน ② เพราะมันคือ "ขออะไร" ไม่ใช่ "งานไหน" — กลิ่น/สูตร/หมวดสินค้า
          เป็นตัวตนของสิ่งที่ขอ ส่วนดีล/SO ในโซน ① คือบริบทของงานที่มันสังกัด */}
      {needsScent && (
        <div className="form-group col-span-2">
          <span className={styles.fieldLabel}>
            {copy.scentLabel}
          </span>
          <SearchableSelect
            value={value.scentId} disabled={disabled}
            onChange={(v) => set({ scentId: v })}
            options={scents.filter(isScentUsable).map((s) => ({
              value: s.id,
              label: s.code ? `${s.name} · ${s.code}` : s.name,
              search: `${s.name} ${s.code || ""} ${s.customerName || ""}`,
            }))}
            placeholder="เลือกกลิ่นจากทะเบียน"
            emptyText="ยังไม่มีกลิ่นที่รับเข้าทะเบียน"
            // ต้องตรงกับป้ายที่มองเห็น — Mock-up ไม่ได้ขอราคา มันอ้างกลิ่นที่ลูกค้ามี
            ariaLabel={copy.scentLabel}
          />
        </div>
      )}
      {/* ประเภทสินค้าที่จะขึ้นตัวอย่าง — อ้างหมวดสินค้า ไม่ใช่ตัวสินค้า เพราะตอนขอ
          Mock-up สินค้ายังไม่มีในระบบ · ธง isExcise/requiresFdaNotice ติดมากับหมวด
          ทำให้ RD เห็นทันทีว่าตัวอย่างนี้เป็นสินค้าที่ต้องขึ้นทะเบียน/แจ้ง อย. หรือไม่ */}
      {needsProductType && (
        <div className="form-group col-span-2">
          <span className={styles.fieldLabel}>ประเภทสินค้าที่จะขึ้นตัวอย่าง</span>
          <SearchableSelect
            value={value.productTypeId} disabled={disabled}
            onChange={(v) => set({ productTypeId: v })}
            options={productTypes.filter((t) => t.isActive !== false).map((t) => ({
              value: String(t.id),
              label: `${t.nameTh || t.nameEn || t.typeCode}${t.nameTh && t.nameEn ? ` (${t.nameEn})` : ""}`,
              search: `${t.nameTh || ""} ${t.nameEn || ""} ${t.typeCode || ""} ${t.mainCategoryName || ""}`,
            }))}
            placeholder="เลือกประเภทสินค้า"
            emptyText="ยังไม่มีหมวดสินค้า"
            ariaLabel="ประเภทสินค้าที่ขอ Mock-up"
          />
          {selectedProductType && (selectedProductType.isExcise || selectedProductType.requiresFdaNotice) && (
            <small className={styles.hint}>
              {[
                selectedProductType.isExcise && "สินค้าประเภทนี้เสียภาษีสรรพสามิต",
                selectedProductType.requiresFdaNotice && "ต้องแจ้ง อย.",
              ].filter(Boolean).join(" · ")}
            </small>
          )}
        </div>
      )}

      {needsFormula && (
        <div className="form-group col-span-2">
          <span className={styles.fieldLabel}>{copy.formulaLabel}</span>
          <SearchableSelect
            value={value.formulaId} disabled={disabled}
            onChange={(v) => {
              const f = formulas.find((x) => x.id === v);
              set({
                formulaId: v,
                formulaCode: f?.code || "",
                formulaName: f?.name || "",
              });
            }}
            options={formulas.filter(isFormulaUsable).map((f) => ({
              value: f.id,
              label: f.code ? `${f.name} · ${f.code}` : f.name,
              search: `${f.name} ${f.code || ""} ${f.customerName || ""}`,
            }))}
            placeholder="เลือกสูตรจากทะเบียน"
            emptyText="ยังไม่มีสูตรที่รับเข้าทะเบียน"
            ariaLabel="สูตรที่ขอราคา"
          />
        </div>
      )}

      {/* ── พัฒนาผลิตภัณฑ์: บรรทัด หมวด × กลิ่น ───────────────────────────
          ⚠️ คนละตารางกับบรรทัดวัสดุโดยสิ้นเชิง — วัสดุเลือกจากทะเบียนวัสดุแล้วขอราคา
          ส่วนนี่คือ "หมวดไหน กลิ่นไหน" ซึ่งเป็นตัวตนของสูตรที่จะเกิด · ยัดสองอย่างนี้
          ลงตารางเดียวกันจะได้ช่องที่ครึ่งหนึ่งไม่เกี่ยวกับหัวข้อที่เลือกอยู่ */}
      {lineShape === "product_dev" && (
        <div className="form-group col-span-2">
          <span className={styles.fieldLabel}>{copy.itemsLabel}</span>
          <ProductDevLines
            rows={items}
            onChange={(rows) => set({ items: rows })}
            categories={productTypes}
            scents={scents}
            customerId={selectedDeal?.customerId || null}
            disabled={disabled}
          />
        </div>
      )}

      {/* ── ขอเอกสาร: บรรทัดชนิดเอกสาร ─────────────────────────────────── */}
      {(lineShape === "document" || lineShape === "billing_doc") && (
        <div className="form-group col-span-2">
          <span className={styles.fieldLabel}>{copy.itemsLabel}</span>
          {/* ⚠️ ตารางตัวเดียวกัน **คนละชุดคำศัพท์** — เอาสองชุดมารวมลิสต์เดียวเมื่อไร
              คำร้องขอเอกสารของ RD จะมีตัวเลือก "ใบกำกับภาษี" ซึ่ง RD ออกให้ไม่ได้ */}
          <DocumentLines
            rows={items}
            onChange={(rows) => set({ items: rows })}
            vocabulary={lineShape === "billing_doc" ? BILLING_DOC_VOCABULARY : undefined}
            disabled={disabled}
          />
        </div>
      )}
      </div>
      )}

      {/* ── ราง PDR **อยู่ในแท็บ "รายละเอียด"** เฉพาะหัวข้อที่ประกาศ `hasPdr` ─────
          ⭐ ใช้แทนช่องรายละเอียดธรรมดา (ธง `hasPdr` มาจากทะเบียนหัวข้อ ไม่ใช่การ
          เทียบชื่อหัวข้อในฟอร์ม — มี ratchet ห้ามไว้)
          ⭐ **รวมกับ "เรื่องที่ขอ" เป็นแท็บเดียว** (มติผู้ใช้ 2026-08-09) — แบบฟอร์ม
          คือรายละเอียดของสิ่งที่ขอ ไม่ใช่คนละเรื่อง · แยกแท็บอยู่ทำให้จำนวนแท็บ
          ไม่เท่ากันระหว่างหัวข้อ และคนต้องสลับไปมาระหว่างชื่อเรื่องกับบรีฟ
          ⭐ **สองชั้นด้วยรางข้าง** (มติ "แบบ A") — 6 ส่วนที่เคยเป็นลิ้นชักซ้อนกันลงมา
          กลายเป็นรายการด้านข้างที่บอกด้วยว่าส่วนไหนกรอกไปเท่าไร ⇒ ไม่ต้องกางทุกอัน
          เพื่อตรวจว่าเหลือตรงไหน
          ⚠️ ฝั่งอ่านบนหน้ารายละเอียด (`PdrSummary`) ยังเป็นลิ้นชักอยู่ — ตามแผนของ
          ผู้ใช้จะยกไปใช้รางเดียวกันใน "ตอน B" · จนกว่าจะถึงตอนนั้นสองฝั่งต่างผังกัน
          โดยตั้งใจ ไม่ใช่หลุด */}
      {activeTab === "subject" && hasPdr && (
        <SectionRail
          sections={railSections}
          value={activeRail}
          onChange={setPdrSection}
          ariaLabel="ส่วนของแบบฟอร์ม PDR"
        >
          {/* 🐞 เดิม **ไม่ได้ส่ง `requester` เลย** — ช่อง "ผู้ร้องขอ (AE)" จึงขึ้นเส้นประ
              ค้างทุกใบตอนกรอก ทั้งที่ `pdrContext` คำนวณค่าไว้ให้แล้ว (โผล่จริงตอน
              บันทึกเสร็จเท่านั้น = อาการที่ผู้ใช้ทักมา 2026-08-09) */}
          <PdrForm
            section={activeRail}
            value={value.pdr || emptyPdr()}
            onChange={(pdr) => set({ pdr })}
            briefs={value.briefs || []}
            onBriefsChange={(briefs) => set({ briefs })}
            disabled={disabled}
            scentCount={scentCount}
            customer={pdrDerived.customer || ""}
            deal={pdrDerived.deal || ""}
            requester={pdrDerived.requester || ""}
            coordinator={pdrDerived.coordinator || ""}
            contactName={pdrDerived.contactName || ""}
            contactPhone={pdrDerived.contactPhone || ""}
            sampleDue={pdrDerived.sampleDue || ""}
          />
        </SectionRail>
      )}

      {/* ── แท็บสุดท้าย: กำหนด · ความเร่งด่วน · ไฟล์ ─────────────────────── */}
      {activeTab === "due" && (
      <div className="form-grid cols-2">
        <div className="form-group">
          {/* ⭐ บังคับทุกหัวข้อ (มติผู้ใช้ 2026-08-08) — ด่านจริงอยู่ `requestShapeError`
              ตัวเดียวกับ server · ป้ายแค่บอกล่วงหน้าว่าช่องนี้ข้ามไม่ได้ */}
          <label htmlFor="req-due">อยากได้คำตอบภายใน (บังคับ)</label>
          <DateInput
            id="req-due" value={value.requestedDueDate} disabled={disabled}
            onChange={(v) => set({ requestedDueDate: v })}
          />
          <small className={styles.hint}>
            เป็นความคาดหวัง — ฝ่ายปลายทางจะรับปากวันจริงตอนกดรับเรื่อง
          </small>
        </div>
        <div className="form-group">
          <label htmlFor="req-urgent">ความเร่งด่วน</label>
          <label className={styles.checkRow}>
            <input
              id="req-urgent" type="checkbox" checked={!!value.urgent} disabled={disabled}
              onChange={(e) => set({ urgent: e.target.checked })}
            />
            <span className={styles.checkLabel}>งานด่วน</span>
          </label>
        </div>
        {/* ⭐ **ด่วนแล้วต้องบอกว่าทำไม** (mig 0222) — ฟอร์มกระดาษ FM-RD-01 เขียนบนหัวว่า
            "หากเป็นงานด่วน กรุณาระบุคำว่าด่วน และวันที่ต้องการ พร้อมแจ้งเหตุผล"
            ⚠️ ติ๊กด่วนได้ฟรีเมื่อไร ทุกใบก็ด่วนภายในสองเดือน แล้วธงนั้นเลิกมีความหมาย */}
        {value.urgent && (
          <div className="form-group col-span-2">
            <label htmlFor="req-urgent-why">เหตุผลที่เป็นงานด่วน *</label>
            <Textarea
              variant="data" id="req-urgent-why" rows={2} maxLength={500}
              value={value.urgentReason || ""} disabled={disabled}
              placeholder="เช่น ลูกค้าต้องใช้ในงานแสดงสินค้าวันที่ 20 · ล็อตผลิตปิดสิ้นเดือน"
              onChange={(e) => set({ urgentReason: e.target.value })}
            />
          </div>
        )}

      {/* ── แนบไฟล์ + กล่าวถึง (ทำงานเหมือนกล่องพิมพ์ในเธรด) ────────────────
          ⭐ **ช่องไฟล์อยู่ทุกโหมด** (มติผู้ใช้ 2026-08-08: "อยากให้แนบไฟล์ได้ตั้งแต่
          หน้าสร้างคำร้องเลย เพราะตอนนี้เหมือนต้องบันทึกก่อน") — ไฟล์เก็บใน
          `value.files` แล้วผู้เรียกอัปให้หลังได้ id (`uploadDraftFiles`) · เดิมซ่อน
          พร้อม @ ด้วยธง `deferAttachments` ทั้งที่กลไกอัปมีอยู่แล้ว
          ⚠️ @ ยังซ่อนตอนร่าง (`deferMentions`) — แจ้งเตือนออกตอนกดส่ง ไม่ใช่ตอน
          บันทึกร่าง โชว์ไว้จะเป็นช่องที่กรอกแล้วไม่เกิดอะไรในจังหวะที่คนคาดว่าเกิด */}
        <div className="form-group col-span-2">
          <span className={styles.fieldLabel}>แนบไฟล์</span>
          {/* ไฟล์ถูกอัปหลังคำร้องถูกสร้าง (ยังไม่มี entityId ตอนกรอกฟอร์ม) —
              เก็บไว้ในหน่วยความจำก่อน แล้วผู้เรียกอัปตามลำดับ */}
          <label className={styles.fileDrop}>
            <Paperclip size={14} aria-hidden="true" />
            <span>เลือกไฟล์ (สูงสุด {MAX_UPLOAD_MB} MB ต่อไฟล์)</span>
            <input
              type="file" multiple accept={UPLOAD_ACCEPT_ATTR} disabled={disabled}
              className={styles.fileInput}
              onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
            />
          </label>
          {!!(value.files || []).length && (
            <ul className={styles.fileList}>
              {(value.files || []).map((f, i) => (
                <li key={`${f.name}-${i}`} className={styles.fileRow}>
                  <span className={styles.fileName}>{f.name}</span>
                  {/* ปุ่มไอคอนผ่าน <Button> กลาง — ห้ามเขียนคลาส btn เองในของใหม่
                      (ด่าน audit:ui นับ rawButtonClass เป็น ratchet ขึ้นไม่ได้) */}
                  <Button
                    iconOnly icon={<X size={13} />} disabled={disabled}
                    onClick={() => removeFile(i)} aria-label={`เอา ${f.name} ออก`}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        {!deferMentions && (
        <div className="form-group col-span-2">
          <span className={styles.fieldLabel}>
            <AtSign size={13} aria-hidden="true" /> กล่าวถึง (ได้รับแจ้งเตือนตอนส่ง)
          </span>
          {/* รายชื่อกรองด้วยด่านของเธรดคำร้องมาแล้วที่ server (ดู
              /api/sa/requests/mentionable) — ไม่มีชื่อคนที่เปิดคำร้องนี้ไม่ได้ */}
          {mentionPeople.length ? (
            <div className={styles.mentionPicker}>
              {mentionPeople.map((p) => {
                const on = (value.mentions || []).some((m) => m.id === p.id);
                return (
                  <button
                    key={p.id} type="button" disabled={disabled}
                    className={`chip ${on ? styles.tierChipOn : styles.tierChip}`}
                    aria-pressed={on}
                    onClick={() => toggleMention(p)}
                  >
                    {on ? "✓ " : "@"}{p.name}
                  </button>
                );
              })}
            </div>
          ) : (
            <small className={styles.hint}>ไม่มีคนที่กล่าวถึงได้ในคำร้องนี้</small>
          )}
          <small className={styles.hint}>
            กล่าวถึงได้ไม่เกิน {MAX_MENTIONS} คน — แจ้งเตือนออกตอนกดส่ง ไม่ใช่ตอนกรอก
          </small>
        </div>
        )}
      </div>
      )}

      {/* บอกว่ายังขาดอะไรอยู่ตรงนี้ที่เดียว — ฟอร์มรู้กฎของตัวเองอยู่แล้ว (ด่าน
          ตัวเดียวกับที่ server ใช้) · ก่อนหน้านี้ปุ่มแค่จางลงเงียบ ๆ ผู้ใช้ต้องเดาว่า
          ขาดช่องไหน · โทนเป็น hint ไม่ใช่แดง เพราะกรอกยังไม่จบไม่ใช่ความผิดพลาด
          ⚠️ `showBlocker=false` = ผู้เรียกวางข้อความนี้เองที่แถบปุ่ม (ติดตากว่า) —
          **ห้ามเขียนเงื่อนไขใหม่ที่นั่น** ต้องเรียก `requestFormBlocker` ตัวเดียวกัน */}
      {showBlocker && shapeError && (
        <small className={styles.hint}>ยังกรอกไม่ครบ — {shapeError}</small>
      )}
      </>
      )}
    </>
  );
}
