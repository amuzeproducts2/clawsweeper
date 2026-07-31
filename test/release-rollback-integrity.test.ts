import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const serviceUnit = "clawsweeper-orchestrator.service";
const timerUnit = "clawsweeper-orchestrator.timer";

type Fixture = {
  backupDir: string;
  currentLink: string;
  fakeSystemctl: string;
  fakeSystemctlLog: string;
  newRelease: string;
  previousRelease: string;
  stateDir: string;
  systemdDir: string;
};

type InstallOptions = {
  corruptRollbackManifestDigest?: boolean;
  expectFailureBeforeCutover?: boolean;
};

const comparisonOperatorAtPhysicalLineEnd = /(?:^|[ \t])(?:==|!=|=|-eq|-ne|-lt|-le|-gt|-ge)[ \t]*$/;

function assertNoLineEndingComparisonOperator(source: string, sourceName: string): void {
  for (const [index, line] of source.split("\n").entries()) {
    if (/^[ \t]*#/.test(line)) {
      continue;
    }
    assert.doesNotMatch(
      line,
      comparisonOperatorAtPhysicalLineEnd,
      `${sourceName}:${index + 1} ends a shell comparison before its closing operand`,
    );
  }
}

function installedFixture(options: InstallOptions = {}): Fixture {
  const root = mkdtempSync(join(tmpdir(), "clawsweeper-rollback-integrity-"));
  const version = "d".repeat(40);
  const bundle = join(root, "bundle");
  const releasesRoot = join(root, "releases-root");
  const previousRelease = join(releasesRoot, "releases", "previous");
  const stateDir = join(root, "state");
  const backupRoot = join(root, "backups");
  const systemdDir = join(root, "systemd");
  const fakeSystemctlState = join(root, "fake-systemctl-state");
  const fakeSystemctl = join(root, "systemctl");
  const fakeSystemctlLog = join(root, "systemctl.log");
  const metricsPath = join(root, "clawsweeper.prom");
  const healthcheckMetricsPath = join(root, "clawsweeper-healthcheck.prom");

  mkdirSync(join(bundle, "scripts"), { recursive: true });
  mkdirSync(join(bundle, "systemd"), { recursive: true });
  mkdirSync(previousRelease, { recursive: true });
  mkdirSync(stateDir, { recursive: true });
  mkdirSync(join(systemdDir, `${serviceUnit}.d`), { recursive: true });
  mkdirSync(join(systemdDir, `${timerUnit}.d`), { recursive: true });
  mkdirSync(fakeSystemctlState, { recursive: true });
  symlinkSync(previousRelease, join(releasesRoot, "current"));
  writeFileSync(join(stateDir, "prior-state"), "before\n");
  writeFileSync(join(systemdDir, serviceUnit), "old service\n");
  writeFileSync(join(systemdDir, timerUnit), "old timer\n");
  writeFileSync(join(systemdDir, `${serviceUnit}.d`, "override.conf"), "old service drop-in\n");
  writeFileSync(join(systemdDir, `${timerUnit}.d`, "override.conf"), "old timer drop-in\n");
  writeFileSync(join(fakeSystemctlState, "enabled"), "enabled\n");
  writeFileSync(join(fakeSystemctlState, "active"), "active\n");
  writeFileSync(join(bundle, "REVISION"), `${version}\n`);
  writeFileSync(metricsPath, "clawsweeper_orchestrator_last_run_success 1\n");
  writeFileSync(
    join(bundle, "scripts", "verify-release.sh"),
    '#!/usr/bin/env bash\nset -euo pipefail\ntest -f "$1/REVISION"\n',
  );
  chmodSync(join(bundle, "scripts", "verify-release.sh"), 0o755);
  cpSync(
    new URL("../scripts/rollback-release.sh", import.meta.url),
    join(bundle, "scripts", "rollback-release.sh"),
  );
  chmodSync(join(bundle, "scripts", "rollback-release.sh"), 0o755);
  writeFileSync(
    join(bundle, "systemd", serviceUnit),
    "[Service]\nType=oneshot\nExecStart=/new-release\n",
  );
  writeFileSync(join(bundle, "systemd", timerUnit), "[Timer]\nOnCalendar=hourly\n");
  writeFileSync(
    fakeSystemctl,
    `#!/usr/bin/env bash
set -euo pipefail
state="${fakeSystemctlState}"
command="\${1:-}"
unit="\${*: -1}"
printf '%s\\n' "$*" >> "${fakeSystemctlLog}"
case "\${command}" in
  is-enabled)
    cat "\${state}/enabled"
    ;;
  is-active)
    if [ "\${unit}" = "${serviceUnit}" ]; then exit 3; fi
    [ "$(cat "\${state}/active")" = active ]
    ;;
  stop)
    if [ "\${unit}" = "${timerUnit}" ]; then
      evidence="$(find "${backupRoot}" -mindepth 2 -maxdepth 2 -name rollback-manifest.sha256 -print -quit)"
      [ -n "\${evidence}" ]
      test -f "\${evidence}.digest"
      test -f "$(dirname "\${evidence}")/rollback-layout.tsv"
      printf 'inactive\\n' > "\${state}/active"
    fi
    ;;
  start)
    if [ "\${unit}" = "${serviceUnit}" ]; then
      printf 'clawsweeper_healthcheck_last_run_timestamp_seconds 100\\nclawsweeper_healthcheck_success 1\\n' > "${healthcheckMetricsPath}"
    elif [ "\${unit}" = "${timerUnit}" ]; then
      printf 'active\\n' > "\${state}/active"
    fi
    ;;
  enable)
    printf 'enabled\\n' > "\${state}/enabled"
    if [ "\${2:-}" = --now ]; then printf 'active\\n' > "\${state}/active"; fi
    ;;
  disable)
    printf 'disabled\\n' > "\${state}/enabled"
    ;;
  mask)
    printf 'masked\\n' > "\${state}/enabled"
    ;;
  daemon-reload)
    ;;
  *)
    exit 64
    ;;
esac
`,
  );
  chmodSync(fakeSystemctl, 0o755);

  const installer = new URL("../scripts/install-release.sh", import.meta.url);
  const installed = spawnSync("/usr/bin/bash", [installer.pathname, bundle, version], {
    encoding: "utf8",
    env: {
      ...process.env,
      CLAWSWEEPER_RELEASES_ROOT: releasesRoot,
      CLAWSWEEPER_STATE_DIR: stateDir,
      CLAWSWEEPER_BACKUP_ROOT: backupRoot,
      CLAWSWEEPER_SYSTEMD_DIR: systemdDir,
      CLAWSWEEPER_LOCK_PATH: join(root, "shared.lock"),
      CLAWSWEEPER_LEGACY_ARTIFACT_ROOT: join(root, "missing-legacy-artifacts"),
      CLAWSWEEPER_LEGACY_HISTORY: join(root, "missing-legacy-history"),
      CLAWSWEEPER_SYSTEMCTL: fakeSystemctl,
      CLAWSWEEPER_METRICS_PATH: metricsPath,
      CLAWSWEEPER_HEALTHCHECK_METRICS_PATH: healthcheckMetricsPath,
      ...(options.corruptRollbackManifestDigest
        ? { CLAWSWEEPER_TEST_CORRUPT_ROLLBACK_MANIFEST_DIGEST: "1" }
        : {}),
    },
  });
  const backupDirs = readdirSync(backupRoot);
  assert.equal(backupDirs.length, 1);
  const fixture = {
    backupDir: join(backupRoot, backupDirs[0]),
    currentLink: join(releasesRoot, "current"),
    fakeSystemctl,
    fakeSystemctlLog,
    newRelease: join(releasesRoot, "releases", version),
    previousRelease,
    stateDir,
    systemdDir,
  };
  if (options.expectFailureBeforeCutover) {
    assert.notEqual(installed.status, 0, "corrupt rollback digest must abort installation");
    return fixture;
  }

  assert.equal(installed.status, 0, `${installed.stderr}\n${installed.stdout}`);
  writeFileSync(join(stateDir, "new-live-state"), "after\n");
  truncateSync(fakeSystemctlLog, 0);

  return fixture;
}

