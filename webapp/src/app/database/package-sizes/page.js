"use client";
// ── ทะเบียนขนาดแพ็คเกจ (mig 0398 · มติเจ้าของ 01/10 "เพิ่ม ลบ ได้") ─────────────────────
//
// ⭐ **ขนาดไม่ใช่สี่ตัวตายตัว** — แอดมินและหัวหน้าฝ่ายบริการ เพิ่ม · แก้ · ลบ ได้ที่นี่ · ทุกคนที่เข้าระบบ
//   ฐานข้อมูลได้เปิดอ่านได้ (ฝ่ายขายต้องรู้ว่า SM/ST/XL บนผลประเมินหมายถึงพื้นที่ขนาดไหน)
//   · หัวหน้าเคาะขนาด + จำนวนต่อพื้นที่จากทะเบียนนี้ที่แท็บ "สรุปส่งผล" ของใบประเมิน และระบบเสนอขนาดจากช่วง ลบ.ม. ที่ตั้งไว้ที่นี่
//
// ⭐ **รายการ = ListPanel ใบเดียว** (มติผู้ใช้ 2026-09-15): หัว → แถบเครื่องมือ (ตัวกรอง) → ตาราง → Pager
//   · ปุ่ม "เพิ่มขนาด" อยู่หัวหน้า (`headerRight`) ทรงเดียวกับทะเบียนอื่นใต้ฐานข้อมูล — ของระดับหน้า ไม่ใช่เครื่องมือของตาราง
//
// 🔑 **สิทธิ์แก้มาจาก server** (`canEdit` ของ GET = `canManagePackageSizes`) — จอไม่เดา role เอง ⇒ ปุ่มที่เห็นคือปุ่มที่กดผ่านจริง
//   (ไม่มีสิทธิ์ = ไม่โชว์ปุ่มเพิ่ม/คอลัมน์จัดการเลย · กติกา ui-visibility)
// ⭐ **ลบได้แม้มีใบใช้อยู่** — พื้นที่เก็บรหัสเป็นภาพนิ่ง: ใบที่ส่งผลแล้วไม่เปลี่ยน · ใบที่ยังไม่ส่งต้องเลือกขนาดใหม่ก่อนส่ง
//   ⇒ กล่องยืนยันบอกจำนวนใบที่กระทบ (`packageSizeDeleteConfirm`) ไม่ใช่ถามว่า "แน่ใจไหม"
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Plus, Ruler, Trash2 } from "lucide-react";
import PackageSizeModal from "@/components/service/PackageSizeModal";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import EmptyState from "@/components/ui/EmptyState";
import Pager from "@/components/ui/Pager";
import RowActionMenu from "@/components/ui/RowActionMenu";
import Segmented from "@/components/ui/Segmented";
import StatusNotice from "@/components/ui/StatusNotice";
import { TableScroll } from "@/components/ui/Table";
import Toast from "@/components/ui/Toast";
import Workspace, { ListPanel } from "@/components/ui/Workspace";
import { apiJson } from "@/lib/apiFetch";
import { fmtDateTime, fmtNumber, naText } from "@/lib/format";
import {
  packageSizeDeleteConfirm, packageSizeDeletedText, packageSizeFilterOptions, packageSizeLegendText, packageSizeRows,
} from "@/lib/service/packageSizeForm";
import {
  packageRegistryWarnings, packageSizeBandText, packageSizeError, packageSizeRangeText,
} from "@/lib/service/packageSizes";
import useLatestRun from "@/lib/ui/useLatestRun";
import useRevalidateOnFocus from "@/lib/ui/useRevalidateOnFocus";
import { usePagination } from "@/lib/usePagination";
import styles from "./page.module.css";

const LOAD_FAILED = "โหลดทะเบียนขนาดแพ็คเกจไม่สำเร็จ";

