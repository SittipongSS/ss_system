"use client";
// ── ทะเบียนรุ่นเครื่อง (/service/models · mig 0344) ───────────────────────
//
// ⭐ **ตั้งค่าของโมดูลบริการ ไม่ใช่ /settings** — รายการใต้ /settings คุมด้วย
//   `master:manage` ซึ่งให้เป็นสิทธิ์รายคนไม่ได้ ⇒ ฝ่าย TS ทั้งฝ่ายจะเข้าไม่ได้
//   และต้องรอแอดมินเพิ่มรุ่นให้ทุกครั้ง · ที่นี่ด่านเป็น `canEditService` ตรง ๆ
//
// ⭐ **ที่นี่คือที่ "สร้าง" · โมดัลเพิ่มเครื่องคือที่ "ใช้"** (มติผู้ใช้ 2026-09-03)
//   แลกกับ: เจอรุ่นใหม่กลางงานต้องออกมาตั้งค่าก่อนแล้วกลับไป — ยอมรับได้เพราะ
//   รุ่นใหม่นาน ๆ ครั้ง และกันรุ่นซ้ำ/พิมพ์ผิดได้จริง (ชีตเก่ามี OV08 กับ OV-08 ปนกัน)
import { useCallback, useEffect, useMemo, useState } from "react";
import { Boxes, Pencil, Plus, Power, Trash2 } from "lucide-react";
import AssetModelModal from "@/components/service/AssetModelModal";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import EmptyState from "@/components/ui/EmptyState";
import RowActionMenu from "@/components/ui/RowActionMenu";
import SkeletonRows from "@/components/ui/Skeleton";
import { TableShell } from "@/components/ui/Table";
import Toast from "@/components/ui/Toast";
import Workspace from "@/components/ui/Workspace";
import { useDepartment, useRole, useTeam, useTeams } from "@/lib/roleContext";
import { canEditService } from "@/lib/permissions";
import useRevalidateOnFocus from "@/lib/ui/useRevalidateOnFocus";
import { ASSET_KIND_LABELS } from "@/lib/service/assetKinds";
import { assetModelError } from "@/lib/service/assetModels";
import { naText } from "@/lib/format";
import { apiJson } from "@/lib/apiFetch";
import styles from "./page.module.css";

