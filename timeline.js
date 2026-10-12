(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.didTimeline = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const SECOND = 1000;

  function toMs(value) {
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : NaN;
  }

  function sumSegments(segments) {
    const milliseconds = (segments || []).reduce((sum, segment) => {
      const start = toMs(segment.startedAt);
      const end = toMs(segment.endedAt);
      return sum + (Number.isFinite(start) && end > start ? end - start : 0);
    }, 0);
    return Math.floor(milliseconds / SECOND);
  }

  function validateSegments(segments) {
    if (!Array.isArray(segments) || segments.length === 0) return false;
    let previousEnd = -Infinity;
    return segments.every((segment) => {
      const start = toMs(segment.startedAt);
      const end = toMs(segment.endedAt);
      const valid = Number.isFinite(start) && Number.isFinite(end) && end > start && start >= previousEnd;
      previousEnd = end;
      return valid;
    });
  }

  function pausesFromSegments(segments) {
    const pauses = [];
    for (let index = 1; index < segments.length; index += 1) {
      const start = toMs(segments[index - 1].endedAt);
      const end = toMs(segments[index].startedAt);
      if (end > start) pauses.push({ startMs: start, endMs: end });
    }
    return pauses;
  }

  function inferLegacyTimeline(record) {
    const startMs = toMs(record.startedAt);
    let endMs = toMs(record.endedAt);
    const workedMs = Math.max(0, Math.floor(Number(record.seconds) || 0)) * SECOND;
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      endMs = startMs + Math.max(workedMs, SECOND);
    }
    const spanMs = endMs - startMs;
    const pauseMs = Math.max(0, spanMs - workedMs);
    const pauses = [];
    if (pauseMs > 0 && workedMs > 0) {
      const workBefore = Math.floor(workedMs / 2);
      pauses.push({ startMs: startMs + workBefore, endMs: startMs + workBefore + pauseMs });
    }
    return { startMs, endMs, pauses, inferred: pauseMs > 0 };
  }

  function timelineFromRecord(record) {
    if (validateSegments(record?.segments)) {
      const segments = record.segments.map((segment) => ({ ...segment }));
      return {
        startMs: toMs(segments[0].startedAt),
        endMs: toMs(segments[segments.length - 1].endedAt),
        pauses: pausesFromSegments(segments),
        inferred: false,
      };
    }
    return inferLegacyTimeline(record || {});
  }

  function segmentsFromTimeline(startMs, endMs, pauses) {
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      throw new Error("End time must be after start time.");
    }
    const sorted = (pauses || [])
      .map((pause) => ({ startMs: Number(pause.startMs), endMs: Number(pause.endMs) }))
      .sort((a, b) => a.startMs - b.startMs);
    let cursor = startMs;
    const segments = [];
    for (const pause of sorted) {
      if (!Number.isFinite(pause.startMs) || !Number.isFinite(pause.endMs) || pause.endMs <= pause.startMs) {
        throw new Error("Every pause must have an end after its start.");
      }
      if (pause.startMs < cursor || pause.startMs <= startMs || pause.endMs >= endMs) {
        throw new Error("Pauses must not overlap and must stay inside the session.");
      }
      if (pause.startMs > cursor) {
        segments.push({ startedAt: new Date(cursor).toISOString(), endedAt: new Date(pause.startMs).toISOString() });
      }
      cursor = pause.endMs;
    }
    if (cursor < endMs) {
      segments.push({ startedAt: new Date(cursor).toISOString(), endedAt: new Date(endMs).toISOString() });
    }
    if (!segments.length) throw new Error("A session must contain some worked time.");
    return segments;
  }

  function pauseSeconds(startMs, endMs, pauses) {
    const worked = sumSegments(segmentsFromTimeline(startMs, endMs, pauses));
    return Math.max(0, Math.floor((endMs - startMs) / SECOND) - worked);
  }

  return {
    inferLegacyTimeline,
    pauseSeconds,
    pausesFromSegments,
    segmentsFromTimeline,
    sumSegments,
    timelineFromRecord,
    validateSegments,
  };
});
