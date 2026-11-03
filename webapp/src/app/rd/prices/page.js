"use client";
// ── รอใส่ราคา — รายการที่ลูกค้าคอนเฟิร์มแล้ว รอ RD ใส่ราคา F · B · FB (ม-153 · มติผู้ใช้ 2026-10-01) ──
//
// ⭐ **หน่วยของหน้านี้คือ "รายการ" (แถวคำร้อง) ไม่ใช่ใบ** — ขั้นราคาอยู่ที่แถว (`rowStage` → `awaiting_price`)
// ⇒ คิวที่นับเป็นใบตอบไม่ได้ว่าเหลืออะไรให้ใส่ราคา · จัดกลุ่มตามใบ (มติผู้ใช้) ใบที่รอนานสุดขึ้นก่อน
//
// ⭐ **"ใช้ราคานี้"** — แถวที่สูตร/กลิ่นมีราคาในทะเบียนอยู่แล้ว (RD ใส่ที่หน้าทะเบียนก่อนลูกค้าคอนเฟิร์ม) ผูกราคาเดิม
// เข้าแถวได้ทันที ไม่ต้องพิมพ์เลขเดิมซ้ำ (ซึ่งได้ rev ซ้ำในประวัติราคา) · ราคาหมดอายุ = โชว์ปุ่มแล้วบอกเหตุตอนกด
//
// ⚠️ **ไม่เขียนกลไกราคาใหม่** — "ใส่ราคา" เปิด `RegistryPriceModal` ตัวเดียวกับหน้าใบ ยิง endpoint เดียวกัน ·
// ช่องราคาและราคาปัจจุบันมาจาก server (ตัวคิดเดียวกับ POST) ⇒ จอเปิดช่องที่ API ตีกลับไม่ได้
// ⚠️ ด่านปุ่ม = `canAnswerRequest` ตัวเดียวกับที่ API ใช้ปฏิเสธ (ไม่มีสิทธิ์ = ไม่เห็นปุ่ม · กฎ UI ของระบบ)
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Coins, ListChecks } from "lucide-react";
import Workspace, { ListPanel, Metric, MetricStrip } from "@/components/ui/Workspace";
import { TableGroupRow, TableScroll } from "@/components/ui/Table";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import StatusNotice from "@/components/ui/StatusNotice";
import GatedAction from "@/components/ui/GatedAction";
import StatusBadge from "@/components/ui/StatusBadge";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import RegistryPrice from "@/components/database/RegistryPrice";
import RegistryPriceModal from "@/components/database/RegistryPriceModal";
import IngredientListModal from "@/components/database/IngredientListModal";
import { apiJson } from "@/lib/apiFetch";
import { businessDate } from "@/lib/businessDate";
import { NA, fmtDate, fmtNumber, naText } from "@/lib/format";
import { notifyToast } from "@/lib/feedback";
import { useCapUser, useDepartment } from "@/lib/roleContext";
import { canAnswerRequest } from "@/lib/deptRequests";
import useLatestRun from "@/lib/ui/useLatestRun";
import useRevalidateOnFocus from "@/lib/ui/useRevalidateOnFocus";
import { priceBoardGroups, priceBoardTotals, usablePriceNote, waitingDays } from "@/lib/rd/priceBoard";
import styles from "./page.module.css";

// ⭐ จัดตารางใหม่ (ผู้ใช้ 03/11/2026: "ปรับ layout สี ตำแหน่ง ป้ายต่างๆ ของตารางหน่อย มันดูยาก") — สี่คอลัมน์:
//   รายการ (รหัสบน·ชื่อล่าง) · ลูกค้าคอนเฟิร์ม (+ รอกี่วัน) · ราคา · Ingredient List
//   สองคอลัมน์ท้าย = **สองก้าวที่ต้องครบ** (ม-159) ทรงเดียวกัน: ป้ายสถานะสีบนสุด → รายละเอียด → ปุ่ม
//   ⇒ กวาดตาแนวนอนเห็นทันทีว่ารายการไหนเหลืออะไร (เดิมหกคอลัมน์ ปุ่มลอยห่างจากราคาที่มันใช้ และ "—" ไม่บอกว่าแปลว่าอะไร)
const COLS = 4;
const PRICE_DIGITS = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

