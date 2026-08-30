"use client";
// ── หน้าโซน — จอที่เป็นเหตุผลของทั้งแผนธุรกิจบริการ ─────────────────────
//
// ⭐ ตารางรอบขายของโซนมีอยู่ในฐานข้อมูลตั้งแต่ mig 0297 (ใบสั่งขายไหน กลิ่นอะไร
//   กี่แพ็ค มาตรฐานเท่าไร) แต่**ไม่มี UI สักจอ** ⇒ ตอนลบโซนผู้ใช้เจอข้อความ
//   "โซนนี้มีรอบขายผูกอยู่" ที่อ้างถึงของที่เขาไม่เคยเห็นมาก่อน
//
// ⭐ สามคำถามที่จอนี้ตอบ และก่อนหน้านี้ทั้งบริษัทตอบไม่ได้:
//   1. โซนนี้ขายอยู่ในรอบไหน · ต่อสัญญามากี่รอบแล้ว (รอบเก่าไม่หายตอนต่อสัญญา)
//   2. เดือนที่แล้วใช้จริงเท่าไร เทียบกับที่ตกลงขายไว้
//   3. ประวัติการเข้าของ **โซนนี้** ข้ามใบสั่งขายทุกใบ (ของเดิมประวัติผูกกับไซต์
//      ทั้งก้อน แยกไม่ออกว่า Lobby หรือ Reception)
import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Clock, FileText, Layers, MapPin, Package, Wrench } from "lucide-react";
import useLatestRun from "@/lib/ui/useLatestRun";
import useRevalidateOnFocus from "@/lib/ui/useRevalidateOnFocus";
import SkeletonRows from "@/components/ui/Skeleton";
import Workspace from "@/components/ui/Workspace";
import DetailOverview from "@/components/ui/DetailOverview";
import { ContextCard, DetailCard, DetailPageLayout } from "@/components/ui/DetailPage";
import { TableScroll } from "@/components/ui/Table";
import { termIsActive, latestTermOfZone } from "@/lib/service/terms";
import { usageBadge, usageSummary, usageVsStandard } from "@/lib/service/consumption";
import { ASSET_KIND_LABELS } from "@/lib/service/assetKinds";
import { VISIT_KIND_LABELS, VISIT_STATUS_LABELS } from "@/lib/service/rounds";
import { isClosedVisit } from "@/lib/service/visitStatus";
import { fmtNumber, naText } from "@/lib/format";
import { floorLabel } from "@/lib/service/zoneCode";
import { businessMonthKey } from "@/lib/datePeriods";
import styles from "./page.module.css";
import { apiFetch } from "@/lib/apiFetch";

