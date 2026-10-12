const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const SCHEMA_VERSION = 2;
const PRIMARY_FILE = "did-data.json";
const PREVIOUS_FILE = "did-data.previous.json";
const RECENT_BACKUP_LIMIT = 20;
const DAILY_BACKUP_LIMIT = 30;

class StorageRecoveryError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "StorageRecoveryError";
    this.details = details;
  }
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function checksumFor(data) {
  return crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

function validateState(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Saved data is not an object.");
  }
  if (!Array.isArray(data.projects) || data.projects.some((name) => typeof name !== "string" || !name.trim())) {
    throw new Error("Saved projects are invalid.");
  }
  if (data.records !== undefined && !Array.isArray(data.records)) {
    throw new Error("Saved records are invalid.");
  }
  for (const record of data.records || []) {
    if (!record || typeof record !== "object") throw new Error("A saved record is invalid.");
    if (typeof record.id !== "string" || !record.id) throw new Error("A saved record has no id.");
    if (typeof record.project !== "string" || !record.project) {
      throw new Error("A saved record has no project.");
    }
    if (!Number.isFinite(Number(record.seconds)) || Number(record.seconds) < 0) {
      throw new Error("A saved record has an invalid duration.");
    }
    if (Number.isNaN(new Date(record.startedAt).getTime()) || Number.isNaN(new Date(record.endedAt).getTime())) {
      throw new Error("A saved record has an invalid timestamp.");
    }
    if (record.segments !== undefined) {
      if (!Array.isArray(record.segments) || record.segments.length === 0) {
        throw new Error("A saved record has invalid work segments.");
      }
      let previousEnd = -Infinity;
      let workedMilliseconds = 0;
      for (const segment of record.segments) {
        const start = new Date(segment?.startedAt).getTime();
        const end = new Date(segment?.endedAt).getTime();
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || start < previousEnd) {
          throw new Error("A saved record has overlapping or invalid work segments.");
        }
        workedMilliseconds += end - start;
        previousEnd = end;
      }
      if (Math.floor(workedMilliseconds / 1000) !== Math.floor(Number(record.seconds))) {
        throw new Error("A saved record duration does not match its work segments.");
      }
    }
  }
  if (data.sessionSegments !== undefined && !Array.isArray(data.sessionSegments)) {
    throw new Error("The active session segments are invalid.");
  }
  return data;
}

function encodeEnvelope(data, now = new Date()) {
  const clean = cloneJson(validateState(data));
  const envelope = {
    schemaVersion: SCHEMA_VERSION,
    savedAt: now.toISOString(),
    checksum: checksumFor(clean),
    data: clean,
  };
  return JSON.stringify(envelope, null, 2) + "\n";
}

function decodeSavedText(text) {
  const parsed = JSON.parse(text);
  if (parsed?.schemaVersion !== undefined || parsed?.data !== undefined || parsed?.checksum !== undefined) {
    if (parsed.schemaVersion !== SCHEMA_VERSION) {
      throw new Error(`Unsupported data schema ${parsed.schemaVersion}.`);
    }
    validateState(parsed.data);
    if (parsed.checksum !== checksumFor(parsed.data)) {
      throw new Error("Saved data checksum does not match.");
    }
    return { data: cloneJson(parsed.data), format: "envelope", savedAt: parsed.savedAt || null };
  }
  validateState(parsed);
  return { data: cloneJson(parsed), format: "legacy", savedAt: null };
}

function readCandidate(filePath) {
  try {
    const text = fs.readFileSync(filePath, "utf8");
    return { ok: true, filePath, text, ...decodeSavedText(text) };
  } catch (error) {
    return { ok: false, filePath, error };
  }
}

