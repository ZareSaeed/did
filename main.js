const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");

const DATA_FILE = path.join(app.getPath("userData"), "did-data.json");
const LEGACY_DATA_FILE = path.join(app.getPath("userData"), "work-timer-data.json");
const CSV_FILE = path.join(app.getPath("userData"), "did-log.csv");

const defaultData = {
  projects: ["General"],
  projectColors: { General: "#2ee6a6" },
  selectedProject: "General",
  records: [],
  sessionSeconds: 0,
  sessionStartedAt: null,
  isRunning: false,
  lastTick: null,
};

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, "0")).join(":");
}

function recordsToCsv(records) {
  const header = [
    "id",
    "project",
    "startedAt",
    "endedAt",
    "seconds",
    "duration",
    "description",
  ];
  const sorted = [...(records || [])].sort(
    (a, b) => new Date(a.endedAt).getTime() - new Date(b.endedAt).getTime()
  );
  const lines = [header.join(",")];
  for (const record of sorted) {
    lines.push(
      [
        record.id,
        record.project,
        record.startedAt,
        record.endedAt,
        record.seconds,
        formatDuration(record.seconds),
        record.description || "",
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  return lines.join("\n") + "\n";
}

function writeCsv(records) {
  fs.mkdirSync(path.dirname(CSV_FILE), { recursive: true });
  fs.writeFileSync(CSV_FILE, recordsToCsv(records), "utf8");
}

function loadData() {
  try {
    const file = fs.existsSync(DATA_FILE)
      ? DATA_FILE
      : fs.existsSync(LEGACY_DATA_FILE)
        ? LEGACY_DATA_FILE
        : null;
    if (file) {
      return { ...defaultData, ...JSON.parse(fs.readFileSync(file, "utf8")) };
    }
  } catch (_) {}
  return { ...defaultData };
}

function saveData(data) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  writeCsv(data.records || []);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 420,
    height: 640,
    minWidth: 360,
    minHeight: 560,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    title: "did",
    backgroundColor: "#0b1224",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setMenuBarVisibility(false);
  win.loadFile("index.html");
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

const REPO_URL = "https://github.com/ZareSaeed/did";

ipcMain.handle("load-data", () => loadData());
ipcMain.handle("save-data", (_event, data) => {
  saveData(data);
  return true;
});
ipcMain.handle("get-app-info", () => ({
  version: app.getVersion(),
  repoUrl: REPO_URL,
}));
ipcMain.handle("open-external", async (_event, url) => {
  if (typeof url !== "string" || !url.startsWith("https://")) {
    return { ok: false, error: "Invalid URL" };
  }
  await shell.openExternal(url);
  return { ok: true };
});
ipcMain.handle("open-csv", async () => {
  const data = loadData();
  writeCsv(data.records || []);
  const error = await shell.openPath(CSV_FILE);
  if (error) {
    shell.showItemInFolder(CSV_FILE);
    return { ok: false, error };
  }
  return { ok: true, path: CSV_FILE };
});
