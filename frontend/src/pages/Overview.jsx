import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { EmptyState, Select, StatusBadge } from "../ui.jsx";
import { OVERVIEW_UPDATED_EVENT, normalizeOverviewData, readOverviewCache, writeOverviewCache } from "../overviewSync.js";

const DOT = {
  green: "bg-emerald-500",
  red: "bg-red-500",
  blue: "bg-blue-500",
  gray: "bg-slate-300",
  amber: "bg-amber-500",
};

const ICONS = {
  account: "M3.5 19.5h17M7 16.5V9l5-3 5 3v7.5M9.5 16.5v-4h5v4",
  rg: "M8 4h8M8 20h8M4 8v8M20 8v8M6 6h4v4H6V6zm8 0h4v4h-4V6zM6 14h4v4H6v-4zm8 0h4v4h-4v-4z",
  vm: "M4 5.5h16v10H4v-10zM8 19h8M10 15.5v3.5M14 15.5v3.5",
  foundry: "M9 3h6M10 3v6l-5 9a2 2 0 001.8 3h10.4A2 2 0 0019 18l-5-9V3",
  activity: "M3 12h4l2-6 4 12 2-6h6",
  quota: "M4 16.5a8 8 0 1116 0M12 16l4-5M9 20h6",
  alert: "M12 9v4m0 4h.01M10.3 4.3l-7.2 12.4A2 2 0 004.8 20h14.4a2 2 0 001.7-3.3L13.7 4.3a2 2 0 00-3.4 0z",
  check: "M5 13l4 4L19 7",
  x: "M6 18L18 6M6 6l12 12",
};

const QUOTA_NAMES = {
  availabilitySets: "可用性集",
  virtualMachines: "虚拟机",
  totalRegionalVcpus: "区域 vCPU 总数",
  cores: "区域 vCPU 总数",
  standardBSFamily: "标准 BS 系列",
  standardBpsv2Family: "标准 Bpsv2 系列 vCPU",
  standardDSv3Family: "标准 DSv3 系列",
  standardDSv2Family: "标准 DSv2 系列",
  standardAv2Family: "标准 Av2 系列",
  standardA0_A7Family: "基本 A 系列 vCPU",
  publicIPAddresses: "公网 IP 地址",
  PremiumDiskCount: "高级存储托管磁盘",
  premiumDiskCount: "高级存储托管磁盘",
};

function Icon({ d, className = "w-5 h-5" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.9} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

function Dot({ c, small }) {
  return <span className={`inline-block rounded-full ${small ? "h-1.5 w-1.5" : "h-2.5 w-2.5"} ${DOT[c] || DOT.gray}`} />;
}

function IconTile({ color = "blue", icon, large = false, small = false, medium = false }) {
  const colors = {
    blue: "bg-blue-50 text-blue-600 ring-blue-100",
    cyan: "bg-cyan-50 text-cyan-600 ring-cyan-100",
    violet: "bg-violet-50 text-violet-600 ring-violet-100",
    orange: "bg-orange-50 text-orange-600 ring-orange-100",
    emerald: "bg-emerald-50 text-emerald-600 ring-emerald-100",
    red: "bg-red-50 text-red-600 ring-red-100",
    slate: "bg-slate-50 text-slate-500 ring-slate-100",
  };
  return (
    <span className={`${medium ? "h-9 w-9 rounded-lg" : small ? "h-8 w-8 rounded-lg" : large ? "h-12 w-12 rounded-2xl" : "h-10 w-10 rounded-xl"} inline-flex shrink-0 items-center justify-center ring-1 ${colors[color] || colors.slate}`}>
      <Icon d={ICONS[icon]} className={medium ? "h-[18px] w-[18px]" : small ? "h-4 w-4" : large ? "h-6 w-6" : "h-5 w-5"} />
    </span>
  );
}

function Panel({ title, sub, icon, iconColor, extra, children, className = "", bodyClassName = "" }) {
  return (
    <section className={`overflow-hidden rounded-2xl border border-slate-200 bg-white ${className}`}>
      {(title || extra) && (
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2.5">
            {icon && <IconTile icon={icon} color={iconColor} medium />}
            <div>
              {title && <h2 className="text-[14px] font-semibold tracking-tight text-slate-950">{title}</h2>}
              {sub && <p className="mt-0.5 text-[12px] text-slate-500">{sub}</p>}
            </div>
          </div>
          {extra && <div className="shrink-0 pt-0.5">{extra}</div>}
        </div>
      )}
      <div className={bodyClassName || "px-4 py-3"}>{children}</div>
    </section>
  );
}

function StatCard({ to, color, icon, title, value, rows }) {
  return (
    <Link
      to={to}
      className="group block rounded-xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_12px_30px_rgba(15,23,42,0.08)]"
    >
      <div className="flex items-center gap-2">
        <IconTile color={color} icon={icon} small />
        <div className="text-[14px] font-medium text-slate-950">{title}</div>
      </div>
      <div className="mt-2 text-[24px] font-semibold leading-none tracking-tight text-slate-950">{Number(value || 0).toLocaleString("en-US")}</div>
      <div className="mt-3 space-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-4 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1.5"><Dot c={r.color} small />{r.label}</span>
            <span className="font-medium tabular-nums text-slate-600">{Number(r.value || 0).toLocaleString("en-US")}</span>
          </div>
        ))}
      </div>
    </Link>
  );
}

