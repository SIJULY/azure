import { useEffect, useMemo, useState } from "react";
import { apiRaw } from "../api.js";
import { Badge, Btn, Card, Input, Loading, PageHead, useToast } from "../ui.jsx";

const GROUPS = [
  "认证与 Token", "Azure 账号", "费用", "Foundry", "配额",
  "资源组", "虚拟机", "防火墙", "任务", "文档下载", "平台", "代理", "脚本", "共享",
];

// 后端 tag → 展示分组的映射（不改后端，前端对齐 AzureIn 的分组名）
const TAG_MAP = {
  "认证": "认证与 Token",
  "API 访问": "认证与 Token",
  "Azure 账号": "Azure 账号",
  "账单费用": "费用",
  "Foundry": "Foundry",
  "资源配额": "配额",
  "资源组": "资源组",
  "虚拟机": "虚拟机",
  "防火墙": "防火墙",
  "任务中心": "任务",
  "代理": "代理",
  "初始化脚本": "脚本",
  "总览": "平台",
};

const METHOD_STYLE = {
  GET: "bg-green-100 text-green-700",
  POST: "bg-blue-100 text-blue-700",
  PUT: "bg-yellow-100 text-yellow-700",
  DELETE: "bg-red-100 text-red-700",
  PATCH: "bg-orange-100 text-orange-700",
};

function genCurl(path, method, op) {
  const params = op.parameters || [];
  let url = `{{baseUrl}}${path}`;
  params.filter((p) => p.in === "path").forEach((p) => {
    url = url.replace(`{${p.name}}`, `<${p.name}>`);
  });
  const qs = params.filter((p) => p.in === "query" && p.required);
  const lines = [`curl -X ${method} '${url}'`, `  -H "Authorization: Bearer $AZUREPANEL_TOKEN"`];
  if (qs.length) lines.push(`  # 必填查询参数: ${qs.map((p) => p.name).join(", ")}`);
  const body = op.requestBody;
  if (body) lines.push(`  -H "Content-Type: application/json"`, `  -d '<请求体 JSON>'`);
  return lines.join(" \\\n");
}

function genPython(path, method, op) {
  const params = op.parameters || [];
  let url = `f"{BASE}{path}"`;
  params.filter((p) => p.in === "path").forEach((p) => {
    url = url.replace(`{${p.name}}`, `{${p.name.toUpperCase()}}`);
  });
  const lines = [
    "import requests",
    "",
    'BASE = "https://azure.sijuly.uk/api/v1"',
    'HEADERS = {"Authorization": "Bearer $AZUREPANEL_TOKEN"}',
    "",
    `r = requests.${method.toLowerCase()}(${url}, headers=HEADERS)`,
    "print(r.status_code)",
    "print(r.json())",
  ];
  return lines.join("\n");
}

function genJS(path, method, op) {
  const params = op.parameters || [];
  let url = `https://azure.sijuly.uk/api/v1${path}`;
  params.filter((p) => p.in === "path").forEach((p) => {
    url = url.replace(`{${p.name}}`, `<${p.name}>`);
  });
  const lines = [
    `const r = await fetch("${url}", {`,
    `  method: "${method}",`,
    `  headers: { "Authorization": "Bearer $AZUREPANEL_TOKEN" },`,
    "});",
    "const data = await r.json();",
    "console.log(data);",
  ];
  return lines.join("\n");
}

