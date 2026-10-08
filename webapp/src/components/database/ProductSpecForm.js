"use client";
import { Fragment } from "react";
import { Box, FileBadge, ListChecks, Plus, Target, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import MoneyInput from "@/components/ui/MoneyInput";
import ChoiceChips from "@/components/ui/ChoiceChips";
import { TableScroll } from "@/components/ui/Table";
import { DetailCard } from "@/components/ui/DetailPage";
import { fmtMoneyOrDash, naText } from "@/lib/format";
import { productBrandName, productDisplayName } from "@/lib/master/productIdentity";
import {
  PRODUCT_SPEC_CERT_STATUS_LABELS, PRODUCT_SPEC_CHECKLIST, PRODUCT_SPEC_CHECKLIST_TITLE, productSpecCertPendingLabel,
  productSpecChecklistMissing, restoreChecklistItem,
} from "@/lib/sales/productSpecChecklist";
import { SPEC_ITEM_COST_MAX } from "@/lib/sales/productSpecWorkflow";
import SpecItemImageCell, { SPEC_ITEM_IMAGE_NEEDS_SPEC } from "@/components/database/SpecItemImageCell";
import { productSpecFormulaRows } from "@/lib/sales/productSpecFormulaRow";
import styles from "./ProductSpecForm.module.css";

/**
 * ฟอร์มสเปคสินค้า FM-SA-04 — **ตัวเดียวทั้งตอนสร้างและตอนแก้สเปค**
 * (กฎ AGENTS.md: ฟอร์มสร้างกับฟอร์มแก้ต้องเป็น component เดียว ต่างกันได้แค่โหมด)
 *
 * ⭐ **มติ 21/09/2569** (docs/fm-sa-04-document-model.md): สเปคเป็นข้อมูลของสินค้า ไม่มี Rev
 * ไม่มีด่านอนุมัติ ⇒ ฟอร์มนี้ไม่รู้จัก "ฉบับ" อีกแล้ว · เลขที่และ Rev อยู่ที่เอกสารที่ออกจาก SO
 *
 * โหมดเดียวคือ `readOnly` — คนที่ไม่มีสิทธิ์แก้สเปคอ่านได้อย่างเดียว · ค่าที่ระบบเติมจากทะเบียน
 * เป็น **ช่องเส้นประอ่านอย่างเดียว** ไม่ใช่ช่องกรอกที่จางลง
 * (form-design-rules §2: "ค่าที่ระบบรู้อยู่แล้ว ห้ามให้คนพิมพ์ซ้ำ")
 *
 * ⚠️ ไม่มีช่องไหนบังคับ — กระดาษ FM-SA-04 ปล่อยว่างได้ทุกช่อง และสเปคที่ยังรอข้อมูลจากลูกค้า
 * ต้องบันทึกค้างไว้ได้ · ความพร้อมบอกด้วยรายการบนการ์ดจัดการ ไม่ใช่ด่านกดไม่ได้
 * ⚠️ แก้สเปคที่นี่ **ไม่แตะเอกสารที่ยื่น/อนุมัติแล้ว** (เอกสารถือภาพนิ่งของตัวเอง) — มีผลกับ
 * เอกสารที่ยังเป็นร่างเท่านั้น
 *
 * ⭐ **มติเจ้าของ 08/10/2569** — ตาราง checklist มีสองคอลัมน์ที่เป็นของ **ในระบบเท่านั้น** (ไม่ลงกระดาษ ไม่เข้าเอกสาร):
 *    · "ราคาทุน" — ทั้งคอลัมน์ขึ้นเฉพาะคนที่ API บอกว่าเห็นได้ (`permissions.canSeeItemCost` · คนอื่น API ไม่ส่งค่ามาเลย)
 *      เห็นได้แต่แก้ไม่ได้ (`canEditItemCost` ไม่จริง) = ตัวเลขอ่านอย่างเดียว
 *    · "รูป" — แถวละรูป ไม่บังคับ · ยังไม่มีสเปค = ปุ่มขึ้นแต่กดไม่ได้ เหตุพิมพ์ครั้งเดียวเหนือตาราง (ต้องสร้างสเปคก่อน)
 *      หน้ากำลังบันทึก/ลบ (`saving`) = แนบรูปใหม่ไม่ได้ชั่วคราว เหตุอยู่ที่ `title` ของปุ่ม (การ์ดจัดการขึ้นสถานะกำลังทำอยู่แล้ว)
 * ⚠️ แถวอ้างกันด้วย `_uid` (ตัวชี้บนจอ — `withRowUids`) ไม่ใช่เลขลำดับ: ผลการแนบรูปกลับมาช้ากว่าการลบ/คืนแถวได้
 *    ⇒ ทุกการแก้แถวส่ง "ตัวแก้" ให้จอ (`onItems(fn)` / `onItemPatch(uid, patch)`) ไม่ส่งชุดแถวที่จำไว้ตอนวาด
 */
/* เหตุที่แนบรูปของแถวไม่ได้ตอนหน้ากำลังบันทึก/ลบ — ขึ้นเป็น `title` ของปุ่มในกล่องรูป (ไม่พิมพ์เหนือตาราง: ชั่วครู่เดียว) */
const SPEC_ITEM_IMAGE_SAVING = "กำลังบันทึก — รอสักครู่แล้วแนบรูปอีกครั้ง";

/* ข้อความหัวการ์ด Checklist — บอกว่าครบ/ขาดจากแบบฟอร์มกี่แถว ไม่ใช่เดาจากเลข 17
   (17 แถวลบได้แล้ว ⇒ "เกิน 17 = มีแถวที่เพิ่มเอง" ไม่จริงอีกต่อไป) */
function checklistMeta(items) {
  const keyed = items.filter((row) => row?.itemKey).length;
  const extras = items.length - keyed;
  const head = `${items.length} แถว — จากแบบฟอร์ม ${keyed}/${PRODUCT_SPEC_CHECKLIST.length}`;
  return extras ? `${head} · เพิ่มเอง ${extras}` : head;
}

export default function ProductSpecForm({
  product,
  form,
  onField,
  items = [],
  onItems,
  certs = [],
  onCerts,
  readOnly = false,
  saving = false,
  permissions = {},
  productId,
  specExists = false,
  onItemPatch,
  onRowUpload,
}) {
  const derived = (label, value, hint) => (
    <div className={styles.derived}>
      <span>{label}</span>
      <div className="readable-field is-compact">{naText(value)}</div>
      {hint ? <p className="form-note">{hint}</p> : null}
    </div>
  );
  const field = (key, label, { long = false, placeholder = "", hint = "" } = {}) => {
    if (readOnly) {
      return (
        <div className={styles.derived}>
          <span>{label}</span>
          <div className="readable-field">
            {form[key] || <span className="readable-field-empty">ไม่ได้กรอก</span>}
          </div>
        </div>
      );
    }
    return (
      <label>
        <span>{label}</span>
        {long
          ? <Textarea rows={3} value={form[key] || ""} placeholder={placeholder} onChange={(event) => onField(key, event.target.value)} />
          : <Input value={form[key] || ""} placeholder={placeholder} onChange={(event) => onField(key, event.target.value)} />}
        {hint ? <p className="form-note">{hint}</p> : null}
      </label>
    );
  };

  /* ⭐ แถว "สูตร / รหัสสูตร / วันที่" (มติเจ้าของ 01/10/2569) — ป้ายและค่าจากตัวประกอบตัวเดียวกับกระดาษ ⇒ จอนี้กับ
     กระดาษตัวอย่างที่พิมพ์จากหน้าเดียวกันพูดตรงกันทุกตัวอักษร (FG ไม่ผูกสูตรแต่มีกลิ่น = แถวกลิ่นเดิม · ไม่มีทั้งคู่ =
     ป้ายใหม่ ช่องขีด · วันที่ พ.ศ. แบบใบไทย เพราะตัวอย่างจากหน้าสินค้าเป็นใบไทยเสมอ)
     ⚠️ ส่ง `product` ตรง ๆ ห้ามแปลงเป็น `{}` — ก้อนที่ไม่มีคีย์ช่องสูตรคือ "ภาพนิ่งเก่า" ของตัวประกอบ (ได้ป้ายกลิ่น) */
  /* ชุดของขวัญ (01-037 · mig 0403) ได้หลายแถว แถวละสูตร บอกหมวด — ตัวประกอบชุดเดียวกับกระดาษ (`productSpecFormulaRows`) */
  const formulaRows = productSpecFormulaRows(product, "th");

  // จอห้ามคิดสิทธิ์เอง — ธงทั้งสามมาจาก API (`productSpecPermissions`)
  const canSeeItemCost = Boolean(permissions?.canSeeItemCost);
  const canEditItemCost = !readOnly && Boolean(permissions?.canEditItemCost);
  /* ⚠️ `!saving` — ผลบันทึกที่กลับมาสร้างร่างใหม่ทั้งก้อน ⇒ รูปที่เริ่มแนบระหว่างนั้นหายเงียบ: ขึ้นเสร็จก่อน = ตัวชี้ถูกร่างใหม่ทับ ·
     ขึ้นเสร็จทีหลังบนแถวที่เพิ่งเพิ่ม (`_uid` เปลี่ยนจาก `~new-N` เป็น id ของฐาน) = ไม่มีแถวเดิมให้ลง · ทั้งสองทางไฟล์ค้างโดยไม่มีใครชี้
     · ปิดที่ธงนี้ = ปิดทั้งปุ่ม ลากวาง และวาง (กล่องส่งต่อให้ `disabled` ของ hook) */
  const canAttachItemImage = !readOnly && !saving && Boolean(permissions?.canAttachItemImage);
  const imageBlockedReason = saving ? SPEC_ITEM_IMAGE_SAVING : (specExists ? "" : SPEC_ITEM_IMAGE_NEEDS_SPEC);

  /* แก้แถวด้วย `_uid` — ไม่พบแถว (ถูกลบไปแล้ว) = ไม่มีอะไรเกิด และจอไม่ถูกนับว่ามีของค้าง (ดู `patchItem` ที่หน้า) */
  const setItem = (uid, patch) => (onItemPatch
    ? onItemPatch(uid, patch)
    : onItems((rows) => rows.map((row) => (row._uid === uid ? { ...row, ...patch } : row))));
  const addItem = () => onItems((rows) => [...rows, {
    itemKey: null, itemLabel: "", detail: "", preparedByS: false, preparedByCustomer: false, note: "",
    imageAttachmentId: null,
  }]);
  /* ⭐ **ลบได้ทุกแถวรวม 17 แถวของแบบฟอร์ม** (มติผู้ใช้ 2026-09-21) — สินค้าหลายตัว
     ไม่มีก้านไม้ ไม่มีสายคาดกล่อง แถวที่ไม่เกี่ยวทำให้ทั้งใบอ่านยากและกระดาษยาวเกินจริง
     ⇒ ลบได้ แต่ต้องคืนได้ด้วย (ชิป "คืนแถวจากแบบฟอร์ม" ใต้ตาราง) ไม่งั้นลบพลาด
        ครั้งเดียวคือทางตัน: พิมพ์ชื่อเพิ่มใหม่ได้ แต่ได้แถวไม่มีคีย์ซึ่งไม่ใช่แถวเดิม */
  const removeItem = (uid) => onItems((rows) => rows.filter((row) => row._uid !== uid));
  const missingItems = readOnly ? [] : productSpecChecklistMissing(items);

  const setCert = (index, patch) => onCerts(certs.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const addCert = () => onCerts([...certs, { key: null, label: "", status: "", note: "" }]);
  const removeCert = (index) => onCerts(certs.filter((_, i) => i !== index));

  return (
    <>
      <DetailCard
        icon={Box}
        eyebrow="PRODUCT OVERVIEW"
        title="ข้อมูลผลิตภัณฑ์"
        meta="ช่องเส้นประมาจากทะเบียนสินค้า — แก้ที่หน้าสินค้า"
      >
        <div className="form-grid cols-3">
          {derived("ชื่อลูกค้า", product?.customerName)}
          {/* 🐞 แบรนด์/ชื่อที่มีแต่ภาษาอังกฤษเคยขึ้นขีด — ตัวเลือกภาษาชุดเดียวกับกระดาษ */}
          {derived("ชื่อแบรนด์", productBrandName(product))}
          {derived("รหัสสินค้า", product?.fgCode)}
          {derived("ชื่อผลิตภัณฑ์", productDisplayName(product))}
          {derived("ประเภทผลิตภัณฑ์", product?.categoryName, product?.categoryCode ? `หมวด ${product.categoryCode}` : "")}
          {formulaRows.map((row, index) => <Fragment key={index}>{derived(row.label, row.value)}</Fragment>)}
          {/* ป้ายเดียวกับกระดาษ "ปริมาตรบรรจุ (Size)" — ค่ามาจากปริมาตร + หน่วยของสินค้า FG ในทะเบียน */}
          {derived("ปริมาตรบรรจุ", product?.volumeText)}
          {field("texture", "ลักษณะเนื้อสาร", { placeholder: "เช่น เหลว · ครีม · ผง", hint: "บันทึกแล้วซิงก์ลงทะเบียนสินค้า" })}
          {field("standardPackaging", "บรรจุภัณฑ์มาตรฐาน", { placeholder: "เช่น บรรจุขวดแก้วหัวสเปรย์", hint: "บันทึกแล้วซิงก์ลงทะเบียนสินค้า" })}
        </div>
      </DetailCard>

      <DetailCard
        icon={Target}
        eyebrow="MARKET & FUNCTIONAL"
        title="ตำแหน่งทางการตลาดและคุณสมบัติ"
        meta="กรอกที่สเปคนี้ทั้งหมด — ไม่เข้าทะเบียนสินค้า"
      >
        <div className="form-grid cols-3">
          {field("targetGroup", "กลุ่มเป้าหมาย", { long: true, placeholder: "เช่น ผู้หญิงวัยรุ่น - วัยเริ่มต้นทำงาน" })}
          {field("keySellingPoint", "จุดขายหลัก", { long: true, placeholder: "เช่น กลิ่นหอมที่สร้างความมั่นใจ" })}
          {field("productBenefit", "ประสิทธิภาพหลัก", { long: true, placeholder: "เช่น ช่วยให้กลิ่นหอม สร้างคาแร็คเตอร์ที่โดดเด่น" })}
          {field("longevity", "ระยะเวลาการออกฤทธิ์กลิ่น", { placeholder: "เช่น 4-6 ชั่วโมง" })}
          {field("dosagePerUse", "ปริมาณแนะนำต่อการใช้งาน", { placeholder: "เช่น 1-2 สเปรย์ต่อครั้ง" })}
        </div>
      </DetailCard>

      <DetailCard
        icon={ListChecks}
        eyebrow="CHECKLIST PROJECT"
        title={PRODUCT_SPEC_CHECKLIST_TITLE}
        meta={checklistMeta(items)}
        actions={readOnly ? null : (
          <Button size="sm" variant="ghost" onClick={addItem} icon={<Plus size={13} />}>เพิ่มแถว</Button>
        )}
      >
        {/* ยังไม่มีสเปค = ปุ่มแนบรูปขึ้นแต่กดไม่ได้ทุกแถว ⇒ บอกเหตุ **ครั้งเดียว** ตรงนี้ (กติกา: ติดด่าน = โชว์แล้วบอกเหตุ)
            ไม่ใช่พิมพ์ซ้ำใต้ปุ่มทุกแถว */}
        {!readOnly && !specExists ? <p className={`form-note ${styles.imageNote}`}>{SPEC_ITEM_IMAGE_NEEDS_SPEC}</p> : null}
        {/* ตารางกว้างขึ้นสองคอลัมน์ (ราคาทุน · รูป) ⇒ ตั้งความกว้างขั้นต่ำให้เลื่อนแนวนอน ดีกว่าบีบช่องกรอกจนพิมพ์ไม่ได้ */}
        <TableScroll family="editable" surface="embedded" minWidth={canSeeItemCost ? 1100 : 972}>
          <table>
            <thead>
              <tr>
                <th className={`num ${styles.colNo}`}>ลำดับ</th>
                <th className={styles.colItem}>สิ่งที่ต้องเตรียม</th>
                <th>รายละเอียด</th>
                <th className={styles.colBy}>ผู้จัดเตรียม</th>
                {canSeeItemCost ? <th className={`num ${styles.colCost}`}>ราคาทุน</th> : null}
                <th className={styles.colImage}>รูป</th>
                <th className={styles.colNote}>หมายเหตุ</th>
                {readOnly ? null : <th className={styles.colRemove} aria-label="ลบแถว" />}
              </tr>
            </thead>
            <tbody>
              {items.map((row, index) => {
                const uid = row._uid;
                const rowLabel = row.itemLabel || `แถวที่ ${index + 1}`;
                return (
                  <tr key={row._uid}>
                    <td className="num">{index + 1}</td>
                    <td>
                      {row.itemKey || readOnly
                        ? <span className={styles.itemLabel}>{naText(row.itemLabel)}</span>
                        : <Input value={row.itemLabel || ""} placeholder="ชื่อรายการ" onChange={(event) => setItem(uid, { itemLabel: event.target.value })} />}
                    </td>
                    <td>
                      {readOnly
                        ? naText(row.detail)
                        : <Input value={row.detail || ""} placeholder="—" onChange={(event) => setItem(uid, { detail: event.target.value })} />}
                    </td>
                    <td>
                      <ChoiceChips
                        multiple
                        minSelected={0}
                        disabled={readOnly}
                        ariaLabel={`ผู้จัดเตรียม ${row.itemLabel || index + 1}`}
                        value={[row.preparedByS ? "ss" : null, row.preparedByCustomer ? "customer" : null].filter(Boolean)}
                        onChange={(next) => setItem(uid, {
                          preparedByS: next.includes("ss"),
                          preparedByCustomer: next.includes("customer"),
                        })}
                        options={[{ value: "ss", label: "S&S" }, { value: "customer", label: "ลูกค้า" }]}
                      />
                    </td>
                    {canSeeItemCost ? (
                      <td className="num">
                        {/* ว่าง = ยังไม่กรอก (`null`) · 0 = ศูนย์บาทที่ตั้งใจกรอก — สองค่านี้ต้องไม่ถูกยุบรวมกัน
                            ⚠️ ตัดที่เพดานของฐานตั้งแต่ตอนพิมพ์ — พิมพ์เกินแล้วไปรู้ตอนบันทึก = ทั้งใบบันทึกไม่ผ่านเพราะแถวเดียว */}
                        {canEditItemCost ? (
                          <MoneyInput
                            value={row.costPrice ?? ""}
                            placeholder="—"
                            aria-label={`ราคาทุน ${rowLabel}`}
                            onChange={(next) => setItem(uid, {
                              costPrice: next === null || next === undefined ? null : Math.min(next, SPEC_ITEM_COST_MAX),
                            })}
                          />
                        ) : fmtMoneyOrDash(row.costPrice)}
                      </td>
                    ) : null}
                    <td>
                      <SpecItemImageCell
                        productId={productId}
                        value={row.imageAttachmentId || null}
                        canAttach={canAttachItemImage}
                        blockedReason={imageBlockedReason}
                        readOnly={readOnly}
                        rowLabel={rowLabel}
                        onChange={(imageAttachmentId) => setItem(uid, { imageAttachmentId })}
                        onBusy={onRowUpload}
                      />
                    </td>
                    <td>
                      {readOnly
                        ? naText(row.note)
                        : <Input value={row.note || ""} placeholder="—" onChange={(event) => setItem(uid, { note: event.target.value })} />}
                    </td>
                    {readOnly ? null : (
                      <td>
                        <Button iconOnly tone="danger" variant="ghost" size="sm"
                          aria-label={`ลบแถว ${row.itemLabel || index + 1}`}
                          onClick={() => removeItem(uid)} icon={<Trash2 size={14} />} />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
        {missingItems.length ? (
          <div className={styles.restore}>
            <span className={styles.restoreLabel}>คืนแถวจากแบบฟอร์ม</span>
            {missingItems.map((entry) => (
              <Button key={entry.key} size="sm" variant="ghost" icon={<Plus size={12} />}
                onClick={() => onItems((rows) => restoreChecklistItem(rows, entry.key))}>
                {entry.label}
              </Button>
            ))}
          </div>
        ) : null}
        <p className={`form-note ${styles.note}`}>
          ลบได้ทุกแถว — แถวของแบบฟอร์มที่ลบทิ้งคืนได้จากปุ่มด้านบน และจะไม่กลับมาเอง
          · เว้นว่างไว้ก็ได้ถ้ายังไม่รู้ · {canSeeItemCost ? "ราคาทุนและรูป" : "รูป"}ใช้ในระบบเท่านั้น ไม่ลงกระดาษ FM-SA-04
        </p>
      </DetailCard>

      <DetailCard
        icon={FileBadge}
        eyebrow="CERTIFICATION & DOCUMENTS"
        title="เอกสารที่ขอได้"
        meta="สถานะว่าง = ยังไม่ตอบ ไม่ใช่ว่ากำลังจัดเตรียม"
        actions={readOnly ? null : (
          <Button size="sm" variant="ghost" onClick={addCert} icon={<Plus size={13} />}>เพิ่มเอกสาร</Button>
        )}
      >
        <TableScroll family="editable" surface="embedded">
          <table>
            <thead>
              <tr>
                <th className={styles.colCertName}>เอกสาร</th>
                <th className={styles.colCertStatus}>สถานะ</th>
                <th>หมายเหตุ</th>
                {readOnly ? null : <th className={styles.colRemove} aria-label="ลบแถว" />}
              </tr>
            </thead>
            <tbody>
              {certs.map((row, index) => (
                <tr key={row.key || `cert-${index}`}>
                  <td>
                    {row.key || readOnly
                      ? <span className={styles.itemLabel}>{naText(row.label)}</span>
                      : <Input value={row.label || ""} placeholder="ชื่อเอกสาร" onChange={(event) => setCert(index, { label: event.target.value })} />}
                  </td>
                  <td>
                    {/* กดชิปที่เลือกอยู่ = ล้างกลับเป็น "ยังไม่ตอบ" — สองสถานะบนกระดาษ
                        ไม่ได้บังคับตอบ (single mode ของ ChoiceChips ยิง onChange ค่าเดิมมา) */}
                    <ChoiceChips
                      disabled={readOnly}
                      ariaLabel={`สถานะ ${row.label || index + 1}`}
                      value={row.status || ""}
                      onChange={(next) => setCert(index, { status: next === row.status ? "" : next })}
                      options={[
                        { value: "ready", label: PRODUCT_SPEC_CERT_STATUS_LABELS.ready },
                        { value: "in_progress", label: productSpecCertPendingLabel(row.key) },
                      ]}
                    />
                  </td>
                  <td>
                    {readOnly
                      ? naText(row.note)
                      : <Input value={row.note || ""} placeholder="—" onChange={(event) => setCert(index, { note: event.target.value })} />}
                  </td>
                  {readOnly ? null : (
                    <td>
                      {row.key ? null : (
                        <Button iconOnly tone="danger" variant="ghost" size="sm" aria-label={`ลบเอกสารแถวที่ ${index + 1}`}
                          onClick={() => removeCert(index)} icon={<Trash2 size={14} />} />
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </DetailCard>
    </>
  );
}
