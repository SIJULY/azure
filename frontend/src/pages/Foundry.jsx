import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import {
  Badge, Btn, Card, EmptyState, Field, Input, Loading,
  Modal, PageHead, Select, Table, Td, useToast,
} from "../ui.jsx";

/* 37 个 Foundry 支持区域：(国别) 显示名 code */
import { REGIONS, regionLabel } from "../regions.js";

const RefreshIcon = ({ spinning }) => (
  <svg className={`w-3.5 h-3.5 ${spinning ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

const shortSub = (value) => {
  const s = String(value || "");
  return s.length > 13 ? `${s.slice(0, 8)}…${s.slice(-4)}` : s;
};

const accountOptionLabel = (account, tier) => {
  const alias = account?.alias || `account-${account?.id}`;
  const quotaTier = tier?.quota_tier || "未知";
  return `${alias} / ${shortSub(account?.subscription_id)} / ${quotaTier}`;
};

/* ---------- 创建 Foundry 账号弹窗 ---------- */
function EnsureModal({ accounts, tiers, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({
    account_id: accounts[0]?.id ? String(accounts[0].id) : "",
    name: "", resource_group: "", region: "",
  });
  const [rgs, setRgs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!f.account_id) return;
    setRgs([]);
    api.get(`/resource-groups?account_id=${f.account_id}`).then((d) => {
      setRgs(Array.isArray(d) ? d : []);
    }).catch(() => {});
  }, [f.account_id]);

  const save = async () => {
    setErr("");
    if (!f.account_id || !f.name.trim() || !f.resource_group || !f.region) return;
    setBusy(true);
    try {
      await api.post("/foundry/ensure", {
        account_id: Number(f.account_id),
        name: f.name.trim(),
        resource_group: f.resource_group,
        region: f.region,
      });
      toast("创建任务已提交，去任务中心查看", { action: "/jobs", actionLabel: "去查看" });
      onSaved();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const canSubmit = f.account_id && f.name.trim() && f.resource_group && f.region;

  return (
    <Modal title="创建 Foundry 账号" onClose={onClose}>
      <p className="text-[13px] text-slate-500 mb-4">创建 AIServices 账号并启用项目管理、本地 key1/key2 和系统托管身份。</p>
      <div className="space-y-3">
        <Field label="Azure 账号">
          <Select value={f.account_id} onChange={(e) => setF({ ...f, account_id: e.target.value, resource_group: "" })}>
            {accounts.map((a) => {
              const t = tiers[a.id];
              return (
                <option key={a.id} value={a.id}>
                  {a.alias} / {a.subscription_id} / {t?.quota_tier || "未知"}
                </option>
              );
            })}
          </Select>
          {f.account_id && (
            <div className="text-[12px] text-slate-400 mt-1">
              缓存的订阅级 Foundry 配额层级：{tiers[Number(f.account_id)]?.quota_tier || "未知"}
            </div>
          )}
        </Field>
        <Field label="账号名">
          <Input value={f.name} placeholder="输入账号名称" onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="资源组">
          <Select value={f.resource_group} onChange={(e) => setF({ ...f, resource_group: e.target.value })}>
            <option value="">请选择</option>
            {rgs.length > 0 && (
              <optgroup label="已有资源组">
                {rgs.map((r, i) => (
                  <option key={i} value={r.name}>{r.name}（{r.location}）</option>
                ))}
              </optgroup>
            )}
          </Select>
        </Field>
        <Field label="区域">
          <Select value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })}>
            <option value="">请选择</option>
            {REGIONS.map((r) => (
              <option key={r[0]} value={r[0]}>{regionLabel(r)}</option>
            ))}
          </Select>
        </Field>
        {err && <p className="text-[13px] text-red-600">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="secondary" onClick={onClose}>取消</Btn>
          <Btn disabled={!canSubmit || busy} onClick={save}>{busy ? "创建中..." : "创建账号"}</Btn>
          <Btn variant="secondary" onClick={onClose}>关闭</Btn>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- 批量部署模型弹窗（四步向导，第一步） ---------- */
function BatchDeployModal({ accounts, tiers, onClose }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState([]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return accounts;
    return accounts.filter((a) =>
      (a.alias || "").toLowerCase().includes(s) ||
      (a.subscription_id || "").toLowerCase().includes(s) ||
      (a.remark || "").toLowerCase().includes(s)
    );
  }, [accounts, q]);

  const toggle = (id) => setSel((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const selectAll = () => setSel(filtered.map((a) => a.id));
  const clearAll = () => setSel([]);

  const steps = ["选择账号", "配置模型", "检查清单", "部署进度"];

  return (
    <Modal title="批量部署模型" onClose={onClose} wide>
      {/* 步骤条 */}
      <div className="flex items-center gap-2 mb-5">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={`flex items-center justify-center w-6 h-6 rounded-full text-[12px] font-medium ${
              i === 0 ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-400"
            }`}>{i + 1}</div>
            <span className={`text-[13px] ${i === 0 ? "text-slate-900 font-medium" : "text-slate-400"}`}>{s}</span>
            {i < steps.length - 1 && <div className="w-8 h-px bg-slate-200 mx-1" />}
          </div>
        ))}
      </div>

      <div className="flex gap-5">
        {/* 左：账号选择 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-3">
            <Input value={q} placeholder="搜索账号名称、备注或订阅 ID…" onChange={(e) => setQ(e.target.value)} className="!w-64" />
            <Btn variant="secondary" onClick={selectAll}>全选</Btn>
            <Btn variant="secondary" onClick={clearAll} disabled={sel.length === 0}>清空选择</Btn>
          </div>
          <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-80 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-6 text-center text-[13px] text-slate-400">无匹配账号</div>
            ) : filtered.map((a) => {
              const t = tiers[a.id]?.quota_tier;
              return (
                <label key={a.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox" className="w-4 h-4 accent-blue-600"
                    checked={sel.includes(a.id)} onChange={() => toggle(a.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-slate-900 truncate">{a.alias}</div>
                    <div className="text-[12px] text-slate-400 font-mono truncate">{a.subscription_id}</div>
                  </div>
                  {t && <Badge color="blue">{t}</Badge>}
                </label>
              );
            })}
          </div>
        </div>

        {/* 右：部署摘要 */}
        <div className="w-56 shrink-0">
          <div className="border border-slate-200 rounded-lg p-4">
            <div className="text-[13px] font-semibold text-slate-900 mb-3">部署摘要</div>
            <div className="space-y-2 text-[13px]">
              <div className="flex justify-between"><span className="text-slate-500">Azure 账号</span><span className="font-medium">{sel.length}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">使用已有</span><span className="font-medium">0</span></div>
              <div className="flex justify-between"><span className="text-slate-500">本批次新建</span><span className="font-medium">0</span></div>
              <div className="flex justify-between"><span className="text-slate-500">模型配置</span><span className="font-medium">1</span></div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100">
              <div className="text-[12px] text-slate-400 mb-1">计划部署</div>
              <div className="text-[28px] font-bold text-slate-900 leading-none">0<span className="text-[14px] font-normal text-slate-400"> / 100</span></div>
            </div>
            <div className="mt-3 text-[12px] text-slate-400">最多 20 个模型配置 · 100 条部署</div>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-slate-100">
        <Btn disabled={sel.length === 0} onClick={() => toast("功能开发中")}>下一步</Btn>
        <Btn variant="secondary" onClick={onClose}>关闭</Btn>
      </div>
    </Modal>
  );
}

/* ---------- 主页面 ---------- */
export default function Foundry() {
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState("all");
  const [foundryId, setFoundryId] = useState("all");
  const [resources, setResources] = useState([]);
  const [tiers, setTiers] = useState({});           // account_id -> quota 接口数据
  const [tiersLoading, setTiersLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [rowRefreshing, setRowRefreshing] = useState(null);
  const [ensureOpen, setEnsureOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);

  useEffect(() => {
    api.get("/accounts").then((d) => setAccounts(d.items || [])).catch(() => {});
  }, []);

  const fetchTier = async (id) => {
    try {
      const d = await api.get(`/quotas?account_id=${id}`, { timeout: 45000 });
      // 只有拿到有效 tier 才返回，否则抛错触发重试逻辑
      if (d && d.quota_tier) return d;
      throw new Error("empty tier");
    } catch {
      return null;
    }
  };

  const loadTiers = async () => {
    if (!accounts.length) return;
    setTiersLoading(true);
    const ids = accountId === "all" ? accounts.map((a) => a.id) : [Number(accountId)];
    const out = {};
    await Promise.all(ids.map(async (id) => {
      const d = await fetchTier(id);
      if (d) out[id] = d;  // 失败的不放入，保持"检测中"状态可重试
    }));
    setTiers((prev) => ({ ...prev, ...out }));
    setTiersLoading(false);
  };

  const loadResources = async () => {
    if (!accounts.length) return;
    const ids = accountId === "all" ? accounts.map((a) => a.id) : [Number(accountId)];
    const rs = [];
    for (const id of ids) {
      try {
        const r = await api.get(`/foundry/resources?account_id=${id}`, { timeout: 45000 });
        (r || []).forEach((x) => rs.push({ ...x, _aid: id }));
      } catch { /* skip */ }
    }
    setResources(rs);
  };

  useEffect(() => {
    if (accounts.length) { loadTiers(); loadResources(); }
    /* eslint-disable-next-line */
  }, [accounts, accountId]);

  const refreshAll = async () => {
    if (refreshing) return;
    setRefreshing(true);
    await loadTiers();
    setRefreshing(false);
  };

  const refreshRow = async (id) => {
    if (rowRefreshing) return;
    setRowRefreshing(id);
    const d = await fetchTier(id);
    setTiers((p) => ({ ...p, [id]: d }));
    setRowRefreshing(null);
  };

  const visibleAccounts = useMemo(() => {
    let list = accountId === "all" ? accounts : accounts.filter((a) => String(a.id) === String(accountId));
    if (foundryId !== "all") {
      const aid = resources.find((r) => r.name === foundryId)?._aid;
      if (aid) list = list.filter((a) => a.id === aid);
    }
    return list;
  }, [accounts, accountId, foundryId, resources]);

  const allResources = useMemo(() => {
    const seen = new Map();
    resources.forEach((r) => { if (!seen.has(r.name)) seen.set(r.name, r); });
    return [...seen.values()];
  }, [resources]);

  return (
    <>
      <PageHead crumb="Foundry" sub="管理账号、项目、部署和访问密钥。" />

      {/* 筛选区 */}
      <div className="flex items-end gap-3 mb-4 flex-wrap">
        <div className="w-full sm:w-72 min-w-0">
          <div className="text-[13px] font-medium text-slate-700 mb-1.5">Azure 账号</div>
          <Select value={accountId} onChange={(e) => { setAccountId(e.target.value); setFoundryId("all"); }} className="!w-full truncate">
            <option value="all">全部账户</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {accountOptionLabel(a, tiers[a.id])}
              </option>
            ))}
          </Select>
          {accountId !== "all" && (
            <div className="text-[12px] text-slate-400 mt-1">
              缓存的订阅级 Foundry 配额层级：{tiers[Number(accountId)]?.quota_tier || "未知"}
            </div>
          )}
        </div>
        <div className="w-full sm:w-56 min-w-0">
          <div className="text-[13px] font-medium text-slate-700 mb-1.5">Foundry 账号</div>
          <Select value={foundryId} onChange={(e) => setFoundryId(e.target.value)} className="!w-full truncate">
            <option value="all">全部账户</option>
            {allResources.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
          </Select>
        </div>
        <div className="pb-0">
          <Btn variant="secondary" onClick={refreshAll} disabled={refreshing} className="inline-flex items-center gap-1.5">
            <RefreshIcon spinning={refreshing} />
            {refreshing ? "刷新中..." : "刷新"}
          </Btn>
        </div>
        <div className="hidden xl:block flex-1" />
        <div className="flex items-center gap-3 flex-wrap">
          <Btn onClick={() => setEnsureOpen(true)}>+ 创建 Foundry 账号</Btn>
          <Btn onClick={() => setBatchOpen(true)}>+ 批量部署模型</Btn>
        </div>
      </div>

      {/* 表格 */}
      <Card>
        {tiersLoading && visibleAccounts.length === 0 ? <Loading /> : (
          <Table cols={[
            "Azure 账号", "订阅",
            <span key="t" className="inline-flex items-center gap-1.5">
              配额层级
              <button
                title="刷新 配额层级"
                onClick={refreshAll}
                disabled={refreshing}
                className="text-slate-400 hover:text-blue-600 disabled:opacity-50"
              >
                <RefreshIcon spinning={refreshing} />
              </button>
            </span>,
            "升级可用状态", "下一层级可用时间", "升级可用策略", "订阅状态",
          ]}>
            {visibleAccounts.length === 0 ? (
              <tr><Td colSpan={7}><EmptyState icon="🤖" text="暂无账号" /></Td></tr>
            ) : visibleAccounts.map((a) => {
              const t = tiers[a.id] || {};
              const loaded = a.id in tiers;
              return (
                <tr key={a.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                  <Td><span className="font-medium text-slate-900">{a.alias}</span></Td>
                  <Td className="font-mono text-[12px]">{a.subscription_id}</Td>
                  <Td>
                    <span className="inline-flex items-center gap-1.5">
                      {loaded ? (t.quota_tier || "未知") : <span className="text-slate-400">检测中…</span>}
                      <button
                        title={`刷新 ${a.alias}`}
                        onClick={() => refreshRow(a.id)}
                        disabled={rowRefreshing === a.id}
                        className="text-slate-400 hover:text-blue-600 disabled:opacity-50"
                      >
                        <RefreshIcon spinning={rowRefreshing === a.id} />
                      </button>
                    </span>
                  </Td>
                  <Td>{t.upgrade_available ?? "-"}</Td>
                  <Td>{t.next_tier_available_at ?? "-"}</Td>
                  <Td>{t.upgrade_policy || "自动升级"}</Td>
                  <Td>
                    {!loaded ? <Badge color="gray">检测中</Badge>
                      : a.status === "healthy" ? <Badge color="green">已启用</Badge>
                      : <Badge color="red">异常</Badge>}
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      {ensureOpen && (
        <EnsureModal
          accounts={accounts} tiers={tiers}
          onClose={() => setEnsureOpen(false)}
          onSaved={() => { setEnsureOpen(false); loadResources(); loadTiers(); }}
        />
      )}
      {batchOpen && (
        <BatchDeployModal accounts={accounts} tiers={tiers} onClose={() => setBatchOpen(false)} />
      )}
    </>
  );
}
