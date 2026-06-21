const { execFileSync } = require("node:child_process");

const rawPort = process.argv[2] || process.env.PORT || "2026";
const port = Number(rawPort);
const waitMs = Number(process.env.KILL_PORT_WAIT_MS || 5000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`Invalid port: ${rawPort}`);
  process.exit(1);
}

function listeningPids() {
  try {
    const output = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return [...new Set(output.split(/\s+/).filter(Boolean))];
  } catch {
    return [];
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function kill(pids, signal) {
  for (const pid of pids) {
    try {
      process.kill(Number(pid), signal);
      console.log(`${signal} process ${pid} on port ${port}`);
    } catch (err) {
      if (err.code !== "ESRCH") {
        console.warn(`Could not ${signal} process ${pid} on port ${port}: ${err.message}`);
      }
    }
  }
}

const initial = listeningPids();
if (!initial.length) process.exit(0);

kill(initial, "SIGTERM");

const deadline = Date.now() + waitMs;
while (Date.now() < deadline) {
  const remaining = listeningPids();
  if (!remaining.length) process.exit(0);
  sleep(100);
}

const stubborn = listeningPids();
if (stubborn.length) {
  kill(stubborn, "SIGKILL");
}

while (Date.now() < deadline + 1000) {
  const remaining = listeningPids();
  if (!remaining.length) process.exit(0);
  sleep(100);
}

const stillListening = listeningPids();
if (stillListening.length) {
  console.error(`Port ${port} is still busy after kill attempts: ${stillListening.join(", ")}`);
  process.exit(1);
}
