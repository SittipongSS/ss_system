"use client";
// ── ของที่ RD ส่ง = แถวคำร้อง + กลิ่นในทะเบียน (P3b) ───────────────────────
//
// ⭐ **กรอกที่เดียว เข้าทะเบียนเลย** — RD ไม่ต้องเปิดหน้าทะเบียนอีกจอแล้วพิมพ์ซ้ำ
// ซึ่งเป็นวิธีที่ข้อมูลสองที่เริ่ม drift กัน
//
// ⚠️ **รหัสซ้ำเตือนที่ช่อง ไม่ใช่ตอนกดส่ง** — ปล่อยไปตายที่ DB จะได้ error 23505
// ภาษาอังกฤษ และมาตอนที่คนกรอกไปหมดแล้วซึ่งสายเกินจะไล่แก้ทีละช่อง
import { notifyToast } from "@/components/ui/Toast";
import PendingFiles from "@/components/ui/PendingFiles";
import Textarea from "@/components/ui/Textarea";
import Select from "@/components/ui/Select";
import OptionTiles from "@/components/ui/OptionTiles";
import FormZone from "@/components/ui/FormZone";
import ScentForm, { emptyScentForm } from "@/components/database/ScentForm";
import FormulaForm, { emptyFormulaForm } from "@/components/database/FormulaForm";
import { businessDate } from "@/lib/businessDate";
import {
  DELIVERED_FRAGRANCE_CODE, deliveredAsOf, deliveryProductCategories, isDeliveredAsProduct,
} from "@/lib/requests/deliveredCategory";
import styles from "./scentDelivery.module.css";

// ⭐ **สองวัน ไม่ใช่วันเดียว** (มติผู้ใช้ 2026-08-08 · ม-66 · mig 0224):
//   · `producedAt` = RD ผลิตกลิ่นตัวนี้เสร็จวันไหน → ไปอยู่บน **ตัวกลิ่น** ในทะเบียน
//   · `readyAt`    = พร้อมส่งมอบให้ฝ่ายขายวันไหน  → ไปอยู่บน **แถวคำร้อง**
// ⚠️ `readyAt` **ไม่ถามในฟอร์มแล้ว** (ม-92: วันส่งใช้ตราประทับวันที่กด — server
// เติมวันไทยเองเมื่อว่าง) · `producedAt` ยังถาม เพราะเป็นข้อเท็จจริงของตัวกลิ่น
// ที่มักเกิดก่อนวันกดส่ง ไม่ใช่วันของการส่ง
// `_files` = File[] ค้างในฟอร์ม (ม-91) — แถวสายกลิ่นเกิดตอนกดส่ง จึงยังไม่มี
// entityId ให้อัป ⇒ อัปหลังแถวเกิด (แพตเทิร์นเดียวกับหน้าสร้างคำร้อง · ม-84)
// ⚠️ ขีดล่างนำหน้า = ของฟอร์มล้วน ห้ามส่งเข้า payload (ดูตอน submit ใน page.js)
/* ⭐ **ฟอร์มเดียวกับทะเบียนกลิ่น** (มติผู้ใช้ 2026-08-19 · ทำคู่กับสายสูตร) — ของที่
   กรอกอยู่ในก้อน `scent` ซึ่งใช้ชื่อช่องชุดเดียวกับ `ScentForm` ⇒ เพิ่มช่องในทะเบียน
   แล้วสายคำร้องได้ตามฟรี · ที่เหลือเป็นของ **แถวคำร้อง** ไม่ใช่ของตัวกลิ่น
   (บรีฟที่ตอบ · รายละเอียด direction · ไฟล์ที่ค้างรออัปหลังแถวเกิด)
   ⚠️ `producedAt` ตั้งต้นเป็นวันนี้ ต่างจากทะเบียนที่เว้นว่าง — ที่นี่ RD เพิ่งผลิตเสร็จ
   ส่วนทะเบียนมีไว้ลงของเก่าที่ไม่มีใครจำวันได้ */
