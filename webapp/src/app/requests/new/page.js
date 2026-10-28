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
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MessageCircleQuestion } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import { DetailPageLayout } from "@/components/ui/DetailPage";
import { DocumentControlCard, DocumentReadinessList } from "@/components/ui/DocumentControlPanel";
import StatusNotice from "@/components/ui/StatusNotice";
import SkeletonRows from "@/components/ui/Skeleton";
import thaiText, { keepPhrases } from "@/components/ThaiText";
import { requiredChecks } from "@/lib/requests/formTabs";
import Toast from "@/components/ui/Toast";
import RequestForm, { emptyRequestForm } from "@/components/requests/RequestForm";
import {
  createRequestDraft, draftFilesLeft, draftUploadFailureText, requestFormBlocker, uploadDraftFiles,
} from "@/lib/master/requestCreate";
import { requestFormCopy, requestKindLabel, requestRequiredFiles, requestVariantChosen } from "@/lib/master/requestTypes";
import { requestImpliedVariant } from "@/lib/requests/variantSwitch";
import { surveyVariantsOff } from "@/lib/service/surveyIntake";
/* ใบยืนยันหน้างาน (ประเมินจากแบบ งวด S5 D-4) — ชื่อหน้า · คำโปรย · คำของลิงก์ · ประโยค N4 มาจากไฟล์ล้วนไฟล์เดียว (F1) */
import {
  SURVEY_CONFIRM_ACTION_LABEL, SURVEY_CONFIRM_ID_PATTERN, SURVEY_CONFIRM_NO_ORIGINAL, SURVEY_CONFIRM_WRAP_KEEP,
  surveyConfirmBackLinkText, surveyConfirmOpenLinkText, surveyConfirmSubtitle,
} from "@/lib/service/surveyConfirmLink";
/* ประโยคปฏิเสธของ server — วลีของงวดห้ามขาดกลาง ("หน้า|งาน" ที่ 375 · UAT S5 sales รอบ 1 K08) · ไม่มีวลี = ทาง thaiText เดิม
   รอบ 2: ทาง keepPhrases ไม่ห่อรหัส (thaiText ห่อ) ⇒ "RQ-AS-" / "26100345" ขาดที่ขีด (N5 · confirm_none_left ที่ 375) — รหัสในประโยค
   (เลขที่ใบ · รหัสสถานที่) เป็นวลีที่ห้ามขาดด้วย */
const DOC_CODE = /[A-Z]{2,}(?:-[A-Z0-9]+)+/g;
const refusalText = (text) => {
  const kept = keepPhrases(text, [...SURVEY_CONFIRM_WRAP_KEEP, ...(String(text ?? "").match(DOC_CODE) || [])]);
  return kept === text ? thaiText(text) : kept;
};
import { scentCountForOrder } from "@/lib/requests/scentDesignOrders";
import { cachedFetchJson } from "@/lib/apiCache";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";
import { businessDate } from "@/lib/businessDate";
import { formatBillingDate } from "@/lib/sales/billingRule";
import { RESPONSE_WARNING_TOAST } from "@/lib/apiWarnings";
import { notifyToast } from "@/components/ui/Toast";
import styles from "./page.module.css";
import { apiFetch, apiJson } from "@/lib/apiFetch";

const asArray = (d) => (Array.isArray(d) ? d : []);
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/* วันที่ YYYY-MM-DD ที่มีจริงบนปฏิทิน — คืน "" ถ้าไม่ใช่
   🐞 `Date.parse("2026-02-30")` ของ V8 ปัดไปเป็น 2 มี.ค. แล้วตอบว่าใช้ได้ ⇒ ลิงก์ที่แก้มือหลุดไปถึง insert
      แล้ว Postgres ตีกลับเป็น 500 ดิบ (date/time field value out of range) ⇒ ประกอบวันกลับแล้วเทียบทุกส่วน */
function calendarIso(value) {
  const iso = String(value || "").trim();
  const match = ISO_DATE.exec(iso);
  if (!match) return "";
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? iso : "";
}

/* วันที่ต้องการรับงานที่เติมจากลิงก์ (`?requiredDate=` = วันวางบิลของงวด) — คืน "" ถ้าไม่เติม
   ⚠️ **วันที่ผ่านไปแล้วไม่เติม** — ด่านของช่องนี้ตรวจแค่รูปแบบ (requestTypes) ⇒ งวดที่เลยรอบวางบิล
      จะได้ใบที่ "ต้องการรับงาน" เมื่อวานโดยไม่มีใครทัก แล้วบัญชีเห็นใบเลยกำหนดตั้งแต่วินาทีแรก
      ⇒ ปล่อยว่างให้ผู้ขอเลือกเอง (ช่องบังคับ ด่านฟอร์มบอกเหตุอยู่แล้ว) · "วันนี้" = นาฬิกาไทย
      · รายการความพร้อมบอกว่าทำไมช่องว่าง (`droppedDueDate` ในหน้า) */
function prefillDueDate(value) {
  const iso = calendarIso(value);
  return iso && iso >= businessDate() ? iso : "";
}

