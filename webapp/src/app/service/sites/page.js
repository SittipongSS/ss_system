"use client";
// ── ทะเบียนไซต์บริการ (mig 0187 · S-1) ───────────────────────────────────
//
// ⭐ ก่อนหน้านี้ **ไม่มีที่เก็บเลย** — ทีม SV ขายระบบกระจายกลิ่นได้ แต่พอปิดการขาย
// แล้วไม่มีตารางไหนรู้ว่าไปติดตั้งที่ไหน · `customers` มีที่อยู่ช่องเดียว ลูกค้าที่มี
// 12 สาขาเก็บไม่ได้ตั้งแต่ต้น
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MapPin, Plus, Search } from "lucide-react";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import Input from "@/components/ui/Input";
import SkeletonRows from "@/components/ui/Skeleton";
import { TableShell } from "@/components/ui/Table";
import Toast from "@/components/ui/Toast";
import Workspace from "@/components/ui/Workspace";
import ServiceSiteModal from "@/components/service/ServiceSiteModal";
import { accessWindowText } from "@/lib/service/sites";
import { useDepartment, useRole, useTeam, useTeams } from "@/lib/roleContext";
import { canEditService } from "@/lib/permissions";
import styles from "./page.module.css";
import { naText } from "@/lib/format";

export default function ServiceSitesPage() {
  const role = useRole();
  const team = useTeam();
  const teams = useTeams();
  const department = useDepartment();
  // ⚠️ cap อย่างเดียวไม่พอ — service:edit ถือกว้างทั้ง staff และ sales role
  // ฝ่าย TS / ทีม SV คือตัวกั้นจริง (เหมือนที่ server ทำใน requireService)
  const canEdit = useMemo(() => canEditService({ role, team, teams, department }), [role, team, teams, department]);

  const [sites, setSites] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [formSite, setFormSite] = useState(undefined); // undefined = ปิด · null = สร้าง
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/service/sites");
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

  // รายชื่อลูกค้าโหลดเฉพาะตอนจะ "เลือก" เท่านั้น (กติกา customer lookup ของระบบ)
  useEffect(() => {
    if (formSite === undefined || customers.length) return;
    (async () => {
      try {
        const res = await fetch("/api/customers");
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || "โหลดรายชื่อลูกค้าไม่สำเร็จ");
        setCustomers(Array.isArray(data) ? data : (data?.rows || []));
      } catch (e) {
        setToast({ kind: "error", msg: e.message });
      }
    })();
  }, [formSite, customers.length]);

  const saveSite = async (form) => {
    const editing = !!formSite;
    const res = await fetch(editing ? `/api/service/sites/${formSite.id}` : "/api/service/sites", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || "บันทึกไม่สำเร็จ");
    setToast({ kind: "success", msg: editing ? `บันทึกไซต์ ${data.name} แล้ว` : `เพิ่มไซต์ ${data.name} แล้ว` });
    await load();
  };

  const visible = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("th");
    if (!needle) return sites;
    return sites.filter((site) => [site.name, site.customerName, site.zone, site.code]
      .filter(Boolean).some((field) => String(field).toLocaleLowerCase("th").includes(needle)));
  }, [sites, search]);

  return (
    <Workspace
      icon={<MapPin size={20} aria-hidden="true" />}
      title="ไซต์บริการ"
      subtitle="จุดติดตั้งระบบกระจายกลิ่นของลูกค้า และเครื่องที่อยู่หน้างาน"
      headerRight={canEdit ? (
        <Button tone="primary" onClick={() => setFormSite(null)} icon={<Plus size={15} aria-hidden="true" />}>
          เพิ่มไซต์
        </Button>
      ) : null}
      toolbar={(
        <div className={styles.toolbar}>
          <Search size={15} aria-hidden="true" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อไซต์ ลูกค้า โซน หรือรหัส"
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
        <EmptyState icon={MapPin} dashed={canEdit} onClick={canEdit ? () => setFormSite(null) : undefined}>
          {canEdit
            ? "ยังไม่มีไซต์บริการในระบบ — กดเพื่อเพิ่มไซต์แรก"
            : "ยังไม่มีไซต์บริการในระบบ"}
        </EmptyState>
      ) : (
        <TableShell>
          <table>
            <thead>
              <tr>
                <th>รหัส</th>
                <th>ไซต์</th>
                <th>ลูกค้า</th>
                <th>โซน</th>
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
                    <td>{naText(site.zone)}</td>
                    <td className={styles.numCol}>
                      {/* เครื่องที่ยังใช้งานคือตัวเลขที่ช่างสนใจ · รวมทั้งหมดไว้ในวงเล็บ */}
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

      <ServiceSiteModal
        open={formSite !== undefined}
        site={formSite}
        customers={customers}
        onClose={() => setFormSite(undefined)}
        onSave={saveSite}
      />

      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}