/* ⭐ **ส่งเป็นอะไร** (ม-148 · มติผู้ใช้ 2026-09-22) — `categoryCode` ของแถว: '02-020' = หัวน้ำหอม ·
   หมวดอื่น = สินค้า (มีก้อน `formula` ชื่อช่องชุดเดียวกับ FormulaForm) · ว่าง = ยังไม่เลือก (ส่งไม่ได้)
   `categoryCode` ตั้งต้นมาจาก PDR ข้อ 1.11 เมื่อใบขอไว้หมวดเดียว (`defaultDeliveredCategory` · ผู้เรียกคิดให้)
   `_as` = ทางที่กดบนแผ่นเลือก — จำไว้ช่วงที่กด "สินค้า" แล้วยังไม่ได้เลือกหมวด (ของฟอร์มล้วน) */
export const emptyDeliveryRow = ({ categoryCode = "" } = {}) => ({
  scent: { ...emptyScentForm(), producedAt: businessDate() },
  categoryCode,
  // `_categoryCode` = หมวดสินค้าที่เลือกล่าสุด — สลับไปหัวน้ำหอมแล้วกลับมา ไม่ต้องเลือกหมวดใหม่
  formula: { ...emptyFormulaForm(), _categoryCode: isDeliveredAsProduct(categoryCode) ? categoryCode : "" },
  spec: "", briefId: "", targetItemId: "", _files: [], _as: "",
});

// ⭐ ช่องของ **รอบแก้** — แถวรออยู่แล้ว บรีฟกับกลิ่นต้นทางระบบรู้แล้ว ⇒ ไม่ถามซ้ำ
// (ค่าสองตัวนั้นถูก server เขียนทับด้วยของจริงอยู่ดี ดู lib/requests/rework.js)
// ⭐ ม-148: "ส่งเป็น" ยกจากรอบก่อนเป็นค่าตั้งต้น (เปลี่ยนได้) · สูตรต้นทางยกจากรอบก่อนแล้วล็อก
export const reworkDeliveryRow = (slot) => {
  const base = emptyDeliveryRow({ categoryCode: slot.categoryCode || "" });
  return {
    ...base,
    scent: { ...base.scent, derivedFromScentId: slot.derivedFromScentId || "" },
    formula: { ...base.formula, derivedFromFormulaId: slot.parentFormulaId || "" },
    targetItemId: slot.targetItemId,
    briefId: slot.briefId || "",
    _sourceLabel: slot.sourceLabel || "",
    _customerNote: slot.customerNote || "",
    _parentFormulaId: slot.parentFormulaId || "",
  };
};

// id หลอกของ "กลิ่นในแท็บนี้" — ช่องกลิ่นของฟอร์มสูตรต้องโชว์ว่าผูกกับกลิ่นตัวไหนทั้งที่กลิ่นยังไม่เกิด
// (กติกา lock ไม่ hide) · ไม่ออกไปถึง server: ก้อน `formula` ที่ส่งไปไม่มี scentId (server ใช้กลิ่นที่เพิ่งสร้าง)
const PENDING_SCENT_ID = "__delivery_scent__";

// ของที่ส่งเข้า FormulaForm ไม่ต้องติดกลับมาในก้อน `formula` — ลูกค้า/กลิ่น/หมวดเป็นของแถว
const formulaOnly = ({ customerId: _c, scentId: _s, categoryCode: _k, ...rest }) => rest;

const norm = (v) => String(v ?? "").trim().toLowerCase();

// รหัสนี้ชนกับอะไร — คืนข้อความไทย หรือ null
// ⚠️ เทียบแบบไม่สนตัวพิมพ์ ให้ตรงกับ `scents_code_uk` ซึ่งเป็น lower(btrim(code))
export function codeConflict(code, index, rows, registryCodes) {
  const key = norm(code);
  if (!key) return null;
  if (registryCodes.has(key)) return "รหัสนี้มีในทะเบียนแล้ว";
  const earlier = rows.findIndex((r, i) => i !== index && norm(r.scent?.code) === key);
  return earlier === -1 ? null : `ซ้ำกับรายการที่ ${earlier + 1}`;
}

