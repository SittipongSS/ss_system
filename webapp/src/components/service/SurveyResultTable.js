"use client";
// ── ตารางสรุปผลประเมินของหัวหน้า TS (เฟส 3 · จอ 07) ─────────────────────
//
// ⭐ **ช่างส่งข้อเท็จจริงมาจากหน้างาน หัวหน้าตัดสินสองอย่าง**: จะติดตั้งจุดไหนบ้าง
//   และแต่ละพื้นที่ใช้แพ็คเกจ **ขนาดไหน กี่แพ็ค** (มติผู้ใช้ 2026-08-29 · ขนาดจากทะเบียน: มติเจ้าของ 01/10 · mig 0398)
//   ⇒ ตารางนี้มี **สองคอลัมน์ที่ต้องกรอก ไม่ใช่คอลัมน์เดียว** · ที่เหลืออ่านอย่างเดียว
//   🔄 **+ คอลัมน์ "ภาพผังที่มาร์กจุดแล้ว"** (มติเจ้าของ 25/09 · แบบ AW-3 · แผน §10.5 S2) —
//      ผังเดิมอัปในการ์ดพื้นที่ของช่าง ทั้งที่มันคือ **ผลของการเลือกจุด** (มาร์กจุดที่เลือกลงผัง)
//      ⇒ ย้ายมาอยู่ข้างคอลัมน์เลือกจุด · รูปขึ้นระบบทันทีเหมือนรูปอื่น (ไม่รอปุ่มบันทึกการเคาะ)
//   ⭐ ลำดับคอลัมน์ตาม AW-3: พื้นที่ · ผลวัดจากช่าง (ตัวเลข · ขนาด · ภาพย่อที่ช่างถ่าย) →
//      ภาพผัง → เลือกจุด → แพ็คเกจ · คอลัมน์ "ขนาด" กับ "รูป" (เลข "1 / 0 / 2") ยุบเข้าช่องแรก
//      เพราะหัวหน้าเคาะจากผลวัด ⇒ ผลวัดต้องอยู่ติดชื่อพื้นที่ ไม่ใช่ท้ายแถว
//
// ⭐ **เคาะแล้วกดบันทึกเอง ไม่ใช่บันทึกทุกคลิก** (มติผู้ใช้ 2026-09-16 · PR5)
//   🐞 ของเดิมยิง `PUT` ทุกครั้งที่กด +/− หรือติ๊กจุด ⇒ หัวหน้าที่กำลังลองตัวเลขเขียน
//     ลงฐานไปแล้วสิบรอบ · ทุกรอบเป็นแถว audit จริง · และไม่มีจังหวะไหนเลยที่เขาพูดว่า
//     "เอาตามนี้" ⇒ ของที่กำลังคิดอยู่แยกไม่ออกจากของที่ตัดสินแล้ว
//   ⇒ ร่างอยู่บนจอ · แถบบนหัวการ์ดนับให้ว่าค้างกี่พื้นที่ · กดครั้งเดียวลงทั้งชุด
//   ⚠️ **กฎว่าอะไรคือ dirty และบันทึกได้หรือยัง อยู่ใน `surveyDecision.js` ไม่ได้อยู่ที่นี่**
//     — ด่านชุดเดียวกับ route `PUT` และการ์ดควบคุมอ่านตัวเดียวกัน
//
// ⚠️ **จำนวนจุด ≠ จำนวนแพ็คเกจ** — `service-field-operations` §2.4 บันทึกไว้แล้วว่า
//   "จำนวนเครื่องต่อแพ็คเกจแกว่ง" · หนึ่งแพ็คเกจกระจายหลายจุดได้ หลายแพ็คเกจลงจุดเดียวได้
//   ⇒ **ห้ามผูกสองเลขนี้เข้าหากันอัตโนมัติ และห้ามเตือนว่า "ไม่เท่ากัน"**
//
// ⭐ **คอลัมน์ที่ต้องตัดสินอยู่ถัดจากชื่อพื้นที่** — 🐞 เดิมแพ็คเกจกับจุดติดตั้งอยู่หลังสี่
//   คอลัมน์อ่านอย่างเดียว (ตาราง 960px) ⇒ มือถือเปิดมาเห็นแต่ของที่อ่าน ปุ่ม +/− หลุดจอ
//   แม้บนแท็บเล็ต · ลบ.ม. กับที่ระบบเสนอจึงยุบเป็นบรรทัดรองของเซลล์ที่มันอธิบาย
// ⭐ **แพ็คเกจ = ขนาดเดียว + จำนวน ต่อพื้นที่** (มติเจ้าของ 01/10) — ขนาดเป็น **แถบเลือกที่เห็นครบทุกขนาดในทะเบียน**
//   (ไม่ใช่ดรอปดาวน์ · ทะเบียนเพิ่ม/ลบได้ ⇒ แถบห่อบรรทัดเองเมื่อขนาดเยอะ) · ระบบ **เสนอ** ขนาดจากช่วง ลบ.ม. + จำนวน 1
//   แต่ไม่เลือกให้ — หัวหน้ากดรับ ("ใช้ที่ระบบเสนอ") หรือเลือกเอง · 🔄 สูตร ceil(ลบ.ม. ÷ 2,400) ถอดแล้ว
//   ⚠️ **ข้อความทุกบรรทัดของช่องแพ็คเกจมาจาก `surveyPackageCell`** (`surveyDecision.js`) — จอไม่ประกอบเอง
//      และช่องเหตุผลโผล่ตามตัวตัดสินเดียวกับด่านบันทึกของ server
// ⭐ **ดูอย่างเดียว = ตัวหนังสือ ไม่ใช่ปุ่มจาง** — จุดที่เลือกคือผลที่ฝ่ายขายอ่าน ต้องชัดที่สุด
//   ในแถว และบอกด้วยไอคอน ไม่ใช่สีขอบอย่างเดียว (WCAG 1.4.1)
// ⭐ **รูปของแต่ละจุดอยู่ใต้จุดนั้น** (PR-S · มติเจ้าของ 28–30/09) — หัวหน้าเลือกจุดจากรูปของจุด ไม่ใช่เทียบกองรูปรวมเอง
//   (`surveyResultSpotCell` · ผูกด้วย `metadata.spotId`) · รูปจุดที่ยังไม่ผูกขึ้นเป็นบรรทัดอำพันท้ายช่อง ไม่หายเงียบ
import { Fragment, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, Circle, CircleCheck, ClipboardList, Lightbulb, Link2, Minus, Pencil, Plus, Undo2 } from "lucide-react";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import Button from "@/components/ui/Button";
import { DetailCard } from "@/components/ui/DetailPage";
import PhotoThumb from "@/components/ui/PhotoThumb";
import Segmented from "@/components/ui/Segmented";
import StatusBadge from "@/components/ui/StatusBadge";
import StatusNotice from "@/components/ui/StatusNotice";
import { TableScroll } from "@/components/ui/Table";
import Textarea from "@/components/ui/Textarea";
import { SURVEY_DOC_PLAN, surveyResultMissing, surveyZoneName } from "@/lib/service/survey";
import { SURVEY_UNKNOWN_TEXT, surveyResultSpotCell, surveyResultZoneCell } from "@/lib/service/surveyControl";
import { surveyZoneTitle } from "@/lib/service/surveyFieldView";
import {
  surveyDecisionDraft, surveyDecisionDirty, surveyDecisionError, surveyDecisionPayload,
  surveyPackageCell, surveyPendingDecisions,
} from "@/lib/service/surveyDecision";
import { packageSizeLegendText } from "@/lib/service/packageSizeForm";
import { PACKAGE_QTY_MAX, PACKAGE_SIZE_REGISTRY_UNREAD } from "@/lib/service/packageSizes";
import { fmtNumber, naText } from "@/lib/format";
import styles from "./SurveyResultTable.module.css";

