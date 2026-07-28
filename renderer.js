const COLOR_PALETTE = [
  "#2ee6a6",
  "#9b6bff",
  "#3d6cff",
  "#37c6ff",
  "#ff8a5c",
  "#ff6b8a",
  "#f0c040",
  "#7dd87d",
  "#c084fc",
  "#60a5fa",
  "#14b8a6",
  "#f472b6",
];

const timerDisplay = document.getElementById("timerDisplay");
const projectTotal = document.getElementById("projectTotal");
const statusLabel = document.getElementById("statusLabel");
const projectSelect = document.getElementById("projectSelect");
const projectColorDot = document.getElementById("projectColorDot");
const addProjectBtn = document.getElementById("addProjectBtn");
const deleteProjectBtn = document.getElementById("deleteProjectBtn");
const addProjectForm = document.getElementById("addProjectForm");
const newProjectInput = document.getElementById("newProjectInput");
const cancelAddBtn = document.getElementById("cancelAddBtn");
const toggleBtn = document.getElementById("toggleBtn");
const toggleLabel = document.getElementById("toggleLabel");
const resetSessionBtn = document.getElementById("resetSessionBtn");
const timerView = document.getElementById("timerView");
const historyView = document.getElementById("historyView");
const tabTimer = document.getElementById("tabTimer");
const tabHistory = document.getElementById("tabHistory");
const recordsBody = document.getElementById("recordsBody");
const historyCount = document.getElementById("historyCount");
const emptyHistory = document.getElementById("emptyHistory");
const copySelectedBtn = document.getElementById("copySelectedBtn");
const openCsvBtn = document.getElementById("openCsvBtn");
const copyToast = document.getElementById("copyToast");
const confirmModal = document.getElementById("confirmModal");
const confirmTitle = document.getElementById("confirmTitle");
const confirmBody = document.getElementById("confirmBody");
const confirmCancel = document.getElementById("confirmCancel");
const confirmOk = document.getElementById("confirmOk");
const noteModal = document.getElementById("noteModal");
const noteSummary = document.getElementById("noteSummary");
const noteInput = document.getElementById("noteInput");
const noteCancel = document.getElementById("noteCancel");
const noteSave = document.getElementById("noteSave");

let state = {
  projects: ["General"],
  projectColors: { General: COLOR_PALETTE[0] },
  selectedProject: "General",
  records: [],
  sessionSeconds: 0,
  sessionStartedAt: null,
  isRunning: false,
  lastTick: null,
};

let tickInterval = null;
let confirmResolver = null;
let noteResolver = null;
let selectedIds = new Set();
let lastClickedId = null;
let sortedHistoryIds = [];
let toastTimer = null;
let pausePromptOpen = false;
let dragSelecting = false;
let dragAnchorId = null;
let dragMoved = false;
let suppressClick = false;

function formatTime(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, "0")).join(":");
}

