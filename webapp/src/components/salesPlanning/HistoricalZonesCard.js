"use client";
// ── การ์ด "โซนในใบนี้" ของใบสั่งขายย้อนหลัง (มติ 22/09 · mig 0374 · ม็อก SoStatus) ─────────────
//
// ⭐ ใบย้อนหลัง **ผูกโซนตั้งแต่ตอนคีย์ใบ** (หนึ่งบรรทัด = หนึ่งโซน · `sales_order_lines."serviceZoneId"`)
//   ⇒ คำถามแรกของคนเปิดใบคือ "ของลงไซต์ไหนบ้าง แล้วฝ่าย TS ตั้งรอบหรือยัง" ซึ่งตารางรายการ
//   ตอบไม่ได้เลย (มันโชว์ FG/จำนวน/ราคา ไม่มีชื่อไซต์หรือโซนสักคอลัมน์)
//
// ⚠️ **ไม่คิดสถานะเอง** — ทั้งสถานะรายโซนและการนับมาจาก `historicalOrderCopy` ตัวเดียวกับรางก้าว
//   (สองที่คิดเองเมื่อไร หัวใบกับการ์ดจะบอกคนละเรื่องทันที — โรคเดิมของโมดูลนี้)
// ⚠️ **ไม่มี style={{…}} แม้แต่ที่เดียว** — งบ inlineStyle ของโมดูลขายเต็มเพดานสองทาง (audit:ui)
//   ⇒ ใช้ตระกูล <TableScroll> + คลาสร่วม `.cell-sub` / `.num` / `.mono` ที่มีอยู่แล้วใน globals.css
import { MapPin } from "lucide-react";
import { DetailCard } from "@/components/ui/DetailPage";
import StatusNotice from "@/components/ui/StatusNotice";
import { TableScroll } from "@/components/ui/Table";
import { fmtMoney, fmtNumber, naText, NA } from "@/lib/format";
import { historicalZoneState } from "@/lib/sales/historicalOrderCopy";

/**
 * @param order          ใบ (อ่าน `status` · `lines` เป็นตัวถอยเมื่อของเสริมไม่มา)
 * @param lineZones      ของเสริมจาก GET ของใบ — `[{ lineId, zoneId, zoneCode, zoneName, siteCode, siteName, siteId, packs, rounds, lineTotal }]`
 * @param plannedSiteIds ไซต์ที่ฝ่าย TS ตั้งรอบแล้ว (historicalServiceProgress) · `null` = ยังไม่รู้
 * @param loadingPlans   กำลังยิงเส้นสรุปงานบริการอยู่ — สถานะรายโซนพูดว่า "กำลังตรวจ" ไม่ใช่ "ยังไม่ตั้ง"
 * @param extrasError    ของเสริมของใบโหลดไม่ขึ้น (หน้าใบส่งมาให้) — ต้องดัง ไม่ใช่การ์ดว่าง
 */
export default function HistoricalZonesCard({
  order, lineZones = [], plannedSiteIds = null, loadingPlans = false, extrasError = null,
}) {
  const zones = Array.isArray(lineZones) ? lineZones : [];
  const packsOf = (zone) => {
    // ⚠️ ว่าง ≠ 0 แพ็ค (`Number(null)` = 0) — ไม่มีค่าในของเสริมก็ถอยไปอ่านบรรทัดของใบ
    if (String(zone.packs ?? "").trim() && Number.isFinite(Number(zone.packs))) return Number(zone.packs);
    const line = (order?.lines || []).find((l) => l.serviceZoneId === zone.zoneId);
    return Number(line?.qty) || 0;
  };
  const totalPacks = zones.reduce((sum, zone) => sum + packsOf(zone), 0);
  const meta = zones.length
    ? `${fmtNumber(zones.length)} โซน · ${fmtNumber(totalPacks)} แพ็ค — โซนผูกจากทะเบียนไซต์ตอนคีย์ใบแล้ว ฝ่าย TS ตั้งรอบต่อได้เลย`
    : "โซนของใบนี้";

  return (
    <DetailCard icon={MapPin} eyebrow="SERVICE ZONES" title="โซนในใบนี้" meta={meta}>
      {zones.length ? (
        <TableScroll family="editable" surface="embedded" cells="stacked" minWidth={520}>
          <table className="w-full text-sm">
            <thead><tr>
              <th>ไซต์ · โซน</th>
              <th className="num">แพ็ค</th>
              <th className="num">รอบ</th>
              <th className="num">ยอด</th>
              <th>สถานะรอบ</th>
            </tr></thead>
            <tbody>
              {zones.map((zone) => (
                <tr key={zone.lineId || zone.zoneId}>
                  <td>
                    {naText(zone.zoneName)}
                    <span className="cell-sub">
                      {[zone.siteCode, zone.siteName].filter(Boolean).join(" ") || NA} · {naText(zone.zoneCode)}
                    </span>
                  </td>
                  <td className="num">{fmtNumber(packsOf(zone))}</td>
                  <td className="num">{zone.rounds == null ? NA : `${fmtNumber(zone.rounds)} รอบ`}</td>
                  <td className="num">{zone.lineTotal == null ? NA : fmtMoney(zone.lineTotal)}</td>
                  <td>{historicalZoneState(order, zone, { plannedSiteIds, loading: loadingPlans })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      ) : (
        /* ⚠️ ว่างเพราะโหลดไม่ขึ้น ≠ ใบไม่มีโซน — ใบย้อนหลังต้องมีอย่างน้อย 1 โซนเสมอ (ด่านของ RPC) */
        <StatusNotice tone={extrasError ? "error" : "warning"} title={extrasError ? "โหลดโซนของใบไม่ขึ้น" : "ใบนี้ยังไม่มีโซน"}>
          {extrasError
            ? `${extrasError} — เปิดหน้าใหม่อีกครั้ง หรือดูที่แท็บงานบริการ`
            : "ใบย้อนหลังต้องมีอย่างน้อย 1 โซน — แก้ที่ฟอร์มคีย์ใบ"}
        </StatusNotice>
      )}
    </DetailCard>
  );
}