/* วัดโหมดเคาะ (2026-09-15 · มีช่องเหตุผล + ปุ่มรับข้อเสนอ + บรรทัดขาดอะไร): ดูอย่างเดียวรวม 573px
   แต่ตอนเคาะช่องเหตุผลกิน 160px · 🐞 640 เดิมคิดจากโหมดดูอย่างเดียว ⇒ แถวสูง 175px
   บรรทัด "ขาด…" ห่อ 6 บรรทัด · 680 ⇒ 138px และยังไม่เกินกรอบแท็บเล็ต (696px)
   🔄 AW-3 (§10.5 S2): ห้าคอลัมน์ → สี่ · สามคอลัมน์มีความกว้างขั้นต่ำของตัวเอง (`<col>` ใน CSS:
      พื้นที่ 13rem · ผัง 9rem · แพ็คเกจ 12rem = 544px) ⇒ เลือกจุดได้ส่วนที่เหลือ ≥136px ที่ 680
      และยังไม่เกินกรอบแท็บเล็ต · ⚠️ ตัวเลขชุดนี้ **คิดจากเนื้อ ยังไม่ได้วัดบนจอจริง** (ชุดนี้ห้ามเปิด
      dev server) — ชุดตรวจจอ (แผนลงมือ §9) ต้องวัด scrollWidth ที่ 768/1024/1440 แล้วแก้ตรงนี้ถ้าล้น
   🔄 mig 0398 (01/10): ช่องแพ็คเกจมีแถบขนาดเพิ่ม (4 ขนาด × ปุ่ม 44px ≈ 190px) ⇒ คอลัมน์แพ็คเกจ 12rem → 13rem และ
      ตาราง 680 → 696 (เต็มกรอบแท็บเล็ตพอดี) ⇒ เลือกจุดยังได้ ≥136px เท่าเดิม · ขนาดในทะเบียนเกินสี่ตัว = แถบห่อบรรทัดเอง
      ⚠️ ชุดนี้ก็ **คิดจากเนื้อ ยังไม่ได้วัดบนจอจริง** เช่นกัน (ห้ามรันแอปกับฐานจริง) — ต้องวัดตอน UAT
   🔄 UAT PR-P 01/10 (วัดบนจอจริงแล้ว): กล่องตาราง ≥ 900px (จอ 1024/1440) คอลัมน์แพ็คเกจขยายเป็น 23rem และป้ายย้ายไปอยู่ข้างตัวควบคุม
      (`@container` ใน CSS) — 696 นี้ยังเป็นขั้นต่ำของกล่องแคบ (681–899px) ซึ่งคอลัมน์แพ็คเกจยัง 13rem ตามที่คิดไว้ข้างบน
   ⚠️ ที่ ≤680px ตารางเลิกเป็นตาราง (แถวเรียงเป็นป้าย/ค่า) ⇒ ตัวเลขนี้ใช้กับ 681px ขึ้นไป */
const TABLE_MIN_WIDTH = 696;

/* ชนิดไฟล์ของช่องผัง — ค่าคงที่ระดับไฟล์ (ส่งอาร์เรย์ใหม่ทุกครั้งที่วาด = แผงคิดชุดชนิดใหม่ทุกรอบ) */
const PLAN_DOC_TYPES = [{ key: SURVEY_DOC_PLAN, label: "ภาพผังที่มาร์กจุดแล้ว" }];

/* ภาพย่อใต้ชิปของจุด — ช่องเลือกจุดแคบ ⇒ สามรูปต่อจุด ที่เหลือบอกด้วย "+n" (ท่าเดียวกับช่องพื้นที่) */
const SPOT_THUMBS = 3;

/* ── ช่องภาพผังของพื้นที่หนึ่งแถว ────────────────────────────────────────────
   ⭐ **component ระดับไฟล์ ไม่ใช่ฟังก์ชันในลูป** — แผงไฟล์แนบยิง `onItemsChange` ใน effect ที่ขึ้นกับ
   ตัวตนของฟังก์ชัน ⇒ ต้องได้ตัวรายงานที่คงที่ต่อพื้นที่ (`useCallback`) ไม่ใช่ลูกศรใหม่ทุกครั้งที่วาด
   ⚠️ ตัวนับ ("ขึ้นแล้ว n รูป" / "ยังไม่มี · ต้องมี") มาจาก **ก้อนรวมของหน้า** ไม่ใช่รายการในแผง —
   ตัวเดียวกับที่ด่านส่งผลอ่าน ⇒ ตารางกับการ์ดจัดการผลบอกเลขเดียวกันเสมอ */
function PlanPhotos({ zoneId, count, canUploadPlan, onFiles, intakeFirst }) {
  const handleItems = useCallback((items, meta) => {
    onFiles?.(zoneId, items, meta);
  }, [onFiles, zoneId]);
  return (
    <>
      <AttachmentsPanel
        entityType="service_survey_zone" entityId={zoneId} canEdit={canUploadPlan} showCount={false}
        title="" inlineUpload docTypes={PLAN_DOC_TYPES}
        /* ปุ่มขนาดนิ้ว "ถ่ายรูป/แนบรูป" — หัวหน้าถ่ายผังที่มาร์กบนกระดาษได้จากแท็บเล็ต
           ⭐ แผ่นรูปแบบหน้าพื้นที่ (ม็อก AW-3) — ลบอยู่ในกล่องดูรูปเต็ม ปุ่ม 44px · 🐞 UAT 25/09: แบบตั้งต้นของแผงมี × 22px
             ที่มุมรูป ต่ำกว่าเป้านิ้ว (แผนลงมือ C11) */
        photoCapture
        photoTiles
        onItemsChange={handleItems}
        /* Ctrl+V ลอย ๆ ตกที่แถวที่หัวหน้ากำลังทำ (แผงนี้อัปขึ้นระบบทันที ของที่ไปผิดแถวคือของที่ต้องตามลบ) */
        intakeWeight={intakeFirst ? 0 : 1}
      />
      {count > 0 ? (
        <span className={styles.planState} data-tone="ok">
          <Check size={12} aria-hidden="true" />ขึ้นแล้ว {fmtNumber(count)} รูป
        </span>
      ) : (
        <span className={styles.planState} data-tone="miss">
          ยังไม่มี · ต้องมี
          {canUploadPlan ? <small>มาร์กจุดที่เลือกลงบนผังก่อนแนบ</small> : null}
        </span>
      )}
    </>
  );
}

/* ⭐ `caption` — บรรทัด "ขอไป N พื้นที่ · …" ที่เดิมเป็น <p> ลอยอยู่ *ข้าง* การ์ด
   (เขียนไว้ก่อนตารางย้ายเข้าการ์ดเมื่อ 2026-09-15) ⇒ คำบรรยายแยกจากตารางที่มันอธิบาย
   ⚠️ ข้อความมาจาก `surveyChangeText` ตัวเดิม ตารางไม่ได้นับเอง — จอ TS · จอ SA ·
   กระดิ่ง ต้องเล่าตัวเลขชุดเดียวกัน */
