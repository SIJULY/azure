import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { Card, EmptyState, Loading, Select, StatusBadge, Spinner } from "../ui.jsx";

/* ---------- 小组件 ---------- */
const DOT = { green: "bg-green-500", red: "bg-red-500", blue: "bg-blue-500", gray: "bg-slate-300", amber: "bg-amber-500" };
function Dot({ c }) {
  return <span className={`inline-block w-2 h-2 rounded-full ${DOT[c] || DOT.gray}`} />;
}

function IconTile({ color, d }) {
  const bg = { blue: "bg-blue-100 text-blue-600", teal: "bg-teal-100 text-teal-600", purple: "bg-purple-100 text-purple-600", orange: "bg-orange-100 text-orange-600" }[color] || "bg-slate-100 text-slate-500";
  return (
    <span className={`w-8 h-8 rounded-lg inline-flex items-center justify-center shrink-0 ${bg}`}>
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d={d} />
      </svg>
    </span>
  );
}

const ICONS = {
  account: "M15 7a3 3 0 11-6 0 3 3 0 016 0zM4 21v-1a7 7 0 0114 0v1",
  rg: "M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z",
  vm: "M9 17.5V6.5A1.5 1.5 0 0110.5 5h3A1.5 1.5 0 0115 6.5v11a1.5 1.5 0 01-1.5 1.5h-3A1.5 1.5 0 019 17.5zM5 8.5v7M3.5 10v4M19 8.5v7M20.5 10v4",
  foundry: "M9.7 3.5L3 12l6.7 8.5L12 18l2.3 2.5L21 12l-6.7-8.5L12 6 9.7 3.5z",
};

function StatCard({ to, color, icon, title, big, rows }) {
  return (
    <Link to={to} className="bg-white border border-slate-200 rounded-xl p-4 flex-1 min-w-[200px] hover:border-blue-300 hover:shadow-sm transition block">
      <div className="flex items-center gap-2 mb-2">
        <IconTile color={color} d={ICONS[icon]} />
        <span className="text-[13px] text-slate-500">{title}</span>
      </div>
      <div className="text-[28px] font-bold text-slate-900 mb-2">{big}</div>
      <div className="space-y-1">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2 text-[12px] text-slate-500">
            <Dot c={r.c} /> {r.t}
          </div>
        ))}
      </div>
    </Link>
  );
}

