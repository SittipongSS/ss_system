"use client";
// ── ทะเบียนไซต์บริการ (mig 0187 · S-1) ───────────────────────────────────
//
// ⭐ ก่อนหน้านี้ **ไม่มีที่เก็บเลย** — ทีม SV ขายระบบกระจายกลิ่นได้ แต่พอปิดการขาย
// แล้วไม่มีตารางไหนรู้ว่าไปติดตั้งที่ไหน · `customers` มีที่อยู่ช่องเดียว ลูกค้าที่มี
// 12 สาขาเก็บไม่ได้ตั้งแต่ต้น
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MapPin, Search, Upload } from "lucide-react";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import Input from "@/components/ui/Input";
import SkeletonRows from "@/components/ui/Skeleton";
import { TableShell } from "@/components/ui/Table";
import Toast from "@/components/ui/Toast";
import Workspace from "@/components/ui/Workspace";
import { accessWindowText } from "@/lib/service/sites";
import { useDepartment, useRole, useTeam, useTeams } from "@/lib/roleContext";
import { canEditService, canImportServiceData } from "@/lib/permissions";
import styles from "./page.module.css";
import { naText } from "@/lib/format";
import { apiFetch } from "@/lib/apiFetch";

export default function ServiceSitesPage() {
  const role = useRole();
  const team = useTeam();
  const teams = useTeams();
  const department = useDepartment();
  // ⚠️ cap อย่างเดียวไม่พอ — service:edit ถือกว้างทั้ง staff และ sales role
  // ฝ่าย TS / ทีม SV คือตัวกั้นจริง (เหมือนที่ server ทำใน requireService)
  const canEdit = useMemo(() => canEditService({ role, team, teams, department }), [role, team, teams, department]);
  // นำเข้าเป็นก้อนแคบกว่าการแก้รายใบ — หัวหน้าฝ่ายบริการขึ้นไปเท่านั้น (F-8)
  const canImport = useMemo(
    () => canImportServiceData({ role, team, teams, department }),
    [role, team, teams, department],
  );

  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await apiFetch("/api/service/sites");
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "โหลดทะเบียนไซต์ไม่สำเร็จ");
      setSites(Array.isArray(data) ? data : []);
    } catch (e) {
      // ⚠️ ห้ามกลืน error แล้วโชว์ "ยังไม่มีไซต์" — โหลดพังกับยังไม่มีข้อมูล
      // หน้าตาเหมือนกันจนแยกไม่ออก
      setLoadError(e.message || "โหลดทะเบียนไซต์ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  /* ⚠️ **หน้านี้ไม่มีฟอร์มไซต์แล้ว** (มติ 2026-08-30) — สร้างไม่ได้ (ไซต์เกิดจาก
     ใบคำร้อง) และ *แก้* อยู่ที่หน้ารายละเอียดของไซต์นั้น ⇒ ทะเบียนลูกค้า · โมดัล ·
     ตัวบันทึก ถูกถอดออกทั้งชุด ไม่ใช่ปล่อยไว้เป็นโค้ดที่ไม่มีทางถูกเรียก
     🐞 โค้ดตายแบบนั้นคือสิ่งที่ทำให้คนอ่านเชื่อว่าหน้านี้ยังแก้ไซต์ได้ */

  const visible = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("th");
    if (!needle) return sites;
    // จังหวัดเข้าชุดค้นด้วย (mig 0315) — เป็นตัวตนถาวรของไซต์ คนถามหา "ไซต์ที่เชียงใหม่"
    return sites.filter((site) => [site.name, site.customerName, site.routeZone, site.code, site.province]
      .filter(Boolean).some((field) => String(field).toLocaleLowerCase("th").includes(needle)));
  }, [sites, search]);

  return (
    <Workspace
      icon={<MapPin size={20} aria-hidden="true" />}
      title="ไซต์บริการ"
      subtitle="จุดติดตั้งระบบกระจายกลิ่นของลูกค้า และเครื่องที่อยู่หน้างาน"
      /* 🔴 **ไม่มีปุ่ม "เพิ่มไซต์" ที่ทะเบียนอีกแล้ว** (มติผู้ใช้ 2026-08-30:
         "สร้างที่คำร้องเท่านั้น ห้ามสร้างผ่านทะเบียนไซต์")
         ⭐ เหตุผลเชิงระบบ: ไซต์ต้องมี **ต้นเรื่อง** เสมอ — เกิดจากใบประเมินพื้นที่ที่
            ฝ่ายขายเปิดให้ลูกค้ารายนั้น · ทะเบียนเป็นที่ *ดู* ไม่ใช่ที่ *เริ่ม*
            (กติกาเดียวกับที่หน้าจัดคิวเจ้าหน้าที่เป็นที่ "วาง" ไม่ใช่ "สร้าง")
         ⚠️ ปุ่มแก้/ลบในแถวยังอยู่ตามเดิม (canEditService) — ที่ถอดคือทางเกิดใหม่เท่านั้น */
      headerRight={canImport ? (
        <Button tone="neutral" as={Link} href="/service/import"
          icon={<Upload size={15} aria-hidden="true" />}>
          นำเข้าข้อมูลเก่า
        </Button>
      ) : null}
      toolbar={(
        <div className="toolbar">
          <Search size={15} aria-hidden="true" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อไซต์ ลูกค้า จังหวัด เขตวิ่งงาน หรือรหัส"
            aria-label="ค้นหาไซต์บริการ"
            className={styles.searchInput}
          />
          <span className={styles.count}>{visible.length} จาก {sites.length} ไซต์</span>
        </div>
      )}
    >
      {loadError && <p className="form-error" role="alert">{loadError}</p>}

      {loading || loadError ? (
        loading ? <SkeletonRows rows={5} /> : null
      ) : sites.length === 0 ? (
        <EmptyState icon={MapPin}>
          ยังไม่มีไซต์บริการในระบบ — ไซต์เกิดจากใบคำร้อง &ldquo;ประเมินพื้นที่&rdquo; ที่ฝ่ายขายเปิดให้ลูกค้า
        </EmptyState>
      ) : visible.length === 0 ? (
        /* ⚠️ ค้นไม่เจอ ≠ ไม่มีไซต์ — ตารางว่างเปล่าโดยไม่มีคำอธิบายอ่านเหมือนข้อมูลหาย */
        <EmptyState icon={Search}>
          ไม่มีไซต์ที่ตรงกับ “{search.trim()}” — ลองค้นด้วยรหัส ชื่อไซต์ ลูกค้า หรือจังหวัด
        </EmptyState>
      ) : (
        /* ⚠️ `minWidth` — รหัสรูปใหม่ยาว 19 ตัว (ST-0121-01-BKK-1001) ไม่ส่งค่านี้
           ตารางจะบีบคอลัมน์จนรหัสตัดบรรทัด แทนที่จะเลื่อนแนวนอน (Table.module.css) */
        <TableShell minWidth={960}>
          <table>
            <thead>
              <tr>
                <th>รหัส</th>
                <th>ไซต์</th>
                <th>ลูกค้า</th>
                <th>เขตวิ่งงาน</th>
                <th className={styles.numCol}>เครื่อง</th>
                <th>ช่วงเวลาที่เข้าได้</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((site) => {
                const window = accessWindowText(site);
                return (
                  <tr key={site.id} className={site.isActive === false ? styles.inactive : undefined}>
                    <td className="mono">{naText(site.code)}</td>
                    <td>
                      <Link href={`/service/sites/${site.id}`} className={styles.siteLink}>{site.name}</Link>
                    </td>
                    <td>{naText(site.customerName)}</td>
                    <td>{naText(site.routeZone)}</td>
                    <td className={styles.numCol}>
                      {/* เครื่องที่ยังใช้งานคือตัวเลขที่เจ้าหน้าที่สนใจ · รวมทั้งหมดไว้ในวงเล็บ */}
                      {site.activeAssetCount || 0}
                      {site.assetCount !== site.activeAssetCount ? ` / ${site.assetCount}` : ""}
                    </td>
                    <td>{window || <span className={styles.muted}>ไม่จำกัด</span>}</td>
                    <td>
                      <span className="ui-badge">{site.isActive === false ? "ปิดใช้งาน" : "ใช้งาน"}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableShell>
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}
