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
import { Check, Coins } from "lucide-react";
import Workspace, { ListPanel, Metric, MetricStrip } from "@/components/ui/Workspace";
import { TableGroupRow, TableScroll } from "@/components/ui/Table";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import StatusNotice from "@/components/ui/StatusNotice";
import GatedAction from "@/components/ui/GatedAction";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import RegistryPrice from "@/components/database/RegistryPrice";
import RegistryPriceModal from "@/components/database/RegistryPriceModal";
import { apiJson } from "@/lib/apiFetch";
import { businessDate } from "@/lib/businessDate";
import { NA, fmtDate, fmtNumber, naText } from "@/lib/format";
import { notifyToast } from "@/lib/feedback";
import { useCapUser, useDepartment } from "@/lib/roleContext";
import { canAnswerRequest } from "@/lib/deptRequests";
import useLatestRun from "@/lib/ui/useLatestRun";
import useRevalidateOnFocus from "@/lib/ui/useRevalidateOnFocus";
import { priceBoardGroups, priceBoardTotals, waitingDays } from "@/lib/rd/priceBoard";
import styles from "./page.module.css";

const COLS = 5;
const PRICE_DIGITS = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

export default function RdPricesPage() {
  const me = useCapUser();
  const department = useDepartment();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [pricing, setPricing] = useState(null);
  const [linking, setLinking] = useState(null);
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
  const applyCurrentPrice = async (row) => {
    const use = row.useCurrent;
    const ok = await confirmAction({
      title: "ใช้ราคาในทะเบียน",
      description: `ผูก${use.text} ${fmtNumber(use.unitPrice, PRICE_DIGITS)} ฿/กก.`
        + `${use.revisionNo != null ? ` (rev ${use.revisionNo})` : ""} เข้ารายการ "${row.name}" ของ ${naText(row.docNo)}`,
      detail: "ไม่ออกราคารุ่นใหม่ — ทะเบียนวัสดุไม่เปลี่ยน · รายการนี้ถือว่าใส่ราคาแล้วและหายจากหน้านี้"
        + " · ใบที่ใส่ราคาครบทุกรายการจะขึ้นว่า RD ตอบแล้ว",
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
      subtitle="รายการที่ลูกค้าคอนเฟิร์มแล้ว รอ RD ใส่ราคา F · B · FB — ใส่เสร็จแล้วรายการหายจากหน้านี้เอง"
    >
      <div className="flex flex-col gap-4">
        {/* ⚠️ 0 ก็เป็นข้อมูล — "รอใส่ราคา 0" คือคำตอบที่ RD เปิดหน้ามาเพื่อจะรู้ · ซ่อนตอนว่างแยกไม่ออกจาก "ยังโหลดไม่เสร็จ" */}
        {!loading && !loadError ? (
          <MetricStrip aria-label="ยอดรอใส่ราคาของฝ่าย">
            <Metric
              label="รอใส่ราคา" value={`${totals.rows} รายการ`}
              tone={totals.rows > 0 ? "warning" : undefined}
            />
            <Metric label="ใบคำร้อง" value={`${totals.requests} ใบ`} note="ใส่ครบใบ = RD ตอบใบนั้นแล้ว" />
            <Metric
              label="รอนานสุด" value={totals.maxDays != null ? `${totals.maxDays} วัน` : NA}
              note="นับจากวันที่ลูกค้าคอนเฟิร์ม"
            />
            <Metric label="มีราคาในทะเบียนแล้ว" value={`${totals.usable} รายการ`} note={'กด "ใช้ราคานี้" ได้เลย ไม่ต้องพิมพ์ซ้ำ'} />
          </MetricStrip>
        ) : null}

        <ListPanel
          icon={<Coins size={17} aria-hidden="true" />}
          title="รายการรอราคา"
          subtitle="จัดกลุ่มตามใบคำร้อง — ใบที่รอนานสุดอยู่บนสุด · ราคาลงทะเบียนวัสดุของกลิ่น/สูตรตามปกติ"
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
            <TableScroll>
              <table className="w-full">
                <thead>
                  <tr>
                    <th>รายการ</th>
                    <th>ลูกค้าคอนเฟิร์ม</th>
                    <th className="num">รอมาแล้ว</th>
                    <th>ราคาในทะเบียน</th>
                    <th>ใส่ราคา</th>
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
    </Workspace>
  );
}

/* หนึ่งกอง = หนึ่งใบคำร้อง — หัวกองพับได้ · ยอดบนหัวกองเป็นยอดทั้งกอง · ลิงก์ไปใบอยู่ท้ายหัวกอง (ไม่ใช่ทั้งแถวคลิกได้) */
function RowGroup({ group, today, canPrice, linking, collapsed, onToggle, onPrice, onUseCurrent }) {
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
          <td>
            <div>{naText(row.name)}</div>
            <div className={styles.sub}>
              {row.registry?.kind === "formula" ? `สูตร${row.registry.categoryCode ? ` ${row.registry.categoryCode}` : ""}` : "กลิ่น"}
              {row.label && row.label !== row.name ? ` · ขอ: ${row.label}` : ""}
            </div>
          </td>
          <td>
            {row.confirmedAt ? fmtDate(row.confirmedAt) : NA}
            {row.confirmedQty != null ? (
              <div className={styles.sub}>{fmtNumber(row.confirmedQty)}{row.unit ? ` ${row.unit}` : ""}</div>
            ) : null}
          </td>
          <td className="num">
            {(() => {
              const d = waitingDays(row, today);
              return d == null ? NA : `${d} วัน`;
            })()}
          </td>
          <td><CurrentPrices row={row} /></td>
          <td>
            {canPrice ? (
              <div className={styles.actions}>
                {/* ⚠️ ไม่มีราคาในทะเบียนสักช่อง = ไม่มีอะไรให้ใช้ ⇒ ไม่โชว์ปุ่ม (ไม่ใช่ด่าน) · มีแต่หมดอายุ = โชว์แล้วบอกเหตุ */}
                {row.useCurrent ? (
                  <GatedAction
                    blocker={row.useCurrentBlocker}
                    size="sm" tone="primary" icon={<Check size={14} />}
                    disabled={linking === row.itemId}
                    onClick={() => onUseCurrent(row)}
                  >
                    ใช้ราคา {row.useCurrent.short} นี้
                  </GatedAction>
                ) : null}
                <GatedAction
                  blocker={row.priceBlocker}
                  size="sm" tone={row.useCurrent ? undefined : "primary"} variant={row.useCurrent ? "quiet" : "filled"}
                  icon={<Coins size={14} />}
                  disabled={linking === row.itemId}
                  onClick={() => onPrice(row)}
                >
                  {row.useCurrent ? "ใส่ราคาใหม่" : "ใส่ราคา"}
                </GatedAction>
              </div>
            ) : <span className={styles.dim}>{NA}</span>}
          </td>
        </tr>
      ))}
    </>
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