function ChevronR() {
  return <Icon d="M9 5l7 7-7 7" className="h-5 w-5 text-slate-400" />;
}

function HeaderContext({ accounts }) {
  const firstHealthy = accounts.find((a) => a.status === "healthy") || accounts[0];
  return (
    <div className="mb-8 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-[20px] font-semibold text-slate-950">
        <span className="text-slate-500">AzureIn</span>
        <span className="text-slate-300">/</span>
        <span>总览</span>
        <Icon d="M19 9l-7 7-7-7" className="h-4 w-4 text-slate-500" />
      </div>
      <div className="flex items-center gap-3 text-[15px] text-slate-500">
        <span>{firstHealthy?.alias || "Azure 账号"}</span>
        <span>·</span>
        <span>East Asia</span>
        <Icon d="M8 9l4-4 4 4M16 15l-4 4-4-4" className="ml-2 h-4 w-4 text-slate-400" />
      </div>
    </div>
  );
}

function SyncNotice({ syncing, err }) {
  const visible = syncing || err;
  return (
    <div className="mb-5 h-[46px]">
      <div className={`flex h-full items-center gap-2 rounded-xl border px-4 text-[13px] transition-opacity duration-200 ${visible ? "opacity-100" : "pointer-events-none opacity-0"} ${err ? "border-amber-200 bg-amber-50 text-amber-800" : "border-blue-100 bg-blue-50 text-blue-700"}`}>
        <span className={`h-2 w-2 rounded-full ${syncing ? "animate-pulse bg-blue-500" : "bg-amber-500"}`} />
        {err ? `当前显示本地缓存数据，后台同步失败：${err}` : "正在后台同步 Azure 数据，页面会优先显示本地缓存。"}
      </div>
    </div>
  );
}

function fmtTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).replace("T", " ").slice(0, 16);
  return d.toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).replaceAll("/", "年").replace(" ", "日 ");
}

function jobResource(job) {
  if (job.resource) return job.resource;
  if (job.account_id !== undefined && job.account_id !== null) return `账号 #${job.account_id}`;
  return (job.id || "").slice(0, 12) || "—";
}

// 操作类型中文映射（对标 AzureIn）
const JOB_TYPE_NAMES = {
  account_test: "Azure 账号",
  auth_login: "登录",
  vm_create: "虚拟机",
  vm_action: "虚拟机",
  foundry_create: "Foundry",
  foundry_deploy: "Foundry",
  proxy_test: "代理",
  quota_check: "资源配额",
};

function jobTypeName(j) {
  if (JOB_TYPE_NAMES[j.type]) return JOB_TYPE_NAMES[j.type];
  const t = (j.type || "").toLowerCase();
  if (t.includes("foundry")) return "Foundry";
  if (t.includes("vm")) return "虚拟机";
  if (t.includes("account")) return "Azure 账号";
  if (t.includes("proxy")) return "代理";
  return j.type || "Azure";
}

