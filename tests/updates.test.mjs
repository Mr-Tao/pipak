import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

// Evaluate the pure functions, without executing Scriptable's native APIs.
const source = readFileSync(new URL("../Pipak.js", import.meta.url), "utf8");
const boundary = source.indexOf("const PREFIX =");
assert.ok(boundary > 0);
const { compareSemver, parseSemver, versionOfSource, validReleaseSource } =
  runInNewContext(
    `${source.slice(0, boundary)}\n({ compareSemver, parseSemver, versionOfSource, validReleaseSource });`,
  );

test("semantic version ordering", () => {
  assert.equal(compareSemver("0.3.0", "0.2.0"), 1);
  assert.equal(compareSemver("1.0.0", "0.99.99"), 1);
  assert.equal(compareSemver("0.2.0", "0.2.0"), 0);
  assert.equal(compareSemver("0.2.0", "0.3.0"), -1);
  assert.equal(compareSemver("1.2", "1.2.0"), null);
  assert.equal(compareSemver("bad", "0.2.0"), null);
  assert.equal(parseSemver("01.2.3"), null);
});

test("release source is validated against its tag", () => {
  const valid = source.replace('const VERSION = "0.2.0";', 'const VERSION = "0.3.0";');
  assert.equal(versionOfSource(valid), "0.3.0");
  assert.equal(validReleaseSource(valid, "v0.3.0"), true);
  assert.equal(validReleaseSource(valid, "v0.4.0"), false);
  assert.equal(validReleaseSource("const VERSION = \"0.3.0\";", "v0.3.0"), false);
  assert.equal(validReleaseSource(valid, "v0.3.0-rc1"), false);
});
