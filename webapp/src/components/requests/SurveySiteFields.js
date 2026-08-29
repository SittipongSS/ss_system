"use client";
// ── บล็อก "สถานที่ + พื้นที่ที่ต้องประเมิน" ของใบประเมินพื้นที่ (mig 0314) ──
//
// ⭐ **หนึ่งใบ = หนึ่งสถานที่ · หนึ่งรายการ = หนึ่งพื้นที่ (โซน)** (มติผู้ใช้ 2026-08-29)
//    รายการเดียวมีของสองแบบปนกันได้: โซนเดิมที่มีรหัส ZN แล้ว กับพื้นที่ใหม่ที่ยัง
//    ไม่มีรหัสจนกว่าจะกดส่งใบ — **ลิสต์เดียว สองปุ่ม** ไม่ใช่สองบล็อกแยก
//    (ถ้าแยกบล็อก คนอ่านต้องบวกเลขเองว่าใบนี้ให้ไปวัดกี่จุด)
//
// ⚠️ ตัวตรวจอยู่ที่ `lib/service/surveyRequest.js` ตัวเดียว — ทั้งจอนี้และ handler
//    เรียกตัวเดียวกัน · ห้ามเขียนกฎชื่อซ้ำ/เพดานจำนวนขึ้นใหม่ตรงนี้
//
// ⚠️ **โหลดของเองในคอมโพเนนต์นี้** (ไม่รับผ่าน props เหมือนดีล/SO) — ทะเบียนไซต์
//    ผูกกับ *ลูกค้าของดีลที่เพิ่งเลือก* ⇒ ผู้เรียกทุกที่ (หน้าเปิดคำร้อง + โมดัลใน
//    หน้าอื่น) จะต้องรู้จัก /api/service/sites เหมือนกันหมดถ้าให้ส่งมาทางพรอป
import { useEffect, useState } from "react";
import { Layers, Plus, X } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import OptionTiles from "@/components/ui/OptionTiles";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { apiJson } from "@/lib/apiFetch";
import { zoneNameKey } from "@/lib/service/surveyRequest";
import styles from "./requestForm.module.css";

// เกินเท่านี้แล้วแผ่นเลือกยาวกว่าหน้าจอ — ค่อยเปลี่ยนเป็นช่องค้นหา
// (กติกา "ชุดเล็กกางให้เห็น ชุดยาวค่อยเป็นดรอปดาวน์" — OptionTiles.js)
const TILE_LIMIT = 6;