export default function RdPricesPage() {
  const me = useCapUser();
  const department = useDepartment();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [pricing, setPricing] = useState(null);
  const [linking, setLinking] = useState(null);
  // แถวที่กด "ใส่ Ingredient List" (ม-159) — เปิด `IngredientListModal` ตัวเดียวกับหน้าคำร้อง/หน้าสูตร
  const [ingredientRow, setIngredientRow] = useState(null);
  const [collapsed, setCollapsed] = useState({});
  const startRun = useLatestRun();

  /* ⚠️ ด่านของจอต้องเป็น **ฟังก์ชันตัวเดียวกับที่ API ใช้ปฏิเสธ** (`canAnswerRequest` ใน price/route.js) ·
     หน้านี้ตรึงฝ่ายเป็น RD อยู่แล้ว (เส้น API ก็ตรึง) จึงถามด้วยใบสมมติที่มีแค่ `dept` พอ */
  const canPrice = useMemo(
    () => canAnswerRequest({ ...me, department }, { dept: "RD" }),
    [me, department],
  );

  const load = useCallback(async (opts) => {
    const isLatest = startRun();
    if (!opts?.background) setLoading(true);
    if (!opts?.background) setLoadError("");
    try {
      const data = await apiJson("/api/rd/price-board", { cache: "no-store" });
      if (!isLatest()) return;
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      if (!isLatest()) return;
      if (!opts?.background) setLoadError(e.message);
    }
    if (isLatest()) setLoading(false);
  }, [startRun]);

  useEffect(() => { load(); }, [load]);
  useRevalidateOnFocus(load);

  // วันไทย ไม่ใช่วัน UTC — ก่อนเจ็ดโมงเช้า `toISOString()` ยังให้เมื่อวาน แล้ว "รอมาแล้ว" จะนับผิดไปหนึ่งวันทุกเช้า
  const today = businessDate();
  const totals = useMemo(() => priceBoardTotals(rows, { todayIso: today }), [rows, today]);
  const groups = useMemo(() => priceBoardGroups(rows, { todayIso: today }), [rows, today]);

  /* ใช้ราคาในทะเบียน — กล่องยืนยันบอกผลก่อนกด (กติกาของระบบ: ทุกก้าวที่ปิดงานต้องบอกว่าจะเกิดอะไร)
     ⚠️ ส่ง rev ที่จอเห็นไปด้วย — มีคนออกราคาใหม่ระหว่างที่หน้าเปิดค้าง server ตีกลับ 409 แทนการผูกเลขที่ไม่เคยเห็น */
  /* ⭐ ม-159 — ผลของการกดต่างกันตามว่าสูตรมี Ingredient List แล้วหรือยัง (ครบสองอย่างถึงจบ) ⇒ ประโยคบอกผลตามแถว */
  const applyCurrentPrice = async (row) => {
    const use = row.useCurrent;
    const ok = await confirmAction({
      title: "ใช้ราคาในทะเบียน",
      description: `ผูก${use.text} ${fmtNumber(use.unitPrice, PRICE_DIGITS)} ฿/กก.`
        + `${use.revisionNo != null ? ` (rev ${use.revisionNo})` : ""} เข้ารายการ "${row.name}" ของ ${naText(row.docNo)}`,
      detail: "ไม่ออกราคารุ่นใหม่ — ทะเบียนวัสดุไม่เปลี่ยน · "
        + (row.ingredient?.missing
          ? "รายการนี้ยังรอ Ingredient List ของสูตร — ใส่ครบแล้วถึงหายจากหน้านี้"
          : "รายการนี้ถือว่าใส่ราคาแล้วและหายจากหน้านี้ · ใบที่ครบทุกรายการจะขึ้นว่า RD ตอบแล้ว"),
      confirmLabel: "ใช้ราคานี้",
    });
    if (!ok) return;
    setLinking(row.itemId);
    try {
      await apiJson(`/api/sa/requests/${row.requestId}/items/${row.itemId}/price`, {
        method: "POST",
        json: { useCurrent: { revisionId: use.revisionId } },
        fallbackError: "ใช้ราคาในทะเบียนไม่สำเร็จ",
      });
      notifyToast(`ใช้ราคา ${use.short} แล้ว`);
    } catch (e) {
      notifyToast.error(e.message || "ใช้ราคาในทะเบียนไม่สำเร็จ");
    } finally {
      // ตีกลับ 4xx = จอไม่ตรงกับของจริง ⇒ ดึงใหม่ทั้งสองทาง (เบื้องหลัง — ตารางไม่หายทั้งก้อน)
      // ⚠️ ล็อกปุ่มของแถวจนตารางใหม่มาถึง — ปลดก่อน = แถวที่เพิ่งปิดยังกดซ้ำได้แล้วได้ 409 งง ๆ (กับดักเดียวกับหน้าใบ)
      try { await load({ background: true }); } finally { setLinking(null); }
    }
  };

  return (
    <Workspace
      icon={<Coins size={22} />}
      title="รอใส่ราคา"
      subtitle="รายการที่ลูกค้าคอนเฟิร์มแล้ว รอ RD ใส่ราคา F · B · FB และ Ingredient List ของสูตร — ครบแล้วรายการหายจากหน้านี้เอง"
    >
      <div className="flex flex-col gap-4">
        {/* ⚠️ 0 ก็เป็นข้อมูล — "รอใส่ราคา 0" คือคำตอบที่ RD เปิดหน้ามาเพื่อจะรู้ · ซ่อนตอนว่างแยกไม่ออกจาก "ยังโหลดไม่เสร็จ" */}
        {!loading && !loadError ? (
          <MetricStrip aria-label="ยอดรอใส่ราคาของฝ่าย">
            {/* ม-159 — สองก้าวแยกกัน (มาไม่พร้อมกัน) แต่รายการจบเมื่อครบ ⇒ นับแยก · แถวเดียวอาจอยู่ทั้งสองการ์ด */}
            <Metric
              label="รอใส่ราคา" value={`${totals.awaitingPrice} รายการ`}
              tone={totals.awaitingPrice > 0 ? "warning" : undefined}
            />
            <Metric
              label="รอ Ingredient List" value={`${totals.missingIngredients} รายการ`}
              tone={totals.missingIngredients > 0 ? "warning" : undefined}
              note="สูตรหมวด 01/02 (ยกเว้น 02-020)"
            />
            <Metric label="ใบคำร้อง" value={`${totals.requests} ใบ`} note="ใส่ครบใบ = RD ตอบใบนั้นแล้ว" />
            <Metric
              label="รอนานสุด" value={totals.maxDays != null ? `${totals.maxDays} วัน` : NA}
              note="นับจากวันที่ลูกค้าคอนเฟิร์ม"
            />
            {/* ⭐ นับเฉพาะแถวที่ปุ่ม "ใช้ราคา … นี้" กดแล้วผ่าน (`usable`) · แถวที่มีปุ่มแต่ราคาใช้ไม่ได้ (`blocked`)
                บอกไว้ในหมายเหตุ ⇒ สองเลขรวมกัน = แถวที่เห็นปุ่ม (ตรวจตัวเลข 26/10 · L15)
                🐞 เดิม "มีราคาในทะเบียนแล้ว" ไม่นับราคาหมดอายุ ทั้งที่มันมีราคาในทะเบียนและมีปุ่ม
                ⚠️ หมายเหตุเลือกตาม `canPrice` — คนที่ไม่มีปุ่ม (ช่องจัดการเป็น "—") ต้องไม่ได้ยินคำว่า "ปุ่ม"/"กด" */}
            <Metric
              label="ใช้ราคาในทะเบียนได้เลย" value={`${totals.usable} รายการ`}
              note={usablePriceNote(totals, { canPrice })}
            />
          </MetricStrip>
        ) : null}

        <ListPanel
          icon={<Coins size={17} aria-hidden="true" />}
          title="รายการรอราคา"
          subtitle="จัดกลุ่มตามใบคำร้อง — ใบที่รอนานสุดอยู่บนสุด · ราคาลงทะเบียนวัสดุ · Ingredient List ลงทะเบียนสูตร"
          count={loading || loadError ? null : `${totals.rows} รายการ`}
          loading={loading}
        >
          {loadError ? (
            <StatusNotice tone="error" className="mb-4" action={<Button size="sm" variant="ghost" onClick={() => load()}>ลองใหม่</Button>}>
              {loadError}
            </StatusNotice>
          ) : null}
          {!groups.length ? (
            loadError ? null : <EmptyState plain icon={Coins}>ไม่มีรายการรอใส่ราคาตอนนี้</EmptyState>
          ) : (
            <TableScroll cells="stacked">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className={styles.colItem}>รายการ</th>
                    <th className={styles.colConfirm}>ลูกค้าคอนเฟิร์ม</th>
                    <th className={styles.colStep}>ราคา (บาท/กก.)</th>
                    <th className={styles.colStep}>Ingredient List</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => (
                    <RowGroup
                      key={group.key}
                      group={group}
                      today={today}
                      canPrice={canPrice}
                      linking={linking}
                      collapsed={!!collapsed[group.key]}
                      onToggle={() => setCollapsed((c) => ({ ...c, [group.key]: !c[group.key] }))}
                      onPrice={setPricing}
                      onUseCurrent={applyCurrentPrice}
                      onIngredients={setIngredientRow}
                    />
                  ))}
                </tbody>
              </table>
            </TableScroll>
          )}
        </ListPanel>
      </div>

      {/* โมดัลกลางตัวเดียวกับหน้าใบ/หน้าทะเบียน — ช่องมาจาก server (ตัวคิดเดียวกับ POST) */}
      <RegistryPriceModal
        open={!!pricing}
        onClose={() => setPricing(null)}
        title={pricing ? `ใส่ราคา — ${pricing.name}` : ""}
        endpoint={pricing ? `/api/sa/requests/${pricing.requestId}/items/${pricing.itemId}/price` : ""}
        slots={pricing ? pricing.slots : null}
        blocker={pricing ? pricing.priceBlocker : ""}
        hint={pricing ? `ราคาเข้าทะเบียนวัสดุเป็นรุ่นใหม่ของกลิ่น/สูตรของรายการนี้${pricing.customerName ? ` (ราคาเฉพาะ ${pricing.customerName})` : ""}`
          + " — อ่านได้จากใบขอราคาผลิตและหน้าทะเบียนตามปกติ · ใส่อย่างน้อยหนึ่งช่อง" : null}
        onSaved={async (msg) => {
          const itemId = pricing?.itemId || null;
          setPricing(null);
          notifyToast(msg);
          // ⚠️ ล็อกปุ่มของแถวที่เพิ่งใส่จนตารางใหม่มาถึง (เหตุผลเดียวกับ "ใช้ราคานี้")
          setLinking(itemId);
          try { await load({ background: true }); } finally { setLinking(null); }
        }}
        onError={() => load({ background: true })}
      />

      {/* ม-159 — ก้าวแยกจากราคา · โมดัลตัวเดียวกับหน้าคำร้อง/หน้าสูตร · บันทึกแล้วแถวที่ใส่ราคาไว้จบเอง */}
      <IngredientListModal
        open={!!ingredientRow}
        onClose={() => setIngredientRow(null)}
        subtitle={ingredientRow ? `${ingredientRow.name} · ${naText(ingredientRow.docNo)}` : ""}
        current={ingredientRow?.ingredient?.current || null}
        endpoint={ingredientRow ? `/api/sa/requests/${ingredientRow.requestId}/items/${ingredientRow.itemId}/ingredients` : ""}
        hint={ingredientRow
          ? (ingredientRow.stage === "awaiting_ingredients"
            ? "ราคาใส่แล้ว — บันทึกแล้วรายการนี้ครบและหายจากหน้านี้ · ลงทะเบียนสูตร (FG และคำร้องอื่นที่ใช้สูตรนี้อ่านตัวเดียวกัน)"
            : "ลงทะเบียนสูตร — รายการยังรอราคาอยู่ ครบทั้งสองอย่างแล้วถึงจบ · ชื่อสาร INCI เรียงจากมากไปน้อย คั่นด้วยจุลภาค")
          : null}
        onSaved={async (msg) => {
          const itemId = ingredientRow?.itemId || null;
          setIngredientRow(null);
          notifyToast(msg);
          setLinking(itemId);
          try { await load({ background: true }); } finally { setLinking(null); }
        }}
        onError={() => load({ background: true })}
      />
    </Workspace>
  );
}

