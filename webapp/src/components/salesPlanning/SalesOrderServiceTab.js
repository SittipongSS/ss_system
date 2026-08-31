"use client";
// ── แท็บ "งานบริการ" ของใบสั่งขาย (PR-F · แผน §3.4) ─────────────────────────
//
// ⭐ ตอบสามคำถามที่ฝ่ายขายถามจริงเวลาเปิดใบบริการ:
//   ของที่ขายไป **ลงโซนครบหรือยัง** · ไซต์ **วางรอบแล้วหรือยัง** · **เดินไปกี่รอบแล้ว**
//
// ⚠️ **โหลดตอนกดเข้าแท็บเท่านั้น** — ข้อมูลชุดนี้ยิงถึง 5 ตาราง และใบส่วนใหญ่ในระบบ
//   เป็นสายสินค้าซึ่งไม่มีแท็บนี้เลย ⇒ ยัดรวมใน GET ของใบ = ทุกคนจ่ายค่าคิวรีที่ไม่ได้ใช้
//
// ⚠️ เหตุที่นัดติดด่านมาจาก `evaluateVisitGate` ตัวเดียวกับที่ตารางจัดคิวของ TS ใช้ —
//   ห้ามเขียนคำอธิบายเองที่นี่ ไม่งั้นสองจอบอกคนละเรื่อง (โรคเดิมของโมดูลนี้)
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarCheck2, MapPin, PackageCheck, Repeat } from "lucide-react";
import { DetailCard } from "@/components/ui/DetailPage";
import Button from "@/components/ui/Button";
import StatusNotice from "@/components/ui/StatusNotice";
import SkeletonRows from "@/components/ui/Skeleton";
import { TableScroll } from "@/components/ui/Table";
import { fmtNumber, naText, NA } from "@/lib/format";
import { apiFetch } from "@/lib/apiFetch";

