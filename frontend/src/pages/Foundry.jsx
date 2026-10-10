import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { publishFoundryOverview } from "../overviewSync.js";
import {
  AccountSelect, Badge, Btn, Card, EmptyState, Field, Input, Loading,
  Modal, PageHead, RegionSelect, Select, Table, Td, useToast,
} from "../ui.jsx";

/* 37 个 Foundry 支持区域：(国别) 显示名 code */
import { REGIONS } from "../regions.js";

const RefreshIcon = ({ spinning }) => (
  <svg className={`w-3.5 h-3.5 ${spinning ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

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
      <p className="text-sm text-slate-500 mb-4">创建 AIServices 账号并启用项目管理、本地 key1/key2 和系统托管身份。</p>
      <div className="space-y-3">
        <Field label="Azure 账号">
          <AccountSelect accounts={accounts} tiers={tiers} value={f.account_id} onChange={(v) => setF({ ...f, account_id: v, resource_group: "" })} />
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
          <RegionSelect regions={REGIONS} value={f.region} onChange={(v) => setF({ ...f, region: v })} />
        </Field>
        {err && <p className="text-sm text-red-600">{err}</p>}
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
function BatchDeployModal({ accounts, tiers, resources, onClose }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState([]);
  const [foundryMode, setFoundryMode] = useState({});
  const [foundryChoice, setFoundryChoice] = useState({});

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return accounts;
    return accounts.filter((a) =>
      (a.alias || "").toLowerCase().includes(s) ||
      (a.subscription_id || "").toLowerCase().includes(s) ||
      (a.remark || "").toLowerCase().includes(s)
    );
  }, [accounts, q]);

  const resourcesByAccount = useMemo(() => {
    const map = new Map();
    (resources || []).forEach((r) => {
      if (!map.has(r._aid)) map.set(r._aid, []);
      map.get(r._aid).push(r);
    });
    return map;
  }, [resources]);

  const applyDefaults = (ids) => {
    setFoundryMode((prev) => {
      const next = { ...prev };
      ids.forEach((id) => {
        if (!next[id]) next[id] = (resourcesByAccount.get(id) || []).length ? "existing" : "new";
      });
      return next;
    });
    setFoundryChoice((prev) => {
      const next = { ...prev };
      ids.forEach((id) => {
        const list = resourcesByAccount.get(id) || [];
        if (!next[id] && list[0]?.name) next[id] = list[0].name;
      });
      return next;
    });
  };

  const toggle = (id) => setSel((p) => {
    const next = p.includes(id) ? p.filter((x) => x !== id) : [...p, id];
    if (!p.includes(id)) applyDefaults([id]);
    return next;
  });
  const selectAll = () => {
    const ids = filtered.map((a) => a.id);
    setSel(ids);
    applyDefaults(ids);
  };
  const clearAll = () => setSel([]);

  const steps = ["选择账号", "配置模型", "检查清单", "部署进度"];
  const selectedAccounts = accounts.filter((a) => sel.includes(a.id));
  const existingCount = selectedAccounts.filter((a) => foundryMode[a.id] === "existing" && foundryChoice[a.id]).length;
  const newCount = selectedAccounts.filter((a) => foundryMode[a.id] === "new").length;
  const modelConfigCount = 1;
  const plannedCount = Math.min(100, (existingCount + newCount) * modelConfigCount);

  return (
    <Modal
      title="批量部署模型"
      onClose={onClose}
      wide
      className="!max-w-[1480px] h-[min(860px,calc(100vh-96px))]"
      bodyClassName="!px-0 !py-0 flex flex-col min-h-0"
    >
      {/* 步骤条 */}
      <div className="px-8 pt-7 pb-4 shrink-0">
        <div className="bg-slate-50 rounded-xl p-1.5 grid grid-cols-4 gap-1.5">
          {steps.map((s, i) => (
            <div key={i} className={`relative flex items-center justify-center gap-3 rounded-lg py-3 text-sm ${
              i === 0 ? "bg-white text-slate-900 font-semibold shadow-sm" : "text-slate-400 font-medium"
            }`}>
              <span className={`flex items-center justify-center w-7 h-7 rounded-lg text-sm font-semibold ${
                i === 0 ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-400"
              }`}>{i + 1}</span>
              <span>{s}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_300px] gap-6 px-8 pb-6 flex-1 min-h-0 overflow-y-auto">
        {/* 左：账号选择 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-4">
            <Input value={q} placeholder="搜索账号名称、备注或订阅 ID…" onChange={(e) => setQ(e.target.value)} className="!w-[520px]" />
            <Btn variant="secondary" onClick={selectAll}>全选</Btn>
            <Btn variant="secondary" onClick={clearAll} disabled={sel.length === 0}>清空选择</Btn>
          </div>
          <div className="space-y-3">
            {filtered.length === 0 ? (
              <div className="p-10 border border-slate-200 rounded-xl text-center text-sm text-slate-400">无匹配账号</div>
            ) : filtered.map((a) => {
              const t = tiers[a.id]?.quota_tier;
              const checked = sel.includes(a.id);
              const accountResources = resourcesByAccount.get(a.id) || [];
              const mode = foundryMode[a.id] || (accountResources.length ? "existing" : "new");
              const selectedResource = accountResources.find((r) => r.name === foundryChoice[a.id]) || accountResources[0];
              return (
                <div key={a.id} className={`border rounded-xl transition ${checked ? "border-blue-300 bg-blue-50/20" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                  <label className="flex items-center gap-4 px-5 py-4 cursor-pointer">
                    <input
                      type="checkbox" className="w-4 h-4 accent-blue-600"
                      checked={checked} onChange={() => toggle(a.id)}
                    />
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-700 font-bold text-lg shrink-0">A</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] font-semibold text-slate-900 truncate">{a.alias}</div>
                      <div className="text-sm text-slate-400 font-mono truncate mt-1">{a.subscription_id}</div>
                    </div>
                    {t && <Badge color="blue" className="!text-sm !px-3 !py-1">{t}</Badge>}
                  </label>

                  {checked && (
                    <div className="border-t border-slate-100 px-5 py-4">
                      <div className="flex items-center gap-3 mb-4">
                        <button
                          type="button"
                          onClick={() => setFoundryMode((p) => ({ ...p, [a.id]: "existing" }))}
                          disabled={accountResources.length === 0}
                          className={`rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${mode === "existing" ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50"}`}
                        >使用已有 Foundry</button>
                        <button
                          type="button"
                          onClick={() => setFoundryMode((p) => ({ ...p, [a.id]: "new" }))}
                          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${mode === "new" ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50"}`}
                        >新建 Foundry</button>
                      </div>
                      {mode === "existing" && accountResources.length > 0 ? (
                        <Field label="Foundry 账号">
                          <Select
                            value={foundryChoice[a.id] || selectedResource?.name || ""}
                            onChange={(e) => setFoundryChoice((p) => ({ ...p, [a.id]: e.target.value }))}
                            className="!text-[15px] !py-3"
                          >
                            {accountResources.map((r) => (
                              <option key={`${a.id}-${r.name}`} value={r.name}>{r.name}</option>
                            ))}
                          </Select>
                        </Field>
                      ) : (
                        <div className="grid grid-cols-2 gap-3">
                          <Field label="Foundry 账号">
                            <Input value={`foundry-${(a.alias || "account").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || a.id}`} readOnly className="!text-[15px] !py-3 bg-slate-50" />
                          </Field>
                          <Field label="区域">
                            <Select defaultValue="japaneast" className="!text-[15px] !py-3">
                              <option value="japaneast">日本东部 · japaneast</option>
                              <option value="eastus">美国东部 · eastus</option>
                              <option value="swedencentral">瑞典中部 · swedencentral</option>
                            </Select>
                          </Field>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 右：部署摘要 */}
        <div className="w-[300px] shrink-0">
          <div className="border border-slate-200 rounded-xl bg-white overflow-hidden sticky top-0">
            <div className="px-5 py-4 text-[14px] font-semibold text-slate-900 border-b border-slate-100">部署摘要</div>
            <div className="px-5 py-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Azure 账号</span><span className="font-medium">{sel.length}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">使用已有</span><span className="font-medium">{existingCount}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">本批次新建</span><span className="font-medium">{newCount}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">模型配置</span><span className="font-medium">{modelConfigCount}</span></div>
            </div>
            <div className="px-5 py-5 bg-blue-50/50 border-y border-slate-100">
              <div className="text-[12px] text-slate-400 mb-1">计划部署</div>
              <div className="text-[34px] font-bold text-blue-600 leading-none">{plannedCount}<span className="text-[16px] font-normal text-slate-400"> / 100</span></div>
            </div>
            <div className="px-5 py-4 space-y-4 max-h-64 overflow-y-auto">
              {selectedAccounts.length === 0 ? (
                <div className="text-[12px] text-slate-400">选择账号后显示部署明细</div>
              ) : selectedAccounts.map((a) => {
                const selectedResource = (resourcesByAccount.get(a.id) || []).find((r) => r.name === foundryChoice[a.id]) || (resourcesByAccount.get(a.id) || [])[0];
                return (
                  <div key={a.id} className="text-[12px]">
                    <div className="font-semibold text-slate-900 mb-2 truncate">{a.alias}</div>
                    <div className="text-slate-500">{foundryMode[a.id] === "new" ? "本批次新建 Foundry" : "使用已有 Foundry"}</div>
                    <div className="text-slate-500 break-all mt-1">{foundryMode[a.id] === "new" ? `foundry-${String(a.id).padStart(4, "0")} · japaneast` : `${selectedResource?.name || "-"} · ${selectedResource?.location || "-"}`}</div>
                  </div>
                );
              })}
            </div>
            <div className="px-5 py-4 border-t border-slate-100 text-[12px] text-slate-400">最多 20 个模型配置 · 100 条部署</div>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 px-8 py-4 border-t border-slate-100 shrink-0 bg-white">
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

  const fetchTier = async (id, force = false) => {
    try {
      const d = await api.get(`/quotas?account_id=${id}${force ? "&refresh=true" : ""}`, { timeout: 45000 });
      // 只有拿到有效 tier 才返回，否则抛错触发重试逻辑
      if (d && d.quota_tier) return d;
      throw new Error("empty tier");
    } catch {
      return null;
    }
  };

  const loadTiers = async (force = false) => {
    if (!accounts.length) return;
    setTiersLoading(true);
    const ids = accountId === "all" ? accounts.map((a) => a.id) : [Number(accountId)];
    const out = {};
    await Promise.all(ids.map(async (id) => {
      const d = await fetchTier(id, force);
      if (d) out[id] = d;  // 失败的不放入，保持"检测中"状态可重试
    }));
    setTiers((prev) => ({ ...prev, ...out }));
    setTiersLoading(false);
  };

  const loadResources = async (force = false) => {
    if (!accounts.length) return;
    const ids = accountId === "all" ? accounts.map((a) => a.id) : [Number(accountId)];
    const rs = [];
    let okCount = 0;
    for (const id of ids) {
      try {
        const r = await api.get(`/foundry/resources?account_id=${id}${force ? "&refresh=true" : ""}`, { timeout: 45000 });
        okCount += 1;
        (r || []).forEach((x) => rs.push({ ...x, _aid: id }));
      } catch { /* skip */ }
    }
    setResources((prev) => (rs.length === 0 && prev.length > 0 ? prev : rs));
    if (okCount > 0 && rs.length > 0) publishFoundryOverview(rs);
  };

  useEffect(() => {
    if (accounts.length) { loadTiers(); loadResources(); }
    /* eslint-disable-next-line */
  }, [accounts, accountId]);

  const refreshAll = async () => {
    if (refreshing) return;
    setRefreshing(true);
    await loadTiers(true);
    await loadResources(true);
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
        <Field label="Azure 账号">
          <AccountSelect accounts={accounts} tiers={tiers} value={accountId} onChange={(v) => { setAccountId(v); setFoundryId("all"); }} includeAll className="w-64" />
        </Field>
        <Field label="Foundry 账号">
          <Select value={foundryId} onChange={(e) => setFoundryId(e.target.value)} className="w-56">
            <option value="all">全部账户</option>
            {allResources.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
          </Select>
        </Field>
        <div className="pb-0">
          <Btn variant="secondary" onClick={refreshAll} disabled={refreshing} className="inline-flex items-center gap-1.5">
            <RefreshIcon spinning={refreshing} />
            {refreshing ? "刷新中..." : "刷新"}
          </Btn>
        </div>
        <div className="flex-1" />
        <Btn onClick={() => setEnsureOpen(true)}>+ 创建 Foundry 账号</Btn>
        <Btn onClick={() => setBatchOpen(true)}>+ 批量部署模型</Btn>
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
        <BatchDeployModal accounts={accounts} tiers={tiers} resources={resources} onClose={() => setBatchOpen(false)} />
      )}
    </>
  );
}
