"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download, Edit3, Plus, Power, PowerOff, Search, Tags, Upload } from "lucide-react";
import RecordDrawer from "@/components/excise/RecordDrawer";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Toast from "@/components/ui/Toast";
import Select from "@/components/ui/Select";
import { useRole } from "@/lib/roleContext";
import { canManageProductCategories } from "@/lib/permissions";
import styles from "./page.module.css";

const EMPTY_FORM = {
  mainSelection: "",
  mainCategoryCode: "",
  mainCategoryName: "",
  typeCode: "",
  nameTh: "",
  nameEn: "",
  note: "",
};

const usageText = (usage = {}) => [
  usage.products ? `${usage.products} สินค้า` : null,
  usage.deals ? `${usage.deals} ดีล` : null,
  usage.projects ? `${usage.projects} โครงการ` : null,
].filter(Boolean).join(" · ") || "ยังไม่ถูกใช้งาน";

export default function ProductCategoriesPage() {
  const role = useRole();
  const canManage = canManageProductCategories(role);
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({ mainCategories: 0, total: 0, active: 0, inactive: 0, used: 0 });
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("active");
  const [drawer, setDrawer] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [confirmRow, setConfirmRow] = useState(null);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/product-types?manage=1", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "โหลดหมวดสินค้าไม่สำเร็จ");
      setItems(payload.items || []);
      setSummary(payload.summary || {});
    } catch (error) {
      setToast({ kind: "error", msg: error.message || "โหลดหมวดสินค้าไม่สำเร็จ" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (canManage) load(); }, [canManage, load]);

  const mainCategories = useMemo(() => {
    const groups = new Map();
    for (const row of items) {
      if (!groups.has(row.mainCategoryCode)) {
        groups.set(row.mainCategoryCode, {
          code: row.mainCategoryCode,
          name: row.mainCategoryName,
          total: 0,
          active: 0,
        });
      }
      const group = groups.get(row.mainCategoryCode);
      group.total += 1;
      if (row.isActive !== false) group.active += 1;
    }
    return [...groups.values()].sort((a, b) => a.code.localeCompare(b.code));
  }, [items]);

  const groupedRows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("th");
    const filtered = items.filter((row) => {
      if (status === "active" && row.isActive === false) return false;
      if (status === "inactive" && row.isActive !== false) return false;
      if (!needle) return true;
      return [row.code, row.mainCategoryName, row.nameTh, row.nameEn, row.note]
        .some((value) => String(value || "").toLocaleLowerCase("th").includes(needle));
    });
    const groups = new Map();
    for (const row of filtered) {
      if (!groups.has(row.mainCategoryCode)) groups.set(row.mainCategoryCode, []);
      groups.get(row.mainCategoryCode).push(row);
    }
    return [...groups.entries()].map(([code, rows]) => ({
      code,
      name: rows[0]?.mainCategoryName || code,
      rows,
    }));
  }, [items, query, status]);

  const openCreate = () => {
    const first = mainCategories[0];
    setForm({
      ...EMPTY_FORM,
      mainSelection: first?.code || "__new",
      mainCategoryCode: first?.code || "",
      mainCategoryName: first?.name || "",
    });
    setDrawer({ mode: "create" });
  };

  const openEdit = (row) => {
    setForm({
      mainSelection: row.mainCategoryCode,
      mainCategoryCode: row.mainCategoryCode,
      mainCategoryName: row.mainCategoryName || "",
      typeCode: row.typeCode,
      nameTh: row.nameTh || "",
      nameEn: row.nameEn || "",
      note: row.note || "",
    });
    setDrawer({ mode: "edit", row });
  };

  const chooseMain = (value) => {
    if (value === "__new") {
      setForm((current) => ({ ...current, mainSelection: value, mainCategoryCode: "", mainCategoryName: "" }));
      return;
    }
    const selected = mainCategories.find((item) => item.code === value);
    setForm((current) => ({
      ...current,
      mainSelection: value,
      mainCategoryCode: selected?.code || "",
      mainCategoryName: selected?.name || "",
    }));
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const editing = drawer?.mode === "edit";
      const body = editing
        ? { mainCategoryName: form.mainCategoryName, nameTh: form.nameTh, nameEn: form.nameEn, note: form.note }
        : {
            mainCategoryCode: form.mainCategoryCode,
            mainCategoryName: form.mainCategoryName,
            typeCode: form.typeCode,
            nameTh: form.nameTh,
            nameEn: form.nameEn,
            note: form.note,
          };
      const response = await fetch(editing ? `/api/product-types/${drawer.row.id}` : "/api/product-types", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "บันทึกหมวดสินค้าไม่สำเร็จ");
      setDrawer(null);
      setToast({ kind: "success", msg: editing ? "บันทึกการแก้ไขหมวดสินค้าแล้ว" : "เพิ่มหมวดสินค้าแล้ว" });
      await load();
    } catch (error) {
      setToast({ kind: "error", msg: error.message || "บันทึกหมวดสินค้าไม่สำเร็จ" });
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async () => {
    if (!confirmRow) return;
    setSaving(true);
    try {
      const nextActive = confirmRow.isActive === false;
      const response = await fetch(`/api/product-types/${confirmRow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: nextActive }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "เปลี่ยนสถานะหมวดสินค้าไม่สำเร็จ");
      setConfirmRow(null);
      setToast({ kind: "success", msg: nextActive ? "เปิดใช้งานหมวดสินค้าแล้ว" : "พักใช้งานหมวดสินค้าแล้ว" });
      await load();
    } catch (error) {
      setToast({ kind: "error", msg: error.message || "เปลี่ยนสถานะหมวดสินค้าไม่สำเร็จ" });
    } finally {
      setSaving(false);
    }
  };

  if (!role || !canManage) return null;

  const editing = drawer?.mode === "edit";
  return (
    <>
      <header className="premium-header">
        <div className="header-content">
          <h1><span className="premium-header-icon"><Tags size={22} /></span> หมวดสินค้า</h1>
          <p>จัดการรหัสและชื่อหมวดที่ใช้ร่วมกันในสินค้า ดีล โครงการ และไทม์ไลน์</p>
        </div>
        <div className={styles.headerActions}>
          <Link prefetch={false} className="btn ghost" href="/api/product-types/export"><Download size={16} /> ส่งออกข้อมูล</Link>
          <Link className="btn" href="/database/product-categories/import"><Upload size={16} /> นำเข้าข้อมูล</Link>
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} /> เพิ่มหมวดสินค้า
          </button>
        </div>
      </header>

      <section className={styles.summary} aria-label="สรุปหมวดสินค้า">
        <div><span>หมวดหลัก</span><strong>{summary.mainCategories || 0}</strong></div>
        <div><span>หมวดรองทั้งหมด</span><strong>{summary.total || 0}</strong></div>
        <div><span>กำลังใช้งาน</span><strong>{summary.active || 0}</strong></div>
        <div><span>พักใช้งาน</span><strong>{summary.inactive || 0}</strong></div>
      </section>

      <section className={`glass-panel ${styles.panel}`}>
        <div className={styles.toolbar}>
          <label className={styles.search}>
            <Search size={16} aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหารหัส ชื่อไทย ชื่ออังกฤษ หรือหมายเหตุ" aria-label="ค้นหาหมวดสินค้า" />
          </label>
          <Select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="กรองสถานะ">
            <option value="active">กำลังใช้งาน</option>
            <option value="all">ทุกสถานะ</option>
            <option value="inactive">พักใช้งาน</option>
          </Select>
          <span className={styles.resultCount}>{groupedRows.reduce((sum, group) => sum + group.rows.length, 0)} รายการ</span>
        </div>

        {loading ? (
          <div className={styles.empty}>กำลังโหลดหมวดสินค้า…</div>
        ) : groupedRows.length === 0 ? (
          <div className={styles.empty}>ไม่พบหมวดสินค้าตามเงื่อนไข</div>
        ) : (
          <>
            <div className={`premium-table-wrapper ${styles.desktopTable}`}>
              <table className="premium-table">
                <thead>
                  <tr>
                    <th style={{ width: 110 }}>รหัส</th>
                    <th>ชื่อหมวดสินค้า</th>
                    <th>ชื่อภาษาอังกฤษ</th>
                    <th style={{ width: 240 }}>การใช้งาน</th>
                    <th style={{ width: 110 }}>สถานะ</th>
                    <th style={{ width: 100, textAlign: "right" }}>จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedRows.map((group) => (
                    <CategoryGroupRows key={group.code} group={group} onEdit={openEdit} onToggle={setConfirmRow} />
                  ))}
                </tbody>
              </table>
            </div>

            <div className={styles.mobileList}>
              {groupedRows.map((group) => (
                <section key={group.code} className={styles.mobileGroup}>
                  <header><strong>{group.code}</strong><span>{group.name}</span></header>
                  {group.rows.map((row) => (
                    <article key={row.id} className={styles.mobileCard}>
                      <div className={styles.mobileCardHead}>
                        <div><strong>{row.code}</strong><span>{row.nameTh || row.nameEn || "ยังไม่ระบุชื่อ"}</span></div>
                        <StatusBadge active={row.isActive !== false} />
                      </div>
                      {row.nameEn && <p>{row.nameEn}</p>}
                      <small>{usageText(row.usage)}</small>
                      <div className={styles.cardActions}>
                        <button type="button" className="btn ghost" onClick={() => openEdit(row)}><Edit3 size={15} /> แก้ไข</button>
                        <button type="button" className="btn ghost" onClick={() => setConfirmRow(row)}>
                          {row.isActive === false ? <Power size={15} /> : <PowerOff size={15} />}
                          {row.isActive === false ? "เปิดใช้" : "พักใช้"}
                        </button>
                      </div>
                    </article>
                  ))}
                </section>
              ))}
            </div>
          </>
        )}
      </section>

      <RecordDrawer
        open={!!drawer}
        onClose={() => !saving && setDrawer(null)}
        closeOnOverlay={false}
        title={editing ? "แก้ไขหมวดสินค้า" : "เพิ่มหมวดสินค้า"}
        subtitle={editing ? `${drawer?.row?.code} · รหัสถูกล็อกเพื่อรักษาข้อมูลอ้างอิง` : "สร้างหมวดรองภายใต้หมวดหลักเดิมหรือหมวดหลักใหม่"}
        badge={editing ? <StatusBadge active={drawer?.row?.isActive !== false} /> : null}
        footer={(
          <>
            <button type="button" className="btn ghost" onClick={() => setDrawer(null)} disabled={saving}>ยกเลิก</button>
            <button type="submit" form="product-category-form" className="btn btn-primary" disabled={saving}>
              {saving ? "กำลังบันทึก…" : editing ? "บันทึกการแก้ไข" : "เพิ่มหมวดสินค้า"}
            </button>
          </>
        )}
      >
        <form id="product-category-form" onSubmit={save} className={styles.form}>
          {!editing && (
            <label>
              <span>หมวดหลัก <b>*</b></span>
              <Select value={form.mainSelection} onChange={(event) => chooseMain(event.target.value)} required>
                {mainCategories.map((item) => <option key={item.code} value={item.code}>{item.code} — {item.name}</option>)}
                <option value="__new">+ สร้างหมวดหลักใหม่</option>
              </Select>
            </label>
          )}

          <div className={styles.codeGrid}>
            <label>
              <span>รหัสหมวดหลัก <b>*</b></span>
              <input className="premium-input" inputMode="numeric" maxLength={2} value={form.mainCategoryCode} onChange={(event) => setForm((current) => ({ ...current, mainCategoryCode: event.target.value.replace(/\D/g, "") }))} disabled={editing || form.mainSelection !== "__new"} required />
            </label>
            <label>
              <span>รหัสหมวดรอง <b>*</b></span>
              <input className="premium-input" inputMode="numeric" maxLength={3} value={form.typeCode} onChange={(event) => setForm((current) => ({ ...current, typeCode: event.target.value.replace(/\D/g, "") }))} disabled={editing} required />
            </label>
          </div>
          <p className={styles.codeNote}>เมื่อสร้างแล้วจะไม่สามารถเปลี่ยนรหัสได้</p>

          <label>
            <span>ชื่อหมวดหลัก <b>*</b></span>
            <input className="premium-input" maxLength={50} value={form.mainCategoryName} onChange={(event) => setForm((current) => ({ ...current, mainCategoryName: event.target.value }))} disabled={!editing && form.mainSelection !== "__new"} required />
            {editing && <small>การแก้ชื่อนี้จะมีผลกับหมวดรองทั้งหมดภายใต้รหัส {form.mainCategoryCode}</small>}
          </label>

          <label>
            <span>ชื่อหมวดสินค้า (ไทย)</span>
            <input className="premium-input" maxLength={100} value={form.nameTh} onChange={(event) => setForm((current) => ({ ...current, nameTh: event.target.value }))} placeholder="ชื่อภาษาไทยเป็นหลัก" />
          </label>
          <label>
            <span>ชื่อหมวดสินค้า (อังกฤษ)</span>
            <input className="premium-input" maxLength={100} value={form.nameEn} onChange={(event) => setForm((current) => ({ ...current, nameEn: event.target.value }))} placeholder="English name" />
            <small>ต้องระบุชื่ออย่างน้อย 1 ภาษา</small>
          </label>
          <label>
            <span>หมายเหตุ</span>
            <textarea className="premium-input" rows={4} maxLength={255} value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} />
            <small>{form.note.length}/255</small>
          </label>

          {editing && (
            <section className={styles.usageBox}>
              <h3>การใช้งานปัจจุบัน</h3>
              <div><span>สินค้า</span><strong>{drawer.row.usage?.products || 0}</strong></div>
              <div><span>ดีล</span><strong>{drawer.row.usage?.deals || 0}</strong></div>
              <div><span>โครงการ</span><strong>{drawer.row.usage?.projects || 0}</strong></div>
              <p>การพักใช้ไม่ลบข้อมูลเดิม แต่จะไม่ให้เลือกหมวดนี้สำหรับงานใหม่</p>
            </section>
          )}
        </form>
      </RecordDrawer>

      <ConfirmDialog
        open={!!confirmRow}
        title={confirmRow?.isActive === false ? "เปิดใช้งานหมวดสินค้า" : "พักใช้งานหมวดสินค้า"}
        description={confirmRow ? `${confirmRow.code} — ${confirmRow.nameTh || confirmRow.nameEn || "ไม่ระบุชื่อ"}` : ""}
        detail={confirmRow?.isActive === false
          ? "หมวดนี้จะกลับมาให้เลือกในสินค้า ดีล และโครงการใหม่"
          : `${usageText(confirmRow?.usage)} ข้อมูลเดิมจะยังคงอยู่ แต่หมวดนี้จะไม่ปรากฏให้เลือกในงานใหม่`}
        confirmLabel={confirmRow?.isActive === false ? "เปิดใช้งาน" : "พักใช้งาน"}
        tone={confirmRow?.isActive === false ? "default" : "danger"}
        busy={saving}
        onConfirm={toggleStatus}
        onClose={() => !saving && setConfirmRow(null)}
      />
      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}

function CategoryGroupRows({ group, onEdit, onToggle }) {
  return (
    <>
      <tr className={styles.groupRow}>
        <td colSpan={6}><strong>{group.code}</strong><span>{group.name}</span><small>{group.rows.length} รายการ</small></td>
      </tr>
      {group.rows.map((row) => (
        <tr key={row.id} className="premium-row">
          <td className="mono"><strong>{row.code}</strong></td>
          <td><strong>{row.nameTh || row.nameEn || "ยังไม่ระบุชื่อ"}</strong>{row.note && <small className={styles.cellNote}>{row.note}</small>}</td>
          <td>{row.nameEn || <span className={styles.muted}>—</span>}</td>
          <td><strong>{row.usage?.total || 0} รายการ</strong><small className={styles.cellNote}>{usageText(row.usage)}</small></td>
          <td><StatusBadge active={row.isActive !== false} /></td>
          <td>
            <div className={styles.rowActions}>
              <button type="button" className="btn-icon" onClick={() => onEdit(row)} aria-label={`แก้ไข ${row.code}`} title="แก้ไข"><Edit3 size={15} /></button>
              <button type="button" className="btn-icon" onClick={() => onToggle(row)} aria-label={`${row.isActive === false ? "เปิดใช้งาน" : "พักใช้งาน"} ${row.code}`} title={row.isActive === false ? "เปิดใช้งาน" : "พักใช้งาน"}>
                {row.isActive === false ? <Power size={15} /> : <PowerOff size={15} />}
              </button>
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}

function StatusBadge({ active }) {
  return <span className={`${styles.statusBadge} ${active ? styles.active : styles.inactive}`}>{active ? "ใช้งาน" : "พักใช้"}</span>;
}
