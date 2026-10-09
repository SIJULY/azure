import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { Badge, Btn, Card, EmptyState, Field, Input, Loading, PageHead, Table, Td, useToast } from "../ui.jsx";

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

/* ---------- 带搜索的账号下拉 ---------- */
function AccountPicker({ accounts, tiers, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);
  const sel = accounts.find((a) => String(a.id) === String(value));

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return accounts.filter((a) =>
      !s || (a.alias || "").toLowerCase().includes(s) || (a.subscription_id || "").toLowerCase().includes(s)
    );
  }, [accounts, q]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full text-[13px] border border-slate-300 rounded-lg px-3 py-2 bg-white text-left text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between gap-2"
      >
        <span className="truncate">{sel ? sel.alias : "请选择账号"}</span>
        <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <Input placeholder="搜索账户或订阅 ID…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 && <div className="px-3 py-4 text-[13px] text-slate-400 text-center">无匹配账号</div>}
            {filtered.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => { onChange(String(a.id)); setOpen(false); setQ(""); }}
                className={`w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 ${String(a.id) === String(value) ? "bg-blue-50" : ""}`}
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] text-slate-900 truncate">{a.alias}</span>
                  <span className="block text-[11px] text-slate-400 font-mono truncate">{a.subscription_id}</span>
                </span>
                {tiers[a.id] && <Badge color="blue">{tiers[a.id]}</Badge>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const GROUP_OPTS = [
  ["resource_group", "资源组"],
  ["service", "服务"],
  ["meter", "计量类别"],
  ["none", "不分组"],
];

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

  const query = async () => {
    if (!f.account_id) return toast("请先选择 Azure 账号");
    setLoading(true); setErr("");
    try {
      const d = await api.get(
        `/billing/range?account_id=${f.account_id}&start=${f.start}&end=${f.end}&group_by=${f.group_by}&cost_type=${f.cost_type}`,
        { timeout: 90000 }
      );
      setData(d);
    } catch (e) { setErr(e.message); setData(null); }
    finally { setLoading(false); }
  };

  const hasData = data && (data.total > 0 || (data.daily || []).length > 0);

  return (
    <>
      <PageHead crumb="账单费用" sub="分析订阅费用、趋势和资源分布。" />
      <Card className="mb-4">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
          <Field label="Azure 账号">
            <AccountPicker accounts={accounts} tiers={tiers} value={f.account_id} onChange={(v) => setF({ ...f, account_id: v })} />
          </Field>
          <Field label="开始"><Input type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
          <Field label="结束"><Input type="date" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>
          <Field label="分组">
            <select value={f.group_by} onChange={(e) => setF({ ...f, group_by: e.target.value })}
              className="w-full text-[13px] border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
              {GROUP_OPTS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </Field>
          <Field label="费用类型">
            <select value={f.cost_type} onChange={(e) => setF({ ...f, cost_type: e.target.value })}
              className="w-full text-[13px] border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="actual">实际费用</option>
              <option value="amortized">摊销费用</option>
            </select>
          </Field>
          <Btn onClick={query} disabled={loading}>{loading ? "查询中..." : "查询费用"}</Btn>
        </div>
      </Card>

      {err && <p className="text-[13px] text-red-600 mb-4">{err}</p>}

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

      <Card title="费用明细" sub="列由 Cost Management 动态返回。">
        {loading ? <Loading text="拉取账单..." /> : !data || !data.details?.length ? (
          <EmptyState icon="🧾" text="暂无数据" />
        ) : (
          <Table cols={["资源组", "费用"]}>
            {data.details.map((d, i) => (
              <tr key={i} className="border-b border-slate-50">
                <Td>{d.resource_group}</Td>
                <Td>{d.cost?.toFixed ? d.cost.toFixed(2) : d.cost} {data.currency}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
