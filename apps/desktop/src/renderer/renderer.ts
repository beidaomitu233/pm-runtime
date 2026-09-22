declare global { interface Window { pm: { runtimeStatus: () => Promise<Record<string, unknown>> } } }

const status = document.querySelector<HTMLSpanElement>("#status");
const frame = document.querySelector<HTMLIFrameElement>("#canvas");
const diagram = { title: "中文门禁流程", nodes: [{ id: "start", label: "开始", x: 40, y: 50 }, { id: "task", label: "编辑中文节点", x: 260, y: 50 }, { id: "end", label: "结束", x: 520, y: 50 }], edges: [["start", "task"], ["task", "end"]] };

window.addEventListener("message", (event) => {
  if (event.source !== frame?.contentWindow || event.origin !== "null") return;
  if (event.data?.type === "drawio.ready") frame?.contentWindow?.postMessage({ type: "drawio.load", data: diagram }, "*");
  if (event.data?.type === "drawio.saved") status && (status.textContent = "Runtime 就绪 · 画布已保存");
});

void window.pm.runtimeStatus().then((value) => { if (status) status.textContent = value.status === "ready" ? "Runtime 就绪" : `Runtime 状态：${String(value.status)}`; }).catch((error) => { if (status) status.textContent = `Runtime 不可用：${String(error)}`; });
