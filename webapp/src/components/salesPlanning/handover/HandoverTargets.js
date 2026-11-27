"use client";
// ── แบ่งเป้ารายเดือนของคนลาออกให้หลายคน (มติเจ้าของ 27/11/2026 ข้อ 5) ─────────────────────────────
// กรอกยอดรายเดือนต่อคน · ผลรวมแต่ละแถว (เดือน × ทีม) ต้องเท่าเป้าเดิมพอดีจึงกดโอนได้ · ปุ่มเกลี่ยเท่ากันช่วยเติม
// ตัวตรวจผลรวมฝั่ง server = `validateTargetSplit` (lib/sales/handover.js) ตัวเดียวกับที่จอใช้
import { useMemo, useState } from "react";
import { Check, Equal, Target, X } from "lucide-react";
import Button from "@/components/ui/Button";
import MoneyInput from "@/components/ui/MoneyInput";
import PersonSelect from "@/components/ui/PersonSelect";
import { TableScroll } from "@/components/ui/Table";
import { apiJson } from "@/lib/apiFetch";
import { fmtMoney, NA, naText } from "@/lib/format";
import { userTeams } from "@/lib/permissions";
import { validateTargetSplit } from "@/lib/sales/handover";
import styles from "./handover.module.css";

const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
export const monthLabel = (period) => {
  const [y, m] = String(period || "").split("-").map(Number);
  return y && m ? `${MONTHS[m - 1]} ${y + 543}` : period;
};

/** เกลี่ยยอดเท่ากัน ปัดลงหลักพัน · เศษไปที่คนสุดท้าย (ผลรวมเท่าเป้าเดิมพอดีเสมอ) */
export function evenSplit(amount, count) {
  if (!count) return [];
  const base = Math.floor(Number(amount || 0) / count / 1000) * 1000;
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? Number(amount || 0) - base * (count - 1) : base));
}

export default function HandoverTargets({ fromId, rows = [], holders = [], onDone, onToast }) {
  const [who, setWho] = useState([]);
  const [split, setSplit] = useState({}); // `${rowId}|${userId}` → amount
  const [busy, setBusy] = useState(false);
  const byId = useMemo(() => new Map(holders.map((u) => [String(u.id), u])), [holders]);
  const key = (rowId, userId) => `${rowId}|${userId}`;
  const amountOf = (rowId, userId) => split[key(rowId, userId)] ?? "";

  const items = rows.flatMap((row) => who.map((userId) => ({ sourceId: row.id, toUserId: userId, amount: Number(amountOf(row.id, userId) || 0) })));
  const check = who.length ? validateTargetSplit(rows, items) : { ok: false, error: "เพิ่มคนรับเป้าอย่างน้อย 1 คน" };
  const teamFor = (userId, rowTeam) => {
    const teams = userTeams(byId.get(String(userId)));
    return teams.includes(rowTeam) ? rowTeam : (teams[0] || rowTeam);
  };

  const fillEven = () => {
    const next = { ...split };
    for (const row of rows) {
      evenSplit(row.targetAmount, who.length).forEach((amount, i) => { next[key(row.id, who[i])] = amount; });
    }
    setSplit(next);
  };
  const remove = (userId) => {
    setWho((list) => list.filter((id) => id !== userId));
    setSplit((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !k.endsWith(`|${userId}`))));
  };
  const save = async () => {
    if (!check.ok) return;
    setBusy(true);
    try {
      const data = await apiJson(`/api/users/${encodeURIComponent(fromId)}/transfer`, {
        method: "POST", json: { split: items.filter((x) => x.amount > 0) }, fallbackError: "โอนเป้าไม่สำเร็จ",
      });
      onToast?.({ kind: "success", msg: `โอนเป้า ${data.rows} แถว (${fmtMoney(data.total)}) ให้ ${(data.receivers || []).join(", ")} แล้ว` });
      onDone?.({ receivers: data.receivers || [], rows, split: items });
    } catch (error) {
      onToast?.({ kind: "error", msg: error.message });
    } finally {
      setBusy(false);
    }
  };

  const available = holders.filter((u) => !who.includes(String(u.id)));
  return (
    <section className="ui-table-shell">
      <header className="ui-table-header">
        <div>
          <h2>เป้ารายเดือนที่เหลือ</h2>
          <p>ตั้งแต่เดือนถัดไป · เดือนที่ผ่านมาแล้วและเดือนนี้ไม่แตะ · ผลรวมแต่ละเดือนต้องเท่าเป้าเดิมพอดี</p>
        </div>
        <div className="ui-section-actions">
          <Button size="sm" icon={<Equal size={14} />} disabled={!who.length} onClick={fillEven}>เกลี่ยเท่ากัน</Button>
        </div>
      </header>
      <div className="ui-table-toolbar">
        <div className={styles.receivers}>
          {who.map((userId) => (
            <span key={userId} className={styles.receiverTag}>
              {byId.get(userId)?.name || userId}
              <Button iconOnly size="sm" variant="quiet" aria-label={`เอา ${byId.get(userId)?.name || ""} ออก`} onClick={() => remove(userId)}>
                <X size={13} />
              </Button>
            </span>
          ))}
          <div className={styles.receiverPicker}>
            <PersonSelect users={available} value="" size="sm" emptyLabel="เพิ่มคนรับเป้า…" ariaLabel="เพิ่มคนรับเป้า"
              onChange={(id) => { if (id) setWho((list) => [...list, String(id)]); }} />
          </div>
        </div>
      </div>
      <TableScroll family="list" surface="embedded">
        <table>
          <thead>
            <tr>
              <th>เดือน</th>
              <th>ทีม</th>
              <th className="num">เป้าเดิม</th>
              {who.map((userId) => <th key={userId}>{byId.get(userId)?.name || userId}</th>)}
              <th className="num">รวม</th>
              <th aria-label="สถานะ" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const sum = who.reduce((s, userId) => s + Number(amountOf(row.id, userId) || 0), 0);
              const diff = Number(row.targetAmount || 0) - sum;
              return (
                <tr key={row.id}>
                  <td>{monthLabel(row.period)}</td>
                  <td>{naText(row.team)}</td>
                  <td className="num">{fmtMoney(row.targetAmount)}</td>
                  {who.map((userId) => (
                    <td key={userId} className={styles.splitCell}>
                      <MoneyInput value={amountOf(row.id, userId)} aria-label={`เป้า ${monthLabel(row.period)} ของ ${byId.get(userId)?.name || ""}`}
                        onChange={(value) => setSplit((prev) => ({ ...prev, [key(row.id, userId)]: value }))} />
                      <div className={styles.splitTeam}>ลงทีม {teamFor(userId, row.team)}</div>
                    </td>
                  ))}
                  <td className="num">{fmtMoney(sum)}</td>
                  <td>
                    {!who.length ? NA : diff === 0
                      ? <span className={styles.sumOk}><Check size={13} aria-hidden="true" /> ครบ</span>
                      : <span className={styles.sumBad}>{diff > 0 ? "ขาด" : "เกิน"} {fmtMoney(Math.abs(diff))}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableScroll>
      <div className={styles.footerRow}>
        <span className={check.ok ? styles.hint : styles.sumBad}>
          {check.ok ? "ครบทุกเดือนแล้ว — เป้าของคนต้นทางจะเป็น 0 และโน้ตว่าโอนให้ใคร" : check.error}
        </span>
        <Button tone="primary" icon={<Target size={15} />} disabled={!check.ok || busy} onClick={save}>โอนเป้า</Button>
      </div>
    </section>
  );
}
