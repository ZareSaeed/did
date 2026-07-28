const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("did", {
  loadData: () => ipcRenderer.invoke("load-data"),
  saveData: (data) => ipcRenderer.invoke("save-data", data),
  openCsv: () => ipcRenderer.invoke("open-csv"),
  getAppInfo: () => ipcRenderer.invoke("get-app-info"),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
});