/* ⭐ **หนึ่ง direction = หนึ่งแท็บ** (มติผู้ใช้ 2026-08-19 · แบบเดียวกับโมดัลสร้างดีล) —
   แท็บกับปุ่ม "เพิ่ม Direction"/"ลบ" อยู่บนแถบเครื่องมือของโมดัล (ดู requests/[id])
   ที่นี่จึงวาดเฉพาะ direction ที่เปิดอยู่
   ⚠️ ปุ่มเพิ่มเคยอยู่ล่างสุดใต้ฟอร์มทุกใบ — กดแล้วไม่เห็นว่าเพิ่มอะไร และยิ่งหลายตัว
   ยิ่งไถยาว (เหตุผลเดียวกับที่ดีลย้ายปุ่มขึ้นไปแถวเดียวกับแท็บเมื่อ 2026-08-04) */
export default function ScentDeliveryFields({
  rows, onChange, scents = [], customers = [], customerId = null,
  disabled = false, briefs = [], active = 0,
  // ม-148 — ทะเบียนหมวดสินค้า (ตัวเลือกหมวดเมื่อส่งเป็นสินค้า) · ทะเบียนสูตร (ตัวเลือก "แก้มาจากสูตร")
  productTypes = [], formulas = [],
}) {
  // ⭐ **บรีฟก้อนเดียว = ไม่ต้องถาม** (มติผู้ใช้) — ช่องที่มีตัวเลือกเดียวแต่ยังบังคับ
  // ให้กด คือขั้นตอนที่ไม่ได้ตัดสินใจอะไร · server เลือกให้เองอยู่แล้ว
  const askBrief = briefs.length > 1;
  const registryCodes = new Set(scents.map((s) => norm(s.code)).filter(Boolean));
  const patch = (i, next) => onChange(rows.map((r, j) => (i === j ? { ...r, ...next } : r)));

  const visible = rows[Math.min(Math.max(active, 0), rows.length - 1)];

  return (
    <div className={styles.wrap}>
      {rows.filter((row) => row === visible).map((row) => {
        const i = rows.indexOf(row);
        const conflict = codeConflict(row.scent?.code, i, rows, registryCodes);
        /* ⚠️ **รอบแก้ล็อกกลิ่นต้นทาง** — แถวรออยู่แล้วและระบบรู้ว่าแก้มาจากตัวไหน ·
           ปล่อยให้เลือกเองเมื่อไรก็ชี้ผิดตัวได้ทั้งที่คำตอบมีตัวเดียว (server เขียนทับ
           ด้วยของจริงอยู่ดี — ดู lib/requests/rework.js) */
        const locked = row.targetItemId
          ? ["customerId", "derivedFromScentId"] : ["customerId"];
        return (
          <div key={i} className={styles.row}>
            {/* คำพูดลูกค้าอยู่ตรงหัวช่องที่กำลังจะกรอก ไม่ใช่ให้ไถกลับไปอ่านบนราง */}
            {row.targetItemId && row._customerNote && (
              <p className={styles.customerNote}>
                <strong>ลูกค้าบอกว่า:</strong> {row._customerNote}
              </p>
            )}

            {/* ⭐ **ส่งเป็นอะไร** (ม-148) — ถามก่อนทุกอย่าง เพราะตัดสินว่าจะมีสูตรเกิดด้วยไหม และราคาที่ใส่
                ทีหลังเป็น F (กลิ่น) หรือ FB (สูตร) · แผ่นเลือกสองทาง ไม่ใช่ดรอปดาวน์ (ชุดเล็กตายตัว) */}
            <div className={styles.deliveredAs}>
            <FormZone title="ส่งเป็น" note="ตัดสินว่าราคาที่ใส่ทีหลังเป็น F หรือ FB" />
            <OptionTiles
              ariaLabel="ส่งเป็น"
              disabled={disabled}
              value={deliveredAsOf(row.categoryCode, { productPending: row._as === "product" })}
              onChange={(as) => patch(i, as === "fragrance"
                ? { categoryCode: DELIVERED_FRAGRANCE_CODE, _as: as }
                : {
                  // กลับมากด "สินค้า" = คืนหมวดสินค้าที่เคยเลือกไว้ในแท็บนี้ (ถ้ามี) ไม่ใช่ล้างทิ้ง
                  categoryCode: row.formula?._categoryCode || "",
                  _as: as,
                })}
              options={[
                {
                  value: "fragrance",
                  label: "หัวน้ำหอม (Fragrance Oil)",
                  description: "กลิ่นเข้าทะเบียน · ราคาที่ใส่ทีหลังเป็น F",
                },
                {
                  value: "product",
                  label: "สินค้า",
                  description: "กลิ่น + สูตรหมวดที่เลือก · ราคาเป็น FB (เบสที่ใส่กลิ่น)",
                },
              ]}
            />
            </div>

            {/* ⭐ **ฟอร์มเดียวกับหน้าทะเบียนกลิ่น** — ลูกค้า (และกลิ่นต้นทางของรอบแก้)
                เป็นของที่คำร้องรู้แล้ว จึงเทาไว้ให้อ่านได้ ไม่ซ่อน
                ⚠️ วันส่งลูกค้ากับสถานะไม่ใช่คำถามของจังหวะนี้ (ม-92 · ม-66): ของเพิ่ง
                ออกจากมือ RD มาถึงฝ่ายขาย ยังไม่ถึงลูกค้า ⇒ ตัดช่องทิ้งทั้งคู่ */}
            <ScentForm
              mode="create" canSetCode canSetLegacy codeRequired
              idPrefix={`d${i}`}
              value={{ ...row.scent, customerId: customerId || row.scent?.customerId || "" }}
              disabled={disabled}
              customers={customers}
              scents={scents}
              codeIssue={conflict}
              locked={locked}
              lockedNote="ยกมาจากคำร้อง — แก้ที่นี่ไม่ได้"
              hide={["sentAt", "status"]}
              historyTitle="วันของกลิ่นตัวนี้"
              historyNote="วันผลิตจริงของกลิ่น — วันส่งมอบระบบประทับให้ตอนกดส่ง"
              onChange={(scent) => patch(i, { scent })}
            />

            {/* ⭐ **สูตรที่เกิดพร้อมกลิ่นนี้** (ม-148) — ฟอร์มเดียวกับทะเบียนสูตร (กติกา "ฟอร์มส่งงาน = ฟอร์ม
                ทะเบียน") · ลูกค้ากับกลิ่นเทาไว้ให้เห็นว่าผูกกับอะไร · หมวดเลือกที่ช่องในฟอร์ม (เฉพาะกลุ่ม 01/02
                ที่มีสูตร) · รอบแก้ที่รอบก่อนส่งสูตรไว้: "แก้มาจากสูตร" ล็อกที่สูตรนั้น */}
            {deliveredAsOf(row.categoryCode, { productPending: row._as === "product" }) === "product" && (
              <section className={styles.formulaBlock} aria-label="สูตรที่เกิดพร้อมกลิ่นนี้">
                {/* หัวของกรอบ ไม่ใช่ FormZone — FormulaForm มีโซน "ตัวตนสูตร" ของมันเองต่อทันที
                    (หัวโซนสองชั้นติดกันอ่านเป็นหัวซ้ำ · เจอตอนเปิดจอจริง) */}
                <h3 className={styles.blockTitle}>สูตรที่เกิดพร้อมกลิ่นนี้</h3>
                <p className={styles.blockNote}>
                  หมวด × กลิ่นในแท็บนี้ · สถานะกำลังพัฒนาจนลูกค้าคอนเฟิร์ม · ราคาที่ใส่ทีหลังเป็น FB ของสูตรนี้
                </p>
                <FormulaForm
                  mode="create" canSetCode codeRequired
                  value={{
                    ...row.formula,
                    customerId: customerId || "",
                    scentId: PENDING_SCENT_ID,
                    categoryCode: row.categoryCode || "",
                  }}
                  scents={[{
                    id: PENDING_SCENT_ID,
                    name: String(row.scent?.name ?? "").trim() || "กลิ่นในแท็บนี้",
                    code: String(row.scent?.code ?? "").trim() || null,
                    customerId: customerId || "",
                  }]}
                  formulas={formulas}
                  customers={customers}
                  categories={deliveryProductCategories(productTypes, row.categoryCode)}
                  disabled={disabled}
                  /* ⚠️ รอบแก้ล็อก "แก้มาจากสูตร" **ทุกแถว** — server ยกจากแถวต้นทางเสมอ (รอบก่อนส่งหัวน้ำหอม = ว่าง)
                     ปล่อยให้เลือกเมื่อรอบก่อนไม่มีสูตร = จอรับค่าที่ server ทิ้งเงียบ (รีวิว ม-148) */
                  locked={row.targetItemId
                    ? ["customerId", "scentId", "derivedFromFormulaId"] : ["customerId", "scentId"]}
                  lockedNote="ยกมาจากคำร้อง / กลิ่นในแท็บนี้ — แก้ที่นี่ไม่ได้"
                  onChange={(next) => patch(i, {
                    formula: { ...formulaOnly(next), _categoryCode: next.categoryCode || "" },
                    categoryCode: next.categoryCode || "",
                    _as: "product",
                  })}
                />
              </section>
            )}

            {/* ── ของ **แถวคำร้อง** ไม่ใช่ของตัวกลิ่น ─────────────────────── */}
            <div className="form-grid">
              {askBrief && !row.targetItemId && (
                <div className="form-group col-span-2">
                  <label htmlFor={`d-brief-${i}`}>ตอบบรีฟก้อนไหน *</label>
                  <Select
                    id={`d-brief-${i}`} value={row.briefId || ""} disabled={disabled}
                    onChange={(e) => patch(i, { briefId: e.target.value })}
                    options={[
                      { value: "", label: "— เลือกบรีฟ —" },
                      ...briefs.map((b, n) => ({
                        value: b.id, label: b.label || `กลิ่นที่ ${n + 1}`,
                      })),
                    ]}
                  />
                  {/* 1 บรีฟ : หลาย direction — เสนอสองทางจากบรีฟเดียวกันได้ */}
                  <span className={styles.hint}>เลือกก้อนเดิมซ้ำได้ ถ้าเสนอหลายทางจากบรีฟเดียว</span>
                </div>
              )}
              {row.targetItemId && (
                <p className={`col-span-2 ${styles.hint}`}>
                  รอบแก้ — บรีฟก้อนเดิมผูกให้อัตโนมัติ ไม่ต้องเลือกซ้ำ
                </p>
              )}
              <div className="form-group col-span-2">
                <label htmlFor={`d-spec-${i}`}>
                  รายละเอียด direction <span className={styles.hint}>(ไม่บังคับ)</span>
                </label>
                <Textarea
                  id={`d-spec-${i}`} rows={2} value={row.spec} disabled={disabled}
                  placeholder="ทิศทางกลิ่น / สิ่งที่ต่างจากตัวก่อนหน้า"
                  onChange={(e) => patch(i, { spec: e.target.value })}
                />
                {/* ⚠️ คนละช่องกับ "หมายเหตุ" ข้างบน — อันนี้อยู่บนแถวคำร้อง (ผู้ขอเห็น
                    ในใบ) ส่วนหมายเหตุติดไปกับตัวกลิ่นในทะเบียน */}
                <span className={styles.hint}>ติดอยู่กับรายการในใบคำร้อง — ไม่ได้เข้าทะเบียนกลิ่น</span>
              </div>
              {/* ไฟล์ประกอบของ direction นี้ (ม-91) — ไม่บังคับ: ตัวงานคือกลิ่นที่
                  เข้าทะเบียน ไฟล์เป็นของแถม ต่างจากสายเอกสารที่ไฟล์คือตัวงาน */}
              <div className="form-group col-span-2">
                <span className="toolbar-label">
                  ไฟล์ประกอบ <span className={styles.hint}>(ไม่บังคับ · อัปให้หลังส่ง)</span>
                </span>
                {/* ⭐ ตะกร้าไฟล์กลาง — เดิมที่นี่วาด label+ลิสต์เอง (ทรงที่ 5 ในระบบ)
                    และเงียบสนิทเมื่อไฟล์ใหญ่เกิน: กรองทิ้งโดยไม่บอกอะไรเลย */}
                <PendingFiles
                  files={row._files || []} disabled={disabled}
                  onChange={(next) => patch(i, { _files: next })}
                  onOversize={(message) => notifyToast.error(message)}
                  label="เลือกไฟล์"
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
