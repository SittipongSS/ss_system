"use client";
// ── การ์ด "ผลติดตั้งสำหรับทำสัญญา" ในแท็บสัญญาของใบสั่งขาย (ขั้นเข้าติดตั้ง PR-5c · ม็อก A6 · มติ 09/11/2026) ─────────
//
// ⭐ สัญญาเป็นราย SO และทำ **หลังทุกไซต์ที่เลือกติดตั้งเสร็จ** — สัญญาระบุจำนวนเครื่องและจุดที่ติด ⇒ การ์ดนี้รวมผลจริง
//    ทุกไซต์: ไซต์ · โซน · รุ่น/สี · รหัสเครื่อง · วันติดตั้ง · ใบส่งงาน + ไซต์ Service (เครื่องที่อยู่แล้วจากทะเบียนเครื่อง)
// ⚠️ อ่านอย่างเดียว · ระบบ **ชี้ ไม่ล็อก ไม่เติม** — ปุ่มออกสัญญาเดิมกดได้ตลอด (การ์ดข้างล่าง) · ยังไม่เติมค่าลงสัญญาให้เอง
// ⚠️ ข้อมูลจาก GET `/install` ก้อนเดียวกับการ์ดบนแท็บภาพรวม (`contract` = `installContractView` ฝั่ง server)
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PackageCheck } from "lucide-react";
import { DetailCard } from "@/components/ui/DetailPage";
import Button from "@/components/ui/Button";
import StatusBadge from "@/components/ui/StatusBadge";
import StatusNotice from "@/components/ui/StatusNotice";
import { TableScroll } from "@/components/ui/Table";
import { apiJson } from "@/lib/apiFetch";
import { NA, fmtDate } from "@/lib/format";
import styles from "./InstallContractCard.module.css";

export default function InstallContractCard({ orderId, onLoaded }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const next = await apiJson(`/api/sales-planning/sales-orders/${orderId}/install`, { fallbackError: "โหลดผลติดตั้งไม่สำเร็จ" });
      setData(next);
      onLoaded?.(next);
    } catch (e) {
      setError(e?.message || "โหลดผลติดตั้งไม่สำเร็จ");
    }
  }, [orderId, onLoaded]);

  useEffect(() => { load(); }, [load]);

  if (error) {
    return (
      <DetailCard icon={PackageCheck} eyebrow="INSTALLATION RESULT" title="ผลติดตั้งสำหรับทำสัญญา">
        <StatusNotice tone="error" action={<Button size="sm" variant="ghost" onClick={load}>ลองใหม่</Button>}>{error}</StatusNotice>
      </DetailCard>
    );
  }
  /* สวิตช์ปิด / ใบไม่มีไซต์ / ยังไม่มีไซต์ไหนตอบ = ไม่มีการ์ด */
  if (!data || !data.enabled || !data.contract?.sites?.length) return null;
  const { readiness, sites, totals } = data.contract;
  const installSites = sites.filter((s) => s.mode === "install");
  const serviceSites = sites.filter((s) => s.mode === "none");

  return (
    <DetailCard
      icon={PackageCheck}
      eyebrow="INSTALLATION RESULT"
      title="ผลติดตั้งสำหรับทำสัญญา"
      meta={readiness ? `ติดตั้งครบ ${readiness.done}/${readiness.total} ไซต์` : null}
      actions={readiness?.ready ? <StatusBadge size="sm" tone="success" label="พร้อมทำสัญญา" /> : <StatusBadge size="sm" tone="warning" label="ยังติดตั้งไม่ครบ" />}
    >
      <p className={styles.lead}>จำนวนเครื่องและจุดที่ติดจริง รวมทุกไซต์ของใบนี้ · สัญญาทำเมื่อติดตั้งครบทุกไซต์</p>
      {readiness?.undecided ? (
        <StatusNotice tone="info" className={styles.notice}>ยังมี {readiness.undecided} ไซต์ที่ฝ่ายขายยังไม่ตอบว่าติดตั้งหรือ Service — ตอบที่การ์ด &quot;ติดตั้ง · เข้าบริการ&quot; แท็บภาพรวม</StatusNotice>
      ) : null}

      <TableScroll>
        <table className="w-full">
          <thead>
            <tr>
              <th>ไซต์</th>
              <th>โซน</th>
              <th>รุ่น · สี</th>
              <th>รหัสเครื่อง</th>
              <th>ติดตั้ง</th>
              <th>ใบส่งงาน</th>
            </tr>
          </thead>
          <tbody>
            {installSites.flatMap((site) => site.rows.map((row, i) => (
              <tr key={`${site.siteId}|${row.zoneId}`} className={row.pending ? styles.pending : undefined}>
                <td>{i === 0 ? <><span className={styles.main}>{site.siteCode || site.siteId}</span><span className="cell-sub">{site.siteName || ""}</span></> : null}</td>
                <td><span className={styles.main}>{row.name || row.code || NA}</span><span className="cell-sub">{row.code || ""}</span></td>
                <td>{row.pending ? <span className="cell-sub">{row.stageLabel || "ยังไม่ติดตั้ง"}</span> : row.machines || NA}</td>
                <td>{row.codes.length ? row.codes.join(" · ") : NA}</td>
                <td>{row.date ? fmtDate(row.date) : NA}</td>
                <td>{row.visitCode || NA}</td>
              </tr>
            )))}
          </tbody>
          {serviceSites.length ? (
            <tbody>
              <tr className={styles.groupRow}>
                <td colSpan={6}>ไซต์ Service — เครื่องอยู่แล้ว (จากทะเบียนเครื่อง) · สัญญาฉบับนี้ครอบด้วย เพราะสัญญาเป็นราย SO</td>
              </tr>
              {serviceSites.flatMap((site) => (site.rows.length ? site.rows : [{ zoneId: "none", name: null, codes: [], machines: null }]).map((row, i) => (
                <tr key={`${site.siteId}|${row.zoneId}`}>
                  <td>{i === 0 ? <><span className={styles.main}>{site.siteCode || site.siteId}</span><span className="cell-sub">{site.siteName || ""}</span></> : null}</td>
                  <td><span className={styles.main}>{row.name || row.code || NA}</span><span className="cell-sub">{row.code || ""}</span></td>
                  <td>{row.machines || <span className="cell-sub">ไม่พบเครื่องในทะเบียน</span>}</td>
                  <td>{row.codes.length ? row.codes.join(" · ") : NA}</td>
                  <td colSpan={2}><span className="cell-sub">Service · เครื่องอยู่แล้ว</span></td>
                </tr>
              )))}
            </tbody>
          ) : null}
        </table>
      </TableScroll>

      <p className={styles.totals}>
        <b>รวมทั้งใบ {totals.sites} ไซต์ · {totals.zones} โซน · {totals.machines} เครื่อง</b>
        <span>
          ติดตั้งใหม่ {totals.install.sites} ไซต์ {totals.install.zones} โซน {totals.install.machines} เครื่อง
          {totals.install.groups ? ` (${totals.install.groups})` : ""}
          {totals.service.sites ? ` · Service ${totals.service.sites} ไซต์ ${totals.service.machines} เครื่อง` : ""}
        </span>
      </p>
      <p className={styles.hint}>
        ตัวเลขมาจากใบส่งงานติดตั้งของช่างและทะเบียนเครื่อง · ใช้ประกอบการออกสัญญา · ระบบยังไม่เติมลงสัญญาให้เอง ·{" "}
        <Link href={`/sales-planning/sales-orders/${orderId}#install`}>ความคืบหน้ารายไซต์</Link>
      </p>
    </DetailCard>
  );
}
