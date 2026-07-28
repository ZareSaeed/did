const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("did", {
  loadData: () => ipcRenderer.invoke("load-data"),
  saveData: (data) => ipcRenderer.invoke("save-data", data),
  openCsv: () => ipcRenderer.invoke("open-csv"),
});