export default function PackageSizesPage() {
  const [sizes, setSizes] = useState([]);
  /* `null` = server ไม่ได้นับ (คนอ่านอย่างเดียว) — ไม่ใช่ "ไม่มีใบใช้" */
  const [usage, setUsage] = useState(null);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState(null);   // null = ปิด · {} = เพิ่มใหม่ · แถว = แก้
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [toast, setToast] = useState(null);

  /* ⭐ หน้านี้ยิงโหลดซ้อนกันได้ (เปิดหน้า · กลับมามองแท็บ · หลังบันทึก/ลบ · ตอนเปิดกล่องลบ) ⇒ จองรอบก่อนยิง
     คำตอบของรอบที่ตกไปแล้วห้ามเขียนทับของใหม่ (ท่าเดียวกับทะเบียนเครื่อง · `useLatestRun`) */
  const startRun = useLatestRun();
  /* เคยได้ทะเบียนมาแล้วหรือยัง — โหลดเบื้องหลังที่พัง **ก่อน** ได้ข้อมูลครั้งแรก ต้องขึ้นเป็นโหลดไม่สำเร็จ
     ไม่ใช่ตกไปเป็น "ยังไม่มีขนาดในทะเบียน" (รอบแรกถูกรอบเบื้องหลังแซงแล้วรอบเบื้องหลังพัง) */
  const loadedOnce = useRef(false);
  const load = useCallback(async (opts) => {
    const isLatest = startRun();
    if (!opts?.background) setLoading(true);
    if (!opts?.background) setLoadError("");
    try {
      const data = await apiJson("/api/service/package-sizes", { fallbackError: LOAD_FAILED });
      if (!isLatest()) return;
      loadedOnce.current = true;
      setSizes(Array.isArray(data?.sizes) ? data.sizes : []);
      setUsage(data?.usage && typeof data.usage === "object" ? data.usage : null);
      setCanEdit(data?.canEdit === true);
      setLoadError("");
    } catch (e) {
      // ⚠️ ห้ามกลืน error แล้วโชว์ "ยังไม่มีขนาด" — โหลดพังกับยังไม่มีข้อมูลหน้าตาเหมือนกัน
      //    โหลดเบื้องหลังที่พังตอนจอมีของอยู่แล้ว = เงียบ (ของเดิมยังถูกกว่าจอแดง)
      if (isLatest() && (!opts?.background || !loadedOnce.current)) setLoadError(e.message || LOAD_FAILED);
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [startRun]);
  useEffect(() => { load(); }, [load]);
  /* กลับมามองแท็บ = ดึงใหม่เงียบ ๆ — จำนวนใบที่ใช้ขนาด (กล่องลบ) เปลี่ยนตามที่หัวหน้าคนอื่นเคาะ */
  useRevalidateOnFocus(load);

  /* ระหว่างโหลด/โหลดพัง ส่ง `null` ⇒ แถบไม่ขึ้นป้ายจำนวน ("ทั้งหมด 0" บนจอที่โหลดพังอ่านว่าทะเบียนว่าง) */
  const filters = useMemo(
    () => packageSizeFilterOptions(loading || loadError ? null : sizes),
    [sizes, loading, loadError],
  );
  const rows = useMemo(() => packageSizeRows(sizes, filter), [sizes, filter]);
  const warnings = useMemo(() => packageRegistryWarnings(sizes), [sizes]);
  const legend = useMemo(() => packageSizeLegendText(sizes), [sizes]);
  const { page, setPage, pageSize, setPageSize, pageCount, total, pageRows } = usePagination(rows, { resetKey: filter });

  const save = async (payload) => {
    setBusy(true);
    try {
      const isNew = !editing?.code;
      await apiJson(isNew ? "/api/service/package-sizes" : `/api/service/package-sizes/${encodeURIComponent(editing.code)}`, {
        method: isNew ? "POST" : "PATCH",
        json: payload,
        fallbackError: isNew ? "เพิ่มขนาดไม่สำเร็จ" : "แก้ขนาดไม่สำเร็จ",
      });
      setEditing(null);
      setToast({ kind: "success", msg: isNew ? `เพิ่มขนาด ${payload.code} แล้ว` : `บันทึกขนาด ${payload.code} แล้ว` });
      await load({ background: true });
    } finally {
      setBusy(false);
    }
  };

  /* 🔑 กล่องลบถามตัวตัดสินเดียว — ด่าน (เหลือขนาดสุดท้าย) + จำนวนใบที่กระทบ + ผลกับใบที่ส่งแล้ว */
  const removeView = removing ? packageSizeDeleteConfirm(removing, { usage, sizes, canEdit }) : null;

  /* error ขึ้นในกล่อง (ConfirmDialog จับ throw) — กล่องไม่ปิด คนกดเห็นว่าไม่สำเร็จเพราะอะไร */
  const remove = async () => {
    const code = removing.code;
    const out = await apiJson(`/api/service/package-sizes/${encodeURIComponent(code)}`, {
      method: "DELETE", fallbackError: "ลบขนาดไม่สำเร็จ",
    });
    setRemoving(null);
    /* ตัวเลขใน toast = ที่ server นับ ณ ตอนลบ (อาจต่างจากที่กล่องยืนยันโชว์ ถ้ามีคนเคาะระหว่างนั้น) */
    setToast({ kind: "success", msg: packageSizeDeletedText(code, out?.usage) });
    await load({ background: true });
  };

  const openRemove = (size) => {
    setRemoving(size);
    /* นับใหม่ตอนเปิดกล่อง — ตัวเลข "กี่ใบใช้ขนาดนี้" ที่ค้างมาจากตอนโหลดหน้าอาจเก่าไปหลายนาที */
    load({ background: true });
  };

  /* เครื่องมือของรายการ = fragment เข้า `ListPanel toolbar` — แผงห่อ `.toolbar` ให้เอง ห้ามห่อซ้ำ
     ⭐ ตัวกรองสามตัวตายตัว = แถบเลือกที่เห็นครบ ไม่ใช่ดรอปดาวน์ (กติกาคอนโทรล) · ป้ายจำนวนเป็นตัวเลข ไม่ต่อในชื่อ */
  const toolbar = (
    <>
      <Segmented className={styles.filterSeg} ariaLabel="กรองตามวิธีเลือกขนาด" value={filter} onChange={setFilter} options={filters} />
      <span className={styles.who}>
        แก้ได้: <b>แอดมิน · หัวหน้าฝ่ายบริการ</b> · คนอื่นเปิดอ่านได้
      </span>
    </>
  );

  return (
    <>
      <Workspace
        icon={<Ruler size={20} aria-hidden="true" />}
        title="ขนาดแพ็คเกจ"
        subtitle="ขนาดแพ็คเกจและขนาดพื้นที่ (ลบ.ม.) ของแต่ละขนาด — ระบบใช้เสนอขนาดตอนหัวหน้าฝ่ายบริการเคาะผลประเมินพื้นที่"
        headerRight={canEdit ? (
          <Button tone="accent" className={styles.touch} icon={<Plus size={15} aria-hidden="true" />} onClick={() => setEditing({})}>
            เพิ่มขนาด
          </Button>
        ) : null}
      >
        {/* `loading` แทนที่เฉพาะเนื้อแผง — หัวกับแถบเครื่องมือยืนอยู่ระหว่างโหลด · โหลดพัง = ขีด ไม่ใช่ "0 ขนาด" */}
        <ListPanel
          icon={<Ruler size={17} aria-hidden="true" />}
          title="รายการขนาดแพ็คเกจ"
          subtitle="ขนาดพื้นที่ = ลบ.ม. สูงสุดของขนาดนั้น · ระบบเสนอขนาดจาก ลบ.ม. ของพื้นที่ที่ช่างวัด"
          count={loading || loadError ? null : `${fmtNumber(rows.length)} ขนาด`}
          loading={loading}
          toolbar={toolbar}
        >
          {loadError ? (
            <StatusNotice tone="error" title={LOAD_FAILED}
              action={<Button size="sm" variant="ghost" className={styles.touch} onClick={() => load()}>ลองใหม่</Button>}>
              {/* ข้อความของ server (ไทย · ไม่มีชื่อตาราง) — ตรงกับหัวข้อ = ไม่ขึ้นซ้ำ บอกทางต่อแทน */}
              {loadError === LOAD_FAILED ? "กด “ลองใหม่” · ถ้ายังไม่ได้ให้แจ้งผู้ดูแลระบบ" : loadError}
            </StatusNotice>
          ) : sizes.length === 0 ? (
            /* คนที่ไม่มีสิทธิ์แก้ไม่เห็นปุ่มเพิ่ม — อย่าบอกให้ไปทำสิ่งที่ทำไม่ได้ */
            <EmptyState plain icon={Ruler}>
              {canEdit
                ? "ยังไม่มีขนาดในทะเบียน — เพิ่มขนาดก่อน หัวหน้าจึงเคาะผลประเมินพื้นที่ได้"
                : "ยังไม่มีขนาดในทะเบียน"}
            </EmptyState>
          ) : (
            <>
              {/* สภาพที่ทำให้ระบบเสนอขนาดไม่ได้ (เช่น ไม่มีขนาดไม่มีเพดาน) — ขึ้นเหนือตาราง ไม่ซ่อนในเชิงอรรถ */}
              {warnings.map((line) => (
                <StatusNotice key={line} tone="warning">{line}</StatusNotice>
              ))}
              {rows.length === 0 ? (
                /* ⚠️ กรองแล้วไม่เหลือ ≠ ไม่มีขนาด — ตารางว่างโดยไม่มีคำอธิบายอ่านเหมือนข้อมูลหาย */
                <EmptyState plain icon={Ruler}>ไม่มีขนาดในกลุ่มนี้ — เลือก “ทั้งหมด” เพื่อดูทุกขนาด</EmptyState>
              ) : (
                /* ⭐ **กล่องแคบกว่าตาราง = แถวเรียงเป็นป้าย/ค่า ไม่ใช่ปัดข้าง** (`styles.shell` · UAT PR-P 01/10)
                   🐞 เดิมตาราง 760px ในกล่องที่แคบกว่า ⇒ ที่ 768 ปุ่ม "แก้ไข" ถูกตัดเป็น "แก้ไ" เมนู "…" (ลบ) หลุดจอ · ที่ 390 เห็นแค่สาม
                      คอลัมน์แรก หมายเหตุ/แก้ไขล่าสุด/ปุ่มทั้งสองต้องปัดข้างโดยไม่มีอะไรบอก · ป้ายของแต่ละค่ามาจาก `data-label` */
                <TableScroll minWidth={canEdit ? 760 : 640} cells="stacked" className={styles.shell}>
                  <table>
                    <thead>
                      <tr>
                        <th>รหัส</th>
                        <th>ชื่อเต็ม</th>
                        <th>ขนาดพื้นที่</th>
                        <th>หมายเหตุ</th>
                        <th>แก้ไขล่าสุด</th>
                        {canEdit && <th aria-label="จัดการ" />}
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((size) => {
                        const lastSize = packageSizeError("delete", {}, { canEdit, before: size, sizes });
                        return (
                          <tr key={size.code}>
                            <td data-label="รหัส"><b className={`mono ${styles.code}`}>{size.code}</b></td>
                            <td data-label="ชื่อเต็ม">{naText(size.nameEn)}</td>
                            <td data-label="ขนาดพื้นที่">
                              <span className={styles.band}>{packageSizeBandText(size, sizes)}</span>
                              <span className="cell-sub">{packageSizeRangeText(size, sizes)}</span>
                            </td>
                            <td data-label="หมายเหตุ" className={styles.note}>{naText(size.note)}</td>
                            <td data-label="แก้ไขล่าสุด">
                              {/* แถวตั้งต้นจาก migration ไม่มีคนแก้ — บอกที่มา ไม่ใช่ขีดที่อ่านว่า "ข้อมูลหาย" */}
                              {size.updatedByName || "ค่าตั้งต้นของระบบ"}
                              <span className="cell-sub">{size.updatedAt ? fmtDateTime(size.updatedAt) : naText(null)}</span>
                            </td>
                            {canEdit && (
                              <td data-actions="1">
                                {/* ⭐ ปุ่มก้าวถัดไป 1 ปุ่ม + เมนู "…" (มติผู้ใช้ 2026-08-01 · ทรงเดียวกับทะเบียนรุ่นเครื่อง)
                                    ⚠️ flex อยู่ที่ **กล่องข้างใน** ไม่ใช่ที่ <td> — td ที่เป็น flex เลิกเป็นเซลล์ตาราง เส้นคั่นแถวใต้คอลัมน์นี้
                                       จึงถูกวาดที่ความสูงของมันเอง = เส้นขาด/เหลื่อมทุกแถว (UAT PR-P 01/10) */}
                                <div className={styles.actions}>
                                <Button size="sm" className={styles.touch} onClick={() => setEditing(size)} icon={<Pencil size={14} aria-hidden="true" />}>
                                  แก้ไข
                                </Button>
                                <RowActionMenu
                                  className={styles.touchMenu}
                                  label={`การจัดการขนาด ${size.code}`}
                                  items={[{
                                    /* ⭐ **โชว์เสมอ แล้วบอกเหตุ** — ขนาดสุดท้ายลบไม่ได้ (ทะเบียนว่าง = ทุกใบส่งผลไม่ได้) */
                                    id: "delete",
                                    label: "ลบขนาดนี้",
                                    icon: Trash2,
                                    tone: "danger",
                                    disabled: !!lastSize,
                                    disabledReason: lastSize || undefined,
                                    onClick: () => openRemove(size),
                                  }]}
                                />
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </TableScroll>
              )}
              {/* กติกาสองข้อที่ตารางนี้ป้อนให้จอเคาะ — ข้อความประกอบจากทะเบียนจริง ไม่ใช่ตัวเลขที่พิมพ์ตายไว้ */}
              <div className={styles.notes}>
                <p><b>ขนาดที่ระบบเสนอ</b> มาจาก ลบ.ม. ของพื้นที่เทียบกับขนาดพื้นที่: {legend}</p>
                <p>
                  ระบบเสนอ <b>1 แพ็ค/เดือน</b> ทุกพื้นที่ · หัวหน้าเปลี่ยนได้ทั้งขนาดและจำนวน ที่แท็บ <b>สรุปส่งผล</b> ของใบประเมินพื้นที่
                  {canEdit ? " · แก้ช่วงหรือลบขนาด มีผลกับการเคาะครั้งถัดไป — ใบที่ส่งผลแล้วไม่เปลี่ยน" : ""}
                </p>
              </div>
            </>
          )}

          {!loadError && rows.length > 0 && (
            <Pager
              page={page} pageCount={pageCount} total={total} onPage={setPage}
              pageSize={pageSize} onPageSize={setPageSize} itemLabel="ขนาด"
            />
          )}
        </ListPanel>
      </Workspace>

      {/* โมดัลกับ Toast อยู่นอกเนื้อแผง (กติกา ListPanel) · ฟอร์มเดียวทั้งเพิ่มและแก้ */}
      <PackageSizeModal
        open={!!editing}
        size={editing?.code ? editing : null}
        sizes={sizes}
        canEdit={canEdit}
        busy={busy}
        onClose={() => !busy && setEditing(null)}
        onSubmit={save}
      />

      <ConfirmDialog
        open={!!removing}
        title={removeView?.title}
        message={removeView?.message}
        detail={removeView?.detail || undefined}
        tone={removeView?.blocked ? "default" : "danger"}
        /* ลบไม่ได้ = ปุ่มเดียว "ปิด" — ปุ่มที่เขียนว่า "ลบ" แต่กดแล้วแค่ปิดกล่อง คือปุ่มที่โกหก */
        confirmLabel={removeView?.blocked ? "ปิด" : removeView?.confirmLabel}
        hideCancel={!!removeView?.blocked}
        onConfirm={removeView && !removeView.blocked ? remove : undefined}
        onClose={() => setRemoving(null)}
      >
        {/* เลขที่ใบที่ต้องเลือกขนาดใหม่ — หัวหน้าตามไปเปิดได้ (ตัวเลข "3 ใบ" อย่างเดียวไม่บอกว่าใบไหน · UAT PR-P 01/10) */}
        {removeView?.docsText ? <p className={styles.removeDocs}>{removeView.docsText}</p> : null}
      </ConfirmDialog>
      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
