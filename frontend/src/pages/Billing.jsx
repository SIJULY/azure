import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { AccountSelect, Badge, Btn, Card, EmptyState, Field, Input, Loading, PageHead, Select, Table, Td, useToast } from "../ui.jsx";

function fmt(d) {
  return d.toISOString().slice(0, 10);
}

/* ---------- SVG 折线图 ---------- */
function LineChart({ daily }) {
  if (!daily || daily.length === 0) return <EmptyState icon="📊" text="暂无数据" />;
  const W = 560, H = 180, P = 28;
  const max = Math.max(...daily.map((d) => d.cost), 0.01);
  const n = daily.length;
  const x = (i) => (n === 1 ? W / 2 : P + (i * (W - 2 * P)) / (n - 1));
  const y = (c) => H - P - (c / max) * (H - 2 * P);
  const pts = daily.map((d, i) => `${x(i).toFixed(1)},${y(d.cost).toFixed(1)}`).join(" ");
  const area = `${P},${H - P} ${pts} ${W - P},${H - P}`;
  const step = Math.max(1, Math.ceil(n / 8));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-44">
      <defs>
        <linearGradient id="billfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1={P} x2={W - P} y1={y(max * f)} y2={y(max * f)} stroke="#e2e8f0" strokeDasharray="3 3" />
      ))}
      <polygon points={area} fill="url(#billfill)" />
      <polyline points={pts} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {daily.map((d, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(d.cost)} r="3" fill="#3b82f6">
            <title>{d.date}: {d.cost}</title>
          </circle>
          {i % step === 0 && (
            <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="#94a3b8">{d.date.slice(5)}</text>
          )}
        </g>
      ))}
    </svg>
  );
}

const GROUP_OPTS = [
  ["resource_group", "资源组"],
  ["none", "不分组"],
];

function fmtTime(s) {
  if (!s) return "-";
  return String(s).replace("T", " ").slice(0, 19);
}

function fmtCost(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(12).replace(/0+$/, "").replace(/\.$/, "") : String(v ?? "");
}

function billingCostColumn(costType) {
  return costType === "amortized" ? "Cost" : "PreTaxCost";
}

