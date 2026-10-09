import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { publishResourceGroupOverview } from "../overviewSync.js";
import {
  Badge, Btn, Card, Confirm, EmptyState, Field, Input, Loading,
  Modal, PageHead, Select, Textarea, useSearch, useToast,
} from "../ui.jsx";
import { REGIONS, regionLabel } from "../regions.js";

function TrashIcon({ className = "w-[18px] h-[18px]" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.7 6.3a1 1 0 00-1.4 0L6.6 13l4.3 4.3 6.7-6.7a1 1 0 000-1.4l-2.9-2.9zM6.6 13L4 20l7-2.6M9 3h6l1 2h4v2H4V5h4l1-2z" />
    </svg>
  );
}
function EyeIcon({ className = "w-[18px] h-[18px]" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.1 12s3.6-7 9.9-7 9.9 7 9.9 7-3.6 7-9.9 7-9.9-7-9.9-7zM12 15a3 3 0 100-6 3 3 0 000 6z" />
    </svg>
  );
}

function CreateRgModal({ accounts, onClose, onSaved }) {
  const toast = useToast();
  const [accountId, setAccountId] = useState(accounts[0]?.id ? String(accounts[0].id) : "");
  const [name, setName] = useState("");
  const [region, setRegion] = useState("japaneast");
  const [tags, setTags] = useState("managed-by=Azure面板");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const save = async () => {
    setErr("");
    if (!accountId) return setErr("请选择 Azure 账号");
    if (!name.trim()) return setErr("请输入资源组名称");
    if (!region) return setErr("请选择区域");
    setBusy(true);
    try {
      await api.post("/resource-groups", { account_id: Number(accountId), name: name.trim(), location: region, tags });
      toast("资源组已创建");
      onSaved();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="创建资源组" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Azure 账号">
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.alias}</option>)}
          </Select>
        </Field>
        <Field label="名称">
          <Input value={name} placeholder="如 rg-prod" onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="区域">
          <Select value={region} onChange={(e) => setRegion(e.target.value)}>
            {REGIONS.map((r) => <option key={r[0]} value={r[0]}>{regionLabel(r)}</option>)}
          </Select>
        </Field>
        <Field label="标签" hint="每行 key=value">
          <Textarea rows={2} value={tags} onChange={(e) => setTags(e.target.value)} className="font-mono text-[12px]" />
        </Field>
        {err && <p className="text-[13px] text-red-600">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="secondary" onClick={onClose}>取消</Btn>
          <Btn disabled={busy || !name.trim()} onClick={save}>{busy ? "创建中..." : "创建"}</Btn>
          <Btn variant="secondary" onClick={onClose}>关闭</Btn>
        </div>
      </div>
    </Modal>
  );
}

