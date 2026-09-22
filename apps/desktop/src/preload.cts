import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("pm", {
  runtimeStatus: () => ipcRenderer.invoke("runtime-status")
});
