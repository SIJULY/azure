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
