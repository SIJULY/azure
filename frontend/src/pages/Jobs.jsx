import { useEffect, useState } from "react";
import { api } from "../api.js";
import {
  Badge, Btn, Card, EmptyState, Loading,
  PageHead, Table, Td, useToast,
} from "../ui.jsx";

function JobStatus({ status }) {
  const map = {
    success: ["green", "已完成", true],
    running: ["blue", "进行中", false],
    pending: ["blue", "进行中", false],
    failed: ["red", "失败", false],
    pending_confirm: ["yellow", "待确认", false],
  };
  const [color, text, check] = map[status] || ["gray", status || "-", false];
  return (
    <Badge color={color}>
      <span className="inline-flex items-center gap-1">
        {check && (
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        )}
        {text}
      </span>
    </Badge>
  );
}

export default function Jobs() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [onlyPending, setOnlyPending] = useState(false);

  const load = async () => {
    try {
      const d = await api.get("/jobs?limit=50");
      setItems(d || []);
    } catch (e) { toast("加载失败：" + e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  const list = onlyPending
    ? items.filter((j) => j.status === "pending_confirm" || j.status === "failed")
    : items;

  const opLabel = (j) => j.title || j.type || "-";

  return (
    <>
      <PageHead crumb="任务中心" sub="跟踪 Azure 长操作、重试和待确认任务。" />
      <Card title="任务" sub="页面每 5 秒刷新，可在此跟踪 Azure 操作进度和处理结果。"
        extra={<>
          <button onClick={() => setOnlyPending((v) => !v)}
            className="inline-flex items-center gap-2 text-xs text-slate-600 hover:text-slate-800">
            <span className={`relative inline-flex w-9 h-5 rounded-full transition ${onlyPending ? "bg-blue-600" : "bg-slate-300"}`}>
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${onlyPending ? "left-[18px]" : "left-0.5"}`} />
            </span>
            只看待核查
          </button>
          <Btn variant="secondary" onClick={load}>刷新</Btn>
        </>}>
        {loading ? <Loading /> : list.length === 0 ? (
          <EmptyState text="暂无任务" />
        ) : (
          <Table cols={["开始时间", "操作", "ID", "状态", "尝试次数", "更新时间", "操作"]}>
            {list.map((j) => (
              <tr key={j.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                <Td className="text-slate-500 whitespace-nowrap">{j.created_at}</Td>
                <Td className="font-medium text-slate-900">{opLabel(j)}</Td>
                <Td className="font-mono text-[12px] text-slate-400">{(j.id || "").slice(0, 8)}</Td>
                <Td><JobStatus status={j.status} /></Td>
                <Td>{j.attempts ?? 1}</Td>
                <Td className="text-slate-500 whitespace-nowrap">{j.updated_at || "—"}</Td>
                <Td>
                  {j.status === "pending_confirm" ? (
                    <div className="flex gap-1.5 whitespace-nowrap">
                      <Btn variant="ghost" onClick={() => toast("确认功能开发中")}>确认</Btn>
                      <Btn variant="ghost" onClick={() => toast("重试功能开发中")}>重试</Btn>
                    </div>
                  ) : j.status === "failed" ? (
                    <Btn variant="ghost" onClick={() => toast("重试功能开发中")}>重试</Btn>
                  ) : null}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