export default function SalesOrderServiceTab({ orderId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch(`/api/sales-planning/sales-orders/${orderId}/service`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "โหลดสรุปงานบริการไม่สำเร็จ");
      setData(body);
    } catch (e) {
      setError(e.message || "โหลดสรุปงานบริการไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [orderId]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <DetailCard icon={MapPin} title="งานบริการของใบนี้"><SkeletonRows rows={4} /></DetailCard>;
  if (error) return <StatusNotice tone="error" title="โหลดสรุปงานบริการไม่สำเร็จ">{error}</StatusNotice>;
  if (!data) return null;

  const { allocation, plans, visits, rounds } = data;

  return (
    <>
      {/* ── 1. ของที่ขายไปลงโซนครบหรือยัง ─────────────────────────────── */}
      <DetailCard
        icon={PackageCheck}
        eyebrow="ALLOCATION"
        title="การจัดสรรลงโซน"
        meta={allocation.complete
          ? `ลงครบแล้ว ${allocation.sites.length} ไซต์`
          : `ยังเหลือ ${fmtNumber(allocation.remaining)} หน่วยที่ยังไม่ได้ลงโซน`}
      >
        {/* ⚠️ นับ FG + จำนวน ไม่ใช่จำนวนบรรทัด — บรรทัดเป็นรูปร่างของเอกสารขาย
            ไม่ใช่ขนาดของงาน (มติผู้ใช้ 2026-08-29 · เกณฑ์เดียวกับคิวรับงานของ TS) */}
        <TableScroll surface="embedded" cells="stacked" minWidth={640}>
          <table className="w-full text-sm">
            <thead><tr>
              <th>รายการที่ขาย</th>
              <th className="num">ขายไว้</th>
              <th className="num">ยังไม่ลงโซน</th>
            </tr></thead>
            <tbody>
              {allocation.fg.map((group) => (
                <tr key={group.key} className="premium-row">
                  <td>
                    {group.fgCode ? <span className="mono">{group.fgCode}</span> : null}
                    <span className="cell-sub cell-ellipsis">{naText(group.description)}</span>
                  </td>
                  <td className="num mono">{fmtNumber(group.qty)} {group.unit || ""}</td>
                  <td className={`num mono ${group.remaining > 0 ? "cell-num-bad" : "cell-num-ok"}`}>
                    {group.remaining > 0 ? fmtNumber(group.remaining) : "ครบ"}
                  </td>
                </tr>
              ))}
              {!allocation.fg.length && (
                <tr><td colSpan={3} className="cell-num-idle">ใบนี้ยังไม่มีรายการที่ต้องจัดสรร</td></tr>
              )}
            </tbody>
          </table>
        </TableScroll>
      </DetailCard>

      {/* ── 2. ไซต์ที่ใบนี้ลงไปแล้ว + สถานะรอบ ────────────────────────── */}
      <DetailCard
        icon={MapPin}
        eyebrow="SITES"
        title="ไซต์ที่งานนี้ลงไป"
        meta={plans.sitesWithoutPlan
          ? `${plans.sitesWithoutPlan} ไซต์ยังไม่มีรอบบริการ — ฝ่ายบริการต้องวางรอบก่อนถึงจะมีนัด`
          : `วางรอบครบแล้ว ${plans.total} รอบ`}
      >
        <TableScroll surface="embedded" cells="stacked" minWidth={640}>
          <table className="w-full text-sm">
            <thead><tr>
              <th>ไซต์ / ลูกค้า</th>
              <th>โซนที่ผูก</th>
              <th className="num">จำนวนที่ลง</th>
              <th aria-label="การกระทำ" />
            </tr></thead>
            <tbody>
              {allocation.sites.map((row) => (
                <tr key={row.siteId} className="premium-row">
                  <td>
                    {naText(row.site?.name)}
                    <span className="cell-sub">{naText(row.site?.customerName)}</span>
                  </td>
                  <td className="cell-ellipsis">{row.zones.map((z) => z.name).join(" · ") || NA}</td>
                  <td className="num mono">{row.packageQty ? fmtNumber(row.packageQty) : NA}</td>
                  <td>
                    <Button as={Link} prefetch={false} href={`/service/sites/${row.siteId}`} tone="neutral" size="sm">
                      เปิดหน้าไซต์
                    </Button>
                  </td>
                </tr>
              ))}
              {!allocation.sites.length && (
                <tr>
                  <td colSpan={4} className="cell-num-idle">
                    ยังไม่มีไซต์ — ฝ่ายบริการต้องรับใบนี้เข้าไซต์แล้วจัดสรรลงโซนก่อน
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableScroll>
      </DetailCard>

      {/* ── 3. นัดข้างหน้า + กระทบยอดรอบ ──────────────────────────────── */}
      <DetailCard icon={CalendarCheck2} eyebrow="VISITS" title="นัดข้างหน้าและรอบที่เดินไปแล้ว">
        <div className="form-grid cols-2">
          <div className="form-field">
            <span className="form-field-label">นัดข้างหน้า</span>
            <span>
              {visits.ahead ? `${fmtNumber(visits.ahead)} นัด` : "ยังไม่มีนัดข้างหน้า"}
              {visits.ahead ? ` — ผ่านด่าน ${fmtNumber(visits.passed)} · ติด ${fmtNumber(visits.blocked)}` : ""}
            </span>
          </div>
          <div className="form-field">
            <span className="form-field-label">
              <Repeat size={14} aria-hidden="true" /> รอบที่เดินไปแล้ว
            </span>
            {/* ⚠️ "ขายไว้" ยังไม่ระบุ = ขีด ไม่ใช่ n/0 ซึ่งอ่านเหมือนขายศูนย์รอบ */}
            <span className={rounds.sold && rounds.done >= rounds.sold ? "cell-num-ok" : undefined}>
              {rounds.sold ? `${fmtNumber(rounds.done)} / ${fmtNumber(rounds.sold)} รอบ` : `${fmtNumber(rounds.done)} รอบ (ยังไม่ระบุจำนวนที่ขาย)`}
            </span>
          </div>
        </div>

        {/* เหตุที่ติดมาจากด่านตัวจริง — บอกเหตุที่พบบ่อยที่สุดข้อเดียว ไม่ไล่ทุกนัด
            (ถ้าอยากเห็นรายนัด กดเข้าไปที่ตารางจัดคิวของฝ่ายบริการ) */}
        {visits.blocked > 0 && visits.topReason && (
          <StatusNotice tone="warning" title={`มีนัดติดด่าน ${fmtNumber(visits.blocked)} นัด`}>
            เหตุที่พบบ่อยที่สุด: {visits.topReason.reason}
          </StatusNotice>
        )}

        <div className="form-actions-buttons">
          <Button as={Link} prefetch={false} href="/service/schedule" tone="neutral" size="sm">
            เปิดตารางจัดคิวของฝ่ายบริการ
          </Button>
        </div>
      </DetailCard>
    </>
  );
}
