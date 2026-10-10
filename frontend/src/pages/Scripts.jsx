import { useEffect, useState } from "react";
import { api } from "../api.js";
import {
  Btn, Card, Confirm, EmptyState, Field, Input, Loading,
  Modal, PageHead, Table, Td, Textarea, useToast,
} from "../ui.jsx";

function ScriptModal({ init, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({
    name: init?.name || "",
    os_type: init?.os_type || "linux",
    content: init?.content || "#cloud-config",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    setErr("");
    if (!f.name.trim()) return setErr("请填写名称");
    if (!f.content.trim()) return setErr("请填写脚本正文");
    setBusy(true);
    try {
      const body = { name: f.name.trim(), content: f.content, os_type: f.os_type };
      if (init) await api.put(`/scripts/${init.id}`, body);
      else await api.post("/scripts", body);
      toast(init ? "模板已更新" : "模板已保存");
      onSaved();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal title={init ? "编辑模板" : "新建模板"} onClose={onClose} wide>
      <p className="text-[13px] text-slate-500 -mt-1 mb-3">Linux 使用 Shell/cloud-init，Windows 使用 PowerShell。</p>
      <div className="space-y-3">
        <Field label="名称">
          <Input value={f.name} placeholder="如 ubuntu-docker" onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="系统">
          <div className="flex gap-4 pt-1">
            <label className="flex items-center gap-2 text-[13px] text-slate-700 cursor-pointer">
              <input type="radio" name="os_type" checked={f.os_type === "linux"}
                onChange={() => setF({ ...f, os_type: "linux" })} className="accent-blue-600" />
              Linux / Shell
            </label>
            <label className="flex items-center gap-2 text-[13px] text-slate-700 cursor-pointer">
              <input type="radio" name="os_type" checked={f.os_type === "windows"}
                onChange={() => setF({ ...f, os_type: "windows" })} className="accent-blue-600" />
              Windows / PowerShell
            </label>
          </div>
        </Field>
        <Field label="脚本正文">
          <Textarea rows={12} value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })}
            className="font-mono text-[12px]" />
        </Field>
        {err && <p className="text-[13px] text-red-600">{err}</p>}
        <div className="flex justify-end gap-2">
          <Btn variant="secondary" onClick={onClose}>取消</Btn>
          <Btn disabled={busy} onClick={save}>{busy ? "保存中..." : "保存模板"}</Btn>
        </div>
      </div>
    </Modal>
  );
}

const osLabel = (t) => (t === "windows" ? "Windows" : "Linux");

export default function Scripts() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [del, setDel] = useState(null);

  const load = async () => {
    setLoading(true);
    try { setItems(await api.get("/scripts")); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const doDelete = async () => {
    try {
      await api.del(`/scripts/${del.id}`);
      toast("已删除");
      load();
    } catch (e) { toast("删除失败：" + e.message); }
    setDel(null);
  };

  return (
    <>
      <PageHead crumb="初始化脚本" sub="维护 Linux cloud-init 和 Windows PowerShell 模板。" />
      <div className="flex justify-end mb-4">
        <Btn variant="dark" onClick={() => setModal({})}>+ 新建模板</Btn>
      </div>
      <Card title="脚本模板" sub="创建虚拟机时可选择模板或提交一次性脚本。">
        {loading ? <Loading /> : items.length === 0 ? (
          <EmptyState text="暂无脚本模板" />
        ) : (
          <Table cols={["名称", "系统", "更新时间", "操作"]}>
            {items.map((s) => (
              <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                <Td className="font-medium text-slate-900">{s.name}</Td>
                <Td className="text-slate-500">{osLabel(s.os_type)}</Td>
                <Td className="text-slate-500">{s.updated_at}</Td>
                <Td>
                  <div className="flex gap-1">
                    <button title="编辑" onClick={() => setModal({ init: s })}
                      className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50">
                      <svg className="w-[16px] h-[16px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                      </svg>
                    </button>
                    <button title="删除" onClick={() => setDel(s)}
                      className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50">
                      <svg className="w-[16px] h-[16px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {modal && <ScriptModal init={modal.init} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
      {del && <Confirm title="删除模板" danger okLabel="删除" text={`确定删除模板「${del.name}」吗？`} onCancel={() => setDel(null)} onOk={doDelete} />}
    </>
  );
}