/* ค่าตั้งต้นของฟอร์มล็อก "ขอยืนยันหน้างาน" จากคำตอบ 200 ของ GET confirm-plan (งวด S5 D-4 · R1)
   ⭐ `variant: 'standard'` ต้องอยู่ทั้งในฟอร์มและในค่าที่ใช้คิด `pristine` — ไทล์วิธีถูกซ่อนในโหมดล็อก ⇒ ไม่มีค่านี้ ฟอร์มจะค้าง
      "ยังขาด: วิธีประเมิน" โดยไม่มีอะไรให้กด และ `requestFormBlocker` ตีกลับการบันทึก
   ⚠️ ส่งแค่ zoneId + ชื่อ — server สร้างชุดพื้นที่เองจากใบต้นทาง (ค่าที่โพสต์มาไม่ถูกใช้) · id ของใบต้นทาง **ไม่อยู่ในฟอร์ม**
      (ไปทาง `extra` ของ createRequestDraft เท่านั้น) */
function confirmLockDefaults(plan) {
  return {
    kind: "site_survey",
    variant: "standard",
    dealId: plan.original?.dealId || "",
    siteId: plan.original?.siteId || "",
    title: plan.title || "",
    zones: (plan.zones || []).map(({ zoneId, name }) => ({ zoneId, name })),
  };
}

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
  /* ⭐ `requiredDate` (กำหนดวางบิล) — วันวางบิลของงวดที่กดมา เติมลง "วันที่ต้องการรับงาน"
     **ให้เห็นและแก้ได้** (ช่องเดิมบนฟอร์ม ไม่ใช่ค่าซ่อน) · ฟอร์มเปิดใหม่ช่องว่างเสมอ = เติมได้เลย
     ⚠️ อยู่ใน `defaults` ชุดเดียวกับของเติมอื่น ⇒ `pristine` ไม่นับว่าแก้ และปุ่ม "เปลี่ยนฝ่าย/หัวข้อ"
        เติมกลับให้เหมือนค่าที่มากับลิงก์ตัวอื่น */
  const defaults = useMemo(() => ({
    kind: searchParams.get("kind") || "",
    dealId: searchParams.get("dealId") || "",
    projectId: searchParams.get("projectId") || "",
    salesOrderId: searchParams.get("salesOrderId") || "",
    quotationId: searchParams.get("quotationId") || "",
    billAmount: searchParams.get("billAmount") ? Number(searchParams.get("billAmount")) : null,
    requestedDueDate: prefillDueDate(searchParams.get("requiredDate")),
  }), [searchParams]);
  /* ⭐ งวดที่ต้องผูกกับคำร้องนี้ (`?installmentId=` จากปุ่ม "ขอใบวางบิลงวดนี้" · กำหนดวางบิล)
     — server ผูกให้หลังบันทึกร่าง ⇒ งวดนั้นขึ้น "ขอใบวางบิลแล้ว" และกระดิ่งก่อนวันวางบิลหยุด
     ⚠️ **ไม่ใช่ช่องในฟอร์ม** — ส่งแยกทาง `extra` ของ createRequestDraft (ฟอร์มกับหน้าแก้ไม่ต้องรู้จัก)
     ⚠️ ส่งเฉพาะตอนใบยังเป็น "ขอเอกสารการเงิน" ของ **ใบสั่งขาย + ใบเสนอราคาใบที่กดมา** — ผู้ใช้เปลี่ยนหัวข้อ/ใบในฟอร์ม
        แปลว่าไม่ใช่งานของงวดนั้นแล้ว (server ตรวจซ้ำทุกข้ออยู่ดี · ผูกไม่ได้ = ใบยังบันทึก + คำเตือน) */
  const linkInstallmentId = (searchParams.get("installmentId") || "").trim().slice(0, 120);
  /* ⭐ งวดจากแผนของใบเสนอราคา (`?installmentSeq=` จากปุ่ม "ขอเอกสารงวดนี้" บนหน้า QT ที่ยังไม่มีงวดจริง · mig 0413) */
  const linkInstallmentSeq = Number.parseInt(searchParams.get("installmentSeq") || "", 10) || null;
  /* ⭐ ทั้งสองค่าเป็นแค่ **ค่าเติม** ของไทล์เลือกงวดในฟอร์ม (BillingInstallmentPicker · PR-2) — งวดที่ส่งไปจริงคืองวดที่ไทล์เลือกอยู่
     ตอนกดบันทึก (ผู้ใช้เปลี่ยน/เลือก "ไม่ระบุงวด" ได้) · เติมเฉพาะเมื่อเป็นใบเสนอราคาเดียวกับที่กดมา */
  const installmentPrefill = useMemo(() => ({
    quotationId: defaults.quotationId, installmentId: linkInstallmentId, installmentSeq: linkInstallmentSeq,
  }), [defaults.quotationId, linkInstallmentId, linkInstallmentSeq]);
  /* วันที่มากับลิงก์แต่ไม่ได้เติมเพราะผ่านไปแล้ว — ช่องว่างเฉย ๆ ดูเหมือนลิงก์พัง ⇒ รายการความพร้อมบอกเหตุ */
  const linkDueDate = calendarIso(searchParams.get("requiredDate"));
  const droppedDueDate = linkDueDate && !defaults.requestedDueDate ? linkDueDate : "";
  /* ⭐ **ใบยืนยันหน้างาน** (ประเมินจากแบบ งวด S5 D-4) — `?confirms={id ของใบต้นทาง}` จากปุ่ม "ขอยืนยันหน้างาน" บนใบต้นทาง
     ⇒ ฟอร์มเดียวกันในโหมดล็อก (`confirmLock`) · ดีล/สถานที่/พื้นที่/วิธีมาจาก GET confirm-plan และ server สร้างเองอีกรอบตอนบันทึก
     🔴 **ค่านี้กลายเป็น path ของ API ⇒ ตรวจรูปก่อนเสมอ** (F14): ไม่ผ่าน `SURVEY_CONFIRM_ID_PATTERN` = ไม่ยิงอะไรเลยทั้งหน้า
        (ลิงก์ที่แต่งมาอย่าง `?confirms=../../production/jobs…` จะพาเบราว์เซอร์ของคนกดไปยิง GET ที่เขียนข้อมูลของเส้นอื่น)
        แล้วขึ้นประโยค N4 ไม่มีฟอร์ม · ผ่านแล้วก็ยังประกอบ path ด้วย `encodeURIComponent` */
  const confirms = (searchParams.get("confirms") || "").trim().slice(0, 120);
  const confirmsBad = !!confirms && !SURVEY_CONFIRM_ID_PATTERN.test(confirms);
  // ⚠️ กลับไปที่เดิมหลังบันทึก — แพตเทิร์นเดียวกับ pm/tasks · ค่าที่ไม่ใช่เส้นทาง
  // ภายในถูกทิ้ง (open redirect จากโดเมนของเราเองคือของจริงที่เคยหลุดมาแล้ว)
  const back = searchParams.get("returnTo");
  /* ลิงก์กลับต้องเป็น path ในระบบเท่านั้น — "//x" และ "/\\x" เบราว์เซอร์อ่านเป็นโดเมนอื่นทั้งคู่
     (ปุ่ม "ขอใบวางบิลงวดนี้" ในกระดิ่งส่ง returnTo มาด้วย · กำหนดวางบิล 26/09) */
  const returnTo = back && /^\/(?![\/\\])/.test(back) ? back : "/requests";
  /* กลับไปที่ใบต้นทาง — ปุ่มลูกศรของหน้า · ปุ่ม "ยกเลิก" · ลิงก์ใต้ประโยคปฏิเสธ (id ที่ไม่ผ่านรูป = ไม่ใช่ path ของใบ ⇒ ทางกลับเดิม) */
  const originalHref = confirms && !confirmsBad ? `/requests/${encodeURIComponent(confirms)}` : returnTo;

  const [form, setForm] = useState(() => emptyRequestForm(defaults));
  /* แผนของใบยืนยันหน้างาน — `null` = กำลังโหลด · `{ ok: true, original, title, zones }` · `{ ok: false, error, open, original }`
     `confirmTick` = ขอถามซ้ำ (หลังบันทึกไม่ผ่าน · F8) · `confirmSeeded` = ฟอร์มถูกตั้งจากแผนแล้ว (ถามซ้ำได้ 200 = คงที่พิมพ์ไว้) */
  const [confirmPlan, setConfirmPlan] = useState(() => (confirmsBad
    ? { ok: false, error: SURVEY_CONFIRM_NO_ORIGINAL, open: null, original: null }
    : null));
  const [confirmTick, setConfirmTick] = useState(0);
  const confirmSeeded = useRef(false);
  const confirmData = confirmPlan?.ok ? confirmPlan : null;
  const confirmDefaults = useMemo(() => (confirmData ? confirmLockDefaults(confirmData) : null), [confirmData]);
  /* ⭐ **วิธีประเมินที่เปิดให้เลือก** (ประเมินจากแบบ งวด 4 · S4 B-6) — สวิตช์ `SURVEY_DRAWING_METHOD` อ่านที่ server
     เท่านั้น ⇒ หน้านี้ถาม GET แล้วได้แค่บูลีน · `null` = ยังไม่ได้คำตอบ (ปุ่มวิธีหยุดรอ) · อ่านไม่ได้ = ถือว่าปิด
     (server ตีกลับ "ประเมินจากแบบ" ตอนสวิตช์ปิดอยู่แล้ว — ที่นี่แค่ไม่ชวนให้กด) */
  const [options, setOptions] = useState(null);
  const variantsOff = useMemo(() => surveyVariantsOff(options?.drawingMethodEnabled), [options]);
  /* ทางเดียวที่เหลือของหัวข้อที่บังคับเลือก (สวิตช์ปิด = "ลงหน้างาน") — เลือกไว้ให้ เพราะไม่มีอะไรให้ตัดสินใจ
     (กติกา form-design-rules: default ได้เฉพาะเมื่อ flow ตัดสินให้แล้ว) · ยังไม่ได้คำตอบ = ยังไม่เดา */
  const impliedVariant = options ? requestImpliedVariant(form.kind, { off: variantsOff }) : null;
  /* ⭐ **กันงานหายเมื่อออกจากหน้ากลางคัน** — หัวข้อ scent_dev มี PDR 41 ช่อง +
     บรีฟรายกลิ่น รวมทั้งฟอร์มเกิน 50 ช่อง แต่เดิมไม่มีตัวกันเลย
     ⚠️ ทางที่หายเงียบจริงคือ **กดเมนูซ้าย** ไม่ใช่ปิดแท็บ — `useUnsavedChanges`
     ดักทั้ง `beforeunload` และคลิกลิงก์ภายในแอป (Next นำทางฝั่ง client ไม่ยิง
     beforeunload) · แพตเทิร์นเดียวกับใบเสนอราคา/ใบสั่งขาย
     ⚠️ เทียบกับค่าตั้งต้น **ที่คิดจาก `defaults` ชุดเดียวกัน** — มาจากลิงก์ที่เติม
     ดีล/SO มาให้แล้วต้องไม่นับว่าแก้ · ปิดตอน `saving` เพราะกำลังจะพาไปหน้าถัดไป */
  /* ⚠️ ค่าตั้งต้นคิดด้วย **วิธีที่เลือกไว้ให้ตัวเดียวกัน** — ไม่งั้นแค่เปิดหน้า (สวิตช์ปิด) ก็ขึ้น "ยังไม่ได้บันทึก" */
  const defaultVariant = options ? requestImpliedVariant(defaults.kind, { off: variantsOff }) : null;
  /* ใบยืนยันหน้างาน: ค่าตั้งต้นคือค่าล็อกชุดเดียวกับที่ตั้งฟอร์ม (มี `variant: 'standard'`) — เปิดแล้วออกเฉย ๆ ไม่ถามว่ายังไม่บันทึก */
  const pristine = useMemo(() => JSON.stringify(emptyRequestForm(
    confirmDefaults || (defaultVariant ? { ...defaults, variant: defaultVariant } : defaults),
  )), [defaults, defaultVariant, confirmDefaults]);
  // ⭐ สองขั้น: เลือกฝ่าย+หัวข้อให้จบ → กดแล้วค่อยกางฟอร์มของหัวข้อนั้น
  // มาจากลิงก์ที่ระบุหัวข้อมาแล้ว (เช่นจากหน้าดีล) = ข้ามขั้นแรกไปเลย ไม่ต้องกดซ้ำ
  // สิ่งที่ผู้ใช้เพิ่งเลือกไว้แล้ว
  const [revealed, setRevealed] = useState(!!defaults.kind);
  const [saving, setSaving] = useState(false);
  /* ใบยืนยันหน้างานที่ถูกปฏิเสธ (ถามแผนซ้ำหลังบันทึกไม่ผ่าน) ไม่มีฟอร์มบนจอแล้ว — ไม่ถามว่า "ยังไม่ได้บันทึก" ถึงของที่มองไม่เห็น */
  useUnsavedChanges(!saving && !(confirmPlan && !confirmPlan.ok) && JSON.stringify(form) !== pristine);
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
    /* 🔴 `?confirms=` ที่ไม่ผ่านรูป = หน้านี้ไม่ยิงคำขอไหนเลย (F14) — มีแต่ประโยค N4 */
    if (confirmsBad) return;
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
    /* โหมดใบยืนยันหน้างานไม่ต้องรู้สวิตช์ — วิธีถูกตรึงที่ลงหน้างาน (ทุกค่าของสวิตช์รับ) และไทล์ไม่ถูกวาด */
    if (confirms) return;
    apiJson("/api/sa/requests/form-options", { cache: "no-store" })
      .then((d) => setOptions({ drawingMethodEnabled: d?.drawingMethodEnabled === true }))
      .catch(() => setOptions({ drawingMethodEnabled: false }));
  }, [confirms, confirmsBad]);

  /* ⭐ แผนของใบยืนยันหน้างาน — ถามครั้งเดียวตอนเปิด (+ ครั้งเดียวหลังบันทึกไม่ผ่าน) · ตัวตัดสินคือ `surveyConfirmPlan` ตัวเดียวกับปุ่ม
     และ POST ⇒ ทุกการปฏิเสธ (มีใบเปิดอยู่แล้ว · พื้นที่ถูกใบอื่นถือ · สถานที่ไม่ใช่ของลูกค้าแล้ว …) ถึงจอ **ก่อน** คนพิมพ์อะไร
     · 200 ครั้งแรก = ตั้งฟอร์มจากแผน (เปิดฟอร์มเลย ไม่มีขั้นเลือกหัวข้อ) · ครั้งถัดไป = คงที่พิมพ์ไว้ เปลี่ยนแค่ช่องล็อก
     · ตั้งฟอร์มในจังหวะเดียวกับตั้งแผน — ไม่มีรอบเรนเดอร์ที่ฟอร์มล็อกถือค่าว่างของฟอร์มปกติ */
  useEffect(() => {
    if (!confirms || confirmsBad) return undefined;
    let alive = true;
    apiJson(`/api/sa/requests/${encodeURIComponent(confirms)}/confirm-plan`, { cache: "no-store" })
      .then((plan) => {
        if (!alive) return;
        const lock = confirmLockDefaults(plan);
        const first = !confirmSeeded.current;
        confirmSeeded.current = true;
        setForm((prev) => (first ? emptyRequestForm(lock) : {
          ...prev, kind: lock.kind, variant: lock.variant, dealId: lock.dealId, siteId: lock.siteId, zones: lock.zones,
        }));
        setRevealed(true);
        setConfirmPlan({ ok: true, original: plan.original, title: plan.title, zones: plan.zones || [] });
      })
      .catch((e) => {
        if (!alive) return;
        setConfirmPlan({
          ok: false, error: e?.message || String(e), open: e?.data?.open || null, original: e?.data?.original || null,
        });
      });
    return () => { alive = false; };
  }, [confirms, confirmsBad, confirmTick]);

  /* เติมทางเดียวที่เหลือ เมื่อหัวข้อนั้นยังไม่มีวิธีที่เลือก — รวมหลังกด "เปลี่ยนฝ่าย/หัวข้อ" (ฟอร์มถูกล้าง)
     ⚠️ ไม่ทับค่าที่ผู้ใช้เลือกแล้ว · เทียบหัวข้อของฟอร์มล่าสุดก่อนเขียน (ผู้ใช้อาจสลับหัวข้อระหว่างรอ) */
  useEffect(() => {
    if (!impliedVariant || requestVariantChosen(form)) return;
    setForm((prev) => (prev.kind === form.kind && !requestVariantChosen(prev)
      ? { ...prev, variant: impliedVariant }
      : prev));
  }, [impliedVariant, form]);

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
  /* ⭐ งวดที่ส่งไปกับคำร้อง = ไทล์ที่เลือกอยู่ในฟอร์ม (`form.installmentPick` · ล้างเองเมื่อเปลี่ยนใบเสนอราคา) — ไม่ใช่ค่าที่มากับลิงก์
     · งวดจริง → `linkInstallmentId` (server ผูกหลังบันทึกร่าง) · แผนของ QT → `installmentSeq` (ผูกเมื่อเกิดงวดบนใบสั่งขาย)
     ⚠️ ไม่ใช่ช่องของ `requestPayload` (whitelist) — ไปทาง `extra` ของ createRequestDraft เหมือนเดิม */
  const installmentPick = form.kind === "billing_doc" ? form.installmentPick || null : null;
  const installmentExtra = installmentPick?.installmentId ? { linkInstallmentId: installmentPick.installmentId }
    : installmentPick?.installmentSeq ? { installmentSeq: installmentPick.installmentSeq } : {};

  /* ⭐ ไฟล์ที่ขึ้น Drive แล้วได้ ref คืนลงตะกร้า **ทันทีทีละไฟล์** (memory retry-must-not-reupload) — รูป `{ file, ref }`
     ที่ `uploadDraftFiles` รู้จักแล้วข้าม ⇒ ไม่มีวันอัปไฟล์เดิมซ้ำ แม้วันหนึ่งหน้านี้จะให้กดซ้ำได้ */
  const remember = (key) => (file, ref) => setForm((prev) => ({
    ...prev,
    [key]: (prev[key] || []).map((entry) => (entry === file ? { file, ref } : entry)),
  }));
  // ช่องไฟล์บังคับของรูปแบบที่เลือก (ประเมินจากแบบ = แบบ/ผังพื้นที่ · docType `spec`)
  const requiredSpec = requestRequiredFiles(form);

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
    /* 🔴 id ของร่างที่เกิดแล้วอยู่นอก try (ผลรีวิวรอบแก้ S4) — อะไรก็ตามที่โยนหลังร่างเกิด (ขั้นอัปไฟล์ ·
       notifyToast) ต้องยังพาไปหน้ารายละเอียด ไม่ใช่ค้างหน้านี้ให้กดซ้ำแล้วได้ร่างใบที่สอง */
    let createdId = null;
    /* ไฟล์ที่ขึ้นแล้วในรอบนี้ — `form` ข้างล่างเป็นภาพก่อนอัป (ref ที่ `remember` คืนลงตะกร้ายังไม่ถึง closure นี้)
       ⇒ toast บอกชื่อไฟล์ที่ยังไม่เข้าจากชุดนี้ + รายการที่ถือ ref มาก่อน (UAT S4 รอบ 4 ข้อ 15) */
    const uploaded = new Set();
    const track = (key) => (file, ref) => { uploaded.add(file); remember(key)(file, ref); };
    const leftNames = () => draftFilesLeft([...(form.requiredFiles || []), ...(form.files || [])], uploaded);
    try {
      /* ใบยืนยันหน้างาน: id ของใบต้นทางไปทาง `extra` เท่านั้น (ทางเดียวกับงวดชำระ — ไม่ใช่ช่องของฟอร์ม) ·
         ไม่ใช่โหมดนั้น = ทางเดิมทุกตัวอักษร */
      const { id, error, warning } = await createRequestDraft(
        form, confirmData ? { confirmsRequestId: confirms } : installmentExtra,
      );
      /* บันทึกไม่ผ่าน (createRequestDraft ส่งมาแค่ประโยค ไม่มีสถานะ/รหัส · F8) — ถามแผนซ้ำหนึ่งครั้ง: ยังได้ 200 = คงฟอร์มที่พิมพ์ไว้ ·
         ถูกปฏิเสธแล้ว (เช่นมีใบเปิดอยู่แล้ว) = หน้าเปลี่ยนเป็นประโยคนั้นแทนฟอร์ม */
      if (error && confirmData) setConfirmTick((n) => n + 1);
      if (error) { setToast({ kind: "error", msg: confirmData ? refusalText(error) : error }); return; }
      createdId = id || null;
      /* ใบร่างเก็บแล้วแต่ผูกงวดไม่ได้ (server ตอบ 201 + `_warning`) — ทักโทนเตือนผ่านถาดกลาง
         (`notifyToast` อยู่ที่ layout ⇒ ไม่หายตอน router.push ต่างจาก Toast ของหน้านี้)
         ⚠️ `warning` ต้องมาจาก createRequestDraft (responseWarningText ของคำตอบ) — ไม่มี = เงียบ */
      if (warning) notifyToast.warning(warning, RESPONSE_WARNING_TOAST);
      // ⭐ อัปไฟล์ที่แนบไว้ในฟอร์ม (มติผู้ใช้ 2026-08-08: แนบได้ตั้งแต่หน้าสร้าง) —
      // ต้องมี id ก่อนถึงอัปได้ จึงมาหลัง create เสมอ
      // ⚠️ อัปพลาด **ไม่ rollback ร่าง** — ของที่อัปแล้วอยู่ครบ พาไปหน้ารายละเอียด
      // พร้อมบอกว่าไฟล์ไหนไม่เข้า ให้แนบต่อที่นั่น (แถวไฟล์แนบมีอยู่แล้ว)
      /* 🔴 **ร่างเกิดแล้ว = พาไปหน้ารายละเอียดทุกทาง** (S4 B-6) — หน้านี้ไม่มีจังหวะให้กดซ้ำแล้วได้ร่างที่สอง
         หรืออัปไบต์เดิมซ้ำ · ไฟล์ที่ไม่เข้าแนบต่อที่หน้ารายละเอียดทีละไฟล์ (ช่องไฟล์บังคับมีบล็อกเดียวกันที่นั่น)
         ⭐ ไฟล์แบบขึ้นก่อน (docType ของรูปแบบ) แล้วค่อยไฟล์ทั่วไป · ล้มที่ไหนหยุดที่นั่น (ข้อความบอกชื่อไฟล์) */
      if (id) {
        const uploadError = await uploadDraftFiles(id, form.requiredFiles, { docType: requiredSpec?.docType, onUploaded: track("requiredFiles") })
          || await uploadDraftFiles(id, form.files, { onUploaded: track("files") });
        /* 🔴 ทักผ่านถาดกลาง (`notifyToast` อยู่ที่ layout) — Toast ของหน้านี้ตายไปพร้อมหน้าตอน router.push
           ผู้ใช้เลยไม่เคยเห็นว่าไฟล์ไหนไม่เข้า (UAT S4 T07) · ค้าง 12 วิ ให้อ่านจบบนหน้ารายละเอียด
           ⭐ บอกจำนวน + ชื่อไฟล์ที่ยังไม่เข้า (UAT S4 รอบ 4 ข้อ 15) — ตัวอัปหยุดที่ไฟล์แรกที่ล้ม ไฟล์ที่ตามหลังก็ไม่เข้าด้วย */
        if (uploadError) notifyToast.error(draftUploadFailureText(uploadError, leftNames()), RESPONSE_WARNING_TOAST);
        router.push(`/requests/${id}`);
      }
    } catch (e) {
      if (createdId) {
        notifyToast.error(draftUploadFailureText(e?.message || "แนบไฟล์ไม่สำเร็จ", leftNames()), RESPONSE_WARNING_TOAST);
        router.push(`/requests/${createdId}`);
      } else {
        setToast({ kind: "error", msg: e?.message || "บันทึกร่างไม่สำเร็จ" });
      }
    } finally {
      setSaving(false);
    }
  };

  /* ── แผงจัดการด้านข้าง — ผังเดียวกับหน้าสร้างใบเสนอราคา (มติผู้ใช้ 2026-08-09)
     ⭐ รายการความพร้อมมาจาก `requiredChecks` **ตัวเดียวกับเกจบนแท็บและด่านส่ง**
     ⇒ สามที่พูดตรงกันเสมอ (แผงบอกว่าครบ แต่ปุ่มกดไม่ได้ = สิ่งที่ทำให้คนเลิกเชื่อจอ)
     ⚠️ ปุ่มลบ/แก้ **ไม่ได้อยู่ที่นี่** — ร่างที่บันทึกแล้วมีชีวิตอยู่ที่หน้ารายละเอียด
     ซึ่งมีทั้งส่ง/ยกเลิก/ลบครบอยู่แล้ว · ทำซ้ำที่นี่ = สองที่ที่ต้องคอยให้ตรงกัน */
  /* ⭐ **ขั้นเลือกหัวข้อ: เลือกครบแล้วหรือยัง** — เงื่อนไขเดียวกับด่าน `requestFormBlocker`
     (ต้องมีทั้งฝ่ายและหัวข้อ) ⇒ ติ๊กในรายการความพร้อม · ปุ่ม "กรอกฟอร์ม…" · เหตุผลข้างปุ่มบันทึก
     อ่านค่าตัวเดียวกัน สามที่จึงพูดตรงกันเสมอ */
  const topicPicked = !!form.kind && !!form.dept;
  /* ป้ายปุ่มที่กางฟอร์ม — ใช้ทั้งบนปุ่มเองและในเหตุผลของปุ่มบันทึก (ชื่อที่อ้างต้องตรงกับปุ่มบนจอทุกตัวอักษร) */
  const openFormLabel = form.kind ? `กรอกฟอร์ม${requestKindLabel(form.kind)}` : "กรอกฟอร์ม";
  /* เหตุผลที่ "บันทึกร่าง" ยังกดไม่ได้ระหว่างขั้นเลือกหัวข้อ
     🐞 (UAT S4 · layout nits D3) เดิมขึ้น "เลือกฝ่ายและหัวข้อก่อน" ตลอดขั้นนี้ ⇒ เลือกครบแล้ว รายการความพร้อม
        ติ๊กแล้ว แต่ข้อความยังสั่งให้เลือกอีก — ขัดกันเองบนการ์ดเดียว และไม่บอกก้าวจริงที่เหลือ (กดปุ่มกางฟอร์ม)
     ⚠️ ยังเลือกไม่ครบ = คำเดิม (คำเดียวกับด่าน `requestFormBlocker` ของ lib/master/requestCreate.js) */
  const topicStepReason = topicPicked ? `กด “${openFormLabel}” เพื่อเปิดฟอร์ม` : "เลือกฝ่ายและหัวข้อก่อน";
  // ป้ายช่องวันที่ของหัวข้อนี้ — ตัวเดียวกับที่ `requiredChecks` ตั้ง (ข้อความของทั้งใบ) ใช้หาแถวที่ต้องบอกเหตุ
  const dueLabel = requestFormCopy(form).dueLabel;
  const readinessItems = revealed
    ? requiredChecks(form).map((c) => ({
      id: `${c.tab}-${c.label}`,
      label: c.label,
      ready: c.ok,
      detail: c.ok ? undefined
        : droppedDueDate && c.tab === "due" && c.label === dueLabel
          ? `วันที่ที่มากับลิงก์ (${formatBillingDate(droppedDueDate)}) ผ่านไปแล้ว — เลือกวันเอง`
          : "ยังไม่ได้กรอก",
    }))
    : [{
      id: "kind",
      label: "เลือกฝ่ายและหัวข้อ",
      ready: topicPicked,
      detail: topicPicked ? requestKindLabel(form.kind) : "เลือกก่อนจึงกางฟอร์มได้",
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
        disabledReason: !revealed ? topicStepReason : blocker || undefined,
        onClick: saveDraft,
      }}
      secondaryActions={[{
        id: "cancel",
        kind: "open",
        icon: null,
        label: "ยกเลิก",
        variant: "ghost",
        // ใบยืนยันหน้างาน: ยกเลิก = กลับไปใบต้นทางที่กดมา
        href: confirms ? originalHref : returnTo,
      }]}
      busy={saving}
      // บอกล่วงหน้าว่าบันทึกแล้วงวดจะถูกผูก — ผูกแล้วงวดนั้นถูกล็อกจาก "ปรับแผนงวด" จนกว่าจะถอด
      footer={installmentPick?.installmentId
        ? "บันทึกแล้วระบบผูกคำร้องนี้กับงวดชำระที่เลือกให้ แล้วไปต่อที่หน้ารายละเอียด — เลขที่ออกตอนกดส่ง · ร่างที่ยังไม่ส่งลบได้ที่นั่น"
        : installmentPick
          ? "บันทึกแล้วระบบจำงวดที่เลือกไว้ และผูกกับงวดจริงให้เมื่อออกใบสั่งขาย — เลขที่ออกตอนกดส่ง · ร่างที่ยังไม่ส่งลบได้ที่นั่น"
          : "บันทึกแล้วไปต่อที่หน้ารายละเอียด — เลขที่ออกตอนกดส่ง · ร่างที่ยังไม่ส่งลบได้ที่นั่น"}
    />
  );

  /* ── โหมดใบยืนยันหน้างาน: ระหว่างโหลด = โครงหน้า · ถูกปฏิเสธ = กล่องแจ้งกล่องเดียว ไม่มีฟอร์ม ไม่มีปุ่มบันทึก ──
     ประโยคมาจาก server (ตัวตัดสินตัวเดียวกับปุ่ม) · ลิงก์ไปใบที่ถือพื้นที่/ใบยืนยันที่เปิดอยู่เมื่อ server ส่ง `open` ·
     ลิงก์กลับใบต้นทางเมื่อ server ส่ง `original` (N4 ไม่มี — ไม่มีใบให้กลับ · ลูกศรของหน้ายังอยู่) */
  const confirmRefused = confirms && confirmPlan && !confirmPlan.ok ? confirmPlan : null;
  const confirmLoading = !!confirms && !confirmPlan;
  const confirmOriginal = confirmData?.original || confirmRefused?.original || null;
  const confirmBody = confirmLoading ? <SkeletonRows rows={6} /> : confirmRefused ? (
    <StatusNotice tone="warning">
      {refusalText(confirmRefused.error)}
      {confirmRefused.open?.id || confirmRefused.original ? (
        <span className={styles.refusalLinks}>
          {confirmRefused.open?.id ? (
            <Link className="linklike" href={`/requests/${encodeURIComponent(confirmRefused.open.id)}`}>
              {surveyConfirmOpenLinkText(confirmRefused.open)}
            </Link>
          ) : null}
          {confirmRefused.original ? (
            <Link className="linklike" href={originalHref}>{surveyConfirmBackLinkText(confirmRefused.original)}</Link>
          ) : null}
        </span>
      ) : null}
    </StatusNotice>
  ) : null;

  return (
    <Workspace
      icon={<MessageCircleQuestion size={22} />}
      title={confirms ? SURVEY_CONFIRM_ACTION_LABEL : "เปิดคำร้อง"}
      subtitle={confirms
        ? (confirmOriginal ? keepPhrases(surveyConfirmSubtitle(confirmOriginal), SURVEY_CONFIRM_WRAP_KEEP) : undefined)
        : "คำร้องจะถูกสร้างเป็นร่างก่อน — เลขที่จะออกตอนกดส่ง"}
      /* N4 (ไม่มีใบต้นทาง — คำตอบไม่มี `original`) = ไม่มีใบให้กลับ ⇒ ลูกศรกลับทางเดิม (UAT S5 sales รอบ 1 · K08 refused-404) */
      back={{ href: confirms && (!confirmRefused || confirmRefused.original) ? originalHref : returnTo, label: "กลับ" }}
    >
      {confirmBody || (
      <DetailPageLayout aside={controlPanel} asideLabel="ความพร้อมและการจัดการคำร้องใหม่">
      <div className={styles.form}>
        <RequestForm
          value={form} onChange={setForm} disabled={saving}
          projects={projects} deals={deals} salesOrders={salesOrders} customers={customers}
          quotations={quotations} products={products} me={me}
          installmentPrefill={installmentPrefill}
          scents={scents} formulas={formulas} productTypes={productTypes}
          mentionPeople={mentionPeople} people={people}
          // วิธีประเมินที่เปิดให้เลือก — มาจากคำตอบของ server (สวิตช์) · ยังไม่ได้คำตอบ = ปุ่มหยุดรอ
          variantsPending={options === null}
          variantsOff={variantsOff}
          // @ อยู่ที่หน้ารายละเอียด (แจ้งเตือนออกตอนกดส่ง) · ช่องไฟล์อยู่ในฟอร์มแล้ว
          // — saveDraft อัปให้หลังได้ id (มติผู้ใช้ 2026-08-08)
          deferMentions
          // เหตุผลที่ยังบันทึกไม่ได้ย้ายไปอยู่ติดปุ่ม (ด่านตัวเดียวกัน คนละที่วาง)
          showBlocker={false}
          revealed={revealed}
          /* ⭐ ใบยืนยันหน้างาน (งวด S5 D-4 · D-5): ฟอร์มตัวเดียวกันในโหมดล็อก — หัวข้อล็อก · ดีล/สถานที่/พื้นที่/วิธีเป็นช่องเส้นประ
             จากใบต้นทาง · ไม่มีปุ่มเปลี่ยนฝ่าย/หัวข้อ (ล้างฟอร์มแล้วก็กลับมาเป็นใบยืนยันไม่ได้) */
          lockKind={!!confirmData}
          confirmLock={confirmData ? { mode: "create", original: confirmData.original, zones: confirmData.zones } : null}
          // ⭐ ปุ่มคุมหัวข้ออยู่ติดช่องหัวข้อ ไม่ใช่แถบปุ่มล่าง · สลับป้ายตามขั้น
          // ⚠️ "เปลี่ยนหัวข้อ" **ล้างฟอร์มทิ้ง** เหลือแค่ฝ่าย/หัวข้อ — ค่าเดิมค้างอยู่คือ
          // ของที่ถูกส่งไปกับคำร้องหัวข้อใหม่โดยไม่มีใครเห็น · และตอนกางฟอร์มแล้ว
          // ดรอปดาวน์ถูกล็อก ⇒ **ทางเดียวที่เปลี่ยนได้คือกดปุ่มนี้** เปลี่ยนโดยไม่ตั้งใจไม่ได้
          topicAction={confirmData ? null : revealed ? {
            // บอกให้ครบว่าปลดล็อกอะไร — ปุ่มปลดทั้งฝ่ายและหัวข้อ ไม่ใช่หัวข้ออย่างเดียว
            label: "เปลี่ยนฝ่าย/หัวข้อ",
            onClick: () => {
              setForm(emptyRequestForm({ ...defaults, dept: form.dept, kind: form.kind }));
              setRevealed(false);
            },
          } : {
            // ⭐ ป้ายบอก **สิ่งที่จะได้** ไม่ใช่สิ่งที่ปุ่มทำ — "แสดงฟอร์ม" ไม่ได้บอกว่า
            // ฟอร์มอะไร · ใส่ชื่อหัวข้อลงไปเลยจะเห็นตั้งแต่ยังไม่กดว่ากำลังจะกรอกอะไร
            label: openFormLabel,
            // ⭐ **ปุ่มหลักของขั้นนี้** — ขั้นแรกยังไม่มีปุ่ม "บันทึกร่าง" (ยังไม่มีอะไร
            // ให้บันทึกนอกจากฝ่ายกับหัวข้อ) ⇒ นี่คือปุ่มเดียวที่พาไปต่อได้ทั้งหน้า
            // เดิมเป็น quiet ตัวเล็กลอยอยู่มุมขวา อ่านเหมือนข้อความจาง ไม่ใช่ปุ่ม
            tone: "accent",
            variant: "filled",
            size: "md",
            // ⚠️ **ปุ่มที่กดไม่ได้ต้องบอกเหตุผล** (กฎเดียวกับ `requestFormBlocker`) —
            // จางเฉย ๆ คือสิ่งที่ทำให้คนคิดว่าระบบพัง แล้วไปหาสาเหตุผิดที่
            disabled: !topicPicked,
            hint: topicPicked ? null : "เลือกฝ่ายและหัวข้อก่อน",
            onClick: () => setRevealed(true),
          }}
        />

        {/* ⚠️ **ไม่มีแถบปุ่มล่างแล้ว** — ปุ่มทั้งใบย้ายไปแผงจัดการด้านข้าง (ผังเดียว
            กับหน้าสร้างใบเสนอราคา) · ปุ่มคุมหัวข้อยังอยู่ติดช่องหัวข้อเหมือนเดิม */}
      </div>
      </DetailPageLayout>
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}
