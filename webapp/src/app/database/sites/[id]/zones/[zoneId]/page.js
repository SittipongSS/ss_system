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
import { AirVent, AlertTriangle, ClipboardList, Clock, Crosshair, Hash, Layers, MapPin, Package } from "lucide-react";
import useLatestRun from "@/lib/ui/useLatestRun";
import useRevalidateOnFocus from "@/lib/ui/useRevalidateOnFocus";
import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";
import SkeletonRows from "@/components/ui/Skeleton";
import Workspace from "@/components/ui/Workspace";
import DetailOverview from "@/components/ui/DetailOverview";
import { ContextCard, DetailCard, DetailPageLayout } from "@/components/ui/DetailPage";
import { TableScroll } from "@/components/ui/Table";
import StatusNotice from "@/components/ui/StatusNotice";
import { termIsActive, latestTermOfZone } from "@/lib/service/terms";
import { usageBadge, usageSummary, usageVsStandard } from "@/lib/service/consumption";
import { ASSET_KIND_LABELS } from "@/lib/service/assetKinds";
import { VISIT_KIND_LABELS, VISIT_STATUS_LABELS } from "@/lib/service/rounds";
import { isClosedVisit } from "@/lib/service/visitStatus";
import { fmtNumber, naText } from "@/lib/format";
import { floorLabel } from "@/lib/service/zoneCode";
import { currentMonth } from "@/lib/datePeriods";
import { canViewVisitReport } from "@/lib/permissions";
import { useDepartment, useRole, useTeam, useTeams } from "@/lib/roleContext";
import styles from "./page.module.css";

const SPOT_PREVIEW = 12;
import { apiFetch } from "@/lib/apiFetch";

/* แถวประวัติการเข้า — ลิงก์ไปใบส่งงานเมื่อคนดูเปิดใบได้ · ไม่ได้ = กล่องหน้าตาเดียวกันที่กดไม่ได้
   (ข้อมูลในแถวเท่ากันทุกคน ต่างกันแค่มีทางไปต่อหรือไม่) */
function VisitRow({ href, children }) {
  if (href) return <Link href={href} className={styles.historyLink}>{children}</Link>;
  return <div className={`${styles.historyLink} ${styles.historyStatic}`}>{children}</div>;
}