export default function ServiceAssetModelsPage() {
  const [models, setModels] = useState([]);
  const [usage, setUsage] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState(null);   // null = ปิด · {} = สร้างใหม่ · แถว = แก้
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [toast, setToast] = useState(null);

  const role = useRole();
  const team = useTeam();
  const teams = useTeams();
  const department = useDepartment();
  const canEdit = useMemo(
    () => canEditService({ role, team, teams, department }),
    [role, team, teams, department],
  );

  const load = useCallback(async (opts) => {
    if (!opts?.background) setLoading(true);
    setLoadError("");
    try {
      const data = await apiJson("/api/service/asset-models", {
        fallbackError: "โหลดทะเบียนรุ่นไม่สำเร็จ",
      });
      setModels(Array.isArray(data?.models) ? data.models : []);
      setUsage(data?.usage && typeof data.usage === "object" ? data.usage : {});
    } catch (e) {
      // ⚠️ ห้ามกลืน error แล้วโชว์ "ยังไม่มีรุ่น" — โหลดพังกับยังไม่มีข้อมูลหน้าตาเหมือนกัน
      if (!opts?.background) setLoadError(e.message || "โหลดทะเบียนรุ่นไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  useRevalidateOnFocus(load);

  const save = async (input) => {
    setBusy(true);
    try {
      const isNew = !editing?.id;
      await apiJson(isNew ? "/api/service/asset-models" : `/api/service/asset-models/${editing.id}`, {
        method: isNew ? "POST" : "PATCH",
        json: input,
        fallbackError: isNew ? "เพิ่มรุ่นไม่สำเร็จ" : "แก้รุ่นไม่สำเร็จ",
      });
      setEditing(null);
      setToast({ kind: "success", msg: isNew ? `เพิ่มรุ่น ${input.name} แล้ว` : "บันทึกแล้ว" });
      await load({ background: true });
    } finally {
      setBusy(false);
    }
  };

  /* ⭐ ปิด/เปิดใช้งานเป็นปุ่มเดียวจบ ไม่ต้องเปิดฟอร์ม — มันคือการกระทำที่ใช้บ่อยที่สุด
     ของหน้านี้ (รุ่นที่เลิกสั่งแล้วแต่ยังมีเครื่องอยู่หน้างาน) */
  const toggleActive = async (model) => {
    try {
      await apiJson(`/api/service/asset-models/${model.id}`, {
        method: "PATCH",
        json: { isActive: model.isActive === false },
        fallbackError: "เปลี่ยนสถานะรุ่นไม่สำเร็จ",
      });
      await load({ background: true });
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
    }
  };

  const remove = async () => {
    if (!removing) return;
    try {
      await apiJson(`/api/service/asset-models/${removing.id}`, {
        method: "DELETE", fallbackError: "ลบรุ่นไม่สำเร็จ",
      });
      setToast({ kind: "success", msg: `ลบรุ่น ${removing.name} แล้ว` });
      setRemoving(null);
      await load({ background: true });
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
      setRemoving(null);
    }
  };

  const removeGate = removing
    ? assetModelError('delete', {}, { canEdit, before: removing, usedBy: usage[removing.id] || 0 })
    : null;

  const rows = useMemo(() => models.slice().sort((a, b) => (
    a.kind === b.kind
      ? String(a.name).localeCompare(String(b.name), "th")
      : String(ASSET_KIND_LABELS[a.kind] || a.kind).localeCompare(String(ASSET_KIND_LABELS[b.kind] || b.kind), "th")
  )), [models]);

  return (
    <Workspace
      icon={<Boxes size={20} aria-hidden="true" />}
      title="ทะเบียนรุ่นเครื่อง"
      subtitle="รุ่นและสีของแต่ละรุ่น — ต้นทางของตัวเลือกตอนเพิ่มเครื่อง"
      headerRight={(
        <>
          <span className="ui-badge">{models.length} รุ่น</span>
          {/* ไม่มีสิทธิ์แก้ = ไม่โชว์ปุ่ม (ไม่ใช่โชว์แล้วกดไม่ได้) */}
          {canEdit && (
            <Button tone="accent" onClick={() => setEditing({})} icon={<Plus size={15} aria-hidden="true" />}>
              เพิ่มรุ่น
            </Button>
          )}
        </>
      )}
      loading={loading}
    >
      {loadError && <p className="form-error" role="alert">{loadError}</p>}

      {loading || loadError ? (
        loading ? <SkeletonRows rows={5} /> : null
      ) : rows.length === 0 ? (
        <EmptyState icon={Boxes}>
          ยังไม่มีรุ่นในทะเบียน — เพิ่มรุ่นก่อน แล้วจึงขึ้นทะเบียนเครื่องได้
        </EmptyState>
      ) : (
        <TableShell minWidth={760}>
          <table>
            <thead>
              <tr>
                <th>รุ่น</th>
                <th>รหัส 4 ตัว</th>
                <th>ชนิด</th>
                <th>สีที่มี</th>
                <th className="a-right">ใช้อยู่</th>
                <th>สถานะ</th>
                {canEdit && <th aria-label="การกระทำ" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((model) => {
                const used = usage[model.id] || 0;
                return (
                  <tr key={model.id} className={model.isActive === false ? styles.off : undefined}>
                    <td>{model.name}</td>
                    <td className="mono">{model.modelCode}</td>
                    <td>{ASSET_KIND_LABELS[model.kind] || model.kind}</td>
                    <td>{model.colours?.length ? model.colours.join(" · ") : naText(null)}</td>
                    <td className="a-right">{used || naText(null)}</td>
                    <td>
                      <span className="ui-badge">{model.isActive === false ? "ปิดใช้งาน" : "ใช้งาน"}</span>
                    </td>
                    {canEdit && (
                      <td className={styles.actions}>
                        {/* ⭐ ปุ่มก้าวถัดไป 1 ปุ่ม + เมนู "…" (มติผู้ใช้ 2026-08-01) —
                            เรียงสามปุ่มกินความกว้างจนคอลัมน์อื่นถูกบีบและปุ่มลบหลุดขอบจอ */}
                        <Button size="sm" onClick={() => setEditing(model)} icon={<Pencil size={14} aria-hidden="true" />}>
                          แก้ไข
                        </Button>
                        <RowActionMenu
                          label={`การจัดการรุ่น ${model.name}`}
                          items={[
                            {
                              id: "toggle",
                              label: model.isActive === false ? "เปิดใช้งาน" : "ปิดใช้งาน",
                              icon: Power,
                              onClick: () => toggleActive(model),
                            },
                            {
                              /* ⭐ **โชว์เสมอ แล้วบอกเหตุ** — กติกา GatedAction ของระบบ
                                 🐞 ของเดิมซ่อนปุ่มเมื่อ `used > 0` ⇒ คนที่หาปุ่มลบไม่เจอ
                                    และไม่มีอะไรบอกว่าทำไม
                                 ⚠️ รุ่นที่ใช้อยู่ลบไม่ได้จริง — เครื่องที่ออกรหัสไปแล้ว
                                    ถือรหัส 4 ตัวของรุ่นนี้ไว้ในรหัสตัวเอง */
                              id: "delete",
                              label: "ลบรุ่นนี้",
                              icon: Trash2,
                              tone: "danger",
                              separatorBefore: true,
                              disabled: used > 0,
                              disabledReason: used > 0
                                ? `มีเครื่องใช้รุ่นนี้ ${used} ตัว — ปิดใช้งานแทน`
                                : undefined,
                              onClick: () => setRemoving(model),
                            },
                          ]}
                        />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableShell>
      )}

      <AssetModelModal
        open={!!editing}
        model={editing?.id ? editing : null}
        usedBy={editing?.id ? (usage[editing.id] || 0) : 0}
        canEdit={canEdit}
        busy={busy}
        onClose={() => !busy && setEditing(null)}
        onSubmit={save}
      />

      {/* 🔑 ด่านตัวเดียวกับที่ API ใช้ — กดไม่ได้ก็ยังเปิดกล่องมาอ่านเหตุผลได้ */}
      <ConfirmDialog
        open={!!removing}
        title="ลบรุ่นนี้ออกจากทะเบียน"
        message={removeGate || `ลบรุ่น ${removing?.name || ""} (${removing?.modelCode || ""}) — ยังไม่มีเครื่องใช้รุ่นนี้`}
        detail={removeGate ? undefined : "รหัส 4 ตัวจะถูกปล่อยคืนให้รุ่นอื่นเอาไปใช้ได้"}
        confirmLabel="ลบ"
        tone="danger"
        onConfirm={removeGate ? undefined : remove}
        onClose={() => setRemoving(null)}
      />
      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}
