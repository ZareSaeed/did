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
const editProjectBtn = document.getElementById("editProjectBtn");
const deleteProjectBtn = document.getElementById("deleteProjectBtn");
const projectDesc = document.getElementById("projectDesc");
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
const appVersion = document.getElementById("appVersion");
const githubBtn = document.getElementById("githubBtn");
const editProjectModal = document.getElementById("editProjectModal");
const editProjectName = document.getElementById("editProjectName");
const editProjectDesc = document.getElementById("editProjectDesc");
const editColorPicker = document.getElementById("editColorPicker");
const editProjectError = document.getElementById("editProjectError");
const editProjectCancel = document.getElementById("editProjectCancel");
const editProjectSave = document.getElementById("editProjectSave");
const editRecordModal = document.getElementById("editRecordModal");
const editRecordSummary = document.getElementById("editRecordSummary");
const editRecordNote = document.getElementById("editRecordNote");
const editRecordError = document.getElementById("editRecordError");
const editRecordDuration = document.getElementById("editRecordDuration");
const editRecordCancel = document.getElementById("editRecordCancel");
const editRecordSave = document.getElementById("editRecordSave");

const DEFAULT_REPO_URL = "https://github.com/ZareSaeed/did";
let repoUrl = DEFAULT_REPO_URL;

let state = {
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
let editingProjectName = null;
let editSelectedColor = COLOR_PALETTE[0];
let editingRecordId = null;
let editTimes = {
  start: { h: 0, m: 0, s: 0 },
  end: { h: 0, m: 0, s: 0 },
};
const WHEEL_ITEM = 38;

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

function pad2(n) {
  return String(Math.max(0, Math.floor(Number(n) || 0))).padStart(2, "0");
}

function clampUnit(value, maxExclusive) {
  const n = typeof value === "number" ? Math.round(value) : Number.parseInt(String(value).replace(/\D/g, ""), 10);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(maxExclusive - 1, n));
}

function getLocalHms(iso) {
  const d = new Date(iso);
  return { h: d.getHours(), m: d.getMinutes(), s: d.getSeconds() };
}

function setLocalHms(iso, h, m, s) {
  const d = new Date(iso);
  d.setHours(h, m, s, 0);
  return d.toISOString();
}

function durationFromEditTimes(record) {
  if (!record) return 0;
  const startIso = setLocalHms(record.startedAt, editTimes.start.h, editTimes.start.m, editTimes.start.s);
  const endIso = setLocalHms(record.endedAt, editTimes.end.h, editTimes.end.m, editTimes.end.s);
  return Math.floor((new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000);
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

function clearSession() {
  state.sessionSeconds = 0;
  state.sessionStartedAt = null;
  state.lastTick = null;
  state.lastHeartbeat = null;
  state.isRunning = false;
}

function buildRecordFromSession(description = "", options = {}) {
  catchUpRunningTime();
  const seconds = Math.floor(state.sessionSeconds);
  if (seconds <= 0 || !state.sessionStartedAt) {
    clearSession();
    return null;
  }

  const record = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    project: state.selectedProject,
    startedAt: state.sessionStartedAt,
    endedAt: options.endedAt || new Date().toISOString(),
    seconds,
    description: String(description || "").trim(),
  };

  if (options.interrupted) record.interrupted = true;

  state.records.push(record);
  clearSession();
  return record;
}

function commitCurrentSession(description = "", options = {}) {
  return buildRecordFromSession(description, options);
}

// The app never gets a chance to close a session cleanly during a power cut,
// so the last persisted heartbeat is the most accurate end time available.
function recoveredEndTime(loaded) {
  const candidates = [loaded.lastHeartbeat, loaded.lastTick];
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined) continue;
    const date = new Date(candidate);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }

  const started = new Date(loaded.sessionStartedAt).getTime();
  if (!Number.isNaN(started)) {
    return new Date(started + Math.floor(loaded.sessionSeconds) * 1000).toISOString();
  }
  return new Date().toISOString();
}

