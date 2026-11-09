"use client";
// ── ตารางแท็บ "กลิ่น" · "สูตร" ของหน้า "ราคา + Ingredient List" (มติเจ้าของ 09/11/2026) ─────────────────────────
//
// ⭐ หนึ่งแถว = หนึ่งตัวในทะเบียนที่มาจากคำร้องที่ลูกค้าคอนเฟิร์ม (`lib/rd/priceRegistry.js`) — ไม่ใช่แถวคำร้อง
// ⭐ ทรงเดียวกับแท็บงานค้างในคำร้อง: รหัสบน·ชื่อล่าง · คอลัมน์ก้าว = ป้ายสถานะสี → รายละเอียด → ปุ่ม
// ⚠️ ไม่มีกลไกเขียนของตัวเอง — ปุ่มยกขึ้นไปให้หน้า (`onPrice` · `onIngredients`) ซึ่งเปิดโมดัลกลางตัวเดียวกับหน้าทะเบียน
// ⚠️ ปุ่มวางตามด่านเดียวกับ API ที่จะยิง (`canPrice` = canQuoteMaterial · `canEditIngredients` = isFormulaRegistrar)
//    ไม่มีสิทธิ์ = ไม่เห็นปุ่ม · ติดด่านของแถว (ใส่ไม่ได้) = เห็นปุ่มแล้วบอกเหตุตอนกด (กฎ UI ของระบบ)
import Link from "next/link";
import { Coins, ListChecks } from "lucide-react";
import { TableGroupRow, TableScroll } from "@/components/ui/Table";
import GatedAction from "@/components/ui/GatedAction";
import StatusBadge from "@/components/ui/StatusBadge";
import RegistryPrice from "@/components/database/RegistryPrice";
import { NA, fmtDate } from "@/lib/format";
import { REGISTRY_INGREDIENT_STATES, REGISTRY_PRICE_STATES } from "@/lib/rd/priceRegistry";
import { REQUEST_STATUS_LABELS } from "@/lib/requests/statuses";
import styles from "./PriceRegistryTable.module.css";

/**
 * @param kind        'scent' | 'formula'
 * @param rows        แถวที่แสดง (ลำดับจอ) · `groups` = ถังจาก `priceViewOf` (null = ไม่จัดกลุ่ม)
 * @param busyKey     แถวที่กำลังรอตารางใหม่หลังบันทึก — ล็อกปุ่ม
 */
