/**
 * Stale-while-revalidate: 秒开显示缓存数据，后台静默拉取最新。
 *
 * 用法：
 *   const { data, loading, refresh } = useSWR(`/vms?account_id=${id}`, (d) => d.vms || []);
 *
 * - 首次：立即返回缓存数据（后端 10 分钟缓存，0.003 秒）
 * - 后台：500ms 后用 ?refresh=true 拉取最新，有变化则静默更新
 * - refresh()：手动强制刷新（刷新按钮用）
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";

export function useSWR(url, select = (d) => d, opts = {}) {
  const [data, setData] = useState(opts.initial || null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef(null);

  const fetchData = useCallback(async (force = false) => {
    const sep = url.includes("?") ? "&" : "?";
    const u = force ? `${url}${sep}refresh=true` : url;
    try {
      const d = await api.get(u);
      return select(d);
    } catch {
      return null;
    }
  }, [url, select]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const d = await fetchData(true);
    if (d !== null) setData(d);
    setLoading(false);
  }, [fetchData]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // 1. 立即显示缓存数据
    fetchData(false).then((d) => {
      if (cancelled) return;
      if (d !== null) setData(d);
      setLoading(false);
      // 2. 后台静默拉取最新
      timerRef.current = setTimeout(async () => {
        if (cancelled) return;
        const fresh = await fetchData(true);
        if (cancelled || fresh === null) return;
        // 简单比较：JSON 序列化后不同则更新
        setData((prev) => {
          try {
            if (JSON.stringify(prev) !== JSON.stringify(fresh)) return fresh;
          } catch { /* ignore */ }
          return prev;
        });
      }, opts.backgroundDelay || 800);
    });
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [fetchData, opts.backgroundDelay]);

  return { data, loading, refresh };
}
