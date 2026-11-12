import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const composeFile = join(import.meta.dir, "..", "bundle", "docker-compose.yml");
const cleanEnv = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" };
const dockerCompose = Bun.spawnSync(["docker", "compose", "version"], { env: cleanEnv, stdout: "ignore", stderr: "ignore" }).exitCode === 0;
const tempDirs: string[] = [];

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

const installerEnv = [
  "COMPOSE_PROJECT_NAME=hidden-numbers",
  "HN_VERSION=0.6.1",
  "HN_IMAGE_CABINET=ghcr.io/otherside-way/hn-cabinet:0.6.1",
  "HN_IMAGE_KAMAILIO=ghcr.io/otherside-way/hn-kamailio:0.6.1",
  "HN_IMAGE_RTPENGINE=ghcr.io/otherside-way/hn-rtpengine:0.6.1",
  "RTPENGINE_INTERFACE=10.0.0.5!203.0.113.10",
  "CABINET_DOMAIN=",
  "CABINET_BIND=0.0.0.0",
];

type Port = { host_ip?: string; target: number; published: string; protocol: string };
type Rendered = {
  name: string;
  services: Record<string, { ports?: Port[]; environment?: Record<string, string>; command?: string[] }>;
  networks: Record<string, { name: string; ipam: { config: { subnet: string; gateway: string }[] } }>;
  volumes: Record<string, { name: string }>;
};

function render(lines: string[]): Rendered {
  const dir = mkdtempSync(join(tmpdir(), "hn-compose-"));
  tempDirs.push(dir);
  const envFile = join(dir, ".env");
  writeFileSync(envFile, lines.join("\n") + "\n");
  const proc = Bun.spawnSync(["docker", "compose", "-f", composeFile, "--env-file", envFile, "config", "--format", "json"], { env: cleanEnv });
  if (proc.exitCode !== 0) throw new Error(proc.stderr.toString());
  return JSON.parse(proc.stdout.toString()) as Rendered;
}

const pick = (env: Record<string, string> | undefined, keys: string[]) => Object.fromEntries(keys.map((k) => [k, env?.[k]]));

function summary(r: Rendered) {
  return {
    project: r.name,
    network: r.networks.default.name,
    ipam: r.networks.default.ipam.config,
    volumes: Object.fromEntries(Object.entries(r.volumes).map(([k, v]) => [k, v.name])),
    ports: Object.fromEntries(
      Object.entries(r.services).map(([name, svc]) => [name, (svc.ports ?? []).map((p) => `${p.host_ip ?? ""}:${p.published}:${p.target}/${p.protocol}`).sort()]),
    ),
    cabinetEnv: pick(r.services.cabinet.environment, ["PORT", "CABINET_PORT", "SIP_PORT", "RTPENGINE_NG", "HN_SLUG"]),
    kamailioEnv: pick(r.services.kamailio.environment, ["SIP_PORT", "RTPENGINE_SOCK"]),
    rtpengine: r.services.rtpengine.command,
  };
}

const classic = {
  project: "hidden-numbers",
  network: "hidden-numbers",
  ipam: [{ subnet: "172.28.0.0/16", gateway: "172.28.0.1" }],
  volumes: { "cabinet-data": "hn-cabinet-data", shared: "hn-shared", "kamailio-data": "hn-kamailio-data" },
  ports: { cabinet: ["0.0.0.0:3500:3500/tcp"], kamailio: [":5060:5060/tcp", ":5060:5060/udp"], rtpengine: [] },
  cabinetEnv: { PORT: "3500", CABINET_PORT: "3500", SIP_PORT: "5060", RTPENGINE_NG: "172.28.0.1:22222", HN_SLUG: undefined },
  kamailioEnv: { SIP_PORT: "5060", RTPENGINE_SOCK: "udp:172.28.0.1:22222" },
  rtpengine: [
    "rtpengine",
    "--interface=10.0.0.5!203.0.113.10",
    "--listen-ng=172.28.0.1:22222",
    "--listen-http=172.28.0.1:8080",
    "--port-min=30000",
    "--port-max=30500",
    "--log-level=5",
  ],
};

describe.skipIf(!dockerCompose)("bundle compose", () => {
  test("an install from 0.4–0.6 with only the installer keys renders exactly the classic stack", () => {
    expect(summary(render(installerEnv))).toEqual(classic);
  });

  test("the oldest installs without COMPOSE_PROJECT_NAME in .env render exactly the classic stack", () => {
    expect(summary(render(installerEnv.filter((line) => !line.startsWith("COMPOSE_PROJECT_NAME="))))).toEqual(classic);
  });

  test("a classic install on a moved sip port changes only the sip port", () => {
    expect(summary(render([...installerEnv, "SIP_PORT=5061"]))).toEqual({
      ...classic,
      ports: { ...classic.ports, kamailio: [":5061:5061/tcp", ":5061:5061/udp"] },
      cabinetEnv: { ...classic.cabinetEnv, SIP_PORT: "5061" },
      kamailioEnv: { ...classic.kamailioEnv, SIP_PORT: "5061" },
    });
  });

  test("a named instance takes its project, network, volumes, ports and media range from .env", () => {
    const r = render([
      ...installerEnv.filter((line) => !line.startsWith("COMPOSE_PROJECT_NAME=")),
      "COMPOSE_PROJECT_NAME=hidden-numbers-globex",
      "HN_SLUG=globex",
      "HN_NETWORK=hidden-numbers-globex",
      "HN_SUBNET=10.228.1.0/24",
      "HN_GATEWAY=10.228.1.1",
      "HN_VOLUME_PREFIX=hn-globex",
      "CABINET_PORT=3501",
      "SIP_PORT=5062",
      "RTP_MIN=31000",
      "RTP_MAX=31500",
    ]);
    expect(summary(r)).toEqual({
      project: "hidden-numbers-globex",
      network: "hidden-numbers-globex",
      ipam: [{ subnet: "10.228.1.0/24", gateway: "10.228.1.1" }],
      volumes: { "cabinet-data": "hn-globex-cabinet-data", shared: "hn-globex-shared", "kamailio-data": "hn-globex-kamailio-data" },
      ports: { cabinet: ["0.0.0.0:3501:3500/tcp"], kamailio: [":5062:5062/tcp", ":5062:5062/udp"], rtpengine: [] },
      cabinetEnv: { PORT: "3500", CABINET_PORT: "3501", SIP_PORT: "5062", RTPENGINE_NG: "10.228.1.1:22222", HN_SLUG: undefined },
      kamailioEnv: { SIP_PORT: "5062", RTPENGINE_SOCK: "udp:10.228.1.1:22222" },
      rtpengine: [
        "rtpengine",
        "--interface=10.0.0.5!203.0.113.10",
        "--listen-ng=10.228.1.1:22222",
        "--listen-http=10.228.1.1:8080",
        "--port-min=31000",
        "--port-max=31500",
        "--log-level=5",
      ],
    });
  });
});