export default function PriceRegistryTable({
  kind, rows, groups, collapsed, onToggleGroup, categoryLabel, canPrice, canEditIngredients, busyKey, onPrice, onIngredients,
}) {
  const isFormula = kind === "formula";
  const cols = isFormula ? 5 : 4;
  const buckets = groups || [{ key: "__all", label: null, items: rows }];
  return (
    <TableScroll cells="stacked">
      <table className="w-full">
        <thead>
          <tr>
            <th className={isFormula ? styles.colItemFormula : styles.colItem}>{isFormula ? "สูตร" : "กลิ่น"}</th>
            <th className={styles.colCustomer}>ลูกค้า</th>
            <th className={styles.colSource}>ลูกค้าคอนเฟิร์ม</th>
            <th className={styles.colStep}>ราคา (บาท/กก.)</th>
            {isFormula ? <th className={styles.colStep}>Ingredient List</th> : null}
          </tr>
        </thead>
        {buckets.map((group) => {
          const isCollapsed = Boolean(group.label) && collapsed.has(group.key);
          return (
            <tbody key={group.key}>
              {group.label ? (
                <TableGroupRow
                  colSpan={cols}
                  label={group.label}
                  sub={group.sub}
                  total={`${group.count} รายการ`}
                  totalTitle="จำนวนรายการในกลุ่มนี้"
                  collapsed={isCollapsed}
                  onToggle={() => onToggleGroup(group.key)}
                />
              ) : null}
              {isCollapsed ? null : group.items.map((row) => (
                <tr key={row.key}>
                  <td><EntityCell row={row} categoryLabel={categoryLabel} /></td>
                  <td><CustomerCell row={row} /></td>
                  <td><SourceCell row={row} /></td>
                  <td>
                    <RegistryPriceCell row={row} canPrice={canPrice} busy={busyKey === row.key} onPrice={onPrice} />
                  </td>
                  {isFormula ? (
                    <td>
                      <RegistryIngredientCell
                        row={row} canEdit={canEditIngredients} busy={busyKey === row.key} onOpen={onIngredients}
                      />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          );
        })}
      </table>
    </TableScroll>
  );
}

/* รหัสบน·ชื่อล่าง (กติกาแสดง entity ของตาราง) — รหัสเป็นทางเข้าหน้ารายละเอียดของทะเบียน
   บรรทัดรอง: สูตร = หมวด · กลิ่นของสูตร / กลิ่น = ชื่อที่ลูกค้าเรียก */
function EntityCell({ row, categoryLabel }) {
  const href = row.kind === "formula" ? `/database/formulas/${row.id}` : `/database/scents/${row.id}`;
  const category = row.categoryCode
    ? [row.categoryCode, categoryLabel?.(row.categoryCode)].filter(Boolean).join(" ")
    : null;
  const sub = row.kind === "formula"
    ? [category || "ยังไม่ระบุหมวด", row.scent ? `กลิ่น ${row.scent.code || row.scent.name}` : null]
    : [row.customerTradeName ? `ลูกค้าเรียก: ${row.customerTradeName}` : null];
  return (
    <>
      <Link href={href} className={styles.entityLink}>
        <span className={styles.code}>{row.code || "ไม่มีรหัส"}</span>
        <span className={styles.name}>{row.name || NA}</span>
      </Link>
      {sub.filter(Boolean).length ? <div className={styles.sub}>{sub.filter(Boolean).join(" · ")}</div> : null}
    </>
  );
}

/* AR บน · ชื่อล่าง (มติ 2026-08-12 — รหัสนำทุกตาราง) · AR อ่านสดจากทะเบียนลูกค้า */
function CustomerCell({ row }) {
  if (!row.customerName && !row.customerArCode) return <span className={styles.dim}>สูตร/กลิ่นกลาง</span>;
  return (
    <>
      {row.customerArCode ? <div className={styles.code}>{row.customerArCode}</div> : null}
      <div>{row.customerName || NA}</div>
    </>
  );
}

/* ที่มา — วันที่ลูกค้าคอนเฟิร์มครั้งแรก + ใบคำร้องที่คอนเฟิร์ม (ลิงก์) · ใบเดียวกันหลายแถวขึ้นครั้งเดียว */
function SourceCell({ row }) {
  const seen = new Set();
  const requests = (row.sources || []).filter((s) => (seen.has(s.requestId) ? false : seen.add(s.requestId)));
  return (
    <>
      <div>{row.firstConfirmedAt ? fmtDate(row.firstConfirmedAt) : NA}</div>
      <ul className={styles.sources}>
        {requests.map((s) => (
          <li key={s.requestId}>
            <Link className="linklike" href={`/requests/${s.requestId}`}>{s.docNo || "คำร้อง"}</Link>
            {s.requestStatus ? <span className={styles.sub}> · {REQUEST_STATUS_LABELS[s.requestStatus] || s.requestStatus}</span> : null}
          </li>
        ))}
      </ul>
    </>
  );
}

/* ── ก้าวราคา — ป้ายสถานะ → ราคาทุกช่องที่ใส่ได้ → ปุ่ม (ใส่/ออกราคาใหม่ ลงทะเบียนวัสดุเป็น rev ใหม่) ───────────── */
function RegistryPriceCell({ row, canPrice, busy, onPrice }) {
  const state = REGISTRY_PRICE_STATES[row.priceState] || REGISTRY_PRICE_STATES.missing;
  return (
    <div className={styles.step}>
      <StatusBadge size="sm" tone={state.tone} label={state.label} />
      <SlotPrices row={row} />
      {canPrice ? (
        <GatedAction
          blocker={row.priceBlocker}
          size="sm"
          tone={row.needsPrice ? "primary" : undefined}
          variant={row.needsPrice ? "filled" : "quiet"}
          icon={<Coins size={14} aria-hidden="true" />}
          disabled={busy}
          onClick={() => onPrice(row)}
        >
          {row.needsPrice ? "ใส่ราคา" : "ออกราคาใหม่"}
        </GatedAction>
      ) : null}
    </div>
  );
}

/* ราคาทุกช่องที่ตัวนี้ใส่ได้ — ช่องที่ยังไม่มีราคาบอกตรง ๆ · ชิ้นแสดงราคาตัวเดียวกับหน้าทะเบียน (`RegistryPrice`) */
function SlotPrices({ row }) {
  if (!row.current?.length) return row.priceBlocker ? <span className={styles.sub}>{row.priceBlocker}</span> : null;
  return (
    <ul className={styles.prices}>
      {row.current.map((c) => (
        <li key={c.key}>
          <span className={styles.slot}>{c.short}</span>{" "}
          {c.price?.unitPrice != null ? (
            <>
              <RegistryPrice price={{ ...c.price, validUntil: c.price.validThrough }} />
              {c.price.state === "ready" && c.price.validThrough ? (
                <span className={styles.sub}> · ถึง {fmtDate(c.price.validThrough)}</span>
              ) : null}
            </>
          ) : <span className={styles.dim}>ยังไม่มีราคา</span>}
        </li>
      ))}
    </ul>
  );
}

/* ── ก้าว Ingredient List (ม-158/159) — ไม่ต้องมี = บอกเป็นคำ · มีแล้ว = ป้ายเขียว + ปุ่มรองแก้ · ยังไม่มี = ป้ายส้ม + ปุ่มหลัก ── */
function RegistryIngredientCell({ row, canEdit, busy, onOpen }) {
  const state = REGISTRY_INGREDIENT_STATES[row.ingredientState] || REGISTRY_INGREDIENT_STATES.none;
  if (row.ingredientState === "none") {
    return <span className={styles.dim} title="สูตรหัวน้ำหอม 02-020 ไม่ต้องมี Ingredient List">{state.label}</span>;
  }
  const missing = row.ingredientState === "missing";
  return (
    <div className={styles.step}>
      <StatusBadge size="sm" tone={state.tone} label={state.label} />
      {canEdit ? (
        <GatedAction
          size="sm"
          tone={missing ? "primary" : undefined}
          variant={missing ? "filled" : "quiet"}
          icon={<ListChecks size={14} aria-hidden="true" />}
          disabled={busy}
          onClick={() => onOpen(row)}
        >
          {missing ? "ใส่ Ingredient List" : "แก้ Ingredient List"}
        </GatedAction>
      ) : null}
    </div>
  );
}
