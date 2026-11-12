import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const doctorScript = join(import.meta.dir, "..", "bundle", "doctor.sh");
const tempDirs: string[] = [];

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

const fakeDocker = `#!/usr/bin/env bash
printf '%s\\n' "$*" >>"$FAKE_DOCKER_LOG"
case "$*" in
  *"exec -T cabinet bun src/cli.ts status --get core.slug"*) echo acme ;;
  *"exec -T cabinet bun src/cli.ts doctor"*) printf 'ok\\tthe cabinet doctor ran\\n' ;;
  compose*" logs "*) echo "[entrypoint] Starting Kamailio on 203.0.113.10:$FAKE_SIP branches: ipauth" ;;
  compose*" ps --format"*) printf 'cabinet running healthy\\nkamailio running \\nrtpengine running \\n' ;;
  compose*" ps -q"*) ;;
  "ps -a --filter label=com.docker.compose.service=cabinet"*) printf '%b' "$FAKE_STACKS" ;;
  "ps -q --filter publish="*) case "$*" in *"label=com.docker.compose.project=$FAKE_PROJECT"*) echo c0ffee ;; esac ;;
esac
exit 0
`;

const stacks = [
  "hidden-numbers\t/opt/hidden-numbers\trunning\t0.0.0.0:3500->3500/tcp, [::]:3500->3500/tcp",
  "hidden-numbers-globex\t/opt/hidden-numbers-globex\trunning\t0.0.0.0:3501->3500/tcp",
  "hidden-numbers-initech\t/opt/hidden-numbers-initech\texited\t",
].join("\\n") + "\\n";

function runDoctor(env: string[], fake: { project: string; sip: string }, eol = "\n") {
  const dir = mkdtempSync(join(tmpdir(), "hn-doctor-"));
  tempDirs.push(dir);
  const bin = join(dir, "bin");
  const hnDir = join(dir, "stack");
  mkdirSync(bin, { recursive: true });
  mkdirSync(hnDir, { recursive: true });
  writeFileSync(join(bin, "docker"), fakeDocker);
  writeFileSync(join(bin, "ufw"), "#!/bin/sh\necho 'Status: inactive'\n");
  writeFileSync(join(bin, "ss"), "#!/bin/sh\nexit 0\n");
  for (const name of ["docker", "ufw", "ss"]) chmodSync(join(bin, name), 0o755);
  writeFileSync(join(hnDir, ".env"), env.join(eol) + eol);
  const log = join(dir, "docker.log");
  writeFileSync(log, "");
  const proc = Bun.spawnSync(["bash", doctorScript], {
    env: {
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      HOME: process.env.HOME ?? "",
      HN_DIR: hnDir,
      FAKE_DOCKER_LOG: log,
      FAKE_PROJECT: fake.project,
      FAKE_SIP: fake.sip,
      FAKE_STACKS: stacks,
    },
  });
  const out = proc.stdout.toString().replace(/\x1b\[[0-9;]*m/g, "");
  return { out, calls: readFileSync(log, "utf8"), hnDir, exitCode: proc.exitCode };
}

const otherStacks = (out: string) => out.split("Other Hidden Numbers stacks on this server")[1]?.split("\nResult")[0] ?? "";

describe("doctor.sh", () => {
  test("a classic install is checked on 3500, 5060 and 30000-30500 under the hidden-numbers project", () => {
    const { out, calls, hnDir } = runDoctor(["COMPOSE_PROJECT_NAME=hidden-numbers", "HN_IMAGE_CABINET=c", "RTPENGINE_INTERFACE=203.0.113.10", "CABINET_BIND=0.0.0.0"], {
      project: "hidden-numbers",
      sip: "5060",
    });
    expect(out).toContain(`Hidden Numbers for acme: ${hnDir}, cabinet :3500, SIP 5060, media 30000-30500/udp`);
    expect(calls).toContain("ps -q --filter publish=3500/tcp --filter label=com.docker.compose.project=hidden-numbers");
    expect(out).toContain("cabinet is published on 3500/tcp");
    expect(out).toContain("SIP is published on 5060/udp");
    expect(out).toContain("make sure the provider firewall opens 3500/tcp, 5060/udp+tcp and 30000-30500/udp");
    expect(otherStacks(out)).toMatch(/hidden-numbers-globex\s+\/opt\/hidden-numbers-globex\s+cabinet :3501/);
    expect(otherStacks(out)).not.toMatch(/^\s*hidden-numbers\s/m);
  });

  test("a named instance is checked on its own ports and project, and lists the other stacks", () => {
    const { out, calls, hnDir } = runDoctor(
      [
        "COMPOSE_PROJECT_NAME=hidden-numbers-globex",
        "HN_SLUG=globex",
        "CABINET_PORT=3501",
        "SIP_PORT=5062",
        "RTP_MIN=31000",
        "RTP_MAX=31500",
        "CABINET_BIND=0.0.0.0",
      ],
      { project: "hidden-numbers-globex", sip: "5062" },
    );
    expect(out).toContain(`Hidden Numbers for globex: ${hnDir}, cabinet :3501, SIP 5062, media 31000-31500/udp`);
    expect(calls).toContain("ps -q --filter publish=3501/tcp --filter label=com.docker.compose.project=hidden-numbers-globex");
    expect(calls).toContain("ps -q --filter publish=5062/udp --filter label=com.docker.compose.project=hidden-numbers-globex");
    expect(out).toContain("cabinet is published on 3501/tcp");
    expect(out).toContain("make sure the provider firewall opens 3501/tcp, 5062/udp+tcp and 31000-31500/udp");
    expect(calls).not.toContain("status --get core.slug");
    const others = otherStacks(out);
    expect(others).toMatch(/hidden-numbers\s+\/opt\/hidden-numbers\s+cabinet :3500/);
    expect(others).toMatch(/hidden-numbers-initech\s+\/opt\/hidden-numbers-initech\s+cabinet exited/);
    expect(others).not.toContain("hidden-numbers-globex");
  });

  test("quoted values and windows line endings in .env are read as plain values", () => {
    const { out, calls, hnDir } = runDoctor(
      ['COMPOSE_PROJECT_NAME="hidden-numbers-globex"', "HN_SLUG='globex'", 'CABINET_PORT="3501"', "SIP_PORT='5062'", 'RTP_MIN="31000"', "RTP_MAX=31500"],
      { project: "hidden-numbers-globex", sip: "5062" },
      "\r\n",
    );
    expect(out).toContain(`Hidden Numbers for globex: ${hnDir}, cabinet :3501, SIP 5062, media 31000-31500/udp`);
    expect(calls).toContain("ps -q --filter publish=3501/tcp --filter label=com.docker.compose.project=hidden-numbers-globex");
    expect(otherStacks(out)).not.toContain("hidden-numbers-globex");
  });
});
