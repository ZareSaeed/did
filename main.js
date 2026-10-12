const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { createStorage } = require("./storage");

const CSV_FILE = path.join(app.getPath("userData"), "did-log.csv");
const storage = createStorage(app.getPath("userData"));

// Chromium's shader cache is noisy on Windows and unnecessary for this app.
app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");

const defaultData = {
  projects: ["General"],
  projectColors: { General: "#2ee6a6" },
  projectDescriptions: { General: "" },
  selectedProject: "General",
  records: [],
  sessionSeconds: 0,
  sessionStartedAt: null,
  isRunning: false,
  lastTick: null,
  lastHeartbeat: null,
  sessionSegments: [],
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
    "interrupted",
    "pauseSeconds",
    "segments",
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
        record.interrupted ? "yes" : "",
        Math.max(
          0,
          Math.floor((new Date(record.endedAt).getTime() - new Date(record.startedAt).getTime()) / 1000) -
            Math.floor(record.seconds || 0)
        ),
        record.segments ? JSON.stringify(record.segments) : "",
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  return lines.join("\n") + "\n";
}

function writeCsv(records) {
  fs.mkdirSync(path.dirname(CSV_FILE), { recursive: true });
  const tempFile = `${CSV_FILE}.${process.pid}.tmp`;
  const fd = fs.openSync(tempFile, "w", 0o600);
  try {
    fs.writeFileSync(fd, recordsToCsv(records), "utf8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  if (fs.existsSync(CSV_FILE)) fs.unlinkSync(CSV_FILE);
  fs.renameSync(tempFile, CSV_FILE);
}

function loadData() {
  const result = storage.load();
  return {
    ...result,
    data: result.data ? { ...defaultData, ...result.data } : { ...defaultData },
  };
}

function saveData(data, reason) {
  return storage.save(data, reason);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 440,
    height: 660,
    minWidth: 400,
    minHeight: 620,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    title: "did",
    icon: path.join(__dirname, "assets", process.platform === "win32" ? "did-icon.ico" : "did-icon.png"),
    backgroundColor: "#0b1224",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setMenuBarVisibility(false);
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    const closeShortcut =
      input.key.toLowerCase() === "w" &&
      (input.control || input.meta) &&
      !input.alt &&
      !input.shift;
    if (!closeShortcut) return;
    event.preventDefault();
    win.close();
  });
  win.loadFile("index.html");
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

const REPO_URL = "https://github.com/ZareSaeed/did";

ipcMain.handle("load-data", (event) => {
  try {
    const result = loadData();
    if (result.recovered) {
      const win = BrowserWindow.fromWebContents(event.sender);
      setImmediate(() => {
        dialog.showMessageBox(win, {
          type: "warning",
          title: "Data recovered",
          message: "did recovered your data from a last-known-good copy.",
          detail:
            "The main data file was missing or damaged. The recovered records are loaded, and the damaged file will be preserved in the corrupt folder.",
        });
      });
    }
    return { ok: true, ...result };
  } catch (error) {
    const win = BrowserWindow.fromWebContents(event.sender);
    setImmediate(() => {
      dialog.showMessageBox(win, {
        type: "error",
        title: "Data could not be loaded",
        message: "did found damaged data and could not find a valid backup.",
        detail:
          "Saving has been disabled so the damaged files are not overwritten. Copy the did data folder before attempting manual recovery.",
      });
    });
    return { ok: false, error: error.message };
  }
});
ipcMain.handle("save-data", (_event, data, reason) => {
  return saveData(data, reason);
});
ipcMain.on("save-data-sync", (event, data, reason) => {
  try {
    event.returnValue = saveData(data, reason);
  } catch (error) {
    event.returnValue = { ok: false, error: error.message };
  }
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
  const result = loadData();
  writeCsv(result.data.records || []);
  const error = await shell.openPath(CSV_FILE);
  if (error) {
    shell.showItemInFolder(CSV_FILE);
    return { ok: false, error };
  }
  return { ok: true, path: CSV_FILE };
});
