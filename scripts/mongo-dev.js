const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const command = process.argv[2] || "start";
const root = process.cwd();
const dataDir = path.join(root, ".mongo-data");
const logDir = path.join(root, ".mongo-log");
const logPath = path.join(logDir, "mongod.log");
const port = process.env.MONGO_PORT || "27017";

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

function ensureMongod() {
  const found = spawnSync("mongod", ["--version"], { stdio: "ignore" });
  if (found.status !== 0) {
    console.error("mongod was not found. Install MongoDB locally or set DATABASE_URL to a reachable MongoDB.");
    process.exit(1);
  }
}

function start() {
  const pids = listeningPids();
  if (pids.length) {
    console.log(`MongoDB already listening on port ${port} (pid ${pids.join(", ")}).`);
    return;
  }

  ensureMongod();
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(logDir, { recursive: true });

  const result = spawnSync(
    "mongod",
    [
      "--dbpath",
      dataDir,
      "--bind_ip",
      "127.0.0.1",
      "--port",
      port,
      "--logpath",
      logPath,
      "--fork",
    ],
    { encoding: "utf8" },
  );

  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || "");
    console.error(`Failed to start MongoDB. See ${logPath}`);
    process.exit(result.status || 1);
  }

  process.stdout.write(result.stdout || "");
}

function stop() {
  const pids = listeningPids();
  if (!pids.length) {
    console.log(`MongoDB is not listening on port ${port}.`);
    return;
  }
  for (const pid of pids) {
    process.kill(Number(pid), "SIGTERM");
    console.log(`Stopped MongoDB pid ${pid} on port ${port}.`);
  }
}

if (command === "start") start();
else if (command === "stop") stop();
else {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}