function formatWhen(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${date}\n${time}`;
}

function formatDateOnly(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString();
}

function formatTimeOnly(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function persist() {
  if (window.did?.saveData) {
    window.did.saveData(state);
  } else {
    localStorage.setItem("did-data", JSON.stringify(state));
  }
}

function nextProjectColor() {
  const used = new Set(Object.values(state.projectColors || {}));
  const free = COLOR_PALETTE.find((c) => !used.has(c));
  if (free) return free;
  return COLOR_PALETTE[state.projects.length % COLOR_PALETTE.length];
}

function ensureProjectColor(name) {
  if (!state.projectColors) state.projectColors = {};
  if (!state.projectColors[name]) {
    state.projectColors[name] = nextProjectColor();
  }
  return state.projectColors[name];
}

function projectColor(name) {
  return ensureProjectColor(name);
}

function getProjectTotal(project) {
  const committed = state.records
    .filter((r) => r.project === project)
    .reduce((sum, r) => sum + (r.seconds || 0), 0);
  if (state.isRunning && project === state.selectedProject) {
    return committed + state.sessionSeconds;
  }
  return committed;
}

function catchUpRunningTime() {
  if (!state.isRunning || !state.lastTick) return;
  const now = Date.now();
  const elapsed = Math.floor((now - state.lastTick) / 1000);
  if (elapsed <= 0) return;
  state.sessionSeconds += elapsed;
  state.lastTick = now;
}

function buildRecordFromSession(description = "") {
  catchUpRunningTime();
  const seconds = Math.floor(state.sessionSeconds);
  if (seconds <= 0 || !state.sessionStartedAt) {
    state.sessionSeconds = 0;
    state.sessionStartedAt = null;
    state.lastTick = null;
    state.isRunning = false;
    return null;
  }

  const record = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    project: state.selectedProject,
    startedAt: state.sessionStartedAt,
    endedAt: new Date().toISOString(),
    seconds,
    description: String(description || "").trim(),
  };

  state.records.push(record);
  state.sessionSeconds = 0;
  state.sessionStartedAt = null;
  state.lastTick = null;
  state.isRunning = false;
  return record;
}

function commitCurrentSession(description = "") {
  return buildRecordFromSession(description);
}

function setView(view) {
  const isTimer = view === "timer";
  timerView.hidden = !isTimer;
  historyView.hidden = isTimer;
  tabTimer.classList.toggle("is-active", isTimer);
  tabHistory.classList.toggle("is-active", !isTimer);
  if (!isTimer) renderHistory();
}

function renderProjects() {
  projectSelect.innerHTML = "";
  for (const project of state.projects) {
    ensureProjectColor(project);
    const option = document.createElement("option");
    option.value = project;
    option.textContent = project;
    if (project === state.selectedProject) option.selected = true;
    projectSelect.appendChild(option);
  }
  deleteProjectBtn.disabled = state.projects.length <= 1;
}

function updateCopyButton() {
  copySelectedBtn.disabled = selectedIds.size === 0;
  copySelectedBtn.textContent =
    selectedIds.size > 0 ? `Copy (${selectedIds.size})` : "Copy";
}

function renderHistory() {
  const records = [...state.records].sort(
    (a, b) => new Date(b.endedAt).getTime() - new Date(a.endedAt).getTime()
  );
  sortedHistoryIds = records.map((r) => r.id);
  selectedIds = new Set([...selectedIds].filter((id) => sortedHistoryIds.includes(id)));

  historyCount.textContent = `${records.length} record${records.length === 1 ? "" : "s"}`;
  recordsBody.innerHTML = "";
  emptyHistory.hidden = records.length > 0;

  for (const record of records) {
    const color = projectColor(record.project);
    const tr = document.createElement("tr");
    tr.dataset.id = record.id;
    tr.tabIndex = 0;
    if (selectedIds.has(record.id)) tr.classList.add("is-selected");

    const note = record.description ? escapeHtml(record.description) : "—";
    tr.innerHTML = `
      <td class="when-cell">${formatWhen(record.endedAt).replace("\n", "<br>")}</td>
      <td>
        <div class="project-cell">
          <span class="project-swatch" style="background:${color}"></span>
          <span>${escapeHtml(record.project)}</span>
        </div>
      </td>
      <td class="time-cell">${formatTime(record.seconds)}</td>
      <td class="note-cell" title="${escapeHtml(record.description || "")}">${note}</td>
      <td class="actions-cell">
        <button type="button" class="row-delete" data-delete-id="${escapeHtml(record.id)}" title="Delete record" aria-label="Delete record">×</button>
      </td>
    `;
    recordsBody.appendChild(tr);
  }

  updateCopyButton();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function render() {
  const color = projectColor(state.selectedProject);
  document.documentElement.style.setProperty("--project-color", color);
  projectColorDot.style.background = color;

  timerDisplay.textContent = formatTime(state.sessionSeconds);
  projectTotal.textContent = `Total · ${formatTime(getProjectTotal(state.selectedProject))}`;

  if (state.isRunning) {
    statusLabel.textContent = "Tracking";
    statusLabel.classList.add("running");
    toggleBtn.classList.add("is-running");
    toggleBtn.setAttribute("aria-pressed", "true");
    toggleLabel.textContent = "Pause";
  } else {
    statusLabel.textContent = pausePromptOpen
      ? "Saving"
      : state.sessionSeconds > 0
        ? "Paused"
        : "Ready";
    statusLabel.classList.remove("running");
    toggleBtn.classList.remove("is-running");
    toggleBtn.setAttribute("aria-pressed", "false");
    toggleLabel.textContent = "Start";
  }

  if (!historyView.hidden) renderHistory();
}

function startTicking() {
  stopTicking();
  tickInterval = setInterval(() => {
    if (!state.isRunning) return;
    const now = Date.now();
    const elapsed = Math.floor((now - state.lastTick) / 1000);
    if (elapsed <= 0) return;
    state.sessionSeconds += elapsed;
    state.lastTick = now;
    render();
    persist();
  }, 250);
}

function stopTicking() {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
}

function askNote({ summary }) {
  noteSummary.textContent = summary;
  noteInput.value = "";
  noteModal.hidden = false;
  pausePromptOpen = true;
  setTimeout(() => noteInput.focus(), 30);
  return new Promise((resolve) => {
    noteResolver = resolve;
  });
}

function closeNote(result) {
  noteModal.hidden = true;
  pausePromptOpen = false;
  if (noteResolver) {
    const resolve = noteResolver;
    noteResolver = null;
    resolve(result);
  }
}

async function pauseWithNote() {
  if (!state.isRunning) return;

  catchUpRunningTime();
  stopTicking();
  state.isRunning = false;
  state.lastTick = null;
  render();
  persist();

  const seconds = Math.floor(state.sessionSeconds);
  if (seconds <= 0 || !state.sessionStartedAt) {
    state.sessionSeconds = 0;
    state.sessionStartedAt = null;
    render();
    persist();
    return;
  }

  const result = await askNote({
    summary: `${state.selectedProject} · ${formatTime(seconds)}`,
  });

  if (result === null) {
    // Keep timing
    state.isRunning = true;
    state.lastTick = Date.now();
    startTicking();
    render();
    persist();
    return;
  }

  commitCurrentSession(result);
  render();
  persist();
}

async function setRunning(running) {
  if (running === state.isRunning) return;
  if (pausePromptOpen) return;

  if (running) {
    if (!state.sessionStartedAt) {
      state.sessionSeconds = 0;
      state.sessionStartedAt = new Date().toISOString();
    }
    state.isRunning = true;
    state.lastTick = Date.now();
    startTicking();
    render();
    persist();
    return;
  }

  await pauseWithNote();
}

async function switchProject(nextProject) {
  if (!nextProject || nextProject === state.selectedProject) return;
  if (pausePromptOpen) return;

  const wasRunning = state.isRunning;
  if (wasRunning || state.sessionStartedAt) {
    stopTicking();
    commitCurrentSession("");
  }
  state.selectedProject = nextProject;
  state.sessionSeconds = 0;
  ensureProjectColor(nextProject);
  render();
  persist();
  if (wasRunning) setRunning(true);
}

function addProject(name) {
  const cleaned = name.trim().replace(/\s+/g, " ");
  if (!cleaned) return false;
  if (pausePromptOpen) return false;

  const existing = state.projects.find((p) => p.toLowerCase() === cleaned.toLowerCase());
  if (existing) {
    switchProject(existing);
    return true;
  }

  if (state.isRunning || state.sessionStartedAt) {
    stopTicking();
    commitCurrentSession("");
  }

  state.projects.push(cleaned);
  state.projectColors[cleaned] = nextProjectColor();
  state.selectedProject = cleaned;
  state.sessionSeconds = 0;
  state.sessionStartedAt = null;
  renderProjects();
  render();
  persist();
  return true;
}

function askConfirm({ title, body, okLabel = "Delete" }) {
  confirmTitle.textContent = title;
  confirmBody.textContent = body;
  confirmOk.textContent = okLabel;
  confirmModal.hidden = false;
  return new Promise((resolve) => {
    confirmResolver = resolve;
  });
}

function closeConfirm(result) {
  confirmModal.hidden = true;
  if (confirmResolver) {
    const resolve = confirmResolver;
    confirmResolver = null;
    resolve(result);
  }
}

async function deleteSelectedProject() {
  if (state.projects.length <= 1 || pausePromptOpen) return;
  const name = state.selectedProject;
  const ok = await askConfirm({
    title: "Delete project?",
    body: `Remove “${name}” from the list? Past session hours stay in the log forever.`,
  });
  if (!ok) return;

  if (state.isRunning || state.sessionStartedAt) {
    stopTicking();
    commitCurrentSession("");
  }

  state.projects = state.projects.filter((p) => p !== name);
  state.selectedProject = state.projects[0];
  state.sessionSeconds = 0;
  state.sessionStartedAt = null;
  renderProjects();
  render();
  persist();
}

async function deleteRecord(id) {
  const record = state.records.find((r) => r.id === id);
  if (!record) return;

  const ok = await askConfirm({
    title: "Delete record?",
    body: `Delete this ${formatTime(record.seconds)} session for “${record.project}”? This cannot be undone.`,
  });
  if (!ok) return;

  state.records = state.records.filter((r) => r.id !== id);
  selectedIds.delete(id);
  render();
  persist();
}

function paintSelection() {
  for (const row of recordsBody.querySelectorAll("tr")) {
    row.classList.toggle("is-selected", selectedIds.has(row.dataset.id));
  }
  updateCopyButton();
}

function selectRange(fromId, toId, { additive = false } = {}) {
  const start = sortedHistoryIds.indexOf(fromId);
  const end = sortedHistoryIds.indexOf(toId);
  if (start === -1 || end === -1) return;

  if (!additive) selectedIds.clear();
  const [from, to] = start < end ? [start, end] : [end, start];
  for (let i = from; i <= to; i += 1) selectedIds.add(sortedHistoryIds[i]);
  paintSelection();
}

function recordsToTsv(records) {
  return records
    .map((record) =>
      [
        formatDateOnly(record.endedAt),
        formatTimeOnly(record.startedAt),
        formatTimeOnly(record.endedAt),
        record.project,
        formatTime(record.seconds),
        String(record.seconds),
        (record.description || "").replaceAll("\t", " ").replaceAll("\n", " "),
      ].join("\t")
    )
    .join("\r\n");
}

async function copySelectedRecords() {
  if (selectedIds.size === 0) return;

  const order = new Map(sortedHistoryIds.map((id, index) => [id, index]));
  const records = state.records
    .filter((r) => selectedIds.has(r.id))
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  const tsv = recordsToTsv(records);
  try {
    await navigator.clipboard.writeText(tsv);
  } catch (_) {
    const area = document.createElement("textarea");
    area.value = tsv;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }

  copyToast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    copyToast.hidden = true;
  }, 1600);
}

function showAddForm(show) {
  addProjectForm.hidden = !show;
  if (show) {
    newProjectInput.value = "";
    newProjectInput.focus();
  }
}

toggleBtn.addEventListener("click", () => setRunning(!state.isRunning));
projectSelect.addEventListener("change", (e) => switchProject(e.target.value));
addProjectBtn.addEventListener("click", () => showAddForm(true));
cancelAddBtn.addEventListener("click", () => showAddForm(false));
deleteProjectBtn.addEventListener("click", () => deleteSelectedProject());
tabTimer.addEventListener("click", () => setView("timer"));
tabHistory.addEventListener("click", () => setView("history"));
confirmCancel.addEventListener("click", () => closeConfirm(false));
confirmOk.addEventListener("click", () => closeConfirm(true));
noteCancel.addEventListener("click", () => closeNote(null));
noteSave.addEventListener("click", () => closeNote(noteInput.value));
copySelectedBtn.addEventListener("click", () => copySelectedRecords());
openCsvBtn.addEventListener("click", async () => {
  persist();
  if (window.did?.openCsv) {
    await window.did.openCsv();
  }
});

noteInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    closeNote(noteInput.value);
  }
});

recordsBody.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  const deleteBtn = e.target.closest("[data-delete-id]");
  if (deleteBtn) return;

  const row = e.target.closest("tr[data-id]");
  if (!row) return;

  e.preventDefault();
  const previousAnchor = lastClickedId;
  dragSelecting = true;
  dragMoved = false;
  dragAnchorId = row.dataset.id;
  document.querySelector(".table-wrap")?.classList.add("is-dragging");

  const multi = e.metaKey || e.ctrlKey;
  if (e.shiftKey && previousAnchor && sortedHistoryIds.includes(previousAnchor)) {
    selectRange(previousAnchor, dragAnchorId, { additive: multi });
    lastClickedId = dragAnchorId;
  } else if (multi) {
    if (selectedIds.has(dragAnchorId)) selectedIds.delete(dragAnchorId);
    else selectedIds.add(dragAnchorId);
    lastClickedId = dragAnchorId;
    paintSelection();
  } else {
    selectedIds = new Set([dragAnchorId]);
    lastClickedId = dragAnchorId;
    paintSelection();
  }
});

recordsBody.addEventListener("mouseover", (e) => {
  if (!dragSelecting || !dragAnchorId) return;
  const row = e.target.closest("tr[data-id]");
  if (!row) return;
  if (row.dataset.id !== dragAnchorId) dragMoved = true;
  selectRange(dragAnchorId, row.dataset.id);
});

window.addEventListener("mouseup", () => {
  if (!dragSelecting) return;
  dragSelecting = false;
  document.querySelector(".table-wrap")?.classList.remove("is-dragging");
  if (dragMoved) {
    suppressClick = true;
    setTimeout(() => {
      suppressClick = false;
    }, 0);
  }
  dragAnchorId = null;
});

recordsBody.addEventListener("click", (e) => {
  const deleteBtn = e.target.closest("[data-delete-id]");
  if (deleteBtn) {
    e.stopPropagation();
    deleteRecord(deleteBtn.dataset.deleteId);
    return;
  }

  if (suppressClick || dragMoved) return;
});

recordsBody.addEventListener("dragstart", (e) => e.preventDefault());

window.addEventListener("keydown", (e) => {
  if (historyView.hidden) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
    if (selectedIds.size === 0) return;
    e.preventDefault();
    copySelectedRecords();
  }
});

addProjectForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (addProject(newProjectInput.value)) showAddForm(false);
});

resetSessionBtn.addEventListener("click", () => {
  if (pausePromptOpen) return;
  stopTicking();
  state.isRunning = false;
  state.sessionSeconds = 0;
  state.sessionStartedAt = null;
  state.lastTick = null;
  render();
  persist();
});

window.addEventListener("beforeunload", () => {
  if (state.isRunning || state.sessionStartedAt) {
    commitCurrentSession("");
  }
  persist();
});

async function init() {
  let loaded = null;
  if (window.did?.loadData) {
    loaded = await window.did.loadData();
  } else {
    const raw = localStorage.getItem("did-data") || localStorage.getItem("work-timer-data");
    if (raw) loaded = JSON.parse(raw);
  }

  if (loaded) {
    state = {
      ...state,
      ...loaded,
      projectColors: { ...state.projectColors, ...(loaded.projectColors || {}) },
      records: Array.isArray(loaded.records) ? loaded.records : [],
      projects: Array.isArray(loaded.projects) && loaded.projects.length ? loaded.projects : ["General"],
    };

    if ((!loaded.records || loaded.records.length === 0) && loaded.totals) {
      const migrated = [];
      for (const [project, seconds] of Object.entries(loaded.totals)) {
        if (!seconds || seconds <= 0) continue;
        if (!state.projects.includes(project)) state.projects.push(project);
        ensureProjectColor(project);
        migrated.push({
          id: `migrated-${project}`,
          project,
          startedAt: new Date(0).toISOString(),
          endedAt: new Date().toISOString(),
          seconds: Math.floor(seconds),
          description: "Migrated total",
        });
      }
      if (migrated.length) state.records = migrated;
    }

    for (const record of state.records) {
      if (typeof record.description !== "string") record.description = "";
    }
  }

  for (const project of state.projects) ensureProjectColor(project);

  if (!state.projects.includes(state.selectedProject)) {
    state.selectedProject = state.projects[0] || "General";
  }

  if (loaded?.isRunning && loaded.sessionSeconds > 0 && loaded.sessionStartedAt) {
    state.sessionSeconds = Math.floor(loaded.sessionSeconds);
    state.sessionStartedAt = loaded.sessionStartedAt;
    commitCurrentSession("");
  }

  state.isRunning = false;
  state.lastTick = null;
  state.sessionSeconds = 0;
  state.sessionStartedAt = null;

  renderProjects();
  render();
  persist();
}

init();
