"use client";
// ── งานเข้าใหม่ (เฟส 4) — ทางที่งานขายเดินมาถึงฝ่าย TS ───────────────────
//
// ⭐ **ที่มาเป็นตัวเลข**: ชีตของทีมมี 102 จุดที่ลูกค้าจ่ายเงินแล้วแต่ไม่มีคิวบริการ
//   งานพวกนั้นไม่ได้หายไป — มันไม่เคยเดินมาถึงฝ่าย TS เลย เพราะไม่มีหน้าไหนพา
//   ใบสั่งขายมาให้ · หน้านี้คือทางนั้น
//
// ⚠️ **หน้านี้ไม่ใช่ที่สร้างงาน** — ทุกแถวมีต้นเรื่องเป็นใบสั่งขายที่อนุมัติแล้ว
//   ไม่มีปุ่ม "สร้างใหม่" ที่ไหนในหน้านี้โดยตั้งใจ (มติ 2026-08-28 · กติกาเดียวกับ
//   ที่ถอดปุ่ม + ออกจากทุกช่องว่างของหน้าจัดคิวเจ้าหน้าที่)
//
// ⚠️ ใบที่ตอบไม่ได้ว่าสายอะไรขึ้นแถบของมันเอง ระบบไม่เดาให้ — เดาเมื่อไร ใบสายสินค้า
//   จะไหลเข้าคิวบริการ หรือใบบริการจะหายเงียบ ทั้งสองทางแย่พอกัน
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowDownToLine, Building2, CalendarPlus, MapPin } from "lucide-react";
import useLatestRun from "@/lib/ui/useLatestRun";
import useRevalidateOnFocus from "@/lib/ui/useRevalidateOnFocus";
import Button from "@/components/ui/Button";
import SkeletonRows from "@/components/ui/Skeleton";
import Tabs from "@/components/ui/Tabs";
import Toast from "@/components/ui/Toast";
import Workspace from "@/components/ui/Workspace";
import { TableScroll } from "@/components/ui/Table";
import EmptyState from "@/components/ui/EmptyState";
import IntakeWizard from "@/components/service/IntakeWizard";
import { INTAKE_TABS, INTAKE_TAB_HINTS, INTAKE_TAB_LABELS } from "@/lib/service/intake";
import { canEditService } from "@/lib/permissions";
import { useDepartment, useRole, useTeam, useTeams } from "@/lib/roleContext";
import { fmtDate, fmtNumber, naText } from "@/lib/format";
import styles from "./page.module.css";
import { apiFetch } from "@/lib/apiFetch";

