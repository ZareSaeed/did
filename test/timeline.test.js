const assert = require("node:assert/strict");
const test = require("node:test");
const {
  segmentsFromTimeline,
  sumSegments,
  timelineFromRecord,
  validateSegments,
} = require("../timeline");

test("legacy records preserve their exact worked duration while inferring a pause", () => {
  const record = {
    startedAt: "2026-10-12T08:00:00.000Z",
    endedAt: "2026-10-12T12:00:00.000Z",
    seconds: 7200,
  };
  const timeline = timelineFromRecord(record);
  const segments = segmentsFromTimeline(timeline.startMs, timeline.endMs, timeline.pauses);
  assert.equal(timeline.inferred, true);
  assert.equal(sumSegments(segments), 7200);
});

test("explicit pause gaps are excluded from worked time", () => {
  const start = Date.parse("2026-10-12T08:00:00.000Z");
  const end = Date.parse("2026-10-12T11:00:00.000Z");
  const segments = segmentsFromTimeline(start, end, [
    { startMs: start + 3600_000, endMs: start + 5400_000 },
  ]);
  assert.equal(sumSegments(segments), 9000);
  assert.equal(validateSegments(segments), true);
});

test("multiple pauses and sessions crossing midnight remain ordered", () => {
  const start = Date.parse("2026-10-12T23:30:00.000Z");
  const end = Date.parse("2026-10-13T02:00:00.000Z");
  const segments = segmentsFromTimeline(start, end, [
    { startMs: start + 1800_000, endMs: start + 2400_000 },
    { startMs: start + 5400_000, endMs: start + 6600_000 },
  ]);
  assert.equal(sumSegments(segments), 7200);
  assert.equal(segments.at(-1).endedAt, "2026-10-13T02:00:00.000Z");
});

test("overlapping pauses are rejected", () => {
  const start = Date.parse("2026-10-12T08:00:00.000Z");
  const end = start + 7200_000;
  assert.throws(
    () => segmentsFromTimeline(start, end, [
      { startMs: start + 600_000, endMs: start + 1800_000 },
      { startMs: start + 1200_000, endMs: start + 2400_000 },
    ]),
    /overlap/
  );
});