function assertRollbackRejectedWithoutMutation(fixture: Fixture): void {
  const rollback = new URL("../scripts/rollback-release.sh", import.meta.url);
  const result = spawnSync("/usr/bin/bash", [rollback.pathname, fixture.backupDir], {
    encoding: "utf8",
    env: { ...process.env, CLAWSWEEPER_SYSTEMCTL: fixture.fakeSystemctl },
  });

  assert.notEqual(result.status, 0, "tampered rollback evidence must be rejected");
  assert.equal(
    readFileSync(fixture.fakeSystemctlLog, "utf8"),
    "",
    "preflight rejection must occur before systemd mutation",
  );
  assert.equal(readFileSync(join(fixture.stateDir, "new-live-state"), "utf8"), "after\n");
  assert.equal(
    readFileSync(join(fixture.systemdDir, serviceUnit), "utf8"),
    "[Service]\nType=oneshot\nExecStart=/new-release\n",
  );
  assert.equal(readlinkSync(fixture.currentLink), fixture.newRelease);
}

test("rollback rejects every tampered reversal member before live mutation", async (t) => {
  const cases: Array<[string, (fixture: Fixture) => void]> = [
    [
      "manifest digest",
      ({ backupDir }) =>
        writeFileSync(join(backupDir, "rollback-manifest.sha256.digest"), `${"0".repeat(64)}\n`),
    ],
    [
      "service unit",
      ({ backupDir }) =>
        writeFileSync(join(backupDir, serviceUnit), "tampered service\n", { flag: "a" }),
    ],
    [
      "drop-in",
      ({ backupDir }) =>
        writeFileSync(join(backupDir, `${serviceUnit}.d`, "override.conf"), "tampered\n", {
          flag: "a",
        }),
    ],
    [
      "previous release target",
      ({ backupDir }) => writeFileSync(join(backupDir, "previous-target"), "/tampered/release\n"),
    ],
    [
      "path metadata",
      ({ backupDir }) => writeFileSync(join(backupDir, "state-dir"), "/tampered/state\n"),
    ],
    [
      "timer enabled state",
      ({ backupDir }) => writeFileSync(join(backupDir, "timer-enabled-state"), "masked\n"),
    ],
    [
      "timer active state",
      ({ backupDir }) => writeFileSync(join(backupDir, "timer-active-state"), "inactive\n"),
    ],
  ];

  for (const [name, tamper] of cases) {
    await t.test(name, () => {
      const fixture = installedFixture();
      assert.ok(existsSync(join(fixture.backupDir, "rollback-layout.tsv")));
      assert.ok(existsSync(join(fixture.backupDir, "rollback-manifest.sha256")));
      assert.ok(existsSync(join(fixture.backupDir, "rollback-manifest.sha256.digest")));
      tamper(fixture);
      assertRollbackRejectedWithoutMutation(fixture);
    });
  }
});