export default function SurveyResultTable({
  zones = [], filesByZone = {}, canDecide = false, busyZone, onSaveDecisions,
  drafts = {}, onDraftsChange, caption = null,
  /* อัปภาพผังได้ไหม — `view.flags.canUploadPlan` (คนเคาะ + เขียนผลวัดของใบนี้ได้ + ยังไม่ล็อก)
     ⚠️ แยกจาก `canDecide` — ผู้บริหารที่ส่งผลได้แต่เขียนผลวัดไม่ได้ อัปแล้วเจอ 403 */
  canUploadPlan = false,
  /* `(zoneId, items, meta)` — แผงผังรายงานรายการขึ้นไปที่ก้อนรวมของหน้า (`useLiveZoneFiles`) */
  onFiles,
  /* โชว์บรรทัด "ระบบเสนอ …" ไหม — แพ็คเกจเป็นงานของหัวหน้า (มติผู้ใช้ 2026-09-21) ⇒ ช่างเห็น
     เฉพาะขนาด/จำนวนที่หัวหน้าเคาะแล้ว ไม่เห็นข้อเสนอของระบบ (กติกาเดียวกับการ์ดพื้นที่ `showPackage`)
     ⚠️ แยกจาก `canDecide` — หัวหน้าที่เปิดใบที่ส่งไปแล้ว (ล็อก) ยังต้องเห็นที่ระบบเสนอเทียบ
     ⚠️ ชื่อ prop คงเดิม (`showFormula`) — สูตร ÷ 2,400 ถอดแล้ว แต่ความหมาย "โชว์ข้อเสนอของระบบไหม" ยังเป็นตัวเดิม */
  showFormula = true,
  /* ทะเบียนขนาดแพ็คเกจจาก GET ใบประเมิน (`packageSizes` · mig 0398) — `null` = server อ่านไม่สำเร็จ ⇒ เคาะขนาดไม่ได้
     (fail-closed · ตัวตัดสินเดียวกับ route `PUT`) · ⚠️ ลืมส่ง = ทุกแถวขึ้น "อ่านทะเบียนขนาดแพ็คเกจไม่สำเร็จ" */
  packageSizes = null,
  /* ผูกรูปจุดกับจุดได้ไหม (`canLinkSpotPhotos` ของ server) — บรรทัด "ยังไม่ได้ผูกจุด" บอกทางไปแท็บหน้างานเฉพาะคนที่ทำได้ */
  canLinkSpots = false,
  /* `()` — อ่านใบใหม่ (ทะเบียนขนาดมากับ GET ใบประเมิน) · ปุ่ม "โหลดใหม่" ของกล่องแจ้ง "อ่านทะเบียนขนาดแพ็คเกจไม่สำเร็จ"
     ไม่ส่ง = กล่องแจ้งไม่มีปุ่ม (บอกเหตุอย่างเดียว) */
  onReload,
  /* `(zoneId)` — ไปถาด "ยังไม่ได้ผูกจุด" ของพื้นที่นั้นบนแท็บหน้างาน (หน้าสลับแท็บ · เปิดพื้นที่ · เลื่อนถึงถาด)
     🐞 UAT 01/10: เดิมเป็นตัวหนังสือเฉย ๆ ⇒ หัวหน้าต้องสลับแท็บ เปิดพื้นที่ แล้วเลื่อนหาถาดเอง · ไม่ส่ง = บอกทางเป็นตัวหนังสือ */
  onOpenSpotTray,
}) {
  /* ร่างของหัวหน้า — key = id ของพื้นที่ · ค่าที่ไม่มีในนี้แปลว่า "ยังไม่ถูกแตะ"
     ⚠️ ห้ามเติมค่าตั้งต้นลงไปตอนเปิดจอ — ของที่เติมไว้ล่วงหน้าแยกไม่ออกจากของที่คนพิมพ์
        แล้ว "ยังไม่บันทึก" จะขึ้นทั้งใบตั้งแต่ยังไม่มีใครแตะอะไร
     ⭐ **ร่างเป็นของหน้า ไม่ใช่ของตาราง** — ตารางนี้ถูก unmount ทุกครั้งที่สลับไปแท็บ
       "หน้างาน" · ถ้าร่างอยู่ใน state ของตาราง ของที่หัวหน้าเคาะไว้จะหายไปพร้อมกัน
       โดยไม่มีคำเตือน (🐞 เจอตอนตรวจก่อน merge 2026-09-16) */
  const setDrafts = onDraftsChange;
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  /* แถวที่หัวหน้ากำลังทำ (โฟกัสล่าสุดอยู่ในแถวไหน) — เจ้าของ Ctrl+V ตอนไม่มีอะไรโฟกัส */
  const [activeZone, setActiveZone] = useState(null);
  const patchDraft = useCallback((id, patch) => {
    setDrafts?.((d) => ({ ...d, [id]: { ...(d[id] || {}), ...patch } }));
  }, [setDrafts]);

  const pending = useMemo(
    () => surveyPendingDecisions(zones, drafts, { sizes: packageSizes }),
    [zones, drafts, packageSizes],
  );
  /* "SM ≤ 300 ลบ.ม. · ST ≤ 2,400 ลบ.ม. · …" — ช่วงของทุกขนาดในบรรทัดเดียวใต้ตาราง (ป้ายบนแถบมีแค่รหัส) */
  const sizeLegend = useMemo(
    () => (Array.isArray(packageSizes) ? packageSizeLegendText(packageSizes) : ""),
    [packageSizes],
  );

  const saveAll = async () => {
    setSaveError("");
    const items = pending.rows
      .map((zone) => ({ zoneId: String(zone.id), payload: surveyDecisionPayload(zone, drafts[zone.id]) }))
      .filter((it) => it.payload);
    if (!items.length) return;
    setSaving(true);
    try {
      /* ⚠️ ล้างร่าง **เฉพาะพื้นที่ที่ลงจริง** — ล้างทั้งก้อนแล้วรอบที่ล้มเหลวจะกลืน
         ของที่หัวหน้าพิมพ์ไว้หายไปพร้อมกัน (กติกา "กดส่งซ้ำต้องไม่ทำของหาย") */
      const result = await onSaveDecisions?.(items);
      const savedIds = result?.savedIds || [];
      if (savedIds.length) {
        setDrafts?.((d) => {
          const next = { ...d };
          for (const id of savedIds) delete next[id];
          return next;
        });
      }
      if (result?.failure) setSaveError(result.failure.message || "บันทึกการเคาะไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  /* "ยกเลิก" = คืนร่างทั้งใบเป็นค่าที่อยู่ในฐาน — ไม่ยิงอะไรทั้งนั้น */
  const discardAll = () => { setDrafts?.({}); setSaveError(""); };

  /* แถบบนหัวการ์ด — ขึ้นเมื่อมีของค้างเท่านั้น (ปุ่มที่กดแล้วไม่เกิดอะไรคือปุ่มที่ไม่ควรมี)
     ⚠️ อยู่ใน `actions` ของ DetailCard ⇒ อยู่บรรทัดเดียวกับชื่อการ์ดบนจอกว้าง
        และตกลงมาเป็นแถวของตัวเองบนจอแคบ ตามกฎของเปลือกการ์ด */
  const bar = canDecide && pending.count ? (
    <div className={styles.saveBar}>
      <StatusBadge tone="info" icon={Pencil}>
        ยังไม่บันทึก {fmtNumber(pending.count)} พื้นที่
      </StatusBadge>
      <Button size="sm" variant="quiet" className={styles.coarseTouch} onClick={discardAll} disabled={saving}>ยกเลิก</Button>
      {/* 🔑 **ปุ่มกดไม่ได้ต้องโชว์เสมอ แล้วบอกเหตุตอนกด** (กติกาของโปรเจกต์) ⇒ ปุ่มอยู่
          ตลอด ส่วนเหตุที่กดไม่ได้เป็นตัวหนังสือใต้แถบ ไม่ใช่ปุ่มที่หายไปเงียบ ๆ */}
      <Button size="sm" className={styles.coarseTouch} onClick={saveAll} disabled={saving || !pending.canSave}>
        {saving ? "กำลังบันทึก..." : "บันทึกการเคาะ"}
      </Button>
    </div>
  ) : null;

  return (
    /* ⭐ ตารางในหน้ารายละเอียด = DetailCard + TableScroll (มติผู้ใช้ 2026-09-15 · ทรงเดียวกับ service/sites/[id])
       ⚠️ minWidth = ความกว้างที่เนื้อสี่คอลัมน์ต้องใช้ (ที่มาของตัวเลขอยู่ที่ TABLE_MIN_WIDTH) · cells="stacked" เพราะ
       ทุกเซลล์ซ้อนสองบรรทัด (กฎ 5) · `styles.shell` อยู่ที่กล่องเลื่อนเอง (container ของ `.rowMiss`)
       🐞 **ต้องส่ง `surface="embedded"`** — ค่าตั้งต้นคือพื้นผิวของตารางที่ยืนเดี่ยวบนหน้าเปล่า
       (ขอบ + มุมมน + พื้น --panel + เงา) ⇒ อยู่ในการ์ดแล้วกลายเป็นพื้นการ์ดซ้อนพื้นการ์ด */
    <DetailCard
      icon={ClipboardList}
      title="สรุปผลประเมินรายพื้นที่"
      meta={caption || `${fmtNumber(zones.length)} พื้นที่`}
      actions={bar}
    >
      {/* เหตุที่ยังกดบันทึกไม่ได้ · และ error จากรอบที่เพิ่งล้ม — ตัวหนังสือใต้แถบ
          ⚠️ อยู่ในเนื้อการ์ด ไม่ใช่ในแถบ เพราะข้อความยาวกว่าที่แถวปุ่มรับไหว */}
      {canDecide && pending.blocked.length ? (
        <p className={styles.saveBlocked}>
          <AlertTriangle size={13} aria-hidden="true" />
          ยังบันทึกไม่ได้ — {pending.blocked.map((b) => `${surveyZoneName(b)}: ${b.error}`).join(" · ")}
        </p>
      ) : null}
      {saveError ? <p className={styles.saveBlocked}><AlertTriangle size={13} aria-hidden="true" />{saveError}</p> : null}
      {/* 🔴 อ่านทะเบียนขนาดไม่สำเร็จ — บอกครั้งเดียวเหนือตาราง พร้อมปุ่มที่ลองใหม่ได้จริง (อ่านใบใหม่ · ร่างการเคาะไม่หาย)
          🐞 UAT 01/10: เดิมทุกแถวเขียน "… — ลองใหม่ (โหลดหน้าใหม่)" โดยไม่มีอะไรให้กด */}
      {canDecide && !Array.isArray(packageSizes) ? (
        <div className={styles.registryNotice}>
          <StatusNotice tone="error" title={PACKAGE_SIZE_REGISTRY_UNREAD}
            action={onReload ? <Button size="sm" variant="ghost" className={styles.coarseTouch} onClick={onReload}>โหลดใหม่</Button> : undefined}>
            ช่องขนาดและจำนวนปิดไว้จนกว่าจะอ่านทะเบียนได้ — ค่าที่เคาะไว้แล้วยังอยู่ครบ
          </StatusNotice>
        </div>
      ) : null}

      <TableScroll surface="embedded" minWidth={TABLE_MIN_WIDTH} cells="stacked" className={styles.shell}>
        <table>
          {/* ความกว้างขั้นต่ำของสามคอลัมน์ (ดู TABLE_MIN_WIDTH) — เลือกจุดได้ส่วนที่เหลือ เพราะชิปจุด
              ยาวไม่เท่ากันทุกใบ และเป็นคอลัมน์เดียวที่ห่อบรรทัดได้โดยไม่เสียอะไร */}
          <colgroup>
            <col className={styles.colZone} />
            <col className={styles.colPlan} />
            <col />
            <col className={styles.colPackage} />
          </colgroup>
          <thead>
            <tr>
              <th>พื้นที่ · ผลวัดจากช่าง</th>
              {/* ดอกจัน = ของที่ต้องมีก่อนส่งผล — ขึ้นเฉพาะคนที่เคาะได้ (คนอ่านอย่างเดียวไม่มีอะไรต้องทำตาม)
                  ⚠️ ซ่อนจาก screen reader — "ต้องมี" พูดอยู่แล้วในบรรทัด "ยังขาด" ของแถวที่ติด */}
              <th>ภาพผังที่มาร์กจุดแล้ว{canDecide ? <span className={styles.star} aria-hidden="true">*</span> : null}</th>
              <th>
                เลือกจุดที่จะติดตั้ง{canDecide ? <span className={styles.star} aria-hidden="true">*</span> : null}
                <span className={styles.thNote}> · จากจุดที่ช่างแจ้ง</span>
              </th>
              <th>
                แพ็คเกจ{canDecide ? <span className={styles.star} aria-hidden="true">*</span> : null}
                <span className={styles.thNote}> · ขนาด และจำนวนต่อเดือน</span>
              </th>
            </tr>
          </thead>
          <tbody className={styles.body}>
            {zones.map((zone) => {
              const cut = zone.status === "cut";
              const files = filesByZone[zone.id] || [];
              /* 🔑 ผลวัดของช่างทั้งช่อง (ตัวเลข · ขนาดรายส่วน · ภาพย่อ · ตัวนับ) มาจากตัวตัดสินตัวเดียว */
              const cell = surveyResultZoneCell(zone, files);
              const miss = surveyResultMissing(zone, files);
              const missText = cut ? "" : [...miss.field, ...miss.result].join(" · ");
              const spots = Array.isArray(zone.spots) ? zone.spots : [];
              /* รูปของแต่ละจุด + รูปที่ยังไม่ผูก — ตัวจัดกลุ่มเดียวกับจอหน้างาน */
              const spotCell = surveyResultSpotCell(zone, files);
              const busy = busyZone === zone.id || saving;
              const zoneCode = zone.zoneCodeUnknown === true ? SURVEY_UNKNOWN_TEXT : naText(zone.zoneCode);
              /* ⚠️ "เพิ่มหน้างาน" ต้องอ่านออกจาก `status` ไม่ใช่จาก `!zoneId` — พื้นที่ที่
                 ช่างเพิ่มได้รหัส ZN ทันที ส่วนพื้นที่ใหม่ของ SA รอถึงตอนกดส่งใบ */
              const tags = [zone.status === "added" ? "ช่างเพิ่มหน้างาน" : null,
                zone.zoneId ? null : "พื้นที่ใหม่"].filter(Boolean).join(" · ");

              /* 🔑 **ทุกค่าที่วาดมาจากร่าง ไม่ใช่จากแถว** — ไม่งั้นกดเพิ่มแล้วตัวเลขไม่ขยับ
                 จนกว่าจะบันทึก ซึ่งคือจอที่ดูเหมือนปุ่มเสีย */
              const draft = surveyDecisionDraft(zone, drafts[zone.id]);
              const dirty = surveyDecisionDirty(zone, drafts[zone.id]);
              const rowError = dirty ? surveyDecisionError(zone, drafts[zone.id], { sizes: packageSizes }) : null;
              const picked = draft.spotIds.length;
              /* 🔑 ช่องแพ็คเกจทั้งช่อง (แถบขนาด · ที่ระบบเสนอ · ปุ่มรับข้อเสนอ · ต้องบอกเหตุผลไหม) จากตัวตัดสินเดียว
                 — อ่านจาก **ร่าง** ⇒ ช่องเหตุผลโผล่ทันทีที่เคาะจนต่างจากที่ระบบเสนอ ไม่ใช่หลังบันทึกแล้วถึงรู้ว่าต้องกรอก */
              const pkg = surveyPackageCell(zone, drafts[zone.id], { sizes: packageSizes, canDecide });
              const needNote = pkg.needNote;
              const noteId = `package-note-${zone.id}`;
              /* อ่านทะเบียนไม่สำเร็จ = เคาะขนาด/จำนวนไม่ได้ (server ตีกลับเหมือนกัน) ⇒ วาดค่าเดิมเป็นตัวหนังสือ + เหตุ */
              const canPick = canDecide && !pkg.registryDown;

              /* ยังว่าง = กดครั้งแรกได้ 1 (จำนวนที่ระบบเสนอ) ไม่ว่ากดฝั่งไหน — แล้วค่อยขยับทีละหนึ่ง */
              const bump = (by) => {
                const next = pkg.qty === null ? 1 : pkg.qty + by;
                patchDraft(zone.id, { packageQty: Math.min(PACKAGE_QTY_MAX, Math.max(1, next)) });
              };
              const toggleSpot = (spotId) => {
                const id = String(spotId);
                const next = draft.spotIds.includes(id)
                  ? draft.spotIds.filter((x) => x !== id)
                  : [...draft.spotIds, id];
                patchDraft(zone.id, { spotIds: next });
              };

              return (
                <Fragment key={zone.id}>
                <tr className={cut ? styles.cut : undefined} data-miss={missText ? "1" : undefined}
                  data-dirty={dirty ? "1" : undefined}
                  onFocusCapture={() => setActiveZone(zone.id)}>
                  {/* ── พื้นที่ · ผลวัดจากช่าง (อ่านอย่างเดียว) ──────────────────────
                      รหัสบน · ชื่อล่าง (กติกาแสดงผลของตาราง) · ภาพย่อเปิดไฟล์จริงในแท็บใหม่
                      ⚠️ `ui-cell-wide` — ภาพย่อเป็นลิงก์ ไม่ใช่ปุ่ม ⇒ เพดานข้อความ 220px ของเซลล์ตาราง
                         จะตัดแถวภาพย่อขาดกลางรูป */}
                  <td data-label="พื้นที่" className={`ui-cell-wide ${styles.zoneCell}`}>
                    <span className={styles.code}>
                      <span>{zoneCode}</span>
                      {dirty ? <span className={styles.rowDirty}><Pencil size={11} aria-hidden="true" />ยังไม่บันทึก</span> : null}
                    </span>
                    {/* ชื่อ + ชั้นครั้งเดียว — ตัวเดียวกับรายการ/หน้าพื้นที่ (🐞 ชื่อที่มีชั้นอยู่แล้วเคยขึ้น "ชั้น 5 · ชั้น 05") */}
                    <b className={styles.zoneName}>{surveyZoneTitle(zone)}</b>
                    {tags ? <span className={styles.sub}>{tags}</span> : null}
                    {!cut && (cell.figures || cell.dims) ? (
                      <span className={styles.figures}>
                        {cell.figures ? <b>{cell.figures}</b> : null}
                        {cell.figures && (cell.partsText || cell.dims) ? " · " : null}
                        {cell.partsText || cell.dims}
                      </span>
                    ) : null}
                    {/* หลายส่วน = บรรทัดแรกบอกจำนวนส่วน บรรทัดนี้บอกขนาดรายส่วน */}
                    {!cut && cell.partsText && cell.dims ? <span className={styles.dimsLine}>{cell.dims}</span> : null}
                    {!cut ? (
                      <div className={styles.thumbs} role="group" aria-label={`รูปจากช่าง ${surveyZoneName(zone)}`}>
                        {cell.thumbs.map((t) => (
                          <Fragment key={t.file.id}>
                            {t.startsGroup ? <span className={styles.thumbSep} aria-hidden="true" /> : null}
                            <a className={styles.thumb} href={t.href} target="_blank" rel="noreferrer"
                              aria-label={`ดู${t.label} ${t.file.fileName || ""} (เปิดแท็บใหม่)`.replace(/\s+/g, " ")}>
                              <PhotoThumb src={t.href} alt="" label="เปิดไม่ได้" className={styles.thumbImg} />
                            </a>
                          </Fragment>
                        ))}
                        {cell.moreThumbs ? <span className={styles.thumbMore}>+{fmtNumber(cell.moreThumbs)}</span> : null}
                        <span className={styles.thumbCap}>
                          <span data-low={cell.photos.wide === 0 ? "1" : undefined}>ภาพกว้าง {fmtNumber(cell.photos.wide)}</span>
                          <span>ภาพจุด {fmtNumber(cell.photos.spot)}</span>
                        </span>
                      </div>
                    ) : null}
                  </td>

                  {cut ? (
                    /* ⚠️ พื้นที่ที่ตัดออกยังต้องอยู่ในตาราง — SA ต้องเห็นว่าอะไรหายไปและเพราะอะไร
                       (ของที่หายจากสิ่งที่เขาจะเสนอราคา คือของที่ลูกค้าจะถาม) */
                    <td colSpan={3} className={styles.cutCell} data-label="สถานะ">
                      <span>ตัดออกหน้างาน — {naText(zone.cutReason)}</span>
                      <span className={styles.sub}>ไม่นับรวมในผลที่ส่งให้ฝ่ายขาย · พื้นที่ยังอยู่ในทะเบียน ประเมินใหม่ได้</span>
                    </td>
                  ) : (
                    <>
                      {/* ── ภาพผังที่มาร์กจุดแล้ว — ของหัวหน้า ขึ้นระบบทันที ─────────── */}
                      <td data-label="ภาพผัง" className={styles.planCell}>
                        <PlanPhotos
                          zoneId={zone.id}
                          count={cell.photos.plan}
                          canUploadPlan={canUploadPlan}
                          onFiles={onFiles}
                          intakeFirst={activeZone === zone.id}
                        />
                      </td>

                      {/* ── เลือกจุดที่จะติดตั้ง — ติ๊กจากที่ช่างแจ้งมา ────────────────
                          ⚠️ `ui-cell-wide` — 🐞 UAT 01/10: ใบที่ล็อก/คนดูอย่างเดียว ชิปเป็นตัวหนังสือ (ไม่มีปุ่ม) ⇒ ข้อยกเว้น
                             "เซลล์ที่มีคอนโทรล" ของ Table.module.css ไม่โดน ⇒ เพดาน 220px ตัดชื่อจุด + ภาพย่อของจุด (ท่าเดียวกับช่องพื้นที่) */}
                      <td data-label="เลือกจุด" className="ui-cell-wide">
                        {spots.length === 0 ? (
                          <span className={styles.warnText}>ช่างยังไม่แจ้งจุดสักจุด</span>
                        ) : (
                          <>
                            {/* ชุดตัวเลือกเล็กตายตัวต้องกางให้เห็น ไม่ใช่ดรอปดาวน์ (กติกาคอนโทรล)
                                ไม่มีสิทธิ์เคาะ = ไม่โชว์ปุ่ม ⇒ ชิปเป็นตัวหนังสือ
                                ⭐ ชิปที่กดได้สูง 44px (ขนาดนิ้ว · AW-3) — หัวหน้าเคาะบนแท็บเล็ตด้วย */}
                            <div className={styles.spots}>
                              {spotCell.rows.map(({ spot: s, thumbs }) => {
                                const on = draft.spotIds.includes(String(s.id));
                                /* บันทึกของช่างต่อท้ายชื่อจุด ("ปลั๊กอยู่ใต้โซฟา") — ข้อมูลที่ใช้ตัดสินว่าจะเลือกจุดไหน
                                   ⚠️ ตัดยาวด้วยจุดไข่ปลา ข้อความเต็มอยู่ในการ์ดพื้นที่ของแท็บหน้างาน */
                                const note = String(s.note || "").trim();
                                return (
                                  <div key={s.id} className={styles.spotItem}>
                                    {canDecide ? (
                                      <button
                                        type="button" className={styles.spotChip}
                                        data-on={on ? "1" : undefined}
                                        disabled={busy}
                                        aria-pressed={on ? "true" : "false"}
                                        onClick={() => toggleSpot(s.id)}
                                      >
                                        {on
                                          ? <CircleCheck size={15} aria-hidden="true" />
                                          : <Circle size={15} aria-hidden="true" />}
                                        {s.label}
                                        {note ? <span className={styles.spotNote} title={note}>· {note}</span> : null}
                                      </button>
                                    ) : (
                                      <span className={styles.spotChip} data-on={on ? "1" : undefined}>
                                        {on && <Check size={12} role="img" aria-label="เลือกติดตั้ง" />}
                                        {s.label}
                                      </span>
                                    )}
                                    {thumbs.length ? (
                                      <div className={styles.spotThumbs} role="group" aria-label={`รูปของจุด ${s.label || ""}`.trim()}>
                                        {thumbs.slice(0, SPOT_THUMBS).map((t) => (
                                          <a key={t.file.id} className={styles.thumb} href={t.href} target="_blank" rel="noreferrer"
                                            aria-label={`ดูรูปจุด ${s.label || ""} ${t.file.fileName || ""} (เปิดแท็บใหม่)`.replace(/\s+/g, " ")}>
                                            <PhotoThumb src={t.href} alt="" label="เปิดไม่ได้" className={styles.thumbImg} />
                                          </a>
                                        ))}
                                        {thumbs.length > SPOT_THUMBS
                                          ? <span className={styles.thumbMore}>+{fmtNumber(thumbs.length - SPOT_THUMBS)}</span>
                                          : null}
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                            <span className={styles.sub}>เลือก {picked} / {spots.length}</span>
                          </>
                        )}
                        {/* รูปจุดที่ยังไม่ผูก (ถ่ายก่อนมีแถวของจุด · จุดถูกลบ) — ต้องเห็น ไม่ใช่หายเงียบ · ผูกได้ที่หน้าพื้นที่ */}
                        {spotCell.unlinkedCount ? (
                          <div className={styles.spotLoose}>
                            <span className={styles.warnText}>
                              ยังไม่ได้ผูกจุด {fmtNumber(spotCell.unlinkedCount)} รูป{canLinkSpots && !onOpenSpotTray ? " — ผูกที่แท็บหน้างาน" : ""}
                            </span>
                            {spotCell.unlinked.length ? (
                              <div className={styles.spotThumbs} role="group" aria-label="รูปจุดที่ยังไม่ได้ผูกจุด">
                                {spotCell.unlinked.slice(0, SPOT_THUMBS).map((t) => (
                                  <a key={t.file.id} className={styles.thumb} href={t.href} target="_blank" rel="noreferrer"
                                    aria-label={`ดูรูปจุดที่ยังไม่ได้ผูก ${t.file.fileName || ""} (เปิดแท็บใหม่)`.replace(/\s+/g, " ")}>
                                    <PhotoThumb src={t.href} alt="" label="เปิดไม่ได้" className={styles.thumbImg} />
                                  </a>
                                ))}
                                {spotCell.unlinked.length > SPOT_THUMBS
                                  ? <span className={styles.thumbMore}>+{fmtNumber(spotCell.unlinked.length - SPOT_THUMBS)}</span>
                                  : null}
                              </div>
                            ) : null}
                            {/* ทางไปผูก = ปุ่มเดียวถึงถาดของพื้นที่นี้ · เฉพาะคนที่ผูกได้ (กติกา ui-visibility) */}
                            {canLinkSpots && onOpenSpotTray ? (
                              <Button size="sm" variant="outline" className={`${styles.coarseTouch} ${styles.looseJump}`}
                                icon={<Link2 size={14} aria-hidden="true" />}
                                aria-label={`ไปผูกจุด — ${surveyZoneName(zone)} (แท็บหน้างาน)`}
                                onClick={() => onOpenSpotTray(zone.id)}>
                                ไปผูกจุด
                              </Button>
                            ) : null}
                          </div>
                        ) : null}
                      </td>

                      {/* ── แพ็คเกจ — ระบบเสนอ หัวหน้าเคาะขนาด + จำนวน ───────────────────
                          ⚠️ `ui-cell-wide` — ใบที่ล็อก/คนดูอย่างเดียว ช่องนี้เป็นตัวหนังสือล้วน ⇒ เพดาน 220px ของเซลล์ตารางตัดบรรทัด
                             "ระบบเสนอ … · หัวหน้าเลือก … แทน" (ท่าเดียวกับช่องเลือกจุด) */}
                      <td data-label="แพ็คเกจ/เดือน" className={`ui-cell-wide ${styles.packageCell}`}>
                        {canPick ? (
                          <>
                            {/* ⭐ ป้ายอยู่ **ข้าง** ตัวควบคุมเมื่อคอลัมน์กว้างพอ (ม็อก S-3) · คอลัมน์แคบ/จอแคบ ป้ายอยู่เหนือ — CSS ตัดสินจาก
                                ความกว้างของกล่องตาราง (`@container`) · ข้อความใต้ตัวควบคุมอยู่ในช่องเดียวกับตัวควบคุม (เยื้องตรงกัน) */}
                            <div className={styles.pkgField}>
                              <span className={styles.pkgLabel}>ขนาด</span>
                              <div className={styles.pkgControl}>
                                {/* ⭐ **ทุกขนาดในทะเบียนกางให้เห็น** (มติเจ้าของ 01/10 · กติกาคอนโทรล: ไม่ใช่ดรอปดาวน์) — ห่อบรรทัดเองเมื่อขนาดเยอะ
                                    · `manual` = ลูกศรแค่ย้ายโฟกัส ไม่เปลี่ยนขนาดให้ (ขนาดคือการตัดสินใจ ไม่ใช่ตัวกรองที่ลองเลื่อนดูได้)
                                    · ขนาดที่เคาะไว้แต่ถูกลบจากทะเบียน = แผ่นแดงกดไม่ได้ท้ายแถบ ("ST (ถูกลบ)") — ต้องเห็นว่าแถวถืออะไรอยู่ */}
                                {pkg.options.length ? (
                                  <Segmented
                                    className={styles.sizeSeg}
                                    ariaLabel={`ขนาดแพ็คเกจ ${surveyZoneName(zone)}`}
                                    activationMode="manual"
                                    value={pkg.size}
                                    onChange={(code) => patchDraft(zone.id, { packageSize: code })}
                                    options={busy ? pkg.options.map((o) => ({ ...o, disabled: true })) : pkg.options}
                                  />
                                ) : (
                                  /* ทะเบียนว่าง — บอกครั้งเดียว พร้อมลิงก์ไปที่ที่เพิ่มขนาดได้ (คนเคาะคือคนเดียวกับคนแก้ทะเบียน)
                                     🐞 UAT 01/10: เดิมเป็นตัวหนังสือเฉย ๆ และประโยคเดียวกันขึ้นซ้ำในบรรทัดข้อเสนอ */
                                  <span className={styles.warnText}>
                                    {pkg.emptyText} —{" "}
                                    <Link href="/database/package-sizes" className={styles.footLink}>เพิ่มที่ ฐานข้อมูล › ขนาดแพ็คเกจ</Link>
                                  </span>
                                )}
                                {pkg.goneText ? (
                                  <span className={styles.goneText}>
                                    <AlertTriangle size={12} aria-hidden="true" />{pkg.goneText}
                                  </span>
                                ) : null}
                                {/* ที่ระบบเสนอ = ข้อเสนอ ไม่ใช่คำสั่ง (ไม่ใช่คำเตือน) · เลือกต่าง = บรรทัดถัดไปบอกว่าหัวหน้าเลือกอะไรแทน
                                    ⚠️ แต่ละท่อนเป็นบรรทัดของตัวเอง (`.suggestText > *`) — ไม่ต่อกันด้วย " · " แล้วปล่อยให้ห่อกลางท่อน
                                       (🐞 UAT 01/10: ทุกแถวทิ้ง "แพ็ค" ไว้บรรทัดเดียว) */}
                                {showFormula && (pkg.hint || pkg.registryText) ? (
                                  <span className={styles.suggest}>
                                    <Lightbulb size={12} aria-hidden="true" />
                                    <span className={styles.suggestText}>
                                      {pkg.hint ? <span>{pkg.hint}</span> : null}
                                      {pkg.overrideText ? <b>{pkg.overrideText}</b> : null}
                                      {/* แถวที่ขนาดไม่เคยถูกเทียบกับข้อเสนอ (back-fill ST ของ 0398) — ทักให้ตรวจ ไม่ใช่ "หัวหน้าเลือกแทน" */}
                                      {pkg.reviewText ? <b>{pkg.reviewText}</b> : null}
                                      {/* ทะเบียนถูกแก้หลังเคาะ — ข้อเท็จจริงกลาง ๆ (แถวที่เคาะแล้วไม่ถูกเปิดใหม่เพราะทะเบียนเปลี่ยน) */}
                                      {pkg.registryText ? <span>{pkg.registryText}</span> : null}
                                    </span>
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <div className={styles.pkgField}>
                              <span className={styles.pkgLabel}>จำนวน</span>
                              <div className={styles.pkgControl}>
                                <div className={styles.packageRow}>
                                  {/* ทะเบียนว่าง = ไม่มีขนาดให้คู่กับจำนวน ⇒ −/+ ปิด (เหตุอยู่บรรทัดบน) */}
                                  <div className={styles.stepper} role="group" aria-label={`จำนวนแพ็คเกจต่อเดือน ${surveyZoneName(zone)}`}>
                                    <button type="button" aria-label="ลดแพ็คเกจ" disabled={busy || !pkg.canStep} onClick={() => bump(-1)}>
                                      <Minus size={15} aria-hidden="true" />
                                    </button>
                                    <b>{naText(pkg.qty)}</b>
                                    <button type="button" aria-label="เพิ่มแพ็คเกจ" disabled={busy || !pkg.canStep} onClick={() => bump(1)}>
                                      <Plus size={15} aria-hidden="true" />
                                    </button>
                                  </div>
                                  {showFormula && pkg.qtyHint ? <span className={styles.qtyHint}>{pkg.qtyHint}</span> : null}
                                </div>
                              </div>
                            </div>
                            {/* ⭐ ยังไม่เคาะ = ปุ่มรับข้อเสนอทีเดียวจบ (ขนาด + จำนวน) — ระบบไม่เติมให้เอง (ร่างที่เติมเอง = "ยังไม่บันทึก" ทั้งใบ)
                                · แถวที่ `reviewText` ทักไว้ได้ปุ่มเดียวกัน (ตัวตัดสินเป็นคนบอกว่ามีปุ่มไหม)
                                ⭐ `reset` = ถอยเฉพาะพื้นที่นี้ (แตะพลาดแล้วไม่ต้องกด "ยกเลิก" ที่ทิ้งการเคาะของทุกพื้นที่ · UAT 01/10) */}
                            {pkg.accept || pkg.reset ? (
                              <div className={styles.pkgActions}>
                                {pkg.accept ? (
                                  <Button size="sm" variant="quiet" className={styles.coarseTouch} disabled={busy}
                                    onClick={() => patchDraft(zone.id, pkg.accept.patch)}>
                                    {pkg.accept.label}
                                  </Button>
                                ) : null}
                                {pkg.reset ? (
                                  <Button size="sm" variant="quiet" className={styles.coarseTouch} disabled={busy}
                                    icon={<Undo2 size={14} aria-hidden="true" />}
                                    aria-label={`${pkg.reset.label} — แพ็คเกจของ ${surveyZoneName(zone)}`}
                                    onClick={() => patchDraft(zone.id, pkg.reset.patch)}>
                                    {pkg.reset.label}
                                  </Button>
                                ) : null}
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <>
                            <b className={styles.qty}>{naText(pkg.valueText)}</b>
                            {showFormula && pkg.hint ? (
                              <span className={styles.suggest}>
                                <span>{pkg.hint}{pkg.overrideText ? ` · ${pkg.overrideText}` : ""}</span>
                              </span>
                            ) : null}
                            {/* คนเคาะที่ทะเบียนอ่านไม่ขึ้น — บอกเหตุที่แถบเลือกหายไป ไม่ใช่ปล่อยให้เดาว่าใบล็อก
                                (ปุ่ม "โหลดใหม่" อยู่ที่กล่องแจ้งเหนือตาราง — ที่เดียว ไม่ซ้ำทุกแถว) */}
                            {canDecide && pkg.registryDown ? (
                              <span className={styles.goneText}>
                                <AlertTriangle size={12} aria-hidden="true" />เคาะขนาดไม่ได้ — {pkg.registryDown}
                              </span>
                            ) : null}
                          </>
                        )}
                        {/* 🔴 ต่างจากที่ระบบเสนอแล้วต้องบอกเหตุผล — ของที่ต่างจากที่ SA จะเสนอราคา
                            คือของที่ลูกค้าจะถาม และ SA ไม่ได้ไปหน้างาน
                            🐞 **ช่องต้องอยู่ต่อตราบใดที่ยังมีข้อความอยู่ในนั้น** แม้จะกดกลับมา
                              ตรงกับที่ระบบเสนอแล้ว — ของเดิมผูกช่องไว้กับ `needNote` อย่างเดียว ⇒ พิมพ์
                              เหตุผล แล้วกดลดกลับเป็นเลขเดิม: ช่องหายไปพร้อมข้อความที่ยังค้างอยู่
                              ในร่าง ⇒ แถบยังขึ้น "ยังไม่บันทึก 1 พื้นที่" โดยที่ **ไม่มีอะไรบนจอ
                              ให้แก้หรือให้ลบเลย** (วัดจริงทั้ง 1440/1024/390) */}
                        {canDecide && (needNote || draft.packageNote) ? (
                          <div className={styles.noteBox}>
                            {/* ป้ายผูกกับช่อง (`htmlFor`) — ช่องที่ไม่มีชื่อ screen reader อ่านว่า "ช่องแก้ไข" เฉย ๆ
                                ⭐ ป้ายแดง "ต้องบอกเหตุผล" ขึ้นเฉพาะตอน **ยังไม่ได้พิมพ์** (`noteMissing`) — กรอกแล้วเป็นป้ายปกติ
                                   (🐞 UAT 01/10: ป้ายแดงค้างเหนือช่องที่กรอกแล้ว แถวที่ผ่านยังดูเหมือนติด) */}
                            <label htmlFor={noteId}>
                              {pkg.noteMissing
                                ? <span className={styles.req}>ต้องบอกเหตุผล</span>
                                : needNote
                                  ? <span className={styles.sub}>เหตุผลที่ต่างจากที่ระบบเสนอ</span>
                                  : <span className={styles.sub}>เหตุผลที่ต่างจากที่ระบบเสนอ (ตอนนี้ไม่ต้องมีแล้ว — ลบทิ้งได้)</span>}
                            </label>
                            {/* ⚠️ `value` = ข้อความดิบของร่าง (เว้นวรรคครบตามที่พิมพ์) — ตัดช่องว่างหัวท้ายตอนส่งเท่านั้น (`surveyDecision.js`)
                                ⭐ ช่องข้อความยาวทรงเดียวของระบบ (`Textarea`: พื้นสามบรรทัด โตตามที่พิมพ์) — เหตุผลยาวได้ 500 ตัวอักษร
                                   🐞 UAT 01/10: ช่องบรรทัดเดียวตัดเหตุผลที่บันทึกไว้ ("ลูกค้าขอกลิ่นเข้มเป็นพิเศษ เปิดประตูทิ…") อ่านไม่ครบโดยไม่กดเข้าไป */}
                            <Textarea
                              id={noteId}
                              touch
                              value={draft.packageNote} disabled={busy} maxLength={500} autoComplete="off"
                              placeholder="ทำไมถึงต่างจากที่ระบบเสนอ"
                              onChange={(e) => patchDraft(zone.id, { packageNote: e.target.value })}
                            />
                          </div>
                        ) : null}
                        {!canDecide && zone.packageNote ? (
                          <span className={styles.note}>เหตุผลที่ต่างจากที่ระบบเสนอ: {naText(zone.packageNote)}</span>
                        ) : null}
                      </td>
                    </>
                  )}
                </tr>
                {/* เหตุผลที่ยังส่งไม่ได้ต้องเป็นตัวหนังสือบนแถวที่ติด ไม่ใช่กองรวมข้างล่าง
                    ⭐ **แถวย่อยเต็มกว้างใต้แถวของมัน ไม่ใช่ท้ายคอลัมน์ "รูป"** — 🐞 เดิมอยู่ในคอลัมน์
                    ที่แคบที่สุด (~113px ที่ 768) ⇒ ข้อความยาวที่สุดของแถวห่อ 5–6 บรรทัด แถวสูง ~150px
                    และบนมือถืออยู่ขอบขวาสุดของตารางที่ต้องปัดข้างถึงจะเห็น */}
                {/* ⚠️ แยกแถวแล้ว screen reader ไล่ทีละแถวจะได้ยินคำเตือนโดยไม่รู้ว่าของพื้นที่ไหน
                    (WCAG 1.3.1) ⇒ เติมชื่อพื้นที่แบบซ่อนจากตา · ไม่ใช้ `headers` ชี้ไป td
                    เพราะสเปกให้ชี้ได้แค่ th และ screen reader หลายตัวไม่อ่าน */}
                {(missText || rowError) && (
                  <tr data-miss-row="1">
                    <td colSpan={4}>
                      {rowError ? (
                        <span className={styles.rowMiss} data-block="1">
                          <span className={styles.srOnly}>
                            {`${surveyZoneName(zone)} บันทึกไม่ได้: `}
                          </span>
                          <AlertTriangle size={12} aria-hidden="true" />
                          {rowError}
                        </span>
                      ) : null}
                      {missText ? (
                        <span className={styles.rowMiss}>
                          <span className={styles.srOnly}>
                            {`${surveyZoneName(zone)} ยังไม่ผ่าน: `}
                          </span>
                          <AlertTriangle size={12} aria-hidden="true" />
                          {missText}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </TableScroll>
      {/* ⭐ บอกกติกาสองข้อที่ต่างกันในตารางเดียว — ผังไม่รอปุ่ม แต่การเคาะรอ (คนที่อัปผังแล้วเลื่อน
          หาปุ่มบันทึกให้ผัง คือคนที่เสียเวลาเพราะเราไม่บอก) · ขึ้นเฉพาะคนที่มีอะไรให้ทำในตารางนี้
          ⚠️ "ระบบจะถามก่อนทิ้ง" ต้องจริง — หน้าเฝ้าร่างการเคาะด้วย `useUnsavedChanges` (ลิงก์ · รีเฟรช · ปิดแท็บ)
          🐞 UAT 25/09 คำเดิม "ออกจากหน้านี้ก่อนบันทึก" สัญญาเกินจริง — ปุ่มย้อนของเครื่องบนมือถือ (หน้าเดียว) ออกจากหน้า
             ได้โดยไม่ถาม (เบราว์เซอร์ไม่ให้ขวางปุ่มย้อน · สองบานถามแล้วผ่านตัวต่อสายประวัติ) ⇒ บอกเฉพาะทางที่ถามจริงทุกจอ */}
      {canDecide ? (
        <p className={styles.footnote}>
          {canUploadPlan ? "ภาพผังขึ้นระบบทันที ไม่ต้องบันทึก · " : ""}
          การเคาะต้องกด “บันทึกการเคาะ” · กดลิงก์ออก รีเฟรช หรือปิดแท็บก่อนบันทึก ระบบจะถามก่อนทิ้ง
        </p>
      ) : null}
      {/* ช่วง ลบ.ม. ของทุกขนาด + ที่มาของข้อเสนอ — ป้ายบนแถบมีแค่รหัส คนเคาะต้องรู้ว่า SM/ST/XL คือพื้นที่ขนาดไหน
          และแก้ช่วงได้ที่ไหน · ขึ้นเฉพาะคนที่เห็นข้อเสนอของระบบ (หัวหน้า) — ช่างไม่มีแถบนี้ให้ใช้ */}
      {showFormula && sizeLegend ? (
        <p className={styles.footnote}>
          ขนาดที่ระบบเสนอ จากทะเบียน <Link href="/database/package-sizes" className={styles.footLink}>ฐานข้อมูล › ขนาดแพ็คเกจ</Link>
          : {sizeLegend} · จำนวนเสนอ 1 แพ็คทุกพื้นที่
        </p>
      ) : null}
    </DetailCard>
  );
}