/* หนึ่งกอง = หนึ่งใบคำร้อง — หัวกองพับได้ · ยอดบนหัวกองเป็นยอดทั้งกอง · ลิงก์ไปใบอยู่ท้ายหัวกอง (ไม่ใช่ทั้งแถวคลิกได้) */
function RowGroup({ group, today, canPrice, linking, collapsed, onToggle, onPrice, onUseCurrent, onIngredients }) {
  const label = [group.docNo || "คำร้อง", group.customerName].filter(Boolean).join(" · ");
  return (
    <>
      <TableGroupRow
        colSpan={COLS}
        label={label}
        sub={group.customerArCode || null}
        badge={group.maxDays != null ? `รอนานสุด ${group.maxDays} วัน` : null}
        total={`${group.total} รายการ`}
        totalTitle="จำนวนรายการที่รอราคาในใบนี้"
        collapsed={collapsed}
        onToggle={onToggle}
        actions={<Link className="linklike" href={`/requests/${group.requestId}`}>เปิดใบคำร้อง</Link>}
      />
      {collapsed ? null : group.rows.map((row) => (
        <tr key={row.itemId}>
          <td><ItemCell row={row} /></td>
          <td>
            <div>{row.confirmedAt ? fmtDate(row.confirmedAt) : NA}</div>
            <div className={styles.sub}>
              {[
                row.confirmedQty != null ? `${fmtNumber(row.confirmedQty)}${row.unit ? ` ${row.unit}` : ""}` : null,
                (() => { const d = waitingDays(row, today); return d == null ? null : `รอมา ${d} วัน`; })(),
              ].filter(Boolean).join(" · ") || NA}
            </div>
          </td>
          <td>
            <PriceCell
              row={row} canPrice={canPrice} busy={linking === row.itemId}
              onPrice={onPrice} onUseCurrent={onUseCurrent}
            />
          </td>
          <td><IngredientCell row={row} canEdit={canPrice} busy={linking === row.itemId} onOpen={onIngredients} /></td>
        </tr>
      ))}
    </>
  );
}

