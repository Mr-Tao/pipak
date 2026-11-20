import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

// Evaluate just the declarations before Scriptable-specific APIs are invoked.
const source = readFileSync(new URL("../Pipak.js", import.meta.url), "utf8");
const boundary = source.indexOf("const PREFIX =");
assert.ok(boundary > 0);
const { buildTimeline, normalize, DEFAULTS, LIMITS, PRESETS } = runInNewContext(
  `${source.slice(0, boundary)}\n({ buildTimeline, normalize, DEFAULTS, LIMITS, PRESETS });`,
);

function checkTimeline(config, duration, expectedTypes) {
  const { phases, total } = buildTimeline(config);
  assert.equal(total, duration * 1000);
  let end = 0;
  for (const phase of phases) {
    assert.equal(phase.start, end);
    assert.ok(phase.duration > 0);
    assert.equal(phase.end, phase.start + phase.duration);
    end = phase.end;
  }
  assert.equal(end, total);
  if (expectedTypes) {
    assert.deepEqual(Array.from(phases, (phase) => phase.type), expectedTypes);
  }
  return phases;
}

test("default Tabata: 10 seconds preparation + 8 rounds", () => {
  const phases = checkTimeline(DEFAULTS, 250);
  assert.equal(phases.length, 17);
  assert.equal(phases[16].type, "rest");
});

test("minute series: no rest phases", () => {
  checkTimeline(PRESETS.minute, 310, ["preparation", ...Array(5).fill("work")]);
});

test("inter-series rest replaces short rest", () => {
  checkTimeline(
    { ...DEFAULTS, work: 10, rest: 5, rounds: 2, sets: 2, setRest: 8, preparation: 3 },
    66,
    ["preparation", "work", "rest", "work", "setRest", "work", "rest", "work", "rest"],
  );
});

test("zero preparation and rest", () => {
  checkTimeline({ ...DEFAULTS, rounds: 1, sets: 2, rest: 0, setRest: 0, preparation: 0 }, 40, ["work", "work"]);
});

test("normalization rejects invalid numbers and excessive round counts", () => {
  const config = normalize({ work: -1, rest: 0, rounds: 200, sets: 50, volume: 101 }, DEFAULTS, LIMITS);
  assert.equal(config.work, 20);
  assert.equal(config.rest, 0);
  assert.equal(config.rounds, 8);
  assert.equal(config.sets, 1);
  assert.equal(config.volume, 35);
});