export default function SurveySiteFields({
  customerId = "",
  customerName = "",
  value,
  onChange,
  disabled = false,
  canCreateSite = false,
}) {
  const siteId = value.siteId || "";
  const zones = value.zones || [];
  const [sites, setSites] = useState([]);
  const [siteZones, setSiteZones] = useState([]);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState(false);
  // `adding` แยกจากเนื้อของร่าง — ช่องเปล่ากับ "ยังไม่เปิดช่อง" คนละสถานะ
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", note: "" });

  const set = (patch) => onChange({ ...value, ...patch });

  // ทะเบียนไซต์ของลูกค้าเจ้าของดีล — เปลี่ยนดีลข้ามลูกค้าแล้วต้องล้างที่เลือกไว้
  // (ไม่ล้าง = ใบไปเกาะไซต์ของลูกค้าคนก่อน แล้วโดน handler ตีกลับตอนกดบันทึก)
  useEffect(() => {
    if (!customerId) { setSites([]); return; }
    let alive = true;
    setLoading(true);
    apiJson(`/api/service/sites?customerId=${encodeURIComponent(customerId)}&includeInactive=0`)
      .then((rows) => { if (alive) setSites(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (alive) setSites([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [customerId]);

  // โซนของไซต์ที่เลือก — ใช้ทั้งปุ่ม "เลือกจากพื้นที่เดิม" และป้ายชื่อบนแถว
  useEffect(() => {
    if (!siteId) { setSiteZones([]); return; }
    let alive = true;
    apiJson(`/api/service/sites/${encodeURIComponent(siteId)}/zones`)
      .then((rows) => { if (alive) setSiteZones(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (alive) setSiteZones([]); })
      .finally(() => { if (alive) setPicking(false); });
    return () => { alive = false; };
  }, [siteId]);

  const pickSite = (id) => {
    if (id === siteId) return;
    // ⚠️ เปลี่ยนไซต์ = ล้างพื้นที่ทั้งลิสต์ — โซนเดิมที่เลือกไว้เป็นของไซต์เก่า
    //    (handler ตรวจซ้ำอยู่แล้ว แต่ให้ผู้ใช้เห็นผลทันทีดีกว่าถูกตีกลับตอนกดส่ง)
    set({ siteId: id, zones: [] });
    setAdding(false);
    setDraft({ name: "", note: "" });
  };

  const addZone = (row) => set({ zones: [...zones, row] });
  const dropZone = (index) => set({ zones: zones.filter((_, i) => i !== index) });

  const takenZoneIds = new Set(zones.map((z) => z.zoneId).filter(Boolean));
  const takenNames = new Set([
    ...zones.filter((z) => z.name).map((z) => zoneNameKey(z.name)),
    ...siteZones.map((z) => zoneNameKey(z.name)),
  ]);
  const restZones = siteZones.filter((z) => !takenZoneIds.has(z.id));
  const zoneName = (row) => row.name
    || siteZones.find((z) => z.id === row.zoneId)?.name
    || row.zoneId;

  const submitDraft = () => {
    const name = draft.name.trim().replace(/\s+/g, " ");
    if (!name) return;
    if (takenNames.has(zoneNameKey(name))) return;   // ปุ่มจางอยู่แล้ว — กันซ้ำอีกชั้น
    addZone({ name, note: draft.note.trim() || null });
    setDraft({ name: "", note: "" });
    setAdding(false);
  };

  const draftName = draft.name.trim().replace(/\s+/g, " ");
  const draftClash = !!draftName && takenNames.has(zoneNameKey(draftName));

  const siteOptions = sites.map((s) => ({
    value: s.id,
    label: s.name || s.code || s.id,
    description: [s.code, s.address].filter(Boolean).join(" · ") || undefined,
    // ค้นด้วยรหัส SS หรือที่อยู่ได้ด้วย — คนจำสาขาจากถนน ไม่ใช่จากชื่อในทะเบียน
    search: [s.name, s.code, s.address, s.routeZone].filter(Boolean).join(" "),
  }));

  return (
    <>
      <div className="form-group col-span-2">
        <span className={styles.fieldLabel}>สถานที่ที่จะให้เข้าไปประเมิน</span>
        {!customerId ? (
          <small className={styles.hint}>เลือกดีลก่อน — รายการสถานที่มาจากลูกค้าของดีลนั้น</small>
        ) : loading ? (
          <small className={styles.hint}>กำลังโหลดทะเบียนไซต์ของ {customerName || "ลูกค้ารายนี้"}…</small>
        ) : !sites.length ? (
          /* ⭐ ทางตันต้องบอกทางออก ไม่ใช่ช่องว่าง — SA ส่วนใหญ่สร้างไซต์เองไม่ได้
             (สิทธิ์แก้ทะเบียนบริการอยู่ที่ฝ่าย TS กับทีมขาย SV — canEditService) */
          <small className={styles.hint}>
            {customerName || "ลูกค้ารายนี้"} ยังไม่มีสถานที่ในทะเบียนไซต์บริการ —
            {canCreateSite
              ? " สร้างที่ /service/sites แล้วกลับมาเลือก"
              : " ขอให้ฝ่ายบริการ (TS) หรือทีมขาย SV สร้างให้ก่อน แล้วกลับมาเลือก"}
          </small>
        ) : siteOptions.length > TILE_LIMIT ? (
          <SearchableSelect
            options={siteOptions.map((o) => ({
              value: o.value, label: o.label, search: o.search,
              render: (
                <span className={styles.siteOption}>
                  <b>{o.label}</b>
                  {o.description ? <small className={styles.hint}>{o.description}</small> : null}
                </span>
              ),
            }))}
            value={siteId}
            onChange={pickSite}
            disabled={disabled}
            placeholder="เลือกสถานที่"
            ariaLabel="สถานที่ที่จะให้เข้าไปประเมิน"
          />
        ) : (
          <OptionTiles
            options={siteOptions}
            value={siteId}
            onChange={pickSite}
            disabled={disabled}
            ariaLabel="สถานที่ที่จะให้เข้าไปประเมิน"
          />
        )}
      </div>

      {!!siteId && (
        <div className="form-group col-span-2">
          <span className={styles.fieldLabel}>
            พื้นที่ที่ต้องประเมิน{" "}
            <span className={styles.hint}>(1 รายการ = 1 พื้นที่)</span>
          </span>

          {zones.length ? (
            <ol className={styles.zoneList}>
              {zones.map((row, index) => (
                <li key={row.zoneId || `new-${index}-${row.name}`} className={styles.zoneRow}>
                  <span className={styles.zoneNo}>{index + 1}</span>
                  <span className={styles.zoneBody}>
                    <b>{zoneName(row)}</b>
                    <small className={styles.hint}>
                      {row.zoneId
                        ? `${siteZones.find((z) => z.id === row.zoneId)?.code || row.zoneId} · วัดซ้ำพื้นที่เดิม`
                        : "พื้นที่ใหม่ — ได้รหัส ZN ตอนกดส่งใบ"}
                      {row.note ? ` · ${row.note}` : ""}
                    </small>
                  </span>
                  <Button
                    type="button" iconOnly variant="ghost" size="sm" disabled={disabled}
                    icon={<X size={16} />} aria-label={`เอา ${zoneName(row)} ออก`}
                    onClick={() => dropZone(index)}
                  />
                </li>
              ))}
            </ol>
          ) : (
            <small className={styles.hint}>ยังไม่มีพื้นที่ในใบนี้ — เพิ่มอย่างน้อย 1 รายการก่อนส่ง</small>
          )}

          <div className={styles.zoneActions}>
            <Button
              type="button" tone="accent" size="sm" disabled={disabled}
              icon={<Plus size={16} />}
              onClick={() => { setPicking(false); setAdding(true); }}
            >
              เพิ่มพื้นที่ใหม่
            </Button>
            <Button
              type="button" size="sm" disabled={disabled || !restZones.length}
              icon={<Layers size={16} />}
              onClick={() => setPicking((on) => !on)}
            >
              เลือกจากพื้นที่เดิม{restZones.length ? ` (${restZones.length})` : ""}
            </Button>
          </div>

          {/* พื้นที่ใหม่ — ชื่ออย่างเดียวพอ (อาคาร/ชั้นเป็นของทะเบียนที่ TS กรอกหน้างาน) */}
          {adding && (
            <div className={styles.zoneDraft}>
              <Input
                value={draft.name}
                disabled={disabled}
                autoFocus
                placeholder="ชื่อพื้นที่ เช่น ล็อบบี้ชั้น G"
                aria-label="ชื่อพื้นที่ใหม่"
                invalid={draftClash}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitDraft(); } }}
              />
              <Input
                value={draft.note}
                disabled={disabled}
                placeholder="สิ่งที่อยากให้ช่างรู้ก่อนไป (ไม่บังคับ)"
                aria-label="หมายเหตุของพื้นที่"
                onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              />
              <Button type="button" tone="primary" size="sm" disabled={disabled || !draftName || draftClash} onClick={submitDraft}>
                เพิ่ม
              </Button>
              <Button
                type="button" variant="ghost" size="sm" disabled={disabled}
                onClick={() => { setAdding(false); setDraft({ name: "", note: "" }); }}
              >
                ยกเลิก
              </Button>
              {draftClash && (
                <small className={styles.hint}>
                  สถานที่นี้มีพื้นที่ชื่อนี้อยู่แล้ว — เลือกจากพื้นที่เดิมแทน
                </small>
              )}
            </div>
          )}

          {picking && (
            <div className={styles.zonePick}>
              {restZones.map((zone) => (
                <Button
                  key={zone.id} type="button" size="sm" variant="outline" disabled={disabled}
                  onClick={() => { addZone({ zoneId: zone.id, note: null }); setPicking(false); }}
                >
                  {zone.name} <span className={styles.hint}>{zone.code || ""}</span>
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