function ChevronR() {
  return (
    <svg className="w-4 h-4 text-slate-300 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

/* ---------- 面包屑（总览，带下拉） ---------- */
function Crumb() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 text-[15px]">
        <span className="text-slate-500">Azure面板</span>
        <span className="text-slate-300 mx-0.5">/</span>
        <span className="font-medium text-slate-900">总览</span>
        <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[120px]">
            <div className="px-3 py-2 text-[13px] text-slate-900 bg-slate-50">总览</div>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- 配额使用情况卡 ---------- */
function QuotaCard({ accounts }) {
  const healthy = useMemo(() => accounts.filter((a) => a.status === "healthy"), [accounts]);
  const [aid, setAid] = useState("");
  const [region, setRegion] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (healthy.length > 0 && !aid) setAid(String(healthy[0].id));
  }, [healthy, aid]);

  useEffect(() => {
    if (!aid) return;
    setLoading(true);
    setData(null);
    api.get(`/quotas?account_id=${aid}`, { timeout: 60000 })
      .then((d) => {
        setData(d);
        const regs = (d.vm_quotas || []).map((r) => r.region);
        setRegion(regs[0] || "");
      })
      .catch(() => setData({ vm_quotas: [], error: "读取失败" }))
      .finally(() => setLoading(false));
  }, [aid]);

  const usages = useMemo(() => {
    if (!data || !region) return [];
    const r = (data.vm_quotas || []).find((x) => x.region === region);
    return r ? r.usages || [] : [];
  }, [data, region]);

  return (
    <Card title="配额使用情况" extra={<Link to="/quotas" className="text-[13px] text-blue-600 hover:text-blue-700">查看配额详情</Link>}>
      <div className="flex gap-2 mb-4">
        <Select value={aid} onChange={(e) => setAid(e.target.value)} className="flex-1">
          <option value="">请选择账号</option>
          {healthy.map((a) => <option key={a.id} value={a.id}>{a.alias}</option>)}
        </Select>
        <Select value={region} onChange={(e) => setRegion(e.target.value)} className="w-36">
          {!region && <option value="">—</option>}
          {(data?.vm_quotas || []).map((r) => <option key={r.region} value={r.region}>{r.region}</option>)}
        </Select>
      </div>
      {loading ? (
        <div className="py-10 flex items-center justify-center gap-2 text-slate-400 text-[13px]"><Spinner /> 正在从 Azure 读取配额…</div>
      ) : !aid ? (
        <p className="text-[13px] text-slate-400 text-center py-8">请选择一个已启用的 Azure 账号</p>
      ) : usages.length === 0 ? (
        <EmptyState text="暂无配额数据" />
      ) : (
        <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
          {usages.map((u, i) => {
            const pct = u.limit > 0 ? Math.min(100, Math.round((u.current / u.limit) * 100)) : 0;
            const bar = pct >= 80 ? "bg-red-500" : pct >= 50 ? "bg-amber-500" : "bg-blue-500";
            return (
              <div key={i}>
                <div className="flex items-center justify-between text-[12px] mb-1">
                  <span className="text-slate-600 truncate mr-2" title={u.name}>{u.name}</span>
                  <span className="text-slate-400 shrink-0 font-mono">{u.current}/{u.limit}</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export default function Overview() {
  const [data, setData] = useState(() => {
    // 优先显示缓存，秒开
    try {
      const c = localStorage.getItem("overview_cache");
      return c ? JSON.parse(c) : null;
    } catch { return null; }
  });
  const [updating, setUpdating] = useState(false);
  const [err, setErr] = useState("");
  const [accounts, setAccounts] = useState([]);
  const [jobs, setJobs] = useState([]);

  useEffect(() => {
    // 后台静默更新，不阻塞页面
    setUpdating(true);
    api.get("/overview").then((d) => {
      setData(d);
      try { localStorage.setItem("overview_cache", JSON.stringify(d)); } catch {}
    }).catch((e) => {
      // 有缓存时不显示错误，静默失败
      if (!data) setErr(e.message);
    }).finally(() => setUpdating(false));
    api.get("/accounts").then((d) => setAccounts(d.items || [])).catch(() => {});
    api.get("/jobs?limit=5").then(setJobs).catch(() => {});
    // eslint-disable-next-line
  }, []);

  const firstHealthy = accounts.find((a) => a.status === "healthy");
  const ctx = firstHealthy?.subscription_name ? firstHealthy.subscription_name : "";

  const needReview = jobs.filter((j) => j.status === "pending").length;
  const failed = jobs.filter((j) => j.status === "failed").length;
  const needReauth = accounts.filter((a) => a.status !== "healthy").length;

  const need = [
    { t: `${needReauth} 个 Azure 账号需要重新验证`, d: "请检查账号状态并重新验证", to: "/accounts" },
    { t: `${needReview} 个任务需要人工复核`, d: "存在需要人工确认的操作", to: "/jobs" },
    { t: `${failed} 个任务最近执行失败`, d: "查看错误信息后决定是否重试", to: "/jobs" },
    { t: "0 个配额接近或达到限制", d: "用量已达到或超过配额的 80%", to: "/quotas" },
  ];

  if (err) return (<><Crumb /><p className="text-[13px] text-red-600 mt-4">加载失败：{err}</p></>);
  // 有缓存直接显示，无缓存才显示加载中（仅首次）
  if (!data) return (<><Crumb /><Loading /></>);

  const v = data.vms || {};
  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <Crumb />
        {updating && <span className="text-[11px] text-slate-400">更新中…</span>}
      </div>
      {ctx && (
        <button className="inline-flex items-center gap-1 text-[13px] text-slate-500 -mt-2 mb-4 hover:text-slate-700">
          {ctx}
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}
      <div className="space-y-4">
        <Card title="资源概览">
          <div className="flex gap-4 flex-wrap">
            <StatCard to="/accounts" color="blue" icon="account" title="Azure 账号" big={data.accounts.total}
              rows={[{ c: "green", t: `运行正常 ${data.accounts.healthy}` }, { c: "gray", t: `需要处理 ${data.accounts.error}` }]} />
            <StatCard to="/resource-groups" color="teal" icon="rg" title="资源组" big={data.resource_groups.total}
              rows={[{ c: "green", t: `运行正常 ${data.resource_groups.total}` }, { c: "amber", t: "需要处理 0" }]} />
            <StatCard to="/virtual-machines" color="purple" icon="vm" title="虚拟机" big={v.total || 0}
              rows={[{ c: "green", t: `运行中 ${v.running || 0}` }, { c: "gray", t: `已停止 ${v.stopped || 0}` }]} />
            <StatCard to="/foundry" color="orange" icon="foundry" title="Foundry" big={data.foundry.total}
              rows={[{ c: "green", t: `运行正常 ${data.foundry.total}` }, { c: "amber", t: "需要处理 0" }]} />
          </div>
        </Card>

        <Card title="最近操作" sub="最近的 Azure 操作记录和处理状态。"
          extra={<Link to="/jobs" className="text-[13px] text-blue-600 hover:text-blue-700">查看全部操作 →</Link>}>
          {jobs.length === 0 ? (
            <EmptyState icon="📋" text="暂无任务" />
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-left">
                  {["开始时间", "操作", "资源", "操作人", "状态"].map((c) => (
                    <th key={c} className="font-medium px-3 py-2.5 whitespace-nowrap">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <td className="px-3 py-3 text-slate-500 whitespace-nowrap">{j.created_at || "—"}</td>
                    <td className="px-3 py-3 text-slate-700">{j.title || j.type}</td>
                    <td className="px-3 py-3 text-slate-500 font-mono text-[12px]">{(j.id || "").slice(0, 8)}</td>
                    <td className="px-3 py-3 text-slate-500">—</td>
                    <td className="px-3 py-3"><StatusBadge status={j.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <QuotaCard accounts={accounts} />
          <Card title="需要处理">
            <div className="divide-y divide-slate-100">
              {need.map((n, i) => (
                <Link key={i} to={n.to} className="flex items-center gap-3 py-3 hover:bg-slate-50/60 -mx-5 px-5">
                  <span className="w-5 h-5 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-[12px] shrink-0">✓</span>
                  <div className="flex-1">
                    <div className="text-[13px] font-medium text-slate-800">{n.t}</div>
                    <div className="text-[12px] text-slate-400">{n.d}</div>
                  </div>
                  <ChevronR />
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
