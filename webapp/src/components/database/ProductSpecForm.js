"use client";
import { Box, FileBadge, ListChecks, Plus, Target, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import ChoiceChips from "@/components/ui/ChoiceChips";
import { TableScroll } from "@/components/ui/Table";
import { DetailCard } from "@/components/ui/DetailPage";
import { naText } from "@/lib/format";
import { productBrandName, productDisplayName } from "@/lib/master/productIdentity";
import {
  PRODUCT_SPEC_CERT_STATUS_LABELS, PRODUCT_SPEC_CHECKLIST, productSpecCertPendingLabel,
  productSpecChecklistMissing, restoreChecklistItem,
} from "@/lib/sales/productSpecChecklist";
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
 */
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

  const setItem = (index, patch) => onItems(items.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const addItem = () => onItems([...items, {
    itemKey: null, itemLabel: "", detail: "", preparedByS: false, preparedByCustomer: false, note: "",
  }]);
  /* ⭐ **ลบได้ทุกแถวรวม 17 แถวของแบบฟอร์ม** (มติผู้ใช้ 2026-09-21) — สินค้าหลายตัว
     ไม่มีก้านไม้ ไม่มีสายคาดกล่อง แถวที่ไม่เกี่ยวทำให้ทั้งใบอ่านยากและกระดาษยาวเกินจริง
     ⇒ ลบได้ แต่ต้องคืนได้ด้วย (ชิป "คืนแถวจากแบบฟอร์ม" ใต้ตาราง) ไม่งั้นลบพลาด
        ครั้งเดียวคือทางตัน: พิมพ์ชื่อเพิ่มใหม่ได้ แต่ได้แถวไม่มีคีย์ซึ่งไม่ใช่แถวเดิม */
  const removeItem = (index) => onItems(items.filter((_, i) => i !== index));
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
          {derived("กลิ่น / รหัสกลิ่น", product?.scentText)}
          {derived("ขนาดบรรจุ", product?.volumeText)}
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
          {field("pricingTier", "ระดับราคา", { long: true, placeholder: "เช่น ราคาต้นทุน 200 บาท/ขวด" })}
          {field("productBenefit", "ประสิทธิภาพหลัก", { long: true, placeholder: "เช่น ช่วยให้กลิ่นหอม สร้างคาแร็คเตอร์ที่โดดเด่น" })}
          {field("longevity", "ระยะเวลาการออกฤทธิ์กลิ่น", { placeholder: "เช่น 4-6 ชั่วโมง" })}
          {field("dosagePerUse", "ปริมาณแนะนำต่อการใช้งาน", { placeholder: "เช่น 1-2 สเปรย์ต่อครั้ง" })}
        </div>
      </DetailCard>

      <DetailCard
        icon={ListChecks}
        eyebrow="CHECKLIST PROJECT"
        title="Checklist บรรจุภัณฑ์"
        meta={checklistMeta(items)}
        actions={readOnly ? null : (
          <Button size="sm" variant="ghost" onClick={addItem} icon={<Plus size={13} />}>เพิ่มแถว</Button>
        )}
      >
        <TableScroll family="editable" surface="embedded">
          <table>
            <thead>
              <tr>
                <th className={`num ${styles.colNo}`}>ลำดับ</th>
                <th className={styles.colItem}>สิ่งที่ต้องเตรียม</th>
                <th>รายละเอียด</th>
                <th className={styles.colBy}>ผู้จัดเตรียม</th>
                <th className={styles.colNote}>หมายเหตุ</th>
                {readOnly ? null : <th className={styles.colRemove} aria-label="ลบแถว" />}
              </tr>
            </thead>
            <tbody>
              {items.map((row, index) => (
                <tr key={row.id || `${row.itemKey || "extra"}-${index}`}>
                  <td className="num">{index + 1}</td>
                  <td>
                    {row.itemKey || readOnly
                      ? <span className={styles.itemLabel}>{naText(row.itemLabel)}</span>
                      : <Input value={row.itemLabel || ""} placeholder="ชื่อรายการ" onChange={(event) => setItem(index, { itemLabel: event.target.value })} />}
                  </td>
                  <td>
                    {readOnly
                      ? naText(row.detail)
                      : <Input value={row.detail || ""} placeholder="—" onChange={(event) => setItem(index, { detail: event.target.value })} />}
                  </td>
                  <td>
                    <ChoiceChips
                      multiple
                      minSelected={0}
                      disabled={readOnly}
                      ariaLabel={`ผู้จัดเตรียม ${row.itemLabel || index + 1}`}
                      value={[row.preparedByS ? "ss" : null, row.preparedByCustomer ? "customer" : null].filter(Boolean)}
                      onChange={(next) => setItem(index, {
                        preparedByS: next.includes("ss"),
                        preparedByCustomer: next.includes("customer"),
                      })}
                      options={[{ value: "ss", label: "S&S" }, { value: "customer", label: "ลูกค้า" }]}
                    />
                  </td>
                  <td>
                    {readOnly
                      ? naText(row.note)
                      : <Input value={row.note || ""} placeholder="—" onChange={(event) => setItem(index, { note: event.target.value })} />}
                  </td>
                  {readOnly ? null : (
                    <td>
                      <Button iconOnly tone="danger" variant="ghost" size="sm"
                        aria-label={`ลบแถว ${row.itemLabel || index + 1}`}
                        onClick={() => removeItem(index)} icon={<Trash2 size={14} />} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
        {missingItems.length ? (
          <div className={styles.restore}>
            <span className={styles.restoreLabel}>คืนแถวจากแบบฟอร์ม</span>
            {missingItems.map((entry) => (
              <Button key={entry.key} size="sm" variant="ghost" icon={<Plus size={12} />}
                onClick={() => onItems(restoreChecklistItem(items, entry.key))}>
                {entry.label}
              </Button>
            ))}
          </div>
        ) : null}
        <p className={`form-note ${styles.note}`}>
          ลบได้ทุกแถว — แถวของแบบฟอร์มที่ลบทิ้งคืนได้จากปุ่มด้านบน และจะไม่กลับมาเอง
          · เว้นว่างไว้ก็ได้ถ้ายังไม่รู้
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
