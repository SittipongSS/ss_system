"use client";
import { useCallback, useEffect, useState } from "react";
import { apiCache, primeCache } from "@/lib/apiCache";

// Cache-first list fetch (stale-while-revalidate): paints instantly from
// apiCache, then refreshes in the background. `reload()` forces a refetch and is
// returned for use after mutations. Each URL fetches independently so one
// failure doesn't blank the others.
export function useApiList(url) {
  const [data, setData] = useState(() => apiCache.get(url) ?? []);
  const [loading, setLoading] = useState(() => !apiCache.has(url));
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || `โหลดข้อมูลไม่สำเร็จ (${r.status})`);
      const json = await r.json();
      const arr = Array.isArray(json) ? json : [];
      primeCache(url, arr); // อัปเดต timestamp ให้ cachedFetchJson นับว่าสด
      setData(arr);
      setError(null);
      return arr;
    } catch (e) {
      setError(e?.message || "เกิดข้อผิดพลาด");
      return null;
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => { reload(); }, [reload]);

  return { data, loading, error, reload, setData };
}
