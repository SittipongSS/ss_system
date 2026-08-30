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
import { useEffect, useMemo, useState } from "react";
import { Layers, Plus, X } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import OptionTiles from "@/components/ui/OptionTiles";
import SearchableSelect from "@/components/ui/SearchableSelect";
import ServiceSiteModal from "@/components/service/ServiceSiteModal";
import { apiJson } from "@/lib/apiFetch";
import { naText } from "@/lib/format";
import { zoneNameKey } from "@/lib/service/surveyRequest";
import { floorLabel, normalizeFloor } from "@/lib/service/zoneCode";
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
  /* โหมดอ่านอย่างเดียว (ทางแก้ใบ) — บล็อกนี้แสดงของที่ใบถืออยู่ แต่แก้ไม่ได้
     ⚠️ เหตุผลอยู่ที่ผู้เรียก (`RequestForm`) — ทางแก้ใบเขียนได้แค่หัวใบ */
  readOnly = false,
}) {
  const siteId = value.siteId || "";
  const zones = value.zones || [];
  const [sites, setSites] = useState([]);
  const [siteZones, setSiteZones] = useState([]);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState(false);
  // `adding` แยกจากเนื้อของร่าง — ช่องเปล่ากับ "ยังไม่เปิดช่อง" คนละสถานะ
  const [adding, setAdding] = useState(false);
  // โมดัลสร้างสถานที่ — **ฟอร์มตัวเดียวกับทะเบียนไซต์** (กฎ AGENTS.md) ไม่ใช่ฟอร์มที่สอง
  const [creatingSite, setCreatingSite] = useState(false);
  const [draft, setDraft] = useState({ name: "", floor: "", note: "" });

  const set = (patch) => onChange({ ...value, ...patch });

  // ทะเบียนไซต์ของลูกค้าเจ้าของดีล — เปลี่ยนดีลข้ามลูกค้าแล้วต้องล้างที่เลือกไว้
  // (ไม่ล้าง = ใบไปเกาะไซต์ของลูกค้าคนก่อน แล้วโดน handler ตีกลับตอนกดบันทึก)
  useEffect(() => {
    if (!customerId) { setSites([]); return undefined; }
    let alive = true;
    setLoading(true);
    apiJson(`/api/service/sites?customerId=${encodeURIComponent(customerId)}&includeInactive=0`)
      .then((rows) => { if (alive) setSites(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (alive) setSites([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [customerId]);

  /* 🐞 **เปลี่ยนดีลข้ามลูกค้าแล้วไซต์เดิมค้างอยู่** — ใบจะเกาะไซต์ของลูกค้าคนก่อน
     แล้วโดน handler ตีกลับตอนกดบันทึก โดยที่จอยังโชว์ชื่อไซต์เดิมอยู่
     ⚠️ ตัดสินจาก **ลิสต์ที่โหลดมาแล้ว** ไม่ใช่จากการที่ customerId เปลี่ยน — โหมดแก้
        โหลดใบก่อนแล้ว customerId ตามมาทีหลัง ถ้าล้างทันทีจะลบของที่บันทึกไว้ทิ้ง
     🐞 **effect นี้เคยไม่มี dependency array** ⇒ รันทุกเรนเดอร์ · พอ `/api/service/sites`
        ล้มชั่วคราว (หรือคืนลิสต์ว่างจังหวะหนึ่ง) มันจะล้างไซต์ **และพื้นที่ที่พิมพ์ไว้ทั้งหมด**
        ทิ้งกลางที่คนกำลังกรอก · ตอนนี้ผูกกับ [sites, siteId, loading, customerId] และ
        ไม่แตะอะไรเลยในโหมดอ่านอย่างเดียว
     ⚠️ ลิสต์ว่างไม่ใช่หลักฐานว่าไซต์ผิดลูกค้า — โหลดพลาดก็ว่างเหมือนกัน ⇒ ล้างเฉพาะตอน
        ลิสต์ **มีของ** แล้วไม่มีไซต์นี้อยู่ในนั้น */
  useEffect(() => {
    if (readOnly) return;
    if (!siteId || loading || !customerId) return;
    if (!sites.length) return;
    if (sites.some((row) => row.id === siteId)) return;
    set({ siteId: "", zones: [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sites, siteId, loading, customerId, readOnly]);

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

  /* ⭐ **สร้างสถานที่ได้ตรงนี้เลย** (มติผู้ใช้ 2026-08-29 — เปิดสิทธิ์ให้ SA สร้างไซต์)
     จังหวะที่คนขายรู้ว่าลูกค้าจะติดตั้งที่ไหนคือตอนกำลังเปิดใบประเมินนี่เอง ⇒ ให้เดิน
     ต่อได้โดยไม่ต้องออกไปทะเบียนแล้วกลับมาเปิดใบใหม่
     ⚠️ ยิง POST เส้นเดียวกับทะเบียน (`/api/service/sites`) ⇒ ด่านสิทธิ์/ด่านรหัสเป็น
        ตัวเดียวกันเป๊ะ ไม่มีทางลัดที่ตรวจน้อยกว่า */
  const createSite = async (payload) => {
    const created = await apiJson("/api/service/sites", {
      method: "POST",
      json: { ...payload, customerId },
      fallbackError: "สร้างสถานที่ไม่สำเร็จ",
    });
    setSites((prev) => [...prev, created]);
    set({ siteId: created.id, zones: [] });
    return created;
  };

  const pickSite = (id) => {
    if (id === siteId) return;
    // ⚠️ เปลี่ยนไซต์ = ล้างพื้นที่ทั้งลิสต์ — โซนเดิมที่เลือกไว้เป็นของไซต์เก่า
    //    (handler ตรวจซ้ำอยู่แล้ว แต่ให้ผู้ใช้เห็นผลทันทีดีกว่าถูกตีกลับตอนกดส่ง)
    set({ siteId: id, zones: [] });
    setAdding(false);
    setDraft({ name: "", floor: "", note: "" });
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
    const floor = normalizeFloor(draft.floor);
    if (floor.error) return;
    addZone({ name, floor: floor.value, note: draft.note.trim() || null });
    setDraft({ name: "", floor: "", note: "" });
    setAdding(false);
  };

  const draftName = draft.name.trim().replace(/\s+/g, " ");
  const draftClash = !!draftName && takenNames.has(zoneNameKey(draftName));
  // ชั้นของพื้นที่ใหม่ (mig 0315) — เป็นท่อนหนึ่งของรหัสโซนที่จะออกตอนกดส่ง
  const draftFloor = normalizeFloor(draft.floor);

  /* ⚠️ **`defaults` ต้องเป็นตัวเดิมข้ามเรนเดอร์** — `ServiceSiteModal` มีมันอยู่ใน deps
     ของ effect ที่ `setForm(...)` ⇒ object literal ใหม่ทุกเรนเดอร์ = ฟอร์มถูกล้าง
     ทุกครั้งที่ผู้ใช้พิมพ์ (state ของพ่อขยับ → พ่อเรนเดอร์ใหม่ → defaults ใหม่ → รีเซ็ต) */
  const siteDefaults = useMemo(() => ({ customerId }), [customerId]);
  const siteCustomers = useMemo(
    () => (customerId ? [{ id: customerId, name: customerName || customerId }] : []),
    [customerId, customerName],
  );

  const siteOptions = sites.map((s) => ({
    value: s.id,
    label: s.name || s.code || s.id,
    description: [s.code, s.address].filter(Boolean).join(" · ") || undefined,
    // ค้นด้วยรหัส SS หรือที่อยู่ได้ด้วย — คนจำสาขาจากถนน ไม่ใช่จากชื่อในทะเบียน
    search: [s.name, s.code, s.address, s.routeZone].filter(Boolean).join(" "),
  }));

  /* ── โหมดอ่านอย่างเดียว ─────────────────────────────────────────────────
     ⭐ แสดง **ของจริงที่ใบถืออยู่** ไม่ใช่ช่องเปล่า — ช่องเปล่าอ่านว่า "ยังไม่ได้เลือก"
        ทั้งที่ใบมีสถานที่อยู่ และถ้ากดบันทึกทับจะดูเหมือนของหาย */
  if (readOnly) {
    const picked = sites.find((row) => row.id === siteId) || null;
    return (
      <div className="form-group col-span-2">
        <span className={styles.fieldLabel}>สถานที่และพื้นที่ที่ต้องประเมิน</span>
        <small className={styles.hint}>
          {loading ? "กำลังโหลด…" : naText([picked?.code, picked?.name].filter(Boolean).join(" · "))}
        </small>
        {zones.length > 0 && (
          <ol className={styles.zoneList}>
            {zones.map((row, index) => (
              <li key={row.zoneId || `ro-${index}`} className={styles.zoneRow}>
                <span className={styles.zoneNo}>{index + 1}</span>
                <span className={styles.zoneBody}>
                  <b>{zoneName(row)}</b>
                  <small className={styles.hint}>
                    {row.zoneId
                      ? (siteZones.find((z) => z.id === row.zoneId)?.code || "พื้นที่เดิม")
                      : `พื้นที่ใหม่ · ${floorLabel(row.floor) || "ยังไม่ระบุชั้น"}`}
                  </small>
                </span>
              </li>
            ))}
          </ol>
        )}
        <small className={styles.hint}>
          สถานที่และพื้นที่แก้ที่นี่ไม่ได้ — ร่างที่ยังไม่ส่งลบแล้วเปิดใหม่ได้ (ยังไม่กินเลขที่)
        </small>
      </div>
    );
  }

  return (
    <>
      <div className="form-group col-span-2">
        <span className={styles.fieldLabel}>สถานที่ที่จะให้เข้าไปประเมิน</span>
        {!customerId ? (
          <small className={styles.hint}>เลือกดีลก่อน — รายการสถานที่มาจากลูกค้าของดีลนั้น</small>
        ) : loading ? (
          <small className={styles.hint}>กำลังโหลดทะเบียนไซต์ของ {customerName || "ลูกค้ารายนี้"}…</small>
        ) : !sites.length ? (
          /* ทางตันต้องบอกทางออก ไม่ใช่ช่องว่าง — คนที่สร้างไม่ได้ต้องรู้ว่าไปขอใคร */
          <small className={styles.hint}>
            {customerName || "ลูกค้ารายนี้"} ยังไม่มีสถานที่ในทะเบียนไซต์บริการ —
            {canCreateSite
              ? ' กดปุ่ม "สร้างสถานที่ใหม่" ข้างล่างได้เลย'
              : " บัญชีของคุณเป็นสิทธิ์อ่านอย่างเดียว — ให้ฝ่ายขายหรือฝ่ายบริการเป็นคนสร้าง"}
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
        {canCreateSite && !!customerId && (
          <div className={styles.zoneActions}>
            <Button
              type="button" size="sm" variant="outline" disabled={disabled}
              icon={<Plus size={16} />}
              onClick={() => setCreatingSite(true)}
            >
              สร้างสถานที่ใหม่
            </Button>
          </div>
        )}
      </div>

      {/* ฟอร์มไซต์ตัวเดียวกับทะเบียน — ล็อกลูกค้าไว้ที่ลูกค้าของดีล (ใบนี้เป็นของเขา) */}
      <ServiceSiteModal
        open={creatingSite}
        customers={siteCustomers}
        defaults={siteDefaults}
        /* ⚠️ ใบคำร้องเรียกของสิ่งนี้ว่า **สถานที่** ทั้งฟอร์ม — โมดัลต้องพูดคำเดียวกัน
           ไม่งั้นกดปุ่ม "สร้างสถานที่ใหม่" แล้วเจอหัวเรื่อง "เพิ่มไซต์บริการ" */
        noun="สถานที่"
        onClose={() => setCreatingSite(false)}
        onSave={createSite}
      />

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
                        : `พื้นที่ใหม่ · ${floorLabel(row.floor) || "ยังไม่ระบุชั้น"} — ได้รหัส ZN ตอนกดส่งใบ`}
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
            {/* ⚠️ ปุ่มจางต้องบอกเหตุ (กติกาของรีโป) — "ไม่มีพื้นที่เดิมให้เลือก" กับ
                "เลือกครบแล้ว" คนละเรื่องกัน และทางแก้คนละทาง */}
            <Button
              type="button" size="sm" disabled={disabled || !restZones.length}
              icon={<Layers size={16} />}
              title={restZones.length ? undefined : (siteZones.length
                ? "เลือกพื้นที่เดิมของสถานที่นี้ครบทุกรายการแล้ว"
                : "สถานที่นี้ยังไม่มีพื้นที่ในทะเบียน — กด \"เพิ่มพื้นที่ใหม่\"")}
              onClick={() => setPicking((on) => !on)}
            >
              เลือกจากพื้นที่เดิม{restZones.length ? ` (${restZones.length})` : ""}
            </Button>
            {!restZones.length && (
              <small className={styles.hint}>
                {siteZones.length
                  ? "เลือกพื้นที่เดิมครบทุกรายการแล้ว"
                  : "สถานที่นี้ยังไม่มีพื้นที่ในทะเบียน — เริ่มที่ “เพิ่มพื้นที่ใหม่”"}
              </small>
            )}
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
              {/* ⚠️ ชั้นบังคับ — เป็นท่อน FF ของรหัสโซน (ไม่มีชั้นก็ออกรหัสไม่ได้ตอนกดส่ง) */}
              <Input
                value={draft.floor}
                disabled={disabled}
                placeholder="ชั้น เช่น 4 หรือ G"
                aria-label="ชั้นของพื้นที่"
                invalid={!!draft.floor && !!draftFloor.error}
                onChange={(e) => setDraft((d) => ({ ...d, floor: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitDraft(); } }}
              />
              <Input
                value={draft.note}
                disabled={disabled}
                placeholder="สิ่งที่อยากให้เจ้าหน้าที่รู้ก่อนไป (ไม่บังคับ)"
                aria-label="หมายเหตุของพื้นที่"
                onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              />
              <Button
                type="button" tone="primary" size="sm"
                disabled={disabled || !draftName || draftClash || !!draftFloor.error}
                onClick={submitDraft}
              >
                เพิ่ม
              </Button>
              <Button
                type="button" variant="ghost" size="sm" disabled={disabled}
                onClick={() => { setAdding(false); setDraft({ name: "", floor: "", note: "" }); }}
              >
                ยกเลิก
              </Button>
              {draftClash && (
                <small className={styles.hint}>
                  สถานที่นี้มีพื้นที่ชื่อนี้อยู่แล้ว — เลือกจากพื้นที่เดิมแทน
                </small>
              )}
              {/* ⚠️ ปุ่มจางต้องบอกเหตุเสมอ — ช่องชั้นว่างอยู่ก็เข้าข่าย ไม่ใช่เฉพาะตอนพิมพ์ผิด */}
              {!draftClash && !!draftFloor.error && (!!draft.floor || !!draftName) && (
                <small className={styles.hint}>{draftFloor.error}</small>
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