function setView(view) {
  const isTimer = view === "timer";
  timerView.hidden = !isTimer;
  historyView.hidden = isTimer;
  tabTimer.classList.toggle("is-active", isTimer);
  tabHistory.classList.toggle("is-active", !isTimer);
  if (!isTimer) renderHistory();
}

function projectDescription(name) {
  if (!state.projectDescriptions) state.projectDescriptions = {};
  return state.projectDescriptions[name] || "";
}

function renderColorPicker(selected) {
  editColorPicker.innerHTML = "";
  for (const color of COLOR_PALETTE) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "color-swatch-btn";
    btn.style.background = color;
    btn.title = color;
    btn.setAttribute("aria-label", `Color ${color}`);
    if (color === selected) btn.classList.add("is-selected");
    btn.addEventListener("click", () => {
      editSelectedColor = color;
      renderColorPicker(color);
    });
    editColorPicker.appendChild(btn);
  }
}

function openEditProjectModal() {
  if (pausePromptOpen) return;
  editingProjectName = state.selectedProject;
  editProjectName.value = editingProjectName;
  editProjectDesc.value = projectDescription(editingProjectName);
  editSelectedColor = projectColor(editingProjectName);
  editProjectError.hidden = true;
  editProjectError.textContent = "";
  renderColorPicker(editSelectedColor);
  editProjectModal.hidden = false;
  setTimeout(() => editProjectName.focus(), 30);
}

function closeEditProjectModal() {
  editProjectModal.hidden = true;
  editingProjectName = null;
}

const TIME_WHEELS = [
  { key: "start", unit: "h", max: 24, wheel: "startHourWheel" },
  { key: "start", unit: "m", max: 60, wheel: "startMinuteWheel" },
  { key: "start", unit: "s", max: 60, wheel: "startSecondWheel" },
  { key: "end", unit: "h", max: 24, wheel: "endHourWheel" },
  { key: "end", unit: "m", max: 60, wheel: "endMinuteWheel" },
  { key: "end", unit: "s", max: 60, wheel: "endSecondWheel" },
];

function wheelEl(id) {
  return document.getElementById(id);
}

function highlightWheel(viewport, value) {
  viewport.querySelectorAll(".time-wheel-item").forEach((el) => {
    const n = Number(el.dataset.n);
    el.classList.toggle("is-active", n === value);
    el.classList.toggle("is-near", Math.abs(n - value) === 1);
  });
}

function paintWheel(viewport, value, extra = 0) {
  const track = viewport.querySelector(".time-wheel-track");
  if (!track) return;
  const max = Number(viewport.dataset.max) || 60;
  const center = (viewport.clientHeight || 118) / 2 - WHEEL_ITEM / 2;
  const y = center - value * WHEEL_ITEM + extra;
  track.style.transform = `translateY(${y}px)`;
  highlightWheel(viewport, clampUnit(Math.round(value), max));
}

function fillWheel(viewport, maxExclusive, value) {
  viewport.innerHTML = "";
  viewport.dataset.max = String(maxExclusive);
  const track = document.createElement("div");
  track.className = "time-wheel-track";
  for (let i = 0; i < maxExclusive; i += 1) {
    const item = document.createElement("div");
    item.className = "time-wheel-item";
    item.textContent = pad2(i);
    item.dataset.n = String(i);
    track.appendChild(item);
  }
  const edit = document.createElement("input");
  edit.className = "time-wheel-edit";
  edit.type = "text";
  edit.inputMode = "numeric";
  edit.maxLength = 2;
  edit.hidden = true;
  viewport.appendChild(track);
  viewport.appendChild(edit);
  paintWheel(viewport, value, 0);
}

function commitWheelValue(cfg, value) {
  const next = clampUnit(value, cfg.max);
  editTimes[cfg.key][cfg.unit] = next;
  const viewport = wheelEl(cfg.wheel);
  if (viewport) paintWheel(viewport, next, 0);
  updateEditDuration();
  return next;
}

function beginWheelType(cfg) {
  const viewport = wheelEl(cfg.wheel);
  if (!viewport) return;
  const edit = viewport.querySelector(".time-wheel-edit");
  if (!edit) return;
  edit.hidden = false;
  edit.value = pad2(editTimes[cfg.key][cfg.unit]);
  edit.focus();
  edit.select();
}

