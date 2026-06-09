#!/usr/bin/env node
"use strict";
/**
 * scripts/migrate_schema.js
 * D1 remote DB에 export 인제스트 필수 컬럼 추가.
 * PRAGMA table_info로 기존 컬럼 확인 후 없는 것만 ALTER TABLE.
 * 기존 데이터/테이블 삭제 없음.
 *
 * 사용:
 *   node scripts/migrate_schema.js
 *   node scripts/migrate_schema.js --db 6r-ai-db
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function readWranglerDbName() {
  const file = path.join(process.cwd(), "wrangler.toml");
  if (!fs.existsSync(file)) return "6r-ai-db";
  const text = fs.readFileSync(file, "utf8");
  const m = text.match(/database_name\s*=\s*"([^"]+)"/);
  return m ? m[1] : "6r-ai-db";
}

function runWrangler(dbName, args) {
  const localWrangler = path.join(
    process.cwd(), "node_modules", ".bin",
    process.platform === "win32" ? "wrangler.cmd" : "wrangler"
  );
  const candidates = process.platform === "win32"
    ? [
        { command: process.env.ComSpec || "cmd.exe", prefix: ["/d", "/c", "npx.cmd", "wrangler"], shell: false },
        { command: localWrangler, prefix: [], shell: true },
        { command: process.env.ComSpec || "cmd.exe", prefix: ["/d", "/c", "wrangler.cmd"], shell: false },
      ]
    : [
        { command: "wrangler", prefix: [], shell: false },
        { command: "npx", prefix: ["wrangler"], shell: false },
        { command: localWrangler, prefix: [], shell: false },
      ];

  const capture = args.includes("--json");
  const errors = [];
  for (const c of candidates) {
    const fullArgs = [...c.prefix, "d1", "execute", dbName, "--remote", ...args];
    const r = spawnSync(c.command, fullArgs, {
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
      encoding: "utf8",
      shell: c.shell || false,
    });
    if (r.error) { errors.push(`${c.command}: ${r.error.message}`); continue; }
    if (r.status === 0) return r.stdout || "";
    errors.push(`${c.command} exit ${r.status}: ${(r.stderr || r.stdout || "").slice(0, 300)}`);
  }
  throw new Error(["wrangler 실행 실패", ...errors].join("\n"));
}

function getExistingColumns(dbName, table) {
  try {
    const out = runWrangler(dbName, ["--command", `PRAGMA table_info(${table});`, "--json"]);
    const parsed = JSON.parse(out);
    const rows = parsed?.[0]?.results || parsed?.results || [];
    return new Set(rows.map(r => r.name));
  } catch (e) {
    console.error(`PRAGMA table_info(${table}) 실패: ${e.message}`);
    return null;
  }
}

function addColumn(dbName, table, col, def) {
  const stmt = `ALTER TABLE ${table} ADD COLUMN ${col} ${def};`;
  try {
    runWrangler(dbName, ["--command", stmt]);
    console.log(`  ✅ ${table}.${col} 추가`);
    return true;
  } catch (e) {
    const msg = String(e.message);
    if (msg.includes("duplicate column") || msg.includes("already exists")) {
      console.log(`  ⏩ ${table}.${col} 이미 존재 (skip)`);
      return false;
    }
    throw e;
  }
}

const SCHEMA = {
  files: [
    ["source_type",      "TEXT DEFAULT ''"],
    ["source_status",    "TEXT DEFAULT 'legacy'"],
    ["original_room",    "TEXT DEFAULT ''"],
    ["source_path",      "TEXT DEFAULT ''"],
    ["media_group_key",  "TEXT DEFAULT ''"],
    ["from_name",        "TEXT DEFAULT ''"],
    ["from_id",          "TEXT DEFAULT ''"],
    ["telegram_message_id", "TEXT DEFAULT ''"],
  ],
  messages: [
    ["source_type",           "TEXT DEFAULT ''"],
    ["source_status",         "TEXT DEFAULT 'legacy'"],
    ["original_room",         "TEXT DEFAULT ''"],
    ["from_name",             "TEXT DEFAULT ''"],
    ["from_id",               "TEXT DEFAULT ''"],
    ["reply_to_message_id",   "TEXT DEFAULT ''"],
    ["telegram_message_id",   "TEXT DEFAULT ''"],
  ],
};

function main() {
  const argv = process.argv.slice(2);
  const dbArg = argv.indexOf("--db");
  const dbName = dbArg >= 0 ? argv[dbArg + 1] : readWranglerDbName();

  console.log(`\n=== D1 Schema Migration ===`);
  console.log(`DB: ${dbName}\n`);

  let totalAdded = 0;
  let totalSkipped = 0;
  let failed = false;

  for (const [table, cols] of Object.entries(SCHEMA)) {
    console.log(`[${table}] PRAGMA 조회 중...`);
    const existing = getExistingColumns(dbName, table);
    if (!existing) {
      console.error(`  ❌ ${table} 테이블 조회 실패. DB 접근 또는 테이블 존재 여부 확인 필요.`);
      failed = true;
      continue;
    }
    console.log(`  기존 컬럼: ${[...existing].join(", ")}`);

    for (const [col, def] of cols) {
      if (existing.has(col)) {
        console.log(`  ⏩ ${table}.${col} 이미 존재 (skip)`);
        totalSkipped++;
        continue;
      }
      try {
        addColumn(dbName, table, col, def);
        totalAdded++;
      } catch (e) {
        console.error(`  ❌ ${table}.${col} 추가 실패: ${e.message.slice(0, 200)}`);
        failed = true;
      }
    }
    console.log("");
  }

  console.log("=== 완료 ===");
  console.log(`추가된 컬럼: ${totalAdded}개`);
  console.log(`이미 존재(skip): ${totalSkipped}개`);
  if (failed) {
    console.error("일부 실패. 위 오류를 확인하세요.");
    process.exit(1);
  } else {
    console.log("✅ 스키마 마이그레이션 성공");
  }
}

try {
  main();
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