export default function ResourceGroups() {
  const toast = useToast();
  const [q] = useSearch();
  const [accounts, setAccounts] = useState([]);
  const [tiers, setTiers] = useState({});
  const [accountId, setAccountId] = useState("all");
  const [region, setRegion] = useState("all");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [del, setDel] = useState(null);

  useEffect(() => {
    api.get("/accounts").then((d) => {
      const items = d.items || [];
      setAccounts(items);
      Promise.all(items.map((a) =>
        api.get(`/quotas?account_id=${a.id}`).then((r) => [a.id, r.quota_tier || "未知"]).catch(() => [a.id, "未知"])
      )).then((pairs) => setTiers(Object.fromEntries(pairs)));
    }).catch(() => {});
  }, []);

  const load = async (force = false) => {
    if (!force) setLoading(true);
    try {
      const ids = accountId === "all" ? accounts.map((a) => a.id) : [Number(accountId)];
      const all = [];
      let okCount = 0;
      for (const id of ids) {
        try {
          const suffix = force ? "&refresh=true" : "";
          const r = await api.get(`/resource-groups?account_id=${id}${suffix}`);
          okCount += 1;
          const a = accounts.find((x) => x.id === id);
          (r || []).forEach((x) => all.push({ ...x, _alias: a?.alias || "", _aid: id, _sub: a?.subscription_id || "" }));
        } catch { /* skip */ }
      }
      setItems((prev) => {
        try { if (JSON.stringify(prev) !== JSON.stringify(all)) return all; } catch {}
        return prev;
      });
      if (okCount > 0) publishResourceGroupOverview(all);
    } catch (e) { if (!force) toast("加载失败：" + e.message); }
    finally { if (!force) setLoading(false); }
  };

  useEffect(() => {
    if (accounts.length) {
      load(false);
      const t = setTimeout(() => load(true), 1000);
      return () => clearTimeout(t);
    }
    /* eslint-disable-next-line */
  }, [accounts, accountId]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items.filter((r) => {
      if (region !== "all" && r.location !== region) return false;
      if (s && !(r.name || "").toLowerCase().includes(s)) return false;
      return true;
    });
  }, [items, region, q]);

  const regions = useMemo(() => [...new Set(items.map((r) => r.location).filter(Boolean))], [items]);

  const doDelete = async () => {
    const target = del;
    setDel(null);
    if (!target) return;
    try {
      await api.post("/resource-groups/delete", { account_id: target._aid, name: target.name }, { timeout: 150000 });
      toast("资源组删除任务已提交");
      load(true);
    } catch (e) {
      toast("删除失败：" + e.message);
    }
  };

  return (
    <>
      <PageHead crumb="资源组" sub="创建、查看和删除 Azure 资源组。" />
      <div className="flex items-end gap-2 mb-4 flex-wrap">
        <Field label="Azure 账号" className="min-w-[260px] flex-1 max-w-sm">
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="all">全部账户</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.alias} {a.subscription_id} {tiers[a.id] || ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="区域" className="w-44">
          <Select value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="all">全部地区</option>
            {regions.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
        </Field>
        <div className="flex-1" />
        <Btn variant="secondary" onClick={() => load(true)} disabled={loading}>{loading ? "刷新中" : "刷新"}</Btn>
        <Btn onClick={() => setCreateOpen(true)}>创建资源组</Btn>
      </div>

      <Card title="订阅资源组" sub="删除资源组会删除其中全部 Azure 资源，请核对确认。">
        {loading ? <Loading /> : filtered.length === 0 ? (
          <EmptyState icon="📁" text="此订阅暂无资源组" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filtered.map((r, i) => {
              const tagN = Object.keys(r.tags || {}).length;
              return (
                <div key={i} className="border border-slate-200 rounded-xl px-4 py-3.5 flex items-center gap-3 bg-white hover:border-slate-300">
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-semibold text-slate-900 truncate">{r.name}</div>
                    <div className="text-[12px] text-slate-400 mt-0.5 truncate">
                      {r._alias}·{r.location}·{tagN}个标签
                    </div>
                  </div>
                  <Link
                    to={`/virtual-machines?rg=${encodeURIComponent(r.name)}`}
                    className="inline-flex items-center gap-1.5 text-[13px] text-blue-600 hover:text-blue-800 px-2.5 py-1.5 rounded-lg hover:bg-blue-50"
                  >
                    <EyeIcon />查看资源
                  </Link>
                  <button
                    title="删除资源组"
                    onClick={() => setDel(r)}
                    className="w-9 h-9 rounded-lg text-red-600 hover:bg-red-50 flex items-center justify-center"
                  >
                    <TrashIcon />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {createOpen && <CreateRgModal accounts={accounts} onClose={() => setCreateOpen(false)} onSaved={() => { setCreateOpen(false); load(); }} />}
      {del && (
        <Confirm title="删除资源组" danger okLabel="删除"
          text={`删除资源组「${del.name}」会删除其中全部 Azure 资源，此操作不可恢复，确定吗？`}
          onCancel={() => setDel(null)} onOk={doDelete} />
      )}
    </>
  );
}