/* รายการ — รหัสบน·ชื่อล่าง (กติกาแสดง entity ของตาราง) · บรรทัดรองบอกชนิดของในทะเบียน และของที่ขอมาถ้าชื่อไม่ตรงกัน */
function ItemCell({ row }) {
  const reg = row.registry;
  const kind = reg?.kind === "formula"
    ? `สูตร${reg.categoryCode ? ` ${reg.categoryCode}` : ""}`
    : reg?.kind === "scent" ? "กลิ่น (หัวน้ำหอม)" : "ยังไม่ผูกทะเบียน";
  const name = reg?.name || row.label || null;
  return (
    <>
      {reg?.code ? <div className={styles.code}>{reg.code}</div> : null}
      <div className={styles.name}>{naText(name)}</div>
      <div className={styles.sub}>
        {kind}
        {row.label && row.label !== name ? ` · ขอ: ${row.label}` : ""}
      </div>
    </>
  );
}

/* ── ก้าวราคา (F · B · FB) — ป้ายสถานะ → ราคาที่มีในทะเบียน → ปุ่ม ─────────────────────────────────────────
   ⚠️ ปุ่มวางตาม `canPrice` (ด่านเดียวกับ API) · ไม่มีราคาในทะเบียนสักช่อง = ไม่มีปุ่ม "ใช้ราคานี้" · หมดอายุ = มีปุ่มแล้วบอกเหตุ */