export default function ServiceZonePage({ params }) {
  const { id, zoneId } = use(params);
  /* หน้านี้เป็นของ **ทะเบียน** (เปิดอ่านได้ทุกคนที่เข้าฐานข้อมูล) · ใบส่งงานเปิดได้เฉพาะฝ่ายบริการ + ฝ่ายขาย
     ⇒ แถวประวัติเป็นลิงก์เฉพาะคนที่เปิดใบได้จริง — คนอื่นเห็นข้อมูลเท่ากัน แต่ไม่มีทางกดไปเจอ Forbidden */
  const role = useRole();
  const team = useTeam();
  const teams = useTeams();
  const department = useDepartment();
  const canOpenVisit = useMemo(() => canViewVisitReport({ role, team, teams, department }), [role, team, teams, department]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  // 404 ≠ โหลดพัง — โซนที่ไม่มี (หรือไม่อยู่ในไซต์นี้) ต้องบอกคนละอย่างกับเน็ตสะดุด · ทรงเดียวกับหน้าเครื่อง
  const [notFound, setNotFound] = useState(false);

  const startRun = useLatestRun();
  const load = useCallback(async (opts) => {
    const isLatest = startRun();
    if (!opts?.background) setLoading(true);
    setLoadError("");
    try {
      const res = await apiFetch(`/api/service/sites/${id}/zones/${zoneId}/detail`);
      const body = await res.json().catch(() => null);
      if (!isLatest()) return;
      // รอบเบื้องหลังที่ล้มต้องเงียบ — ไม่พลิกหน้าที่อ่านอยู่เป็น "ไม่พบ"
      if (!opts?.background) setNotFound(res.status === 404);
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

  /* ⚠️ นำหน้าด้วยคำว่า "ไซต์" — ชื่อไซต์เป็นข้อความอิสระ ("ชั้น 2") อ่านปนกับชั้นของโซนได้ */
  const back = { href: `/database/sites/${id}`, label: data?.site?.name ? `ไซต์ ${data.site.name}` : "ไซต์" };

  /* ⭐ เปลือกโหลด/ไม่พบ/พัง เป็น hideHeader เหมือนหน้าที่โหลดเสร็จ — ทรงเดียวกันทั้งสี่หน้า
     (เครื่อง · ไซต์ · โซน · ใบส่งงาน) · ลำดับ: ไม่พบ (404) มาก่อนโหลดพัง
     🐞 เดิม `!res.ok` โยนทิ้งทุกกรณี ⇒ โซนที่ถูกลบขึ้น "โหลดข้อมูลโซนไม่สำเร็จ" + ปุ่มลองใหม่
        อ่านเหมือนเน็ตสะดุดที่กดซ้ำแล้วจะหาย · สาขา "ไม่พบ" ไม่เคยถูกเรียกเลย */
  /* ♿ hideHeader ถอด h1 ของ Workspace ออกด้วย — หน้าที่โหลดเสร็จได้ h1 จาก DetailOverview
     แต่สามเปลือกนี้ไม่มีหัวเรื่องเลย ⇒ h1 ซ่อนตา (sr-only) ชื่อเดียวกับการ์ดหัวเดิม · หน้าตาไม่เปลี่ยน */
  const shell = (body) => (
    <Workspace hideHeader back={back}>
      <h1 className="sr-only">โซนบริการ</h1>
      {body}
    </Workspace>
  );
  if (loading) return shell(<SkeletonRows rows={5} />);
  if (notFound || (!loadError && !data?.zone)) {
    return shell(
      <EmptyState icon={Layers}>
        ไม่พบโซนนี้
        <small>อาจถูกลบไปแล้ว หรือรหัสในลิงก์ไม่ถูกต้อง</small>
      </EmptyState>,
    );
  }
  if (loadError) {
    return shell(
      <StatusNotice tone="error" title="โหลดข้อมูลโซนไม่สำเร็จ"
        action={<Button size="sm" onClick={() => load()}>ลองใหม่</Button>}>
        {loadError}
      </StatusNotice>,
    );
  }

  const { zone, site } = data;
  const itemsOfVisit = (visitId) => (data.items || [])
    .filter((i) => i.visitId === visitId && i.assetId && zoneAssets.some((a) => a.id === i.assetId));

  const zoneSpots = Array.isArray(zone.spots) ? zone.spots : [];
  // รอบที่ใช้เล่าค่าขาย — รอบที่ยังมีผลก่อน ไม่มีค่อยถอยไปรอบล่าสุด (ตัวเดียวกับที่ใช้คิดมาตรฐาน)
  const saleTerm = activeTerm || latestTerm;

  return (
    <Workspace hideHeader back={back}>
      <DetailOverview
        eyebrow={`โซนบริการ · ${naText(zone.code)}`}
        title={zone.name}
        description={[site?.code, site?.name, site?.customerName].filter(Boolean).join(" · ")}
        badges={(
          <>
            <span className={`ui-badge ${activeTerm ? "success" : "warning"}`}>
              {activeTerm ? "มีรอบขายที่ยังมีผล" : latestTerm ? "รอบขายจบแล้ว" : "ยังไม่เคยขาย"}
            </span>
            {zone.isActive === false && <span className="ui-badge">ปิดใช้งาน</span>}
          </>
        )}
        /* จำนวนเครื่อง/จุดขึ้นเสมอ (ศูนย์ก็เป็นคำตอบ) · ค่าของรอบขายขึ้นเฉพาะโซนที่เคยขาย —
           ป้าย "ยังไม่เคยขาย" บอกเหตุอยู่แล้ว
           🐞 เดิมโซนที่ยังไม่เคยขายได้ "—" สี่ช่องเต็มจอแรกบนมือถือ และเครื่องศูนย์ตัวขึ้น "—"
              ขัดกับการ์ดข้างที่บอก "0 ตัว" */
        facts={[
          { key: "assets", icon: AirVent, label: "อุปกรณ์ในโซน", value: `${fmtNumber(zoneAssets.length)} ตัว` },
          { key: "spots", icon: Crosshair, label: "จุดติดตั้ง", value: `${fmtNumber(zoneSpots.length)} จุด` },
          ...(saleTerm ? [
            { key: "scent", icon: Package, label: "กลิ่นปัจจุบัน", value: saleTerm.description },
            { key: "pack", icon: Hash, label: "แพ็คที่ขาย", value: saleTerm.packageQty != null ? `${fmtNumber(saleTerm.packageQty)}${saleTerm.unit ? ` ${saleTerm.unit}` : ""}` : null },
            { key: "std", icon: Clock, label: "มาตรฐานต่อเดือน", value: saleTerm.standardMlPerMonth != null ? `${fmtNumber(saleTerm.standardMlPerMonth)} ml` : null },
          ] : []),
        ]}
      />

      <DetailPageLayout
        aside={(
          <>
            {/* กดทั้งใบกลับหน้าไซต์ — ทางเดียวกับลิงก์ย้อนกลับด้านบน */}
            <ContextCard
              href={`/database/sites/${id}`}
              icon={MapPin} eyebrow="ไซต์" title={naText(site?.name)}
              subtitle={site?.customerName || undefined}
              facts={[
                { label: "รหัสไซต์", value: site?.code },
                { label: "เขตวิ่งงาน", value: site?.routeZone },
                { label: "รหัสโซน", value: zone.code },
                // ชั้น/อาคาร (mig 0315) — ชั้นไม่อยู่ในรหัสแล้ว (mig 0384) บรรทัดนี้คือที่บอกชั้น
                { label: "ชั้น", value: floorLabel(zone.floor) },
                { label: "อาคาร", value: zone.building },
              ]}
            />
            {/* จุดติดตั้ง (mig 0354) — ตำแหน่งวางเครื่องข้างในโซน · แก้ที่ปุ่มแก้ไขโซนในหน้าไซต์
                ⚠️ เลขลำดับนำหน้าชื่อ — ชื่อจุดไม่บังคับไม่ซ้ำ (ContextCard ใช้ป้ายเป็น key)
                การ์ดสองใบนี้ขึ้นเฉพาะตอนมีของ — จำนวนศูนย์อยู่ในแถบ facts ด้านบนแล้ว
                🐞 เดิมขึ้นหัวเปล่า "0 จุด" / "0 ตัว" เสมอ ⇒ แท็บเล็ตเหลือช่องโหว่ข้างการ์ดไซต์ มือถือยาวเปล่า ๆ */}
            {zoneSpots.length > 0 && (
              <ContextCard
                icon={Crosshair} eyebrow="จุดติดตั้ง" title={`${fmtNumber(zoneSpots.length)} จุด`}
                subtitle={zoneSpots.length > SPOT_PREVIEW ? `แสดง ${SPOT_PREVIEW} จุดแรก — ทั้งหมดอยู่ที่ปุ่มแก้ไขโซนในหน้าไซต์` : undefined}
                facts={zoneSpots.slice(0, SPOT_PREVIEW).map((s, i) => ({ label: `${i + 1}. ${s.label}`, value: s.note }))}
              />
            )}
            {zoneAssets.length > 0 && (
              <ContextCard
                icon={AirVent} eyebrow="อุปกรณ์ในโซน" title={`${fmtNumber(zoneAssets.length)} ตัว`}
                facts={zoneAssets.slice(0, 6).map((a) => ({
                  label: a.label,
                  value: [ASSET_KIND_LABELS[a.kind] || a.kind, a.serial].filter(Boolean).join(" · "),
                }))}
              />
            )}
          </>
        )}
      >
        {/* ⭐ ทุกรอบตั้งแต่เริ่มขาย รวมรอบที่จบไปแล้ว — โซนอยู่ถาวร ใบสั่งขายใหม่มา
            ผูกทับ ประวัติจึงต่อเนื่องข้ามการต่อสัญญา (มติ 2026-08-27) */}
        {/* รอบขาย = บรรทัดใบสั่งขาย ⇒ ไอคอนใบสั่งขาย (FileText เป็นของใบเสนอราคา) */}
        <DetailCard icon={ClipboardList} title={`รอบขายของโซนนี้ ${data.terms.length} รอบ`}
          meta="แต่ละรอบคือหนึ่งบรรทัดในใบสั่งขาย — ต่อสัญญา = ใบใหม่ผูกโซนเดิม">
          {data.terms.length === 0 ? (
            <EmptyState icon={ClipboardList} plain>โซนนี้ยังไม่เคยถูกผูกกับบรรทัดใบสั่งขาย — ผูกได้ที่หน้างานเข้าใหม่</EmptyState>
          ) : (
            <TableScroll family="list" minWidth={760}>
              <table>
                <thead>
                  <tr>
                    <th scope="col">ใบสั่งขาย</th>
                    <th scope="col">ช่วงบริการ</th>
                    <th scope="col">กลิ่น</th>
                    <th scope="col" className={`num ${styles.num}`}>แพ็ค</th>
                    <th scope="col" className={`num ${styles.num}`}>มาตรฐาน/เดือน</th>
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
                        <td className={`num ${styles.num}`}>
                          {term.packageQty == null ? naText(null) : `${fmtNumber(term.packageQty)}${term.unit ? ` ${term.unit}` : ""}`}
                        </td>
                        <td className={`num ${styles.num}`}>
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
          {/* ไม่เคยขายและไม่มีเครื่อง = ยังไม่มีอะไรให้เทียบ — บอกตรง ๆ แทนตารางขีดหกแถว
              ⚠️ มีรอบขายหรือมีเครื่องแล้วต้องขึ้นตาราง — แถว "ไม่ได้เข้า" ตอนนั้นคือคำตอบ */}
          {!latestTerm && zoneAssets.length === 0 ? (
            <EmptyState icon={Package} plain>ยังไม่มียอดใช้ — โซนนี้ยังไม่มีรอบขายหรืออุปกรณ์</EmptyState>
          ) : (
            <>
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
                      <th scope="col" className={`num ${styles.num}`}>เข้าบริการ</th>
                      <th scope="col" className={`num ${styles.num}`}>มาตรฐาน</th>
                      <th scope="col" className={`num ${styles.num}`}>ใช้จริง</th>
                      <th scope="col" className={`num ${styles.num}`}>ส่วนต่าง</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usage.map((row) => (
                      <tr key={row.month} data-empty={row.usedMl == null ? "yes" : undefined}>
                        {/* 🐞 เดิมเรียก businessMonthKey() ของ datePeriods โดยไม่ส่งวัน ⇒ ได้ null
                            ⇒ ไม่เคยติด "(เดือนนี้)" ⇒ เดือนที่ยังไม่จบอ่านเป็นใช้ขาดทั้งเดือน */}
                        <th scope="row">{row.month}{row.month === currentMonth() ? " (เดือนนี้)" : ""}</th>
                        <td className={`num ${styles.num}`}>{row.usedMl == null ? "ไม่ได้เข้า" : `${fmtNumber(row.visits)} ครั้ง`}</td>
                        <td className={`num ${styles.num}`}>{row.standardMl == null ? naText(null) : `${fmtNumber(row.standardMl)} ml`}</td>
                        <td className={`num ${styles.num}`}>{row.usedMl == null ? naText(null) : `${fmtNumber(row.usedMl)} ml`}</td>
                        <td className={`num ${styles.num}`} data-diff={row.diffMl == null ? undefined : row.diffMl > 0 ? "over" : row.diffMl < 0 ? "under" : "even"}>
                          {row.diffMl == null ? naText(null) : `${row.diffMl > 0 ? "+" : ""}${fmtNumber(row.diffMl)} ml`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            </>
          )}
        </DetailCard>

        {/* ⭐ ประวัติของ **โซนนี้** ข้ามใบสั่งขายทุกใบ — ของเดิมประวัติผูกกับไซต์ทั้งก้อน */}
        <DetailCard icon={Clock} title={`ประวัติการเข้าของโซนนี้ ${zoneVisits.length} ครั้ง`}
          meta="ต่อเนื่องข้ามใบสั่งขายทุกใบ ตั้งแต่เริ่มขายโซนนี้">
          {zoneVisits.length === 0 ? (
            <EmptyState icon={Clock} plain>ยังไม่มีนัดที่ปิดงานแล้วแตะเครื่องในโซนนี้</EmptyState>
          ) : (
            <ul className={styles.history}>
              {zoneVisits.slice(0, 20).map((visit) => (
                <li key={visit.id}>
                  <VisitRow href={canOpenVisit ? `/service/visits/${visit.id}` : null}>
                    <b>{naText(visit.actualDate)}</b>
                    <span>{VISIT_KIND_LABELS[visit.kind] || visit.kind} · {VISIT_STATUS_LABELS[visit.status]}</span>
                    <span>{naText(visit.assigneeName)}</span>
                    <span className={styles.used}>
                      {itemsOfVisit(visit.id).map((i) => `${i.label}${i.qty != null ? ` ${fmtNumber(i.qty)}${i.unit ? ` ${i.unit}` : ""}` : ""}`).join(" · ") || naText(null)}
                    </span>
                  </VisitRow>
                </li>
              ))}
            </ul>
          )}
        </DetailCard>
      </DetailPageLayout>
    </Workspace>
  );
}
