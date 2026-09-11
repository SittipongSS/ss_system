"use client";
// ── แท็บ "พื้นที่บริการ" บนหน้าลูกค้า (เฟส 3A · §5A · จอ 11 ของม็อก) ────────
//
// ⭐ **นี่คือที่เดียวที่เห็นภาพรวมข้ามใบ** — หนึ่งใบประเมินครอบหนึ่งสถานที่ ⇒ ลูกค้าที่มี
//   5 สาขาจะมีใบอย่างน้อย 5 ใบ · AE ที่เปิดดีลใหม่ต้องเห็นของเดิมทั้งหมดในจอเดียว
//   โดยไม่ต้องรู้จักโมดูลบริการและไม่ต้องไล่เปิดใบทีละใบ
//
// 🔑 **แท็บเดียว ไม่ใช่สองแท็บ** — หน้านี้เคยมีแท็บ "ไซต์บริการ" ที่ตอบเรื่อง *ปฏิบัติการ*
//   (มีเครื่องกี่ตัว เข้าครั้งหน้าเมื่อไร น้ำหอมใกล้หมดไหม) · แท็บนี้ตอบเรื่อง *ก่อนขาย*
//   (วัดไว้เท่าไร กี่จุด กี่แพ็คเกจ ขายแล้วหรือยัง) · **แต่ทั้งคู่คือ "สถานที่ของลูกค้ารายนี้"**
//   อ่านตารางเดียวกัน สิทธิ์ชุดเดียวกัน โผล่พร้อมกันเสมอ ⇒ วางสองแท็บเคียงกันคือผิดกฎ
//   ที่เขียนไว้บนหัวหน้าลูกค้าเอง: **"ข้อมูลหนึ่งชิ้นมีบ้านหลังเดียว"**
//   ⇒ ยุบเป็นแท็บเดียว: **สถานที่เป็นหัวกลุ่ม (พร้อมสรุปปฏิบัติการ) · พื้นที่เป็นแถว**
//
// 🔴 **อ่านอย่างเดียวทั้งแท็บ** — `/database` เป็นของกลางตามกฎ module-ownership · การแก้
//   ทะเบียนยังเป็นของฝ่าย TS ที่ `/service` ⇒ ที่นี่ไม่มีปุ่มเขียนอะไรเลย มีแต่ลิงก์
//
// ⚠️ **ไม่มีปุ่ม "เสนอราคาพื้นที่ที่ยังไม่ขาย"** ถึงม็อก §11 จะวาดไว้ — สายใบเสนอราคา (§5B)
//   ผู้ใช้สั่งพักไว้ ("เอาแค่เริ่มที่คำร้องถึงผลถึง SA") และ prototype ซึ่งใหม่กว่าก็ถอด
//   ปุ่มออกแล้ว ⇒ ปุ่มที่กดแล้วไม่มีอะไรเกิดขึ้นแย่กว่าไม่มีปุ่ม · ตัวเลข "ประเมินแล้ว
//   ยังไม่ขาย" ยังอยู่ครบ เพราะนั่นคือของที่ชูจริง (กรณี ④ ของเมทริกซ์เจ็ดกรณี)
import Link from "next/link";
import { CheckCircle2, Layers, MapPin, TriangleAlert } from "lucide-react";
import RegistryBadge from "@/components/ui/StatusBadge";
import { Metric, MetricStrip } from "@/components/ui/Workspace";
import { TableShell } from "@/components/ui/Table";
import { REQUEST_STATUS_LABELS, REQUEST_STATUS_TONES } from "@/lib/requests/statuses";
import { siteRefillBadge } from "@/lib/service/refill";
import { floorLabel } from "@/lib/service/zoneCode";
import { fmtDate, fmtNumber, naText } from "@/lib/format";
import styles from "./CustomerZonesPanel.module.css";

/* ป้ายการขายมี **สามแบบ ไม่ใช่สองแบบ** — `zoneTermState` ตอบสามค่า และของที่
   "เคยขาย รอบจบแล้ว" เป็นงานต่ออายุ ซึ่งเป็นงานขายคนละชนิดกับของที่ยังไม่เคยเสนอ
   ⚠️ ม็อกวาดไว้แค่สองแบบ — ยุบรวมแล้ว AE จะมองไม่เห็นคิวต่ออายุเลย */
const TERM_BADGE = {
  active: { tone: "success", label: "ขายแล้ว" },
  ended: { tone: "neutral", label: "เคยขาย · รอบจบแล้ว" },
  none: { tone: "warning", label: "ยังไม่ขาย" },
};

