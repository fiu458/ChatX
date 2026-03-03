const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("chatxApi", {
  getConfig: () => ipcRenderer.invoke("chatx:get-config"),
});