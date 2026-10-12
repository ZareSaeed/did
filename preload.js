const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("did", {
  loadData: () => ipcRenderer.invoke("load-data"),
  saveData: (data, reason) => ipcRenderer.invoke("save-data", data, reason),
  saveDataSync: (data, reason) => ipcRenderer.sendSync("save-data-sync", data, reason),
  openCsv: () => ipcRenderer.invoke("open-csv"),
  getAppInfo: () => ipcRenderer.invoke("get-app-info"),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
});