export default function Billing() {
  const toast = useToast();
  const [accounts, setAccounts] = useState([]);
  const [tiers, setTiers] = useState({});
  const [f, setF] = useState(() => {
    const end = new Date(); const start = new Date(); start.setDate(start.getDate() - 8);
    return { account_id: "", start: fmt(start), end: fmt(end), group_by: "resource_group", cost_type: "actual" };
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.get("/accounts").then((d) => {
      const items = d.items || [];
      setAccounts(items);
      if (items.length > 0) setF((x) => ({ ...x, account_id: String(items[0].id) }));
      // 并行拉取各账号配额层级（用于徽章）
      items.forEach((a) => {
        api.get(`/quotas?account_id=${a.id}`, { timeout: 45000 })
          .then((q) => { if (q.quota_tier) setTiers((t) => ({ ...t, [a.id]: q.quota_tier })); })
          .catch(() => {});
      });
    }).catch(() => {});
  }, []);

  const query = async (forceRefresh = false) => {
    if (!f.account_id) return toast("请先选择 Azure 账号");
    setLoading(true); setErr("");
    try {
      const qs = new URLSearchParams({
        account_id: f.account_id,
        start: f.start,
        end: f.end,
        group_by: f.group_by,
        cost_type: f.cost_type,
      });
      if (forceRefresh) qs.set("force_refresh", "true");
      const d = await api.get(`/billing/range?${qs.toString()}`, { timeout: 90000 });
      setData(d);
      if (d.warning) toast(d.warning);
    } catch (e) { setErr(e.message); setData(null); }
    finally { setLoading(false); }
  };

  const hasData = data && (data.total > 0 || (data.daily || []).length > 0);

  return (
    <>
      <PageHead crumb="账单费用" sub="默认优先读取 20 分钟缓存，手动刷新才实时查询 Azure Cost Management。" />
      <Card className="mb-4">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
          <Field label="Azure 账号">
            <AccountSelect accounts={accounts} tiers={tiers} value={f.account_id} onChange={(v) => setF({ ...f, account_id: v })} />
          </Field>
          <Field label="开始"><Input type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
          <Field label="结束"><Input type="date" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>
          <Field label="分组">
            <Select value={f.group_by} onChange={(e) => setF({ ...f, group_by: e.target.value })}>
              {GROUP_OPTS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </Select>
          </Field>
          <Field label="费用类型">
            <Select value={f.cost_type} onChange={(e) => setF({ ...f, cost_type: e.target.value })}>
              <option value="actual">实际费用</option>
              <option value="amortized">摊销费用</option>
            </Select>
          </Field>
          <div className="flex gap-2">
            <Btn onClick={() => query(false)} disabled={loading} className="flex-1">{loading ? "查询中..." : "查询费用"}</Btn>
            <Btn variant="secondary" onClick={() => query(true)} disabled={loading} className="flex-1">刷新 Azure</Btn>
          </div>
        </div>
        {data && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-slate-500">
            <Badge color={data.stale ? "amber" : data.cached ? "blue" : "green"}>
              {data.stale ? "旧缓存" : data.cached ? "缓存命中" : "Azure 实时"}
            </Badge>
            <span>更新时间：{fmtTime(data.generated_at)}</span>
            {!data.stale && data.expires_at && <span>缓存有效至：{fmtTime(data.expires_at)}</span>}
            {data.cache_ttl_seconds && <span>TTL：{Math.round(data.cache_ttl_seconds / 60)} 分钟</span>}
          </div>
        )}
      </Card>

      {err && <p className="text-[13px] text-red-600 mb-4">{err}</p>}
      {data?.warning && <p className="text-[13px] text-amber-600 mb-4">{data.warning}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <Card title="区间总费用" sub="Azure Cost Management 返回的税前费用合计。">
          {loading ? <Loading text="拉取账单..." /> : hasData ? (
            <>
              <div className="text-[32px] font-bold text-slate-900">
                {data.total?.toFixed ? data.total.toFixed(2) : data.total}
              </div>
              <div className="text-[13px] text-slate-500 mt-1">Azure 结算币种：{data.currency || "USD"}</div>
            </>
          ) : (
            <>
              <div className="text-[32px] font-bold text-slate-300">—</div>
              <div className="text-[13px] text-slate-400 mt-1">Azure 结算币种</div>
            </>
          )}
        </Card>
        <Card title="每日趋势" sub="同一天的各分组汇总后绘制。">
          {loading ? <Loading text="拉取账单..." /> : <LineChart daily={data?.daily} />}
        </Card>
      </div>

      <Card title="费用明细" sub="按 Cost Management 返回的每日明细行展示。">
        {loading ? <Loading text="拉取账单..." /> : !data || (!(data.detail_rows || []).length && !(data.details || []).length) ? (
          <EmptyState icon="🧾" text="暂无数据" />
        ) : (data.detail_rows || []).length ? (
          <Table cols={[billingCostColumn(data.cost_type), "UsageDate", "ResourceGroup", "Currency"]}>
            {data.detail_rows.map((d, i) => (
              <tr key={`${d.usage_date || ""}-${d.resource_group || ""}-${i}`} className="border-b border-slate-50">
                <Td className="font-mono">{fmtCost(d.cost)}</Td>
                <Td className="font-mono">{d.usage_date || "-"}</Td>
                <Td>{d.resource_group || "-"}</Td>
                <Td>{d.currency || data.currency || "-"}</Td>
              </tr>
            ))}
          </Table>
        ) : (
          <Table cols={["ResourceGroup", billingCostColumn(data.cost_type), "Currency"]}>
            {data.details.map((d, i) => (
              <tr key={i} className="border-b border-slate-50">
                <Td>{d.resource_group || "-"}</Td>
                <Td className="font-mono">{fmtCost(d.cost)}</Td>
                <Td>{data.currency || "-"}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