function PriceCell({ row, canPrice, busy, onPrice, onUseCurrent }) {
  const priced = row.stage === "awaiting_ingredients";
  return (
    <div className={styles.step}>
      <StatusBadge size="sm" tone={priced ? "success" : "warning"} label={priced ? "ใส่ราคาแล้ว" : "รอใส่ราคา"} />
      <CurrentPrices row={row} />
      {!priced && canPrice ? (
        <div className={styles.actions}>
          {row.useCurrent ? (
            <GatedAction
              blocker={row.useCurrentBlocker}
              size="sm" tone="primary" icon={<Check size={14} />}
              disabled={busy}
              onClick={() => onUseCurrent(row)}
            >
              ใช้ราคา {row.useCurrent.short} นี้
            </GatedAction>
          ) : null}
          <GatedAction
            blocker={row.priceBlocker}
            size="sm" tone={row.useCurrent ? undefined : "primary"} variant={row.useCurrent ? "quiet" : "filled"}
            icon={<Coins size={14} />}
            disabled={busy}
            onClick={() => onPrice(row)}
          >
            {row.useCurrent ? "ใส่ราคาใหม่" : "ใส่ราคา"}
          </GatedAction>
        </div>
      ) : null}
    </div>
  );
}

/* ── ก้าว Ingredient List ของสูตรที่แถวผูก (ม-159) — ทรงเดียวกับก้าวราคา ──────────────────────────────────
   ไม่ต้องมี (กลิ่นล้วน · 02-020) = บอกเป็นคำ ไม่ใช่ขีดลอย ๆ · มีแล้ว = ป้ายเขียว · ยังไม่มี = ป้ายส้ม + ปุ่ม
   ⭐ **ปุ่มหลักทุกแถว** (ผู้ใช้ 03/11/2026 "ปุ่ม ใส่ ingredient ให้เด่นกว่านี้") — เดิมเป็นปุ่มจางตอนยังรอราคา จนอ่านเหมือนลิงก์
   ทั้งที่เป็นก้าวบังคับเท่ากับราคา (ครบสองอย่างถึงจบ) ⇒ น้ำหนักเท่าปุ่ม "ใส่ราคา" · ปุ่มเฉพาะคนที่ตอบฝ่ายนี้ได้ (ด่านเดียวกับ API) */