export default function ServiceZonePage({ params }) {
  const { id, zoneId } = use(params);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const startRun = useLatestRun();
  const load = useCallback(async (opts) => {
    const isLatest = startRun();
    if (!opts?.background) setLoading(true);
    setLoadError("");
    try {
      const res = await apiFetch(`/api/service/sites/${id}/zones/${zoneId}/detail`);
      const body = await res.json().catch(() => null);
      if (!isLatest()) return;
      if (!res.ok) throw new Error(body?.error || "โหลดข้อมูลโซนไม่สำเร็จ");
      setData(body);
    } catch (e) {
      if (isLatest() && !opts?.background) setLoadError(e.message || "โหลดข้อมูลโซนไม่สำเร็จ");
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [id, zoneId, startRun]);
  useEffect(() => { load(); }, [load]);
  useRevalidateOnFocus(load);

  const ordersById = useMemo(
    () => new Map((data?.orders || []).map((o) => [o.id, o])),
    [data?.orders],
  );

  /* รอบที่ยังมีผล — ตัวตัดสินอยู่ที่ terms.js ที่เดียว (ห้ามเทียบสถานะเองที่นี่) */
  const activeTerm = useMemo(
    () => (data?.terms || []).find((t) => termIsActive(t, ordersById.get(t.salesOrderId))) || null,
    [data?.terms, ordersById],
  );
  const latestTerm = useMemo(() => latestTermOfZone(data?.terms || []), [data?.terms]);

  const zoneAssets = useMemo(
    () => (data?.assets || []).filter((a) => a.zoneId === zoneId),
    [data?.assets, zoneId],
  );

  /* ประวัติการเข้าของโซน = นัดที่ปิดแล้วซึ่ง "แตะเครื่องในโซนนี้"
     ⚠️ ไม่ใช่ทุกนัดของไซต์ — ไซต์เดียวมีหลายโซน เจ้าหน้าที่เข้าทีเดียวแต่ทำไม่ครบทุกโซน */
  const zoneVisits = useMemo(() => {
    const assetIds = new Set(zoneAssets.map((a) => a.id));
    const touched = new Set(
      (data?.items || []).filter((i) => i.assetId && assetIds.has(i.assetId)).map((i) => i.visitId),
    );
    return (data?.visits || [])
      .filter((v) => isClosedVisit(v) && touched.has(v.id))
      .sort((a, b) => String(b.actualDate || "").localeCompare(String(a.actualDate || "")));
  }, [data?.items, data?.visits, zoneAssets]);

  const usage = useMemo(() => usageVsStandard({
    zoneId,
    items: data?.items || [],
    assets: data?.assets || [],
    visits: data?.visits || [],
    standardMlPerMonth: activeTerm?.standardMlPerMonth ?? latestTerm?.standardMlPerMonth ?? null,
    months: 6,
  }), [zoneId, data, activeTerm, latestTerm]);
  const summary = useMemo(() => usageSummary(usage), [usage]);
  const badge = usageBadge(summary);

  const back = { href: `/service/sites/${id}`, label: naText(data?.site?.name) };

  if (loading) {
    return <Workspace icon={<Layers size={20} aria-hidden="true" />} title="โซนบริการ" back={back}><SkeletonRows rows={5} /></Workspace>;
  }
  if (loadError || !data?.zone) {
    return (
      <Workspace icon={<Layers size={20} aria-hidden="true" />} title="โซนบริการ" back={back}>
        <p className="form-error" role="alert">{loadError || "ไม่พบโซน"}</p>
      </Workspace>
    );
  }

  const { zone, site } = data;
  const itemsOfVisit = (visitId) => (data.items || [])
    .filter((i) => i.visitId === visitId && i.assetId && zoneAssets.some((a) => a.id === i.assetId));

  return (
    <Workspace hideHeader back={back}>
      <DetailOverview
        eyebrow={`โซนบริการ · ${naText(zone.code)}`}
        title={zone.name}
        description={[site?.name, site?.customerName].filter(Boolean).join(" · ")}
        badges={(
          <>
            <span className={`ui-badge ${activeTerm ? "success" : "warning"}`}>
              {activeTerm ? "มีรอบขายที่ยังมีผล" : latestTerm ? "รอบขายจบแล้ว" : "ยังไม่เคยขาย"}
            </span>
            {zone.isActive === false && <span className="ui-badge">ปิดใช้งาน</span>}
          </>
        )}
        facts={[
          { key: "assets", icon: Wrench, label: "อุปกรณ์ในโซน", value: zoneAssets.length ? `${fmtNumber(zoneAssets.length)} ตัว` : null },
          { key: "scent", icon: Package, label: "กลิ่นปัจจุบัน", value: activeTerm?.description || latestTerm?.description },
          { key: "pack", icon: FileText, label: "แพ็คที่ขาย", value: activeTerm?.packageQty != null ? `${fmtNumber(activeTerm.packageQty)}${activeTerm.unit ? ` ${activeTerm.unit}` : ""}` : null },
          { key: "std", icon: Clock, label: "มาตรฐานต่อเดือน", value: activeTerm?.standardMlPerMonth != null ? `${fmtNumber(activeTerm.standardMlPerMonth)} ml` : null },
        ]}
      />

      <DetailPageLayout
        aside={(
          <>
            <ContextCard
              icon={MapPin} eyebrow="ไซต์" title={naText(site?.name)}
              subtitle={site?.customerName || undefined}
              facts={[
                { label: "รหัสไซต์", value: site?.code },
                { label: "เขตวิ่งงาน", value: site?.routeZone },
                { label: "รหัสโซน", value: zone.code },
                // ชั้น/อาคาร (mig 0315) — ชั้นอยู่ในรหัสในรูปย่อ (GF/04) บรรทัดนี้อ่านออก
                { label: "ชั้น", value: floorLabel(zone.floor) },
                { label: "อาคาร", value: zone.building },
              ]}
            />
            <ContextCard
              icon={Wrench} eyebrow="อุปกรณ์ในโซน" title={`${fmtNumber(zoneAssets.length)} ตัว`}
              facts={zoneAssets.slice(0, 6).map((a) => ({
                label: a.label,
                value: [ASSET_KIND_LABELS[a.kind] || a.kind, a.serial].filter(Boolean).join(" · "),
              }))}
            />
          </>
        )}
      >
        {/* ⭐ ทุกรอบตั้งแต่เริ่มขาย รวมรอบที่จบไปแล้ว — โซนอยู่ถาวร ใบสั่งขายใหม่มา
            ผูกทับ ประวัติจึงต่อเนื่องข้ามการต่อสัญญา (มติ 2026-08-27) */}
        <DetailCard icon={FileText} title={`รอบขายของโซนนี้ ${data.terms.length} รอบ`}
          meta="แต่ละรอบคือหนึ่งบรรทัดในใบสั่งขาย — ต่อสัญญา = ใบใหม่ผูกโซนเดิม">
          {data.terms.length === 0 ? (
            <p className={styles.muted}>โซนนี้ยังไม่เคยถูกผูกกับบรรทัดใบสั่งขาย — ผูกได้ที่หน้างานเข้าใหม่</p>
          ) : (
            <TableScroll family="list" minWidth={760}>
              <table>
                <thead>
                  <tr>
                    <th scope="col">ใบสั่งขาย</th>
                    <th scope="col">ช่วงบริการ</th>
                    <th scope="col">กลิ่น</th>
                    <th scope="col" className={styles.num}>แพ็ค</th>
                    <th scope="col" className={styles.num}>มาตรฐาน/เดือน</th>
                    <th scope="col">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.terms.map((term) => {
                    const order = ordersById.get(term.salesOrderId);
                    const active = termIsActive(term, order);
                    return (
                      <tr key={term.id}>
                        <th scope="row">{naText(order?.orderNumber)}</th>
                        <td>{naText([term.startDate, term.endDate].filter(Boolean).join(" – "))}</td>
                        <td>{naText(term.fgCode || term.description)}</td>
                        <td className={styles.num}>
                          {term.packageQty == null ? naText(null) : `${fmtNumber(term.packageQty)}${term.unit ? ` ${term.unit}` : ""}`}
                        </td>
                        <td className={styles.num}>
                          {term.standardMlPerMonth == null ? naText(null) : `${fmtNumber(term.standardMlPerMonth)} ml`}
                        </td>
                        <td>
                          <span className={`ui-badge ${active ? "success" : ""}`.trim()}>
                            {active ? "มีผล" : order?.supersededById ? "ถูกออกฉบับแก้ทับ" : "จบแล้ว"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableScroll>
          )}
        </DetailCard>

        {/* ⭐ คำถามที่ทั้งบริษัทตอบไม่ได้มาตลอด — เดือนไหนใช้เกิน/ขาดเทียบที่ขายไว้ */}
        <DetailCard icon={Package} title="ใช้จริง เทียบ มาตรฐาน"
          meta="ยอดมาจากของที่เจ้าหน้าที่บันทึกตอนปิดงาน ผูกกับเครื่องในโซนนี้เท่านั้น">
          {badge && <p className={styles.badgeLine} data-tone={badge.tone}>{badge.text}</p>}
          {summary.unconverted > 0 && (
            <p className={styles.warn}>
              <AlertTriangle size={14} aria-hidden="true" />
              มี {fmtNumber(summary.unconverted)} รายการที่หน่วยแปลงเป็น ml ไม่ได้ — ยอดข้างล่างยังไม่รวมของพวกนั้น
            </p>
          )}
          <TableScroll family="list" minWidth={620}>
            <table>
              <thead>
                <tr>
                  <th scope="col">เดือน</th>
                  <th scope="col" className={styles.num}>เข้าบริการ</th>
                  <th scope="col" className={styles.num}>มาตรฐาน</th>
                  <th scope="col" className={styles.num}>ใช้จริง</th>
                  <th scope="col" className={styles.num}>ส่วนต่าง</th>
                </tr>
              </thead>
              <tbody>
                {usage.map((row) => (
                  <tr key={row.month} data-empty={row.usedMl == null ? "yes" : undefined}>
                    <th scope="row">{row.month}{row.month === businessMonthKey() ? " (เดือนนี้)" : ""}</th>
                    <td className={styles.num}>{row.usedMl == null ? "ไม่ได้เข้า" : `${fmtNumber(row.visits)} ครั้ง`}</td>
                    <td className={styles.num}>{row.standardMl == null ? naText(null) : `${fmtNumber(row.standardMl)} ml`}</td>
                    <td className={styles.num}>{row.usedMl == null ? naText(null) : `${fmtNumber(row.usedMl)} ml`}</td>
                    <td className={styles.num} data-diff={row.diffMl == null ? undefined : row.diffMl > 0 ? "over" : row.diffMl < 0 ? "under" : "even"}>
                      {row.diffMl == null ? naText(null) : `${row.diffMl > 0 ? "+" : ""}${fmtNumber(row.diffMl)} ml`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </DetailCard>

        {/* ⭐ ประวัติของ **โซนนี้** ข้ามใบสั่งขายทุกใบ — ของเดิมประวัติผูกกับไซต์ทั้งก้อน */}
        <DetailCard icon={Clock} title={`ประวัติการเข้าของโซนนี้ ${zoneVisits.length} ครั้ง`}
          meta="ต่อเนื่องข้ามใบสั่งขายทุกใบ ตั้งแต่เริ่มขายโซนนี้">
          {zoneVisits.length === 0 ? (
            <p className={styles.muted}>ยังไม่มีนัดที่ปิดงานแล้วแตะเครื่องในโซนนี้</p>
          ) : (
            <ul className={styles.history}>
              {zoneVisits.slice(0, 20).map((visit) => (
                <li key={visit.id}>
                  <Link href={`/service/visits/${visit.id}`} className={styles.historyLink}>
                    <b>{naText(visit.actualDate)}</b>
                    <span>{VISIT_KIND_LABELS[visit.kind] || visit.kind} · {VISIT_STATUS_LABELS[visit.status]}</span>
                    <span>{naText(visit.assigneeName)}</span>
                    <span className={styles.used}>
                      {itemsOfVisit(visit.id).map((i) => `${i.label}${i.qty != null ? ` ${fmtNumber(i.qty)}${i.unit ? ` ${i.unit}` : ""}` : ""}`).join(" · ") || naText(null)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DetailCard>
      </DetailPageLayout>
    </Workspace>
  );
}