function endWheelType(cfg, raw) {
  const viewport = wheelEl(cfg.wheel);
  const edit = viewport?.querySelector(".time-wheel-edit");
  if (edit) {
    edit.hidden = true;
    edit.value = "";
  }
  if (raw === null || raw === undefined || String(raw).trim() === "") return;
  commitWheelValue(cfg, raw);
}

function bindTimeWheels() {
  for (const cfg of TIME_WHEELS) {
    const viewport = wheelEl(cfg.wheel);
    if (!viewport || viewport.dataset.bound) continue;
    viewport.dataset.bound = "1";

    let pointerId = null;
    let startY = 0;
    let startValue = 0;
    let moved = false;

    viewport.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const edit = viewport.querySelector(".time-wheel-edit");
      if (edit && !edit.hidden) return;
      pointerId = e.pointerId;
      startY = e.clientY;
      startValue = editTimes[cfg.key][cfg.unit];
      moved = false;
      viewport.setPointerCapture(e.pointerId);
    });

    viewport.addEventListener("pointermove", (e) => {
      if (pointerId !== e.pointerId) return;
      const delta = e.clientY - startY;
      if (Math.abs(delta) > 3) moved = true;
      const preview = Math.max(0, Math.min(cfg.max - 1, startValue - delta / WHEEL_ITEM));
      paintWheel(viewport, preview);
    });

    const finishPointer = (e) => {
      if (pointerId !== e.pointerId) return;
      viewport.releasePointerCapture?.(e.pointerId);
      pointerId = null;
      if (!moved) {
        beginWheelType(cfg);
        return;
      }
      const delta = e.clientY - startY;
      commitWheelValue(cfg, startValue - delta / WHEEL_ITEM);
    };

    viewport.addEventListener("pointerup", finishPointer);
    viewport.addEventListener("pointercancel", finishPointer);

    viewport.addEventListener("wheel", (e) => {
      e.preventDefault();
      const dir = e.deltaY > 0 ? 1 : -1;
      commitWheelValue(cfg, editTimes[cfg.key][cfg.unit] + dir);
    }, { passive: false });
  }
}

function bindWheelEditors() {
  for (const cfg of TIME_WHEELS) {
    const viewport = wheelEl(cfg.wheel);
    const edit = viewport?.querySelector(".time-wheel-edit");
    if (!edit || edit.dataset.bound) continue;
    edit.dataset.bound = "1";
    edit.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        endWheelType(cfg, edit.value);
      }
      if (e.key === "Escape") {
        e.preventDefault();
        endWheelType(cfg, null);
      }
    });
    edit.addEventListener("blur", () => endWheelType(cfg, edit.value));
  }
}

function syncWheelsFromRecord() {
  bindTimeWheels();
  for (const cfg of TIME_WHEELS) {
    fillWheel(wheelEl(cfg.wheel), cfg.max, editTimes[cfg.key][cfg.unit]);
  }
  bindWheelEditors();
}

function updateEditDuration() {
  const record = state.records.find((r) => r.id === editingRecordId);
  const seconds = durationFromEditTimes(record);
  if (!editRecordDuration) return;
  if (seconds <= 0) {
    editRecordDuration.textContent = "Duration · invalid (end must be after start)";
    editRecordDuration.style.color = "var(--danger)";
  } else {
    editRecordDuration.textContent = `Duration · ${formatTime(seconds)}  ·  ${seconds}s`;
    editRecordDuration.style.color = "var(--green)";
  }
}

function openEditRecordModal(id) {
  const record = state.records.find((r) => r.id === id);
  if (!record) return;
  editingRecordId = id;
  editTimes = {
    start: getLocalHms(record.startedAt),
    end: getLocalHms(record.endedAt),
  };
  editRecordSummary.textContent = `${record.project} · ${formatDateOnly(record.endedAt)}`;
  editRecordNote.value = record.description || "";
  editRecordError.hidden = true;
  editRecordError.textContent = "";
  editRecordModal.hidden = false;
  requestAnimationFrame(() => {
    syncWheelsFromRecord();
    updateEditDuration();
  });
}