test("installer rejects a corrupt rollback manifest digest before cutover", () => {
  const fixture = installedFixture({
    corruptRollbackManifestDigest: true,
    expectFailureBeforeCutover: true,
  });

  assert.equal(
    readFileSync(fixture.fakeSystemctlLog, "utf8"),
    `is-enabled ${timerUnit}\nis-active --quiet ${timerUnit}\n`,
    "installer must reject the digest before timer stop or activation",
  );
  assert.equal(readFileSync(join(fixture.stateDir, "prior-state"), "utf8"), "before\n");
  assert.equal(readFileSync(join(fixture.systemdDir, serviceUnit), "utf8"), "old service\n");
  assert.equal(readlinkSync(fixture.currentLink), fixture.previousRelease);
  assert.equal(existsSync(fixture.newRelease), false);
});

test("release scripts keep comparison operators with their closing operand", () => {
  for (const relative of [
    "../scripts/amuze-orchestrator.sh",
    "../scripts/build-release.sh",
    "../scripts/install-release.sh",
    "../scripts/rollback-evidence.sh",
    "../scripts/rollback-release.sh",
    "../scripts/verify-release.sh",
  ]) {
    const path = new URL(relative, import.meta.url);
    assertNoLineEndingComparisonOperator(readFileSync(path, "utf8"), path.pathname);
  }
});

test("release comparison guard rejects split predicates independent of test command form", () => {
  const mutations = [
    [
      "bracket",
      `if [ "\${actual_digest}" !=
      "\${digest}" ]; then
  exit 1
fi
`,
    ],
    [
      "test",
      `if test "\${actual_digest}" !=
      "\${digest}"; then
  exit 1
fi
`,
    ],
    [
      "absolute-test",
      `if /usr/bin/test "\${attempts}" -ne
      "\${limit}"; then
  exit 1
fi
`,
    ],
    [
      "wrapped-test",
      `if command test "\${actual_digest}" =
      "\${digest}"; then
  exit 1
fi
`,
    ],
  ];

  for (const [name, mutation] of mutations) {
    assert.throws(
      () => assertNoLineEndingComparisonOperator(mutation, `split-${name}.sh`),
      new RegExp(`split-${name}\\.sh:1 ends a shell comparison`),
    );
  }
});

test("release comparison guard accepts the complete double-bracket comparison without false positives", () => {
  const currentDigestComparison = `# A comparison comment may end with !=
actual_digest=
if [[ "\${actual_digest}" != "\${digest}" ]]; then
  exit 1
fi
`;

  assert.doesNotThrow(() =>
    assertNoLineEndingComparisonOperator(currentDigestComparison, "complete-double-bracket.sh"),
  );
});
