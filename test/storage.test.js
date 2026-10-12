const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { StorageRecoveryError, createStorage, decodeSavedText } = require("../storage");

function makeState(records = []) {
  return {
    projects: ["General"],
    projectColors: { General: "#2ee6a6" },
    projectDescriptions: { General: "" },
    selectedProject: "General",
    records,
    sessionSeconds: 0,
    sessionStartedAt: null,
    isRunning: false,
    lastTick: null,
    lastHeartbeat: null,
  };
}

function makeRecord(id = "record-1") {
  return {
    id,
    project: "General",
    startedAt: "2026-10-11T20:00:00.000Z",
    endedAt: "2026-10-11T20:10:00.000Z",
    seconds: 600,
    description: "Recovered work",
  };
}

function withTempDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "did-storage-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("writes a checksummed envelope and loads it", (t) => {
  const directory = withTempDirectory(t);
  const storage = createStorage(directory);
  storage.save(makeState([makeRecord()]));

  const text = fs.readFileSync(storage.paths.primaryPath, "utf8");
  const decoded = decodeSavedText(text);
  assert.equal(decoded.format, "envelope");
  assert.equal(decoded.data.records.length, 1);

  const loaded = createStorage(directory).load();
  assert.equal(loaded.recovered, false);
  assert.equal(loaded.data.records[0].id, "record-1");
});

test("rejects records whose duration disagrees with their work segments", () => {
  const record = makeRecord();
  record.segments = [
    { startedAt: record.startedAt, endedAt: "2026-10-11T20:05:00.000Z" },
  ];
  assert.throws(
    () => createStorage(path.join(os.tmpdir(), "unused-did-test")).save(makeState([record])),
    /does not match/
  );
});

test("recovers from a backup when the primary file is corrupt", (t) => {
  const directory = withTempDirectory(t);
  const storage = createStorage(directory);
  storage.save(makeState([makeRecord()]));
  fs.writeFileSync(storage.paths.primaryPath, "{broken", "utf8");

  const loaded = createStorage(directory).load();
  assert.equal(loaded.recovered, true);
  assert.equal(loaded.primaryProblem, "corrupt");
  assert.equal(loaded.data.records.length, 1);
});

test("rejects a valid-looking envelope whose contents fail the checksum", (t) => {
  const directory = withTempDirectory(t);
  const storage = createStorage(directory);
  storage.save(makeState([makeRecord()]));
  const envelope = JSON.parse(fs.readFileSync(storage.paths.primaryPath, "utf8"));
  envelope.data.records[0].seconds = 999999;
  fs.writeFileSync(storage.paths.primaryPath, JSON.stringify(envelope), "utf8");

  const loaded = createStorage(directory).load();
  assert.equal(loaded.recovered, true);
  assert.equal(loaded.data.records[0].seconds, 600);
});

test("recovers a fully written temporary save after an interrupted promotion", (t) => {
  const directory = withTempDirectory(t);
  const storage = createStorage(directory);
  storage.save(makeState([makeRecord()]));
  const interruptedTemp = path.join(directory, ".did-data-crash.json");
  fs.renameSync(storage.paths.primaryPath, interruptedTemp);
  if (fs.existsSync(storage.paths.previousPath)) fs.unlinkSync(storage.paths.previousPath);
  fs.rmSync(storage.paths.backupDirectory, { recursive: true, force: true });

  const loaded = createStorage(directory).load();
  assert.equal(loaded.recovered, true);
  assert.equal(loaded.source, interruptedTemp);
  assert.equal(loaded.data.records.length, 1);
});

test("never converts an unrecoverable corrupt primary into empty defaults", (t) => {
  const directory = withTempDirectory(t);
  const storage = createStorage(directory);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(storage.paths.primaryPath, "\0\0\0", "utf8");

  assert.throws(() => storage.load(), StorageRecoveryError);
  assert.equal(fs.readFileSync(storage.paths.primaryPath, "utf8"), "\0\0\0");
});

test("rejects an unexplained transition from records to an empty state", (t) => {
  const directory = withTempDirectory(t);
  const storage = createStorage(directory);
  storage.save(makeState([makeRecord()]));

  assert.throws(() => storage.save(makeState(), "startup-normalize"), /Refusing to replace/);
  assert.equal(createStorage(directory).load().data.records.length, 1);
});

test("allows an explicit deletion of the final record", (t) => {
  const directory = withTempDirectory(t);
  const storage = createStorage(directory);
  storage.save(makeState([makeRecord()]));
  storage.save(makeState(), "user-delete-record");

  assert.equal(createStorage(directory).load().data.records.length, 0);
});

test("timer-only checkpoints do not create recent backup churn", (t) => {
  const directory = withTempDirectory(t);
  const storage = createStorage(directory);
  const state = makeState([makeRecord()]);
  storage.save(state);
  state.lastHeartbeat = "2026-10-11T20:10:05.000Z";
  state.sessionSeconds = 5;
  storage.save(state, "timer-checkpoint");

  const recentBeforeChange = fs
    .readdirSync(storage.paths.backupDirectory)
    .filter((name) => name.startsWith("recent-"));
  assert.equal(recentBeforeChange.length, 0);

  state.records.push(makeRecord("record-2"));
  storage.save(state);
  const recentAfterChange = fs
    .readdirSync(storage.paths.backupDirectory)
    .filter((name) => name.startsWith("recent-"));
  assert.equal(recentAfterChange.length, 1);
});