function closeEditRecordModal() {
  for (const cfg of TIME_WHEELS) {
    const edit = wheelEl(cfg.wheel)?.querySelector(".time-wheel-edit");
    if (edit) {
      edit.hidden = true;
      edit.value = "";
    }
  }
  editRecordModal.hidden = true;
  editingRecordId = null;
  editTimes = { start: { h: 0, m: 0, s: 0 }, end: { h: 0, m: 0, s: 0 } };
}

function saveRecordEdit() {
  const record = state.records.find((r) => r.id === editingRecordId);
  if (!record) return;

  const startIso = setLocalHms(record.startedAt, editTimes.start.h, editTimes.start.m, editTimes.start.s);
  const endIso = setLocalHms(record.endedAt, editTimes.end.h, editTimes.end.m, editTimes.end.s);
  const seconds = Math.floor((new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000);

  if (seconds <= 0) {
    editRecordError.textContent = "End time must be after start time.";
    editRecordError.hidden = false;
    return;
  }

  record.startedAt = startIso;
  record.endedAt = endIso;
  record.seconds = seconds;
  record.description = String(editRecordNote.value || "").trim();
  closeEditRecordModal();
  render();
  persist();
}

function saveProjectEdit() {
  if (!editingProjectName) return;

  const cleaned = editProjectName.value.trim().replace(/\s+/g, " ");
  if (!cleaned) {
    editProjectError.textContent = "Project name is required.";
    editProjectError.hidden = false;
    return;
  }

  const duplicate = state.projects.find(
    (p) => p.toLowerCase() === cleaned.toLowerCase() && p !== editingProjectName
  );
  if (duplicate) {
    editProjectError.textContent = "A project with that name already exists.";
    editProjectError.hidden = false;
    return;
  }

  const oldName = editingProjectName;
  const description = editProjectDesc.value.trim();
  const color = editSelectedColor;

  if (!state.projectDescriptions) state.projectDescriptions = {};
  if (!state.projectColors) state.projectColors = {};

  if (oldName !== cleaned) {
    state.projects = state.projects.map((p) => (p === oldName ? cleaned : p));
    delete state.projectColors[oldName];
    delete state.projectDescriptions[oldName];
    for (const record of state.records) {
      if (record.project === oldName) record.project = cleaned;
    }
    if (state.selectedProject === oldName) state.selectedProject = cleaned;
  }

  state.projectColors[cleaned] = color;
  state.projectDescriptions[cleaned] = description;

  closeEditProjectModal();
  renderProjects();
  render();
  persist();
}

function renderProjectDesc() {
  const desc = projectDescription(state.selectedProject);
  if (desc) {
    projectDesc.textContent = desc;
    projectDesc.hidden = false;
  } else {
    projectDesc.textContent = "";
    projectDesc.hidden = true;
  }
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
  renderProjectDesc();
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
    const interruptedFlag = record.interrupted
      ? `<span class="interrupted-flag" title="Ended by an unexpected shutdown (power cut or crash). End time is the last second the timer recorded." aria-label="Interrupted by power loss">
          <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">
            <path fill="currentColor" d="M12 2 1 21h22L12 2zm1 15h-2v2h2v-2zm0-8h-2v6h2V9z" />
          </svg>
        </span>`
      : "";
    tr.innerHTML = `
      <td class="when-cell">${formatWhen(record.endedAt).replace("\n", "<br>")}</td>
      <td>
        <div class="project-cell">
          <span class="project-marks">
            <span class="project-swatch" style="background:${color}"></span>
            ${interruptedFlag}
          </span>
          <span>${escapeHtml(record.project)}</span>
        </div>
      </td>
      <td class="time-cell">${formatTime(record.seconds)}</td>
      <td class="note-cell"><span class="note-text" title="${escapeHtml(record.description || "")}">${note}</span></td>
      <td class="actions-cell">
        <div class="row-actions">
          <button type="button" class="row-edit" data-edit-id="${escapeHtml(record.id)}" title="Edit record" aria-label="Edit record">✎</button>
          <button type="button" class="row-delete" data-delete-id="${escapeHtml(record.id)}" title="Delete record" aria-label="Delete record">×</button>
        </div>
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

function updateBackground() {
  let bgState = "idle";
  if (state.isRunning) bgState = "recording";
  else if (state.sessionSeconds > 0 || pausePromptOpen) bgState = "paused";

  window.spaceBg?.setState(bgState);
  window.spaceBg?.setAccent(projectColor(state.selectedProject));
}

function render() {
  const color = projectColor(state.selectedProject);
  document.documentElement.style.setProperty("--project-color", color);
  projectColorDot.style.background = color;
  renderProjectDesc();
  updateBackground();

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
    state.lastHeartbeat = new Date(now).toISOString();
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
    state.lastHeartbeat = new Date().toISOString();
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
    state.lastHeartbeat = new Date().toISOString();
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
  if (!state.projectDescriptions) state.projectDescriptions = {};
  state.projectDescriptions[cleaned] = "";
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

  const records = state.records
    .filter((r) => selectedIds.has(r.id))
    .sort((a, b) => new Date(a.endedAt).getTime() - new Date(b.endedAt).getTime());

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
editProjectBtn.addEventListener("click", () => openEditProjectModal());
cancelAddBtn.addEventListener("click", () => showAddForm(false));
deleteProjectBtn.addEventListener("click", () => deleteSelectedProject());
editProjectCancel.addEventListener("click", () => closeEditProjectModal());
editProjectSave.addEventListener("click", () => saveProjectEdit());
editRecordCancel.addEventListener("click", () => closeEditRecordModal());
editRecordSave.addEventListener("click", () => saveRecordEdit());
editProjectName.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    saveProjectEdit();
  }
});
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

githubBtn.addEventListener("click", async () => {
  if (window.did?.openExternal) {
    await window.did.openExternal(repoUrl);
  } else {
    window.open(repoUrl, "_blank", "noopener,noreferrer");
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
  const actionBtn = e.target.closest("[data-delete-id], [data-edit-id]");
  if (actionBtn) return;

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
  const editBtn = e.target.closest("[data-edit-id]");
  if (editBtn) {
    e.stopPropagation();
    openEditRecordModal(editBtn.dataset.editId);
    return;
  }

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
  if (pausePromptOpen && state.sessionStartedAt) {
    commitCurrentSession(noteInput.value);
  } else if (state.isRunning || state.sessionStartedAt) {
    commitCurrentSession("");
  }
  persist();
});

async function init() {
  if (window.did?.getAppInfo) {
    try {
      const info = await window.did.getAppInfo();
      if (info?.version) appVersion.textContent = `v${info.version}`;
      if (info?.repoUrl) repoUrl = info.repoUrl;
    } catch (_) {}
  }

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
      projectDescriptions: { ...state.projectDescriptions, ...(loaded.projectDescriptions || {}) },
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

  for (const project of state.projects) {
    ensureProjectColor(project);
    if (!state.projectDescriptions) state.projectDescriptions = {};
    if (typeof state.projectDescriptions[project] !== "string") {
      state.projectDescriptions[project] = "";
    }
  }

  if (!state.projects.includes(state.selectedProject)) {
    state.selectedProject = state.projects[0] || "General";
  }

  // A leftover session means the previous run never closed it: power cut or crash.
  if (loaded?.sessionStartedAt && loaded.sessionSeconds > 0) {
    const endedAt = recoveredEndTime(loaded);
    state.isRunning = false;
    state.lastTick = null;
    state.sessionSeconds = Math.floor(loaded.sessionSeconds);
    state.sessionStartedAt = loaded.sessionStartedAt;
    state.selectedProject = state.projects.includes(loaded.selectedProject)
      ? loaded.selectedProject
      : state.selectedProject;
    commitCurrentSession("", { endedAt, interrupted: true });
  }

  clearSession();

  renderProjects();
  render();
  persist();
}

init();
