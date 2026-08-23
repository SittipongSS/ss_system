"use client";
// ── ปุ่ม "เปิดคำร้อง" บนหน้าดีล / หน้าโครงการ ─────────────────────────────────
//
// ⭐ **มติผู้ใช้ 2026-08-22** — เปิดคำร้องได้จากหน้าดีลและหน้าโครงการโดยตรง
//    เดิมมีทางลัดหัวข้อเดียว (พัฒนาสูตร) ที่เหลือต้องไปเริ่มที่คิวแล้วเลือกดีลใหม่
//
// ⭐ **เลือกหัวข้อในโมดัล แล้วไปกรอกที่หน้าเต็ม** — ไม่ใช่ครอบ `RequestForm` ไว้ในนี้
//    เด็ดขาด: `/requests/new` เขียนกฎไว้เองแล้วว่า **ห้ามทำสองเปลือก** (จะได้แถบปุ่ม
//    กับข้อความ blocker สองชุดที่ต้องคอยดูแลให้ตรงกัน) และคำร้องต้องมีจังหวะทบทวน
//    ก่อนออกเลขที่ · ที่นี่ทำหน้าที่เดียว = ตอบว่า *ดีลใบนี้เปิดหัวข้อไหนได้*
//    (ต่างจากงาน ซึ่งเป็นโมดัลเต็มตัวในหน้า — งานไม่มีเลขที่ให้ออก)
//
// ⚠️ **เหตุที่เปิดไม่ได้โชว์ติดกับหัวข้อ ไม่ใช่ซ่อนหัวข้อทิ้ง** (มติข้อเดียวกัน) —
//    หัวข้อที่หายไปเงียบ ๆ ไม่ได้สอนใครว่าต้องไปทำอะไรก่อน · เหตุผลทั้งหมดมาจาก
//    `dealRequestEntries` ซึ่งยกมาจากด่านตัวจริงของแต่ละหัวข้ออีกที
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircleQuestion } from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import OptionTiles from "@/components/ui/OptionTiles";
import DealPicker from "@/components/pm/DealPicker";
import { dealRequestEntries } from "@/lib/requests/dealRequestEntries";
import styles from "./RequestCreateButton.module.css";

export default function RequestCreateButton({
  // โหมดหน้าดีล — ดีลถูกกำหนดมาแล้ว
  deal = null,
  /* โหมดหน้าโครงการ — เลือกดีลก่อน แล้วรายการหัวข้อค่อยคิดจากดีลใบนั้น
     ⚠️ ส่ง **เฉพาะดีลของโครงการนี้** เข้ามา · `DealPicker` รับ `deals` เป็น prop
     อยู่แล้วจึงถูกจำกัดขอบเขตโดยไม่ต้องมีตัวเลือกชุดที่สอง */
  projectDeals = null,
  project = null,
  /* ใบเสนอราคาของดีล/โครงการ — ใช้ตอบว่าขอใบวางบิลได้ไหม
     (มาจาก payload ของหน้าได้เลย: `billingQuotationError` อ่าน approvalStatus /
     status / totalAmount / subtotal ซึ่งเป็นคอลัมน์ของตาราง `quotations` ทั้งชุด) */
  quotations = [],
  returnTo = "",
  canEdit = false,
  label = "เปิดคำร้อง",
  size = "sm",
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pickedDealId, setPickedDealId] = useState("");
  const [salesOrders, setSalesOrders] = useState([]);

  /* ⚠️ **ใบสั่งขายต้องมาจาก `/api/sales-planning/sales-orders` เท่านั้น** — ด่านบรีฟกลิ่น
     อ่าน `so.lines` (มีบรรทัดออกแบบกลิ่นไหม) กับ `so.scentRequest` (เปิดคำร้องไปแล้วยัง)
     ซึ่ง route นั้นประกอบให้ · payload ของหน้าดีล/หน้าโครงการ `select('*')` มาเฉย ๆ
     ⇒ ไม่มีสองช่องนี้ แล้วหัวข้อบรีฟกลิ่นจะขึ้นว่า "ยังไม่มีใบที่เปิดได้" ตลอดกาล
     (route นั้นเขียนกับดักข้อนี้ไว้เองแล้วในคอมเมนต์ 🐞 ของมัน)
     ⭐ ขอตอนกดปุ่มเท่านั้น — คนส่วนใหญ่เปิดหน้าดีลมาอ่าน ไม่ได้มาเปิดคำร้อง */
  useEffect(() => {
    if (!open || salesOrders.length) return;
    fetch("/api/sales-planning/sales-orders", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setSalesOrders(Array.isArray(rows) ? rows : []))
      .catch(() => {});
  }, [open, salesOrders.length]);

  const pickMode = !deal;
  const activeDeal = deal || (projectDeals || []).find((row) => row.id === pickedDealId) || null;

  /* ⚠️ ในโหมดโครงการ ใบเสนอราคา/ใบสั่งขายที่ส่งเข้ามาเป็นของ **ทั้งโครงการ** —
     ต้องกรองให้เหลือของดีลที่เลือกก่อน ไม่งั้นบรีฟกลิ่นจะขึ้นว่าเปิดได้ทั้งที่ SO
     ใบนั้นเป็นของดีลอื่นในโครงการเดียวกัน */
  const entries = useMemo(() => dealRequestEntries(activeDeal, {
    quotations: activeDeal ? quotations.filter((row) => !row.dealId || row.dealId === activeDeal.id) : [],
    salesOrders: activeDeal ? salesOrders.filter((row) => !row.dealId || row.dealId === activeDeal.id) : [],
    returnTo,
  }), [activeDeal, quotations, salesOrders, returnTo]);

  if (!canEdit) return null;

  const close = () => { setOpen(false); setPickedDealId(""); };

  return (
    <>
      <Button size={size} onClick={() => setOpen(true)} icon={<MessageCircleQuestion size={13} aria-hidden="true" />}>
        {label}
      </Button>
      <Modal open={open} onClose={close} title="เปิดคำร้องถึงฝ่ายอื่น" size="sm">
        <div className={styles.body}>
          {pickMode && (
            <label className={styles.field}>
              ดีลที่เกี่ยวข้อง
              <DealPicker
                deals={projectDeals || []}
                projects={project ? [project] : []}
                value={pickedDealId}
                onChange={(dealId) => setPickedDealId(dealId)}
                placeholder="เลือกดีลของคำร้อง"
                ariaLabel="ดีลของคำร้อง"
              />
            </label>
          )}
          {activeDeal ? (
            <div className={styles.group}>
              <span className={styles.groupLabel}>หัวข้อ</span>
              <OptionTiles
                options={entries.map((entry) => ({
                  value: entry.kind,
                  label: entry.label,
                  description: entry.blocker || undefined,
                  disabled: !!entry.blocker,
                }))}
                onChange={(kind) => {
                  const entry = entries.find((row) => row.kind === kind);
                  if (entry?.href) router.push(entry.href);
                }}
                ariaLabel="หัวข้อคำร้อง"
              />
            </div>
          ) : (
            <div className={styles.hint}>
              เลือกดีลก่อน แล้วระบบจะบอกว่าดีลใบนั้นเปิดคำร้องหัวข้อไหนได้บ้าง
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