function ParamTable({ params }) {
  if (!params || params.length === 0) return <p className="text-[13px] text-slate-400 py-2">无</p>;
  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr className="text-left text-slate-400 border-b border-slate-100">
          <th className="py-2 pr-3 font-medium">名称</th>
          <th className="py-2 pr-3 font-medium">必填</th>
          <th className="py-2 pr-3 font-medium">类型</th>
          <th className="py-2 font-medium">说明</th>
        </tr>
      </thead>
      <tbody>
        {params.map((p, i) => (
          <tr key={i} className="border-b border-slate-50">
            <td className="py-2 pr-3 font-mono text-[12px] text-slate-900">{p.name}</td>
            <td className="py-2 pr-3">{p.required ? <span className="text-red-500">是</span> : <span className="text-slate-400">否</span>}</td>
            <td className="py-2 pr-3 text-slate-500">{p.schema?.type || "-"}</td>
            <td className="py-2 text-slate-500">{p.description || "-"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function OpDetail({ path, method, op }) {
  const [paramTab, setParamTab] = useState("query");
  const [codeTab, setCodeTab] = useState("curl");

  const params = op.parameters || [];
  const pathParams = params.filter((p) => p.in === "path");
  const queryParams = params.filter((p) => p.in === "query");
  const headerParams = params.filter((p) => p.in === "header");
  const hasBody = !!op.requestBody;

  const tabs = [];
  if (pathParams.length) tabs.push(["path", "路径参数"]);
  if (queryParams.length) tabs.push(["query", "查询参数"]);
  if (headerParams.length) tabs.push(["header", "请求头"]);
  if (hasBody) tabs.push(["body", "请求体"]);
  const activeTab = tabs.find(([k]) => k === paramTab)?.[0] || tabs[0]?.[0];

  const codes = { curl: genCurl(path, method, op), python: genPython(path, method, op), js: genJS(path, method, op) };
  const responses = op.responses ? Object.keys(op.responses) : [];

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <span className={`text-[12px] font-bold px-2.5 py-1 rounded-md ${METHOD_STYLE[method] || "bg-slate-100 text-slate-600"}`}>
          {method}
        </span>
        <code className="text-[14px] font-mono text-slate-900 break-all">{path}</code>
      </div>
      {op.summary && <h3 className="text-[16px] font-semibold text-slate-900 mb-1">{op.summary}</h3>}
      {op.description && <p className="text-[13px] text-slate-500 mb-5">{op.description}</p>}

      <div className="mb-5">
        <div className="text-[13px] font-medium text-slate-700 mb-2">参数</div>
        {tabs.length === 0 ? (
          <p className="text-[13px] text-slate-400">无参数</p>
        ) : (
          <>
            <div className="flex gap-1 mb-2">
              {tabs.map(([k, label]) => (
                <button key={k} onClick={() => setParamTab(k)}
                  className={`text-[12px] px-3 py-1.5 rounded-lg ${activeTab === k ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}>
                  {label}
                </button>
              ))}
            </div>
            {activeTab === "path" && <ParamTable params={pathParams} />}
            {activeTab === "query" && <ParamTable params={queryParams} />}
            {activeTab === "header" && <ParamTable params={headerParams} />}
            {activeTab === "body" && (
              <pre className="text-[12px] font-mono bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-x-auto text-slate-700">
                {JSON.stringify(op.requestBody?.content?.["application/json"]?.schema || op.requestBody, null, 2)}
              </pre>
            )}
          </>
        )}
      </div>

      <div className="mb-5">
        <div className="text-[13px] font-medium text-slate-700 mb-2">代码示例</div>
        <div className="flex gap-1 mb-2">
          {[["curl", "cURL"], ["python", "Python"], ["js", "JavaScript"]].map(([k, label]) => (
            <button key={k} onClick={() => setCodeTab(k)}
              className={`text-[12px] px-3 py-1.5 rounded-lg ${codeTab === k ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}>
              {label}
            </button>
          ))}
        </div>
        <pre className="text-[12px] font-mono bg-slate-900 text-slate-100 rounded-lg p-4 overflow-x-auto whitespace-pre">
          {codes[codeTab]}
        </pre>
      </div>

      {responses.length > 0 && (
        <div>
          <div className="text-[13px] font-medium text-slate-700 mb-2">响应码</div>
          <div className="flex gap-1.5 flex-wrap">
            {responses.map((c) => (
              <span key={c} className={`text-[12px] font-mono px-2 py-1 rounded-md ${
                c.startsWith("2") ? "bg-green-50 text-green-700" :
                c.startsWith("4") ? "bg-amber-50 text-amber-700" :
                c.startsWith("5") ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"
              }`}>{c}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Docs() {
  const toast = useToast();
  const [spec, setSpec] = useState(null);
  const [q, setQ] = useState("");
  const [selGroup, setSelGroup] = useState(GROUPS[0]);
  const [selOp, setSelOp] = useState(null);

  useEffect(() => {
    apiRaw("/openapi.json").then((r) => r.json()).then(setSpec).catch(() => {});
  }, []);

  const opsByTag = useMemo(() => {
    if (!spec?.paths) return {};
    const map = {};
    Object.entries(spec.paths).forEach(([path, ops]) => {
      Object.entries(ops).forEach(([method, op]) => {
        const m = method.toUpperCase();
        if (!["GET", "POST", "PUT", "DELETE", "PATCH"].includes(m)) return;
        (op.tags || ["未分组"]).forEach((t) => {
          const g = TAG_MAP[t] || t;
          if (!map[g]) map[g] = [];
          map[g].push({ path, method: m, op });
        });
      });
    });
    return map;
  }, [spec]);

  const filtered = useMemo(() => {
    const list = opsByTag[selGroup] || [];
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter((p) =>
      p.path.toLowerCase().includes(s) ||
      (p.op.summary || "").toLowerCase().includes(s) ||
      (p.op.description || "").toLowerCase().includes(s));
  }, [opsByTag, selGroup, q]);

  const downloadJSON = () => {
    const a = document.createElement("a");
    a.href = "/api/v1/openapi.json";
    a.download = "openapi.json";
    a.click();
  };

  const downloadPostman = () => {
    if (!spec) return toast("OpenAPI 数据尚未加载");
    const all = Object.values(opsByTag).flat();
    const collection = {
      info: { name: "Azure面板 API", schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
      item: GROUPS.filter((g) => g !== "共享" && g !== "文档下载" && opsByTag[g]).map((g) => ({
        name: g,
        item: opsByTag[g].map((p) => ({
          name: `${p.method} ${p.path}`,
          request: {
            method: p.method,
            url: `{{baseUrl}}${p.path}`,
            header: [{ key: "Authorization", value: "Bearer {{token}}" }],
          },
        })),
      })),
      variable: [
        { key: "baseUrl", value: `${window.location.origin}/api/v1` },
        { key: "token", value: "" },
      ],
    };
    const blob = new Blob([JSON.stringify(collection, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "azure-panel.postman_collection.json";
    a.click();
  };

  return (
    <>
      <PageHead crumb="API 文档" sub="当前角色可访问的接口，参数与调用示例。" />

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Badge color="blue">OpenAPI 3.2.0</Badge>
        <div className="flex-1" />
        <Btn variant="dark" onClick={downloadJSON}>下载 OpenAPI JSON</Btn>
        <Btn variant="dark" onClick={downloadPostman}>下载 Postman Collection</Btn>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-3.5 mb-4">
        <p className="text-[13px] text-blue-900/80">
          使用 Bearer Token 获取 OpenAPI JSON，可以交给 AI 了解接口。JSON 按你的角色过滤，示例不包含真实凭据。
          <a href="/jobs" className="text-blue-600 hover:text-blue-700 ml-2">异步任务调用流程 →</a>
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
        <Card className="!px-0">
          <div className="px-4 pb-2">
            <Input placeholder="搜索接口名称、路径或说明…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="max-h-[560px] overflow-y-auto px-2 pb-2">
            {GROUPS.map((g) => (
              <button key={g} onClick={() => { setSelGroup(g); setSelOp(null); }}
                className={`w-full text-left text-[13px] px-3 py-2 rounded-lg mb-0.5 ${selGroup === g ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-600 hover:bg-slate-50"}`}>
                {g}
              </button>
            ))}
          </div>
        </Card>

        <Card className="!p-0 overflow-hidden min-h-[480px]">
          {selGroup === "文档下载" ? (
            <div className="p-6 space-y-3">
              <h3 className="text-[15px] font-semibold text-slate-900">文档下载</h3>
              <p className="text-[13px] text-slate-500">下载接口定义文档，用于导入到 API 调试工具或交给 AI 理解接口。</p>
              <div className="flex gap-2 flex-wrap pt-1">
                <Btn variant="dark" onClick={downloadJSON}>下载 OpenAPI JSON</Btn>
                <Btn variant="secondary" onClick={downloadPostman}>下载 Postman Collection</Btn>
              </div>
            </div>
          ) : selGroup === "共享" ? (
            <div className="p-6"><p className="text-[13px] text-slate-400">该分组暂无接口</p></div>
          ) : !spec ? <Loading text="加载接口文档..." /> : selOp ? (
            <OpDetail path={selOp.path} method={selOp.method} op={selOp.op} />
          ) : (
            <div className="divide-y divide-slate-50">
              {filtered.length === 0 && <p className="p-6 text-[13px] text-slate-400">该分组暂无接口</p>}
              {filtered.map((p, i) => (
                <button key={i} onClick={() => setSelOp(p)}
                  className="w-full text-left px-6 py-3 hover:bg-slate-50 flex items-center gap-3">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${METHOD_STYLE[p.method] || "bg-slate-100 text-slate-600"}`}>
                    {p.method}
                  </span>
                  <span className="font-mono text-[13px] text-slate-700">{p.path}</span>
                  <span className="text-[12px] text-slate-400 truncate ml-auto">{p.op.summary || ""}</span>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