function fsyncFile(filePath) {
  const fd = fs.openSync(filePath, "r+");
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function durableWrite(filePath, text, flags = "wx") {
  const fd = fs.openSync(filePath, flags, 0o600);
  try {
    fs.writeFileSync(fd, text, "utf8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function timestampForFile(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function listFiles(directory, prefix) {
  try {
    return fs
      .readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.startsWith(prefix) && entry.name.endsWith(".json"))
      .map((entry) => {
        const filePath = path.join(directory, entry.name);
        return { filePath, mtimeMs: fs.statSync(filePath).mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
  } catch (_) {
    return [];
  }
}

function durableSignature(data) {
  return checksumFor({
    projects: data.projects || [],
    projectColors: data.projectColors || {},
    projectDescriptions: data.projectDescriptions || {},
    selectedProject: data.selectedProject || null,
    records: data.records || [],
  });
}

function createStorage(userDataPath, options = {}) {
  const now = options.now || (() => new Date());
  const primaryPath = path.join(userDataPath, PRIMARY_FILE);
  const previousPath = path.join(userDataPath, PREVIOUS_FILE);
  const backupDirectory = path.join(userDataPath, "backups");
  const corruptDirectory = path.join(userDataPath, "corrupt");
  let lastKnownRecordCount = 0;
  let lastDurableSignature = null;

  function recoveryCandidates() {
    const tempFiles = listFiles(userDataPath, ".did-data-");
    const backups = listFiles(backupDirectory, "");
    return [
      ...tempFiles.map((item) => item.filePath),
      previousPath,
      ...backups.map((item) => item.filePath),
    ].filter((filePath, index, all) => fs.existsSync(filePath) && all.indexOf(filePath) === index);
  }

  function load() {
    fs.mkdirSync(userDataPath, { recursive: true });
    const primaryExists = fs.existsSync(primaryPath);
    if (primaryExists) {
      const primary = readCandidate(primaryPath);
      if (primary.ok) {
        lastKnownRecordCount = (primary.data.records || []).length;
        lastDurableSignature = durableSignature(primary.data);
        return { data: primary.data, source: primaryPath, recovered: false, format: primary.format };
      }
    }

    for (const candidatePath of recoveryCandidates()) {
      const candidate = readCandidate(candidatePath);
      if (!candidate.ok) continue;
      lastKnownRecordCount = (candidate.data.records || []).length;
      lastDurableSignature = durableSignature(candidate.data);
      return {
        data: candidate.data,
        source: candidatePath,
        recovered: true,
        primaryProblem: primaryExists ? "corrupt" : "missing",
        format: candidate.format,
      };
    }

    if (!primaryExists) {
      return { data: null, source: null, recovered: false, isNew: true, format: null };
    }

    throw new StorageRecoveryError(
      "The main data file is damaged and no valid automatic backup was found.",
      { primaryPath }
    );
  }

  function createBackupFromText(text, prefix, date) {
    fs.mkdirSync(backupDirectory, { recursive: true });
    const backupPath = path.join(
      backupDirectory,
      `${prefix}-${timestampForFile(date)}-${crypto.randomBytes(3).toString("hex")}.json`
    );
    durableWrite(backupPath, text);
    if (!readCandidate(backupPath).ok) {
      throw new Error(`Backup validation failed: ${backupPath}`);
    }
    return backupPath;
  }

  function trimBackups(prefix, limit) {
    for (const item of listFiles(backupDirectory, prefix).slice(limit)) {
      fs.unlinkSync(item.filePath);
    }
  }

  function hasDailyBackup(date) {
    const day = date.toISOString().slice(0, 10);
    return listFiles(backupDirectory, `daily-${day}`).length > 0;
  }

  function quarantinePrimary(date) {
    if (!fs.existsSync(primaryPath)) return null;
    fs.mkdirSync(corruptDirectory, { recursive: true });
    const destination = path.join(corruptDirectory, `did-data-corrupt-${timestampForFile(date)}.json`);
    fs.renameSync(primaryPath, destination);
    return destination;
  }

  function save(data, reason = "state-update") {
    validateState(data);
    const recordCount = (data.records || []).length;
    const destructiveReasons = new Set(["user-delete-record", "user-clear-records"]);
    if (lastKnownRecordCount > 0 && recordCount === 0 && !destructiveReasons.has(reason)) {
      throw new Error(
        `Refusing to replace ${lastKnownRecordCount} saved records with an empty state without an explicit deletion.`
      );
    }

    const savedAt = now();
    const text = encodeEnvelope(data, savedAt);
    fs.mkdirSync(userDataPath, { recursive: true });
    const tempPath = path.join(
      userDataPath,
      `.did-data-${process.pid}-${timestampForFile(savedAt)}-${crypto.randomBytes(3).toString("hex")}.json`
    );
    durableWrite(tempPath, text);
    const temp = readCandidate(tempPath);
    if (!temp.ok) throw new Error(`Temporary save validation failed: ${temp.error.message}`);

    const primary = fs.existsSync(primaryPath) ? readCandidate(primaryPath) : null;
    const nextSignature = durableSignature(data);
    if (primary?.ok && lastDurableSignature !== nextSignature) {
      createBackupFromText(primary.text, "recent", savedAt);
    }

    if (primary?.ok) {
      if (fs.existsSync(previousPath)) fs.unlinkSync(previousPath);
      fs.renameSync(primaryPath, previousPath);
    } else if (fs.existsSync(primaryPath)) {
      quarantinePrimary(savedAt);
    }

    fs.renameSync(tempPath, primaryPath);
    fsyncFile(primaryPath);
    if (!hasDailyBackup(savedAt)) createBackupFromText(text, `daily-${savedAt.toISOString().slice(0, 10)}`, savedAt);
    trimBackups("recent-", RECENT_BACKUP_LIMIT);
    trimBackups("daily-", DAILY_BACKUP_LIMIT);

    lastKnownRecordCount = recordCount;
    lastDurableSignature = nextSignature;
    return { ok: true, savedAt: savedAt.toISOString() };
  }

  return {
    load,
    save,
    paths: { primaryPath, previousPath, backupDirectory, corruptDirectory },
  };
}

module.exports = {
  SCHEMA_VERSION,
  StorageRecoveryError,
  checksumFor,
  createStorage,
  decodeSavedText,
  encodeEnvelope,
  validateState,
};