/* ⚠️ **ตร.ม. ไม่ใช่ ลบ.ม.** — แท็บฝั่งลูกค้าพูดเป็นพื้นที่ (ม็อก §11) ส่วนจอส่งผลของ TS
   พูดเป็นปริมาตรเพราะสูตรแพ็คเกจใช้ปริมาตร · หยิบผิดตัวแล้วเลขยังดูสมเหตุสมผล
   จนไม่มีใครจับได้ ⇒ โชว์ทั้งคู่ ตร.ม. เป็นตัวหลัก ลบ.ม. เป็นบรรทัดรอง */
function SizeCell({ zone }) {
  if (!zone.surveyedAt && zone.areaSqm === null) {
    return <span className={styles.muted}>ยังไม่เคยวัด</span>;
  }
  return (
    <>
      <span className="mono">{fmtNumber(zone.areaSqm)} ตร.ม.</span>
      <small className={styles.sub}>
        {fmtNumber(zone.volumeCbm)} ลบ.ม.{zone.parts > 1 ? ` · ${zone.parts} ส่วน` : ""}
      </small>
    </>
  );
}

export default function CustomerZonesPanel({
  registry, sitesOps = [], loading = false, error = "",
}) {
  if (loading) return <p className={styles.state} role="status">กำลังโหลดทะเบียนพื้นที่…</p>;
  // ⚠️ โหลดพังกับ "ไม่มีของ" หน้าตาเหมือนกัน — ห้ามกลืน error แล้วโชว์ "ยังไม่มี"
  if (error) return <p className="form-error" role="alert">{error}</p>;

  const sites = registry?.sites || [];
  if (!sites.length) {
    return (
      <p className={styles.state}>
        ลูกค้ารายนี้ยังไม่มีสถานที่ในทะเบียนไซต์บริการ — สถานที่เกิดตอนฝ่ายขายเปิดใบประเมินพื้นที่
      </p>
    );
  }

  /* สรุปฝั่งปฏิบัติการมาจากเส้นเดิมของหน้านี้ (`/api/service/sites?withSchedule=1`)
     ⚠️ ไม่ย้ายมาคำนวณใหม่ในเส้นทะเบียน — ตรรกะ "ครั้งหน้าเมื่อไร / น้ำหอมใกล้หมด"
        มีที่อยู่ของมันแล้ว เขียนซ้ำเมื่อไรสองจอจะตอบคนละอย่าง */
  const opsById = new Map((sitesOps || []).map((s) => [s.id, s]));
  const unsold = (registry.measuredCount || 0) - (registry.soldCount || 0) - (registry.endedCount || 0);
  const history = registry.history || [];
  const canOpenSite = registry.canOpenSiteRegistry === true;

  return (
    <div className={styles.wrap}>
      <MetricStrip>
        <Metric icon={<MapPin size={16} aria-hidden="true" />} label="สถานที่" value={registry.siteCount} />
        <Metric icon={<Layers size={16} aria-hidden="true" />}
          label="พื้นที่ที่ประเมินแล้ว" value={registry.measuredCount}
          note={registry.zoneCount !== registry.measuredCount ? `จากทั้งหมด ${registry.zoneCount}` : undefined} />
        <Metric icon={<CheckCircle2 size={16} aria-hidden="true" />} tone="good"
          label="ขายแล้ว" value={registry.soldCount}
          note={registry.soldPackages ? `${registry.soldPackages} แพ็คเกจ/เดือน` : undefined} />
        {/* ⭐ กรณี ④ ของเมทริกซ์: วัดแล้วยังไม่ขาย = ของที่จ่ายค่าแรงไปแล้วแต่ยังไม่ได้เงิน
            ⇒ ต้องชูขึ้นก่อนใคร (แผน §5A · ม็อก §12) */}
        <Metric icon={<TriangleAlert size={16} aria-hidden="true" />} tone={unsold > 0 ? "warning" : undefined}
          label="ประเมินแล้วยังไม่ขาย" value={Math.max(0, unsold)}
          note={unsold > 0 ? "มีตัวเลขครบแล้ว เสนอราคาได้โดยไม่ต้องกลับไปวัดใหม่" : undefined} />
      </MetricStrip>

      {sites.map((site) => {
        const ops = opsById.get(site.id);
        const refill = ops ? siteRefillBadge(ops.refill) : null;
        return (
          <section key={site.id} className={styles.site}>
            <header className={styles.siteHead}>
              <div>
                <h3>
                  {/* 🔴 ลิงก์เฉพาะคนที่เปิดได้จริง — `/service/sites/[id]` อ่านด้วย
                      `canViewService` ⇒ AE กดแล้วเจอ "โหลดข้อมูลไซต์ไม่สำเร็จ"
                      ลิงก์ที่พาไปหน้าที่กดไม่เข้า แย่กว่าไม่มีลิงก์ */}
                  {canOpenSite
                    ? <Link href={`/service/sites/${site.id}`} className="linklike">{naText(site.name)}</Link>
                    : naText(site.name)}
                </h3>
                <p>
                  {[site.code, site.address, site.routeZone ? `เขตวิ่งงาน ${site.routeZone}` : null]
                    .filter(Boolean).join(" · ") || naText(null)}
                </p>
                {/* สรุปฝั่งปฏิบัติการ — ของที่แท็บ "ไซต์บริการ" เดิมเคยตอบ */}
                {ops && (
                  <p>
                    {[
                      `เครื่อง ${ops.activeAssetCount ?? 0} ตัว`,
                      ops.nextVisitDate ? `เข้าครั้งหน้า ${fmtDate(ops.nextVisitDate)}` : "ยังไม่มีนัดครั้งหน้า",
                    ].join(" · ")}
                  </p>
                )}
              </div>
              <span className={styles.siteTags}>
                {site.isActive === false && <RegistryBadge tone="neutral" label="ปิดใช้งาน" />}
                {/* น้ำหอมใกล้หมด — ของที่แท็บ "ไซต์บริการ" เดิมเคยเตือน ต้องไม่หายไป
                    ตอนยุบสองแท็บเข้าด้วยกัน (นั่นคือของที่ TS ใช้จริงทุกวัน) */}
                {refill && <RegistryBadge tone={refill.tone} label={refill.label} />}
                <RegistryBadge tone="info" label={`${site.zoneCount} พื้นที่`} />
              </span>
            </header>

            {site.zoneCount === 0 ? (
              /* สาขาที่ยังไม่มีพื้นที่ต้องอยู่ในลิสต์ — ตัดออกแล้วจอจะอ่านว่าลูกค้าไม่มีสาขานี้ */
              <p className={styles.state}>ยังไม่มีพื้นที่ในสถานที่นี้ — เปิดใบประเมินเพื่อให้ฝ่ายบริการเข้าไปวัด</p>
            ) : (
              <TableShell minWidth={880}>
                <table>
                  <thead>
                    <tr>
                      <th>พื้นที่</th>
                      <th>ขนาด</th>
                      <th className="a-right">จุดติดตั้ง</th>
                      <th className="a-right">แพ็คเกจ</th>
                      <th>สถานะ</th>
                      <th>ประเมินล่าสุด</th>
                    </tr>
                  </thead>
                  <tbody>
                    {site.zones.map((zone) => {
                      const badge = TERM_BADGE[zone.termState] || TERM_BADGE.none;
                      return (
                        <tr key={zone.id}>
                          <td>
                            {/* ชื่อ **สด** จากทะเบียนโซน ไม่ใช่ชื่อที่แช่ไว้ในใบ —
                                เปลี่ยนชื่อพื้นที่แล้วตารางนี้ต้องตามทันที */}
                            <b>{naText(zone.name)}</b>
                            <small className={`${styles.sub} mono`}>
                              {[zone.code, floorLabel(zone.floor)].filter(Boolean).join(" · ") || naText(null)}
                            </small>
                          </td>
                          <td><SizeCell zone={zone} /></td>
                          <td className="a-right">
                            {/* ⚠️ ห้ามผูกจำนวนจุดกับจำนวนแพ็คเกจ และห้ามเตือนว่าไม่เท่ากัน —
                                หนึ่งแพ็คเกจกระจายหลายจุดได้ หลายแพ็คเกจลงจุดเดียวได้ */}
                            {zone.spotsTotal ? (
                              <>
                                <b>{zone.spotsSelected}</b>
                                <small className={styles.sub}>จาก {zone.spotsTotal}</small>
                              </>
                            ) : zone.registeredSpots ? (
                              /* ไม่เคยประเมิน แต่ทะเบียนโซนมีจุด (ของเก่า — mig 0353) · ป้ายบอกที่มา
                                 เพราะไม่ใช่ "เลือกติดตั้ง/ที่ติดตั้งได้" แบบผลประเมิน */
                              <>
                                <b>{zone.registeredSpots}</b>
                                <small className={styles.sub}>ทะเบียนโซน</small>
                              </>
                            ) : <span className={styles.muted}>{naText(null)}</span>}
                          </td>
                          <td className="a-right">
                            {/* ⚠️ สองเลขคนละความหมาย ห้ามยุบรวม (mig 0314 เขียนกำกับ) —
                                บนคือที่ TS ประเมิน ล่างคือที่ลูกค้าซื้อจริง */}
                            <b>{naText(zone.assessedPackages)}</b>
                            {zone.soldPackages !== null && zone.soldPackages !== zone.assessedPackages && (
                              <small className={styles.sub}>ซื้อจริง {zone.soldPackages}</small>
                            )}
                          </td>
                          <td>
                            <RegistryBadge tone={badge.tone} label={badge.label} />
                            {zone.salesOrders?.length > 0 && (
                              <small className={`${styles.sub} mono`}>
                                {zone.salesOrders.map((o) => o.orderNumber).filter(Boolean).join(" · ")}
                              </small>
                            )}
                            {zone.termEndDate && (
                              <small className={styles.sub}>จบรอบ {fmtDate(zone.termEndDate)}</small>
                            )}
                          </td>
                          <td>
                            {zone.surveyedAt ? (
                              <>
                                {/* ปลายทางคือ **ใบคำร้อง** ไม่ใช่หน้าไซต์ — เปิดได้ทุกตำแหน่ง
                                    และตรงกับคำถาม "ประเมินล่าสุดโดยใบไหน" พอดี */}
                                {zone.surveyRequestId ? (
                                  <Link href={`/requests/${zone.surveyRequestId}`} className="linklike mono">
                                    {fmtDate(zone.surveyedAt)}
                                  </Link>
                                ) : <span className="mono">{fmtDate(zone.surveyedAt)}</span>}
                                <small className={styles.sub}>
                                  {zone.surveyCount > 1 ? `ประเมินมาแล้ว ${zone.surveyCount} รอบ` : "ประเมินรอบแรก"}
                                </small>
                              </>
                            ) : <span className={styles.muted}>ยังไม่เคยวัด</span>}
                            {/* 🔒 สถานะของตัวเอง ไม่ใช่ "ยังไม่วัด" — ยุบรวมแล้วสองใบจะสั่ง
                                วัดพื้นที่เดียวกันซ้อนกัน แล้วช่างไปสองรอบ */}
                            {zone.pendingRequest && (
                              <small className={styles.pending}>
                                มีใบสั่งวัดค้าง {zone.pendingRequest.docNo || ""}
                              </small>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableShell>
            )}
          </section>
        );
      })}

      {history.length > 0 && (
        <section className={styles.site}>
          <header className={styles.siteHead}>
            <div>
              <h3>ประวัติการประเมิน</h3>
              <p>พื้นที่เดียววัดได้หลายรอบ ผลเก่าไม่ถูกทับ · หนึ่งใบครอบหนึ่งสถานที่</p>
            </div>
          </header>
          <ol className={styles.timeline}>
            {history.map((row) => (
              <li key={row.id}>
                <span className={`${styles.tlDate} mono`}>{naText(fmtDate(row.at))}</span>
                <span className={styles.tlBody}>
                  <b>
                    <Link href={`/requests/${row.id}`} className="linklike">{row.docNo || row.id}</Link>
                    <RegistryBadge size="sm" tone={REQUEST_STATUS_TONES[row.status]}
                      label={REQUEST_STATUS_LABELS[row.status] || row.status} />
                  </b>
                  <small className={styles.sub}>
                    {[
                      row.siteNames.join(" · ") || null,
                      `${row.zoneCount} พื้นที่`,
                      row.cutCount ? `ตัดออก ${row.cutCount}` : null,
                    ].filter(Boolean).join(" · ")}
                  </small>
                  {/* ชื่อที่ **แช่ไว้ตอนเปิดใบ** — พื้นที่ถูกเปลี่ยนชื่อทีหลัง ใบเก่ายัง
                      อ่านได้ว่าตอนนั้นเรียกอะไร (ต่างจากตารางข้างบนที่ใช้ชื่อสด) */}
                  {row.zoneNames?.length > 0 && (
                    <small className={styles.sub}>{row.zoneNames.join(" · ")}</small>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
