import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import {
  Badge, Btn, Card, Check, EmptyState, Field, Input, Loading,
  PageHead, Select, Table, Td, useSearch, useToast,
} from "../ui.jsx";
import { REGIONS, regionLabel } from "../regions.js";

const CN_NAMES = {
  availabilitySets: "可用性集",
  virtualMachines: "虚拟机",
  totalRegionalVcpus: "区域 vCPU 总数",
  standardBSFamily: "标准 BS 系列",
  standardDSv3Family: "标准 DSv3 系列",
  standardDSv2Family: "标准 DSv2 系列",
  standardDSv4Family: "标准 DSv4 系列",
  standardDSv5Family: "标准 DSv5 系列",
  standardDASv4Family: "标准 DASv4 系列",
  standardDASv5Family: "标准 DASv5 系列",
  standardDASv6Family: "标准 DASv6 系列",
  standardDCSv3Family: "标准 DCsv3 系列",
  standardDCSv2Family: "标准 DCsv2 系列",
  standardDDv4Family: "标准 DDv4 系列",
  standardDDv5Family: "标准 DDv5 系列",
  standardESv3Family: "标准 ESv3 系列",
  standardESv4Family: "标准 ESv4 系列",
  standardESv5Family: "标准 ESv5 系列",
  standardEASv4Family: "标准 EASv4 系列",
  standardEASv5Family: "标准 EASv5 系列",
  standardFSFamily: "标准 FS 系列",
  standardFSv2Family: "标准 FSv2 系列",
  standardGSFamily: "标准 GS 系列",
  standardHBFamily: "标准 HB 系列",
  standardHBv2Family: "标准 HBv2 系列",
  standardHCfamily: "标准 HC 系列",
  standardHBSFamily: "标准 HBS 系列",
  standardMSFamily: "标准 MS 系列",
  standardMSv2Family: "标准 MSv2 系列",
  standardNCASv3_T4Family: "标准 NCASv3_T4 系列",
  standardNCFamily: "标准 NC 系列",
  standardNCSv2Family: "标准 NCv2 系列",
  standardNCSv3Family: "标准 NCv3 系列",
  standardNDFamily: "标准 ND 系列",
  standardNDSFamily: "标准 ND 系列",
  standardNPSFamily: "标准 NP 系列",
  standardNVFamily: "标准 NV 系列",
  standardNVSv3Family: "标准 NVv3 系列",
  standardNVSv4Family: "标准 NVv4 系列",
  standardNVSv5Family: "标准 NVv5 系列",
  standardNVADSA10v5Family: "标准 NVADSA10v5 系列",
  standardFXMDVSFamily: "标准 FXMDVS 系列",
  standardLSv2Family: "标准 LSv2 系列",
  standardDv2Family: "标准 Dv2 系列",
  standardAv2Family: "标准 Av2 系列",
  standardA0_A7Family: "标准 A0-A7 系列",
  standardA8_A11Family: "标准 A8-A11 系列",
  standardB1s: "标准 B1s",
  premiumIO: "高级 IO",
  premiumV2IO: "高级 V2 IO",
  premiumV2Disks: "高级 V2 磁盘",
  standardSSDPublicIPS: "标准 SSD 公网 IP",
  standardSDDDisks: "标准 HDD 磁盘",
  standardHDDDisks: "标准 HDD 磁盘",
  standardSSDDisks: "标准 SSD 磁盘",
  standardSSDZRS: "标准 SSD ZRS",
  premiumZRS: "高级 ZRS",
  premiumDisks: "高级磁盘",
  premiumManagedDisks: "高级托管磁盘",
  networkInterfaces: "网络接口",
  publicIPAddresses: "公网 IP 地址",
  loadBalancers: "负载均衡器",
  networkSecurityGroups: "网络安全组",
  virtualNetworks: "虚拟网络",
  networkWatchers: "网络观察程序",
  premiumPageBlobAccounts: "高级页 Blob 账号",
  standardPageBlobAccounts: "标准页 Blob 账号",
  standardBlobAccounts: "标准 Blob 账号",
  standardFileAccounts: "标准文件账号",
  standardStorageAccounts: "标准存储账号",
  premiumBlockBlobAccounts: "高级块 Blob 账号",
  premiumFileAccounts: "高级文件账号",
  snapshots: "快照",
  dataDisks: "数据磁盘",
  cores: "内核",
};

