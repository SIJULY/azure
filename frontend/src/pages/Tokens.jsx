import { useEffect, useState } from "react";
import { api } from "../api.js";
import {
  Btn, Card, Confirm, EmptyState, Loading,
  PageHead, Table, Td, useToast,
} from "../ui.jsx";

export default function Tokens() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [del, setDel] = useState(null);
  const [newToken, setNewToken] = useState(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const origin = window.location.origin;

  const load = async () => {
    setLoading(true);
    try { setItems(await api.get("/tokens")); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const gen = async () => {
    setBusy(true);
    try {
      const name = "API Token " + new Date().toLocaleString("zh-CN", { hour12: false });
      const r = await api.post("/tokens", { name });
      setNewToken(r.token);
      setCopied(false);
      load();
    } catch (e) { toast("生成失败：" + e.message); }
    finally { setBusy(false); }
  };

  const copyText = async (text, done) => {
    try {
      await navigator.clipboard.writeText(text);
      done?.();
    } catch { toast("复制失败，请手动复制"); }
  };

  const doDelete = async () => {
    try {
      await api.del(`/tokens/${del.id}`);
      toast("Token 已撤销");
      load();
    } catch (e) { toast("撤销失败：" + e.message); }
    setDel(null);
  };

  return (
    <>
      <PageHead crumb="API 访问" sub="管理个人访问令牌并连接自动化工具。" />

      <Card title="API 地址"
        sub="使用 Bearer Token 获取 OpenAPI JSON，可以交给 AI 了解接口。JSON 按你的角色过滤，示例不包含真实凭据。"
        className="mb-4">
        <code className="block text-[13px] font-mono bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-slate-700 mb-3">
          {origin}/api/v1
        </code>
        <pre className="text-[12px] font-mono bg-slate-900 text-slate-100 rounded-lg px-4 py-3 overflow-x-auto whitespace-pre">
{`curl '${origin}/api/v1/openapi.json' \\
  -H "Authorization: Bearer $AZUREPANEL_TOKEN"`}
        </pre>
        <a href="/api-docs" className="inline-block mt-3 text-[13px] text-blue-600 hover:text-blue-700">查看接口文档 →</a>
      </Card>

      <Card title="个人 API Token"
        sub="Token 拥有你当前的全部权限，长期有效。重置或撤销后，使用旧 Token 的脚本将停止访问。"
        extra={<Btn variant="dark" disabled={busy} onClick={gen}>{busy ? "生成中..." : "生成 Token"}</Btn>}>

        {newToken && (
          <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-[13px] text-amber-800 font-medium mb-2">Token 已生成，仅显示一次，请立即复制保存：</p>
            <div className="flex gap-2">
              <code className="flex-1 text-[12px] font-mono bg-white border border-amber-200 rounded-lg px-3 py-2.5 break-all text-slate-800">{newToken}</code>
              <Btn variant="secondary" onClick={() => copyText(newToken, () => setCopied(true))}>
                {copied ? "已复制" : "复制"}
              </Btn>
            </div>
          </div>
        )}

        {loading ? <Loading /> : items.length === 0 ? (
          <EmptyState text="尚未生成 Token" />
        ) : (
          <Table cols={["Token", "创建时间", "操作"]}>
            {items.map((t) => (
              <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                <Td>
                  <code className="text-[12px] font-mono bg-slate-50 px-2 py-1 rounded text-slate-600">
                    {t.prefix}••••••••
                  </code>
                  <span className="ml-2 text-[12px] text-slate-400">{t.name}</span>
                </Td>
                <Td className="text-slate-500 whitespace-nowrap">{t.created_at}</Td>
                <Td>
                  <div className="flex gap-1.5 whitespace-nowrap">
                    <Btn variant="ghost" onClick={() => {
                      if (newToken && t.prefix === newToken.slice(0, 8)) copyText(newToken, () => toast("已复制"));
                      else toast("Token 明文仅在生成时显示一次");
                    }}>复制</Btn>
                    <Btn variant="ghost" className="!text-red-600" onClick={() => setDel(t)}>撤销</Btn>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {del && <Confirm title="撤销 Token" danger okLabel="撤销"
        text={`确定撤销 Token「${del.name}」吗？使用该 Token 的脚本将停止访问。`}
        onCancel={() => setDel(null)} onOk={doDelete} />}
    </>
  );
}
