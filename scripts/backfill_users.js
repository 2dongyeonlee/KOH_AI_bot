#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");

function sql(v) {
  if (v === null || v === undefined || v === "") return "NULL";
  return `'${String(v).replace(/'/g, "''")}'`;
}

function readWranglerDbName() {
  const file = path.join(process.cwd(), "wrangler.toml");
  if (!fs.existsSync(file)) return "6r-ai-db";
  const text = fs.readFileSync(file, "utf8");
  const m = text.match(/database_name\s*=\s*"([^"]+)"/);
  return m ? m[1] : "6r-ai-db";
}

function runWrangler(dbName, args) {
  const localWranglerJs = path.join(process.cwd(), "node_modules", "wrangler", "bin", "wrangler.js");
  const candidates = process.platform === "win32"
    ? [
        { command: process.execPath, prefix: [localWranglerJs], shell: false },
        { command: process.env.ComSpec || "cmd.exe", prefix: ["/d", "/c", "npx.cmd", "wrangler"], shell: false },
      ]
    : [
        { command: "npx", prefix: ["wrangler"], shell: false },
        { command: "wrangler", prefix: [], shell: false },
      ];
  const errors = [];
  for (const candidate of candidates) {
    const fullArgs = [...candidate.prefix, "d1", "execute", dbName, "--remote", ...args];
    const result = spawnSync(candidate.command, fullArgs, { stdio: "inherit", encoding: "utf8", shell: candidate.shell });
    if (!result.error && result.status === 0) return;
    errors.push(`${candidate.command} ${fullArgs.join(" ")}\n${result.error?.message || `exit ${result.status}`}`);
  }
  throw new Error(`wrangler 실행 실패\n${errors.join("\n---\n")}`);
}

function main() {
  const dbName = readWranglerDbName();
  const statements = [];

  statements.push(`
INSERT INTO users (telegram_id, name, canonical_name, source, last_seen_at)
SELECT sender_id, sender_name, sender_name, 'backfill_messages', MAX(created_at)
FROM messages
WHERE sender_id IS NOT NULL AND sender_id != '' AND sender_name IS NOT NULL AND sender_name != ''
GROUP BY sender_id, sender_name
ON CONFLICT(telegram_id) DO UPDATE SET
  name = COALESCE(NULLIF(users.name, ''), excluded.name),
  canonical_name = COALESCE(NULLIF(users.canonical_name, ''), excluded.canonical_name),
  last_seen_at = MAX(users.last_seen_at, excluded.last_seen_at);
`);

  statements.push(`
INSERT INTO users (telegram_id, name, canonical_name, source, last_seen_at)
SELECT uploader_id, uploader_name, uploader_name, 'backfill_files', MAX(created_at)
FROM files
WHERE uploader_id IS NOT NULL AND uploader_id != '' AND uploader_name IS NOT NULL AND uploader_name != ''
GROUP BY uploader_id, uploader_name
ON CONFLICT(telegram_id) DO UPDATE SET
  name = COALESCE(NULLIF(users.name, ''), excluded.name),
  canonical_name = COALESCE(NULLIF(users.canonical_name, ''), excluded.canonical_name),
  last_seen_at = MAX(users.last_seen_at, excluded.last_seen_at);
`);

  statements.push(`
INSERT OR IGNORE INTO user_aliases (telegram_id, alias_name, source, source_room_id, source_room_title, source_table, first_seen_at, last_seen_at, count)
SELECT sender_id, sender_name, 'backfill_messages', room_id, room_title, 'messages', MIN(created_at), MAX(created_at), COUNT(*)
FROM messages
WHERE sender_id IS NOT NULL AND sender_id != '' AND sender_name IS NOT NULL AND sender_name != ''
GROUP BY sender_id, sender_name;
`);

  statements.push(`
INSERT OR IGNORE INTO user_aliases (telegram_id, alias_name, source, source_room_id, source_room_title, source_table, first_seen_at, last_seen_at, count)
SELECT uploader_id, uploader_name, 'backfill_files', room_id, room_title, 'files', MIN(created_at), MAX(created_at), COUNT(*)
FROM files
WHERE uploader_id IS NOT NULL AND uploader_id != '' AND uploader_name IS NOT NULL AND uploader_name != ''
GROUP BY uploader_id, uploader_name;
`);

  statements.push(`
INSERT INTO room_people (room_id, room_title, telegram_id, person_name, canonical_name, source, confidence, first_seen_at, last_seen_at, updated_at)
SELECT room_id, room_title, sender_id, sender_name, COALESCE(NULLIF(u.canonical_name, ''), sender_name), 'backfill_messages', 'confirmed', MIN(m.created_at), MAX(m.created_at), CURRENT_TIMESTAMP
FROM messages m
LEFT JOIN users u ON CAST(u.telegram_id AS TEXT) = CAST(m.sender_id AS TEXT)
WHERE sender_id IS NOT NULL AND sender_id != '' AND sender_name IS NOT NULL AND sender_name != ''
GROUP BY room_id, sender_id, sender_name;
`);

  statements.push(`
INSERT INTO room_people (room_id, room_title, telegram_id, person_name, canonical_name, source, confidence, first_seen_at, last_seen_at, updated_at)
SELECT room_id, room_title, uploader_id, uploader_name, COALESCE(NULLIF(u.canonical_name, ''), uploader_name), 'backfill_files', 'confirmed', MIN(f.created_at), MAX(f.created_at), CURRENT_TIMESTAMP
FROM files f
LEFT JOIN users u ON CAST(u.telegram_id AS TEXT) = CAST(f.uploader_id AS TEXT)
WHERE uploader_id IS NOT NULL AND uploader_id != '' AND uploader_name IS NOT NULL AND uploader_name != ''
GROUP BY room_id, uploader_id, uploader_name;
`);

  const sqlFile = path.join(os.tmpdir(), `koh_backfill_users_${Date.now()}.sql`);
  fs.writeFileSync(sqlFile, statements.join("\n"), "utf8");
  runWrangler(dbName, ["--file", sqlFile]);
  fs.unlinkSync(sqlFile);
  console.log("Backfilled users/aliases/room_people from messages and files.");
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