function RecentJobs({ jobs }) {
  return (
    <Panel
      title="最近操作"
      sub="最近的 Azure 操作记录和处理状态。"
      icon="activity"
      iconColor="blue"
      extra={<Link to="/jobs" className="text-[14px] font-medium text-blue-600 hover:text-blue-700">查看全部操作 →</Link>}
      bodyClassName="p-0"
    >
      {jobs.length === 0 ? (
        <div className="px-7 py-10"><EmptyState icon="📋" text="暂无任务" /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[14px]">
            <thead>
              <tr className="border-b border-slate-100 text-[12px] text-slate-500">
                <th className="px-4 py-3 font-medium">开始时间</th>
                <th className="px-4 py-3 font-medium">操作</th>
                <th className="px-4 py-3 font-medium">资源</th>
                <th className="px-4 py-3 font-medium">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {jobs.slice(0, 6).map((j) => (
                <tr key={j.id || `${j.type}-${j.created_at}`} className="hover:bg-slate-50/60">
                  <td className="whitespace-nowrap px-4 py-3 text-[12px] text-slate-500">{fmtTime(j.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-50 text-slate-500 ring-1 ring-slate-100">
                        <Icon d={ICONS.activity} className="h-3 w-3" />
                      </span>
                      <div>
                        <div className="text-[12px] font-medium text-slate-900">{j.title || j.type || "Azure 操作"}</div>
                        {j.status === "failed" && <div className="mt-0.5 text-[12px] text-red-600">任务执行失败，请检查代理、账户配置或服务状态后重试。</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-mono text-[12px] font-medium text-slate-900">{jobResource(j)}</div>
                    <div className="mt-0.5 text-[12px] text-slate-500">{jobTypeName(j)}</div>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={j.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function quotaLabel(name) {
  if (QUOTA_NAMES[name]) return QUOTA_NAMES[name];
  // 动态系列名兜底：standardXxxFamily -> 标准 Xxx 系列 vCPU
  const m = /^standard(.+)Family$/i.exec(name || "");
  if (m) return `标准 ${m[1]} 系列 vCPU`;
  return name || "配额项目";
}

function QuotaProgress({ q }) {
  const used = Number(q.current || 0);
  const limit = Number(q.limit || 0);
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-4 text-[12px]">
        <span className="truncate font-medium text-slate-900">{quotaLabel(q.name)}</span>
        <span className="text-slate-500 tabular-nums">{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100">
        <div className={`h-1.5 rounded-full ${pct >= 80 ? "bg-amber-500" : "bg-blue-500"}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-right text-[10px] text-slate-400 tabular-nums">{used.toLocaleString("en-US")} / {limit.toLocaleString("en-US")} Count</div>
    </div>
  );
}

function QuotaCard({ accounts }) {
  const healthy = useMemo(() => accounts.filter((a) => a.status === "healthy"), [accounts]);
  const [aid, setAid] = useState("");
  const [region, setRegion] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (healthy.length > 0 && !aid) setAid(String(healthy[0].id));
  }, [healthy, aid]);

  useEffect(() => {
    if (!aid) return;
    let cancelled = false;
    setLoading(true);
    setErr("");
    api.get(`/quotas?account_id=${aid}`, { timeout: 120000 })
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setErr(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [aid]);

  const regions = useMemo(() => (data?.vm_quotas || []).map((r) => r.region), [data]);

  useEffect(() => {
    if (regions.length > 0 && !region) setRegion(regions[0]);
  }, [regions, region]);

  const rows = useMemo(() => {
    // 按选中的区域过滤，没有选中则用第一个区域
    const targetRegion = region || regions[0];
    const regionData = (data?.vm_quotas || []).find((r) => r.region === targetRegion);
    const all = (regionData?.usages || []).map((q) => ({ ...q, region: targetRegion }));
    const positive = all.filter((q) => Number(q.limit || 0) > 0);
    // 去重（同一名称只保留一个）
    const seen = new Set();
    const deduped = positive.filter((q) => {
      if (seen.has(q.name)) return false;
      seen.add(q.name);
      return true;
    });
    // 动态选择有实际用量的系列（不硬编码 Bpsv2/BS）
    // 找出所有 standard*Family 中 current > 0 的，按用量排序
    const seriesWithUsage = deduped
      .filter((q) => /^standard.*Family$/i.test(q.name) && Number(q.current || 0) > 0)
      .sort((a, b) => Number(b.current || 0) - Number(a.current || 0));
    const dynamicSeries = seriesWithUsage.length > 0 ? seriesWithUsage[0].name : null;

    // 基础优先级（不含硬编码的系列）
    const preferred = ["cores", "totalRegionalVcpus", "virtualMachines", "PremiumDiskCount", "availabilitySets", "standardA0_A7Family", "standardDSv3Family", "standardAv2Family", "publicIPAddresses"];
    // 如果有实际使用的系列，把它插入到第 2 位
    if (dynamicSeries && !preferred.includes(dynamicSeries)) {
      preferred.splice(1, 0, dynamicSeries);
    }
    return deduped
      .sort((a, b) => {
        const ia = preferred.indexOf(a.name), ib = preferred.indexOf(b.name);
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      })
      .slice(0, 4);
  }, [data, region, regions]);

  return (
    <Panel
      title="配额使用情况"
      icon="quota"
      iconColor="violet"
      extra={<Link to="/quotas" className="text-[14px] font-medium text-blue-600 hover:text-blue-700">查看配额详情</Link>}
    >
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <div className="text-[14px] font-semibold text-slate-800">Azure 账号</div>
          <Select value={aid} onChange={(e) => setAid(e.target.value)}>
            {healthy.length === 0 && <option value="">暂无健康账号</option>}
            {healthy.map((a) => <option key={a.id} value={a.id}>{a.alias || `账号 #${a.id}`}</option>)}
          </Select>
        </label>
        <label className="space-y-2">
          <div className="text-[14px] font-semibold text-slate-800">区域</div>
          <Select value={region} onChange={(e) => setRegion(e.target.value)}>
            {regions.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
        </label>
      </div>
      {loading && <div className="py-10 text-center text-[14px] text-slate-400">正在读取配额缓存...</div>}
      {!loading && err && <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">配额读取失败：{err}</div>}
      {!loading && !err && rows.length === 0 && <EmptyState icon="📊" text="暂无可展示的配额数据" />}
      {!loading && !err && rows.length > 0 && <div className="space-y-4">{rows.map((q) => <QuotaProgress key={`${q.region}-${q.name}`} q={q} />)}</div>}
    </Panel>
  );
}

function NeedItem({ color, icon, title, desc, to }) {
  return (
    <Link to={to} className="flex items-center gap-3 px-3 py-2.5 transition hover:bg-slate-50/70 rounded-lg">
      <IconTile color={color} icon={icon} small />
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-medium text-slate-900">{title}</div>
        <div className="mt-0.5 text-[12px] text-slate-500">{desc}</div>
      </div>
      <ChevronR />
    </Link>
  );
}

function NeedPanel({ data, jobs, syncError }) {
  const accountErrors = Number(data.accounts?.error || 0);
  const failedJobs = jobs.filter((j) => j.status === "failed").length;
  const quotaWarnings = 0;
  const items = [
    {
      color: accountErrors > 0 ? "red" : "emerald",
      icon: accountErrors > 0 ? "alert" : "check",
      title: `${accountErrors} 个 Azure 账号需要重新验证`,
      desc: "请检查账号状态并重新验证",
      to: "/accounts",
    },
    {
      color: "emerald",
      icon: "check",
      title: "0 个任务需要人工复核",
      desc: "存在需要人工确认的操作",
      to: "/jobs",
    },
    {
      color: failedJobs > 0 || syncError ? "red" : "emerald",
      icon: failedJobs > 0 || syncError ? "x" : "check",
      title: `${failedJobs || (syncError ? 1 : 0)} 个任务最近执行失败`,
      desc: "查看错误信息后决定是否重试",
      to: "/jobs",
    },
    {
      color: quotaWarnings > 0 ? "amber" : "emerald",
      icon: quotaWarnings > 0 ? "alert" : "check",
      title: `${quotaWarnings} 个配额接近或达到限制`,
      desc: "用量已达到或超过配额的 80%",
      to: "/quotas",
    },
  ];

  return (
    <Panel title="需要处理" icon="alert" iconColor="orange" bodyClassName="space-y-1 p-2">
      {items.map((item) => <NeedItem key={item.title} {...item} />)}
    </Panel>
  );
}

export default function Overview() {
  const [data, setData] = useState(() => readOverviewCache());
  const [recentJobs, setRecentJobs] = useState(() => {
    const cached = readOverviewCache();
    return Array.isArray(cached.recent_jobs) ? cached.recent_jobs : [];
  });
  const [accounts, setAccounts] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    const loadRecentJobs = () => {
      api.get("/jobs?limit=8", { timeout: 30000 }).then((items) => {
        if (!cancelled) setRecentJobs(Array.isArray(items) ? items : []);
      }).catch(() => {});
    };

    api.get("/accounts", { timeout: 30000 }).then((d) => {
      if (!cancelled) setAccounts(d.items || []);
    }).catch(() => {});
    loadRecentJobs();

    setSyncing(true);
    api.get("/overview?refresh=true", { timeout: 120000 }).then((d) => {
      if (cancelled) return;
      const normalized = writeOverviewCache(normalizeOverviewData(d), false);
      setData(normalized);
      if (Array.isArray(normalized.recent_jobs) && normalized.recent_jobs.length > 0) {
        setRecentJobs(normalized.recent_jobs);
      }
      setErr("");
    }).catch((e) => {
      if (!cancelled) setErr(e.message);
    }).finally(() => {
      if (!cancelled) setSyncing(false);
    });

    const onOverviewUpdated = (e) => {
      if (cancelled) return;
      const normalized = normalizeOverviewData(e.detail || readOverviewCache());
      setData(normalized);
      if (Array.isArray(normalized.recent_jobs) && normalized.recent_jobs.length > 0) {
        setRecentJobs(normalized.recent_jobs);
      }
    };
    window.addEventListener(OVERVIEW_UPDATED_EVENT, onOverviewUpdated);
    const jobsTimer = setInterval(loadRecentJobs, 5000);
    return () => {
      cancelled = true;
      clearInterval(jobsTimer);
      window.removeEventListener(OVERVIEW_UPDATED_EVENT, onOverviewUpdated);
    };
  }, []);

  const vms = data.vms || {};
  const jobs = Array.isArray(recentJobs) ? recentJobs : [];
  const failedJobs = jobs.filter((j) => j.status === "failed").length;

  return (
    <div className="pb-10">
      <HeaderContext accounts={accounts} />
      <SyncNotice syncing={syncing} err={err} />

      <div className="mb-8">
        <h1 className="mb-5 text-[22px] font-semibold tracking-tight text-slate-950">资源概览</h1>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-4 md:grid-cols-2">
          <StatCard
            to="/accounts"
            color="blue"
            icon="account"
            title="Azure 账号"
            value={data.accounts?.total}
            rows={[{ color: "green", label: "运行正常", value: data.accounts?.healthy }, { color: "gray", label: "需要处理", value: data.accounts?.error }]}
          />
          <StatCard
            to="/resource-groups"
            color="cyan"
            icon="rg"
            title="资源组"
            value={data.resource_groups?.total}
            rows={[{ color: "green", label: "运行正常", value: data.resource_groups?.total }, { color: "amber", label: "需要处理", value: 0 }]}
          />
          <StatCard
            to="/virtual-machines"
            color="violet"
            icon="vm"
            title="虚拟机"
            value={vms.total}
            rows={[{ color: "green", label: "运行中", value: vms.running }, { color: "gray", label: "已停止", value: vms.stopped }]}
          />
          <StatCard
            to="/foundry"
            color="orange"
            icon="foundry"
            title="Foundry"
            value={data.foundry?.total}
            rows={[{ color: "green", label: "运行正常", value: data.foundry?.total }, { color: "amber", label: "需要处理", value: 0 }]}
          />
        </div>
      </div>

      <div className="space-y-4">
        <RecentJobs jobs={jobs} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <QuotaCard accounts={accounts} />
          <NeedPanel data={data} jobs={jobs} syncError={failedJobs === 0 ? err : ""} />
        </div>
      </div>
    </div>
  );
}