function IngredientCell({ row, canEdit, busy, onOpen }) {
  const plan = row.ingredient || {};
  if (!plan.required) {
    return (
      <span className={styles.dim} title="ไม่ผูกสูตร หรือเป็นสูตรหัวน้ำหอม 02-020">ไม่ต้องใส่</span>
    );
  }
  if (!plan.missing) return <StatusBadge size="sm" tone="success" label="มีแล้ว" />;
  return (
    <div className={styles.step}>
      <StatusBadge size="sm" tone="warning" label="ยังไม่มี" />
      {canEdit ? (
        <div className={styles.actions}>
          <Button
            size="sm" tone="primary" icon={<ListChecks size={14} aria-hidden="true" />}
            disabled={busy} onClick={() => onOpen(row)}
          >
            ใส่ Ingredient List
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/* ราคาที่มีอยู่แล้วในทะเบียน ทุกช่องที่แถวนี้ใส่ได้ — ช่องที่ยังไม่มีราคาบอกตรง ๆ (ไม่ซ่อน) เพราะคือช่องที่ RD ต้องใส่
   ⚠️ ชิ้นแสดงราคาตัวเดียวกับหน้าทะเบียน (`RegistryPrice`) — สามสถานะ (ยังไม่ผูก · รอราคา · หมดอายุ) อ่านเหมือนกันทุกจอ */
function CurrentPrices({ row }) {
  if (!row.current?.length) return <span className={styles.dim}>{NA}</span>;
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