const fmtN = (n) => `${Number(n || 0).toLocaleString("en-US")}个`;

function QuotaTable({ rows, showZero }) {
  const list = useMemo(() => {
    let r = rows || [];
    if (!showZero) r = r.filter((x) => (x.limit || 0) > 0);
    return r;
  }, [rows, showZero]);
  if (!list.length) return <EmptyState icon="📊" text="没有匹配的配额数据" />;
  return (
    <Table cols={["配额项目", "已使用", "上限", "剩余", "使用率", "作用域 / 状态"]}>
      {list.map((q, i) => {
        const used = q.current || 0, limit = q.limit || 0;
        const left = limit - used;
        const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
        const hot = pct >= 80;
        const label = CN_NAMES[q.name] ? `${CN_NAMES[q.name]} ${q.name}` : q.name;
        return (
          <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/60">
            <Td className="font-medium text-slate-900">{label}</Td>
            <Td>{fmtN(used)}</Td>
            <Td>{fmtN(limit)}</Td>
            <Td className={left < 0 ? "text-red-600" : ""}>{fmtN(left)}</Td>
            <Td>
              <div className="flex items-center gap-2">
                <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${hot ? "bg-red-500" : "bg-blue-500"}`} style={{ width: `${pct}%` }} />
                </div>
                <span className={`text-[12px] ${hot ? "text-red-600 font-medium" : "text-slate-500"}`}>{pct}%</span>
              </div>
            </Td>
            <Td>{hot ? <Badge color="red">接近上限</Badge> : <Badge color="green">正常</Badge>}</Td>
          </tr>
        );
      })}
    </Table>
  );
}

const INFO = [
  "Foundry 模型配额按订阅、区域、模型和部署类型共享给多个 Foundry 账号与项目，并不是每个项目一份独立额度。账号视图会另外展示该 AI Services/Foundry 账号返回的使用限制。",
  "查看 Foundry 区域配额时，Azure 服务主体需要订阅级 Cognitive Services Usages Reader 或等效权限。",
  "Compute 返回空且 Microsoft.Quota 未注册时，系统会自动为当前订阅提交后台注册，完成后重新读取配额。注册失败时显示原因，不会反复自动提交。",
];

export default function Quotas() {
  const toast = useToast();
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState("");
  const [region, setRegion] = useState("japaneast");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [showZero, setShowZero] = useState(false);
  const [q, setQ] = useSearch();
  const [foundryResources, setFoundryResources] = useState([]);
  const [foundryId, setFoundryId] = useState("");

  useEffect(() => {
    api.get("/accounts").then((d) => {
      const items = d.items || [];
      setAccounts(items);
      if (items.length) setAccountId(String(items[0].id));
    }).catch(() => {});
  }, []);

  const query = async () => {
    if (!accountId) return toast("请先选择 Azure 账号");
    setLoading(true); setErr("");
    try {
      const d = await api.get(`/quotas?account_id=${accountId}`);
      setData(d);
      api.get(`/foundry/resources?account_id=${accountId}`).then((r) => setFoundryResources(r || [])).catch(() => setFoundryResources([]));
      setFoundryId("");
    } catch (e) { setErr(e.message); setData(null); }
    finally { setLoading(false); }
  };

  const vmRows = useMemo(() => {
    const all = [];
    (data?.vm_quotas || []).forEach((r) => {
      if (region && r.region !== region) return;
      (r.usages || []).forEach((u) => all.push({ ...u, _region: r.region }));
    });
    const s = q.trim().toLowerCase();
    return s ? all.filter((x) => {
      const label = CN_NAMES[x.name] ? `${CN_NAMES[x.name]} ${x.name}` : (x.name || "");
      return label.toLowerCase().includes(s);
    }) : all;
  }, [data, region, q]);

  const tier = data?.quota_tier || "—";

  return (
    <>
      <PageHead crumb="资源配额" sub="查看订阅区域、计算资源与 Foundry 模型配额。" />
      <Card className="mb-4">
        <div className="flex gap-3 items-end flex-wrap">
          <Field label="Azure 账号" className="min-w-[220px] flex-1">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.alias}</option>)}
            </Select>
          </Field>
          <Field label="区域" className="w-64">
            <Select value={region} onChange={(e) => setRegion(e.target.value)}>
              {REGIONS.map((r) => <option key={r[0]} value={r[0]}>{regionLabel(r)}</option>)}
            </Select>
          </Field>
          <Btn onClick={query} disabled={loading}>{loading ? "查询中..." : "查询配额"}</Btn>
        </div>
      </Card>

      <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-4 mb-4 space-y-1.5">
        {INFO.map((t, i) => <p key={i} className="text-[13px] text-blue-900/80">{t}</p>)}
      </div>

      {err && <p className="text-[13px] text-red-600 mb-4">{err}</p>}
      {loading && <Card><Loading text="查询配额中..." /></Card>}

      {data && !loading && (
        <div className="space-y-4">
          <Card title="计算 / VM 配额" sub="当前订阅在所选区域的 vCPU、机型系列和其他 Microsoft.Compute 使用量与上限。"
            extra={<>
              <Check label="显示零额度项目" checked={showZero} onChange={(e) => setShowZero(e.target.checked)} />
              <Input placeholder="搜索配额或模型" className="!w-44" value={q} onChange={(e) => setQ(e.target.value)} />
              <Badge color="blue">配额行: {vmRows.length}</Badge>
            </>}>
            <QuotaTable rows={vmRows} showZero={showZero} />
          </Card>

          <Card title="Azure OpenAI 配额层级" sub="订阅级 Free Tier 或 Tier 1–6，由 Azure 根据用量与付款历史分配；这不是部署类型或资源 SKU Tier。">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-[13px]">
              <div><span className="text-slate-400">当前 Tier：</span><span className="font-medium text-slate-900">{tier}</span></div>
              <div><span className="text-slate-400">分配时间：</span><span className="text-slate-500">—</span></div>
              <div><span className="text-slate-400">升级策略：</span><span className="font-medium text-slate-900">OnceUpgradeIsAvailable</span></div>
              <div><span className="text-slate-400">下一 Tier：</span><span className="text-slate-500">—</span></div>
              <div><span className="text-slate-400">升级可用状态：</span><span className="text-slate-500">—</span></div>
              <div><span className="text-slate-400">可升级时间：</span><span className="text-slate-500">—</span></div>
            </div>
          </Card>

          <Card title="Foundry 区域模型配额" sub="当前订阅在所选区域的模型、部署类型和 TPM/PTU 配额行。">
            <EmptyState icon="🤖" text="没有匹配的配额数据" />
          </Card>

          <Card title="Foundry 账号配额" sub="选择一个 Foundry/AI Services 账号，查看 Azure 在账号作用域返回的用量和限制；该结果同样不代表项目独占额度。">
            <Field label="Foundry 账号" className="max-w-xs mb-3">
              <Select value={foundryId} onChange={(e) => setFoundryId(e.target.value)}>
                <option value="">选择 Foundry 账号</option>
                {foundryResources.map((r, i) => <option key={i} value={r.name}>{r.name}</option>)}
              </Select>
            </Field>
            {!foundryId
              ? <p className="text-[13px] text-slate-400">选择账号后读取账号作用域配额。</p>
              : <EmptyState icon="🤖" text="没有匹配的配额数据" />}
          </Card>
        </div>
      )}
    </>
  );
}