export default function ServiceIntakePage() {
  const role = useRole();
  const team = useTeam();
  const teams = useTeams();
  const department = useDepartment();
  const canEdit = useMemo(() => canEditService({ role, team, teams, department }), [role, team, teams, department]);

  const [tab, setTab] = useState("bind");
  const [data, setData] = useState(null);
  const [sites, setSites] = useState([]);
  const [zonesBySite, setZonesBySite] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [wizardOrder, setWizardOrder] = useState(null);
  const [toast, setToast] = useState(null);

  const startRun = useLatestRun();
  const load = useCallback(async (opts) => {
    const isLatest = startRun();
    if (!opts?.background) setLoading(true);
    setLoadError("");
    try {
      const res = await apiFetch("/api/service/intake");
      const body = await res.json().catch(() => null);
      if (!isLatest()) return;
      if (!res.ok) throw new Error(body?.error || "โหลดคิวงานเข้าใหม่ไม่สำเร็จ");
      setData(body);
    } catch (e) {
      /* ⚠️ ห้ามกลืน error เป็นคิวว่าง — "โหลดพัง" กับ "ไม่มีงานค้าง" หน้าตาเหมือนกัน
         จนแยกไม่ออก แล้วฝ่าย TS จะเชื่อว่าไม่มีอะไรต้องทำ ซึ่งคือรูเดิมที่หน้านี้มาปิด */
      if (isLatest() && !opts?.background) setLoadError(e.message || "โหลดคิวงานเข้าใหม่ไม่สำเร็จ");
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [startRun]);
  useEffect(() => { load(); }, [load]);
  useRevalidateOnFocus(load);

  // ทะเบียนไซต์/โซนโหลดตอนจะ "เลือก" เท่านั้น — คิวอย่างเดียวไม่ต้องใช้
  const loadRegistry = useCallback(async (siteId = null) => {
    const res = await apiFetch("/api/service/sites");
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error || "โหลดทะเบียนไซต์ไม่สำเร็จ");
    /* ⚠️ /api/service/sites คืน **อาร์เรย์ตรง ๆ** ไม่ได้ห่อใน { sites } — ต่างจาก
       /api/service/visits ที่ห่อ · เดาผิดแล้วรายการไซต์ว่างเปล่าโดยไม่มี error */
    const rows = Array.isArray(body) ? body : (Array.isArray(body?.sites) ? body.sites : []);
    setSites(rows);
    if (siteId) {
      const zoneRes = await apiFetch(`/api/service/sites/${siteId}/zones`);
      const zoneBody = await zoneRes.json().catch(() => null);
      if (zoneRes.ok) {
        /* 🐞 **เคยอ่าน `zoneBody.zones` ตัวเดียว** ทั้งที่ endpoint คืนอาร์เรย์ตรง ๆ
           (คอมเมนต์เหนือบรรทัด 79 เตือนเรื่องนี้ไว้เองแล้วสำหรับไซต์ แต่ท่อนโซนพลาด)
           ⇒ สร้างโซนใหม่ใน wizard แล้วดรอปดาวน์โซน **ว่างเปล่า** จัดสรรของต่อไม่ได้ */
        const zoneRows = Array.isArray(zoneBody)
          ? zoneBody
          : (Array.isArray(zoneBody?.zones) ? zoneBody.zones : []);
        setZonesBySite((prev) => new Map(prev).set(siteId, zoneRows));
      }
    }
    return rows;
  }, []);

  const openWizard = async (order) => {
    try {
      await loadRegistry();
      /* ⚠️ **เลิกโหลดที่อยู่ลูกค้าที่นี่แล้ว** (มติ 2026-08-30) — มันมีไว้ทำไทล์
         "ตั้งจากที่อยู่ไหน" ของฟอร์มสร้างไซต์ ซึ่งถูกถอดออกจาก wizard นี้แล้ว
         (ไซต์เกิดจากใบคำร้องประเมินพื้นที่ทางเดียว) · `addresses` เป็น jsonb ก้อนใหญ่
         — วัดจริง 136 KB บนลูกค้า 191 ราย ⇒ ไม่ดึงของที่ไม่มีใครใช้ */
      setWizardOrder(order);
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
    }
  };

  // โหลดโซนของไซต์ที่ถูกเลือกใน wizard (ไม่โหลดทุกไซต์ล่วงหน้า — ไซต์ 200 แห่ง
  // = 200 คำขอ) · ใช้ตัวอ้างอิงจาก state ปัจจุบันผ่าน setter เพื่อไม่ให้ callback
  // เปลี่ยนตัวตนทุกครั้งที่ zonesBySite ขยับ (ไม่งั้น useEffect ใน wizard วนไม่จบ)
  const ensureZones = useCallback(async (siteId) => {
    if (!siteId) return;
    let known = false;
    setZonesBySite((prev) => { known = prev.has(siteId); return prev; });
    if (known) return;
    const res = await apiFetch(`/api/service/sites/${siteId}/zones`);
    const body = await res.json().catch(() => null);
    if (!res.ok) return;
    const rows = Array.isArray(body) ? body : (Array.isArray(body?.zones) ? body.zones : []);
    setZonesBySite((prev) => new Map(prev).set(siteId, rows));
  }, []);

  /* ⚠️ **ไม่มี `createSite` แล้ว** (มติผู้ใช้ 2026-08-30) — ไซต์เกิดจากใบคำร้อง
     "ประเมินพื้นที่" ทางเดียว · เหลือเฉพาะโซน ซึ่งเป็นรายละเอียดของไซต์ที่มีต้นเรื่องแล้ว */
  const registryActions = useMemo(() => ({
    ensureZones,
    createZone: async (siteId, form) => {
      const res = await apiFetch(`/api/service/sites/${siteId}/zones`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "สร้างโซนไม่สำเร็จ");
      await loadRegistry(siteId);
      return body;
    },
  }), [loadRegistry, ensureZones]);

  const bindOrder = async (payload) => {
    await ensureZones(payload.siteId);
    const res = await apiFetch("/api/service/intake/bind", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error || "ผูกโซนไม่สำเร็จ");
    setToast({ kind: "success", msg: `ผูกแล้ว ${body?.terms?.length || 0} บรรทัด — ขั้นต่อไปคือตั้งรอบเข้าบริการ` });
    setTab("plan");
    await load({ background: true });
  };

  const counts = data?.counts || { bind: 0, plan: 0, visit: 0, unknownLine: 0 };

  return (
    <Workspace
      icon={<ArrowDownToLine size={20} aria-hidden="true" />}
      title="งานเข้าใหม่"
      subtitle="ใบสั่งขายสายบริการที่อนุมัติแล้ว รอผูกกับไซต์/โซน แล้วตั้งรอบเข้าบริการ"
    >
      {loadError && <p className="form-error" role="alert">{loadError}</p>}

      <Tabs
        value={tab}
        onChange={setTab}
        ariaLabel="คิวงานเข้าใหม่"
        tabs={INTAKE_TABS.map((key) => ({
          key,
          label: `${INTAKE_TAB_LABELS[key]} ${counts[key] || 0}`,
        }))}
      />
      <p className={styles.hint}>{INTAKE_TAB_HINTS[tab]}</p>

      {/* ⭐ ถังที่ระบบตอบไม่ได้ — ขึ้นเหนือคิวเสมอ ไม่ว่าจะอยู่แท็บไหน
          ฝ่าย TS แก้เองไม่ได้ (สายธุรกิจเป็นของโครงการ) จึงบอกว่าต้องไปหาใคร */}
      {counts.unknownLine > 0 && (
        <section className={styles.unknown} aria-label="ใบที่ยังไม่ระบุสายธุรกิจ">
          <p className={styles.unknownHead}>
            <AlertTriangle size={14} aria-hidden="true" />
            <b>{counts.unknownLine} ใบยังไม่ระบุสายธุรกิจ</b> — ระบบไม่เดาให้ ต้องให้ฝ่ายขายระบุสายที่โครงการก่อน
          </p>
          <ul className={styles.unknownList}>
            {(data?.unknownLine || []).map((row) => (
              <li key={row.orderId}>
                <b>{row.code}</b>
                <span>{naText(row.customerName)}</span>
                <span>{row.pendingLines} บรรทัด</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {loading ? <SkeletonRows rows={4} /> : loadError ? null : (
        <>
          {tab === "bind" && (
            (data?.bind || []).length === 0 ? (
              <EmptyState icon={ArrowDownToLine}>
                ไม่มีใบสั่งขายรอผูกโซน — ใบสายบริการที่อนุมัติใหม่จะมาโผล่ที่นี่เอง
              </EmptyState>
            ) : (
              <TableScroll family="list" minWidth={720}>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">ใบสั่งขาย</th>
                      <th scope="col">ลูกค้า</th>
                      <th scope="col">อนุมัติเมื่อ</th>
                      <th scope="col">ของที่ต้องจัดสรร</th>
                      <th scope="col">สัญญา · จ่ายถึง</th>
                      <th scope="col" aria-label="การกระทำ" />
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.bind || []).map((row) => (
                      <tr key={row.orderId}>
                        <th scope="row">{row.code}</th>
                        <td>{naText(row.customerName)}</td>
                        <td>{naText((row.approvedAt || row.orderDate || "").slice(0, 10))}</td>
                        {/* ⭐ นับ **FG + จำนวน** ไม่ใช่จำนวนบรรทัด (มติผู้ใช้ 2026-08-29)
                            บรรทัดเป็นรูปร่างของเอกสารขาย ไม่ใช่ขนาดของงาน — ใบจริงใบหนึ่ง
                            มี 10 บรรทัด แต่เป็น FG แค่ 2 ชนิด รวม 13 หน่วย */}
                        <td>
                          {row.fgKinds
                            ? `${fmtNumber(row.fgKinds)} ชนิด · ${fmtNumber(row.remainingQty)} หน่วย`
                            : naText(null)}
                        </td>
                        {/* ⭐ ชิปความพร้อม (PR-C) — TS ต้องรู้ **ตั้งแต่ตอนรับงาน** ว่าใบนี้
                            พอจัดสรรแล้วจะเดินต่อได้ไหม · ของเดิมเห็นแต่ขนาดงาน แล้วไปเจอ
                            ด่านตอนจัดคิวทีหลัง ซึ่งเป็นตอนที่เสียเวลาไปแล้ว
                            ⚠️ นี่คือ *ป้ายบอกสถานะ* ไม่ใช่ด่าน — ใบที่ยังไม่พร้อมก็ยัง
                               รับเข้าไซต์/จัดสรรลงโซนได้ (คนละขั้นกัน) */}
                        <td>
                          <span className={`ui-badge ${row.readiness?.hasContract ? "success" : "warning"}`}>
                            {row.readiness?.hasContract ? row.readiness.contractNo : "ยังไม่ผูกสัญญา"}
                          </span>
                          {" "}
                          <span className={`ui-badge ${row.readiness?.coveredToday ? "success" : "warning"}`}>
                            {row.readiness?.paidThrough
                              ? `จ่ายถึง ${fmtDate(row.readiness.paidThrough)}`
                              : "ยังไม่มีงวดที่รับรอง"}
                          </span>
                        </td>
                        <td>
                          {canEdit && (
                            <Button tone="neutral" size="sm" onClick={() => openWizard(row)}
                              icon={<Building2 size={15} aria-hidden="true" />}>
                              รับเข้าไซต์
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            )
          )}

          {tab === "plan" && (
            (data?.plan || []).length === 0 ? (
              <EmptyState icon={CalendarPlus}>
                ทุกไซต์ที่ขายแล้วมีรอบครบ — โซนที่ผูกใบสั่งขายแล้วแต่ยังไม่มีรอบจะมาอยู่ที่นี่
              </EmptyState>
            ) : (
              <TableScroll family="list" minWidth={720}>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">ไซต์</th>
                      <th scope="col">ลูกค้า</th>
                      <th scope="col">โซนที่ขายแล้ว</th>
                      <th scope="col" aria-label="การกระทำ" />
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.plan || []).map((row) => (
                      <tr key={row.siteId}>
                        <th scope="row">{naText(row.site?.name)}</th>
                        <td>{naText(row.site?.customerName)}</td>
                        <td>{row.zones.map((z) => z.name).join(" · ")}</td>
                        <td>
                          <Link href={`/service/sites/${row.siteId}`} className={styles.rowLink}>
                            ตั้งรอบที่หน้าไซต์
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            )
          )}

          {tab === "visit" && (
            (data?.visit || []).length === 0 ? (
              <EmptyState icon={MapPin}>
                ทุกรอบมีนัดข้างหน้าแล้ว — รอบที่เดินอยู่แต่ไม่มีนัดล่วงหน้าเลยจะมาอยู่ที่นี่
              </EmptyState>
            ) : (
              <TableScroll family="list" minWidth={720}>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">ไซต์</th>
                      <th scope="col">รอบ</th>
                      <th scope="col">เจ้าหน้าที่ประจำ</th>
                      <th scope="col" aria-label="การกระทำ" />
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.visit || []).map((row) => (
                      <tr key={row.planId}>
                        <th scope="row">{naText(row.site?.name)}</th>
                        <td>ทุก {fmtNumber(row.everyDays)} วัน</td>
                        <td>{naText(row.assigneeName)}</td>
                        <td>
                          <Link href={`/service/sites/${row.siteId}`} className={styles.rowLink}>
                            เติมนัดที่หน้าไซต์
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            )
          )}
        </>
      )}

      <IntakeWizard
        open={!!wizardOrder}
        order={wizardOrder}
        sites={sites}
        zonesBySite={zonesBySite}
        onClose={() => setWizardOrder(null)}
        onDone={bindOrder}
        onReloadRegistry={registryActions}
      />

      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}
