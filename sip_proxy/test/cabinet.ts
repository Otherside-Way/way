import { writeFileSync } from "node:fs";

const KEY = "test-trunk-key-0123456789";
const MODE = process.env.MODE === "digest" ? "digest" : "ipauth";
writeFileSync("/shared/decrypt.key", "test-decrypt-key");

const carrier = { key: KEY, host: "172.30.0.30", port: 5060 };
const config = {
  publicIp: "172.30.0.10",
  modes: MODE === "digest" ? { digest: { ...carrier, user: "winberry_.at.cc.winberry", pass: "test-pass" } } : { ipauth: carrier },
};

Bun.serve({
  port: 3501,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/config/kamailio") return Response.json(config);
    if (url.pathname === "/trunk-key") {
      if (req.headers.get("x-trunk-key") !== KEY) return new Response("unknown", { status: 404 });
      return Response.json({ mode: MODE, route: "default", prefix: "" });
    }
    if (url.pathname === "/detokenize") return Response.json({ phone: "+380000000001" });
    return new Response("not found", { status: 404 });
  },
});
