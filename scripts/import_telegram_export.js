#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const DEFAULT_ROOM_ID = "export_6r_strategy_w_kwon_2026";
const DEFAULT_ROOM_TITLE = "6R전략_w/권_2026";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const part = argv[i];
    if (part.startsWith("--")) {
      const key = part.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) args[key] = true;
      else args[key] = next, i++;
    }
  }
  return args;
}

function readWranglerDbName() {
  const file = path.join(process.cwd(), "wrangler.toml");
  if (!fs.existsSync(file)) return "6r-ai-db";
  const text = fs.readFileSync(file, "utf8");
  const m = text.match(/database_name\s*=\s*"([^"]+)"/);
  return m ? m[1] : "6r-ai-db";
}

function winCommandExists(command) {
  if (process.platform !== "win32") return true;
  const result = spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/c", "where", command], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
  return result.status === 0;
}

function runWrangler(dbName, args, inputFile = "") {
  const localWrangler = path.join(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "wrangler.cmd" : "wrangler");
  const localWranglerJs = path.join(process.cwd(), "node_modules", "wrangler", "bin", "wrangler.js");
  const cmd = process.env.ComSpec || "cmd.exe";
  const candidates = process.platform === "win32"
    ? [
        ...(winCommandExists("npx.cmd") ? [{ command: cmd, prefix: ["/d", "/c", "npx.cmd", "wrangler"], shell: false }] : []),
        ...(fs.existsSync(localWranglerJs) ? [{ command: process.execPath, prefix: [localWranglerJs], shell: false }] : []),
        { command: localWrangler, prefix: [], shell: true },
        { command: cmd, prefix: ["/d", "/c", `"${localWrangler}"`], shell: false },
        ...(winCommandExists("wrangler.cmd") ? [{ command: cmd, prefix: ["/d", "/c", "wrangler.cmd"], shell: false }] : []),
      ]
    : [
        { command: "npx", prefix: ["wrangler"], shell: false },
        { command: localWrangler, prefix: [], shell: false },
        { command: "wrangler", prefix: [], shell: false },
      ];
  const errors = [];
  for (const candidate of candidates) {
    const fullArgs = [...candidate.prefix, "d1", "execute", dbName, "--remote", ...args];
    const capture = args.includes("--json");
    const result = spawnSync(candidate.command, fullArgs, {
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
      encoding: "utf8",
      shell: candidate.shell,
    });
    if (result.error) {
      errors.push([
        "wrangler 실행 실패",
        `command: ${candidate.command}`,
        `args: ${fullArgs.join(" ")}`,
        `error: ${result.error.message}`,
        "해결 안내: npm.cmd install 또는 npx.cmd wrangler --version 확인",
      ].join("\n"));
      continue;
    }
    if (result.status === 0) return result.stdout || "";
    errors.push([
      "wrangler 실행 실패",
      `command: ${candidate.command}`,
      `args: ${fullArgs.join(" ")}`,
      `exit: ${result.status}`,
      result.stderr || result.stdout || "",
      "해결 안내: npm.cmd install 또는 npx.cmd wrangler --version 확인",
    ].join("\n"));
  }
  throw new Error(errors.join("\n\n---\n\n") || "wrangler 실행 실패");
}

function sql(v) {
  if (v === null || v === undefined || v === "") return "NULL";
  return `'${String(v).replace(/'/g, "''")}'`;
}

function normalizeText(value) {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item.text === "string") return item.text;
      return "";
    }).join("");
  }
  if (typeof value === "string") return value;
  return "";
}

function hashText(value) {
  return crypto.createHash("sha1").update(String(value || "")).digest("hex").slice(0, 16);
}

function columnsFor(dbName, table) {
  const out = runWrangler(dbName, ["--command", `PRAGMA table_info(${table});`, "--json"]);
  const rows = parseWranglerResults(out);
  if (rows.length) return new Set(rows.map((r) => r.name));
  return new Set();
}

function parseWranglerResults(out) {
  try {
    const parsed = JSON.parse(out);
    return parsed?.[0]?.results || parsed?.results || [];
  } catch {
    return [];
  }
}

function queryRows(dbName, command) {
  const out = runWrangler(dbName, ["--command", command, "--json"]);
  return parseWranglerResults(out);
}

function insertSelect(table, values, existingColumns, whereNotExists = "") {
  const entries = Object.entries(values).filter(([key]) => existingColumns.has(key));
  if (!entries.length) return "";
  const cols = entries.map(([key]) => key).join(", ");
  const vals = entries.map(([, value]) => sql(value)).join(", ");
  if (whereNotExists) {
    return `INSERT INTO ${table} (${cols}) SELECT ${vals} WHERE NOT EXISTS (${whereNotExists});`;
  }
  return `INSERT INTO ${table} (${cols}) VALUES (${vals});`;
}

function updateWhere(table, values, existingColumns, whereClause = "") {
  const entries = Object.entries(values).filter(([key]) => existingColumns.has(key));
  if (!entries.length || !whereClause) return "";
  const set = entries.map(([key, value]) => `${key} = ${sql(value)}`).join(", ");
  return `UPDATE ${table} SET ${set} WHERE ${whereClause};`;
}

function userFromMessage(message) {
  const id = message.from_id || message.actor_id || "";
  const name = message.from || message.actor || "";
  if (!id && !name) return null;
  const normalizedName = String(name || "").toLowerCase().replace(/\s+/g, "_").replace(/[^\w가-힣]/g, "");
  return { id: String(id || `export:${normalizedName || hashText(name)}`), name: String(name || id) };
}

function contextMessages(messages, index, radius = 3) {
  const start = Math.max(0, index - radius);
  const end = Math.min(messages.length, index + radius + 1);
  const out = [];
  for (let i = start; i < end; i++) {
    const msg = messages[i];
    const text = normalizeText(msg?.text || msg?.caption).replace(/\s+/g, " ").trim();
    if (!text) continue;
    out.push({
      id: msg.id || "",
      date: msg.date || "",
      from: msg.from || msg.actor || "",
      text: text.slice(0, 500),
    });
  }
  return out.slice(0, 7);
}

function fileFromMessage(message, exportDir) {
  const filePath = message.file || message.photo || message.media || "";
  if (!filePath) return null;
  const fileName = path.basename(filePath);
  const absPath = path.resolve(exportDir, filePath);
  let size = Number(message.file_size || 0) || 0;
  if (!size && fs.existsSync(absPath)) size = fs.statSync(absPath).size;
  return {
    fileName,
    fileType: path.extname(fileName).replace(".", "").toLowerCase() || String(message.media_type || "file"),
    mimeType: message.mime_type || "",
    fileSize: size,
    localPath: filePath,
    absPath,
  };
}

function main() {
  const args = parseArgs(process.argv);
  const exportPath = args.path;
  if (!exportPath) throw new Error("Missing --path telegram export result.json");
  const roomTitle = args["room-title"] || DEFAULT_ROOM_TITLE;
  const roomId = args["room-id"] || DEFAULT_ROOM_ID;
  const dbName = args.db || readWranglerDbName();
  const fullPath = path.resolve(process.cwd(), exportPath);
  const exportDir = path.dirname(fullPath);
  const data = JSON.parse(fs.readFileSync(fullPath, "utf8"));
  const messages = Array.isArray(data.messages) ? data.messages : [];

  console.log(`Import target room: ${roomTitle}`);
  console.log(`Loaded messages: ${messages.length}`);
  console.log(`D1 database: ${dbName}`);

  const roomCols = columnsFor(dbName, "rooms");
  const userCols = columnsFor(dbName, "users");
  const aliasCols = columnsFor(dbName, "user_aliases");
  const roomPeopleCols = columnsFor(dbName, "room_people");
  const messageCols = columnsFor(dbName, "messages");
  const fileCols = columnsFor(dbName, "files");

  const statements = [];
  let importedMessages = 0;
  let importedFiles = 0;
  let skippedMessages = 0;
  let skippedFiles = 0;
  const seenMessages = new Set();
  const seenFiles = new Set();

  statements.push(insertSelect("rooms", {
    room_id: roomId,
    room_title: roomTitle,
    room_type: "telegram_export",
    source: "telegram_export",
    last_seen_at: new Date().toISOString(),
  }, roomCols, `SELECT 1 FROM rooms WHERE room_id = ${sql(roomId)}`));

  for (let messageIndex = 0; messageIndex < messages.length; messageIndex++) {
    const message = messages[messageIndex];
    if (message.type && message.type !== "message" && message.type !== "service") continue;
    const text = normalizeText(message.text || message.caption);
    const file = fileFromMessage(message, exportDir);
    const nearbyMessages = file ? contextMessages(messages, messageIndex, 3) : [];
    const nearbyText = nearbyMessages.map((item) => item.text).join(" / ");
    const fileContextText = text || nearbyText;
    const fileSummary = fileContextText
      ? fileContextText.slice(0, 1000)
      : (file ? `Telegram export file: ${file.fileName}` : "");
    const contentForMessage = text || (file ? `[file] ${file.fileName}\n${fileSummary}`.trim() : "");
    const user = userFromMessage(message);
    if (user) {
      statements.push(insertSelect("users", {
        telegram_id: user.id,
        chat_id: user.id,
        name: user.name,
        canonical_name: user.name,
        source: "telegram_export",
        last_seen_at: message.date || new Date().toISOString(),
      }, userCols, `SELECT 1 FROM users WHERE telegram_id = ${sql(user.id)}`));
      statements.push(updateWhere("users", {
        name: user.name,
        source: "telegram_export",
        last_seen_at: message.date || new Date().toISOString(),
        canonical_name: user.name,
      }, userCols, `telegram_id = ${sql(user.id)} AND (canonical_name IS NULL OR canonical_name = '')`));
      statements.push(updateWhere("users", {
        name: user.name,
        source: "telegram_export",
        last_seen_at: message.date || new Date().toISOString(),
      }, userCols, `telegram_id = ${sql(user.id)}`));
      statements.push(insertSelect("user_aliases", {
        telegram_id: user.id,
        alias_name: user.name,
        source: "telegram_export",
        source_room_id: roomId,
        source_room_title: roomTitle,
        source_table: "messages",
        source_id: String(message.id || ""),
        last_seen_at: message.date || new Date().toISOString(),
        count: 1,
      }, aliasCols, `SELECT 1 FROM user_aliases WHERE telegram_id = ${sql(user.id)} AND alias_name = ${sql(user.name)}`));
      statements.push(insertSelect("room_people", {
        room_id: roomId,
        room_title: roomTitle,
        telegram_id: user.id,
        person_name: user.name,
        canonical_name: user.name,
        source: "telegram_export",
        confidence: "confirmed",
        last_seen_at: message.date || new Date().toISOString(),
      }, roomPeopleCols, `SELECT 1 FROM room_people WHERE room_id = ${sql(roomId)} AND telegram_id = ${sql(user.id)}`));
    }

    const exportMessageId = message.id ? String(message.id) : hashText(`${message.date}|${user?.id || ""}|${contentForMessage}`);
    const dedupeKey = `${roomId}|${exportMessageId}`;
    if (seenMessages.has(dedupeKey)) {
      skippedMessages++;
    } else {
      seenMessages.add(dedupeKey);
      const fallbackHash = hashText(`${roomId}|${message.date}|${user?.id || ""}|${contentForMessage}`);
      const where = messageCols.has("telegram_message_id")
        ? `SELECT 1 FROM messages WHERE room_id = ${sql(roomId)} AND telegram_message_id = ${sql(exportMessageId)}`
        : `SELECT 1 FROM messages WHERE room_id = ${sql(roomId)} AND created_at = ${sql(message.date)} AND sender_id = ${sql(user?.id || "")} AND content = ${sql(contentForMessage.slice(0, 4000))}`;
      if (contentForMessage) {
        statements.push(insertSelect("messages", {
          telegram_message_id: exportMessageId,
          export_message_id: exportMessageId,
          room_id: roomId,
          room_title: roomTitle,
          sender_id: user?.id || "",
          sender_name: user?.name || "",
          content: contentForMessage,
          raw_json: JSON.stringify(message),
          saved_by: "telegram_export_importer",
          source_type: "telegram_export",
          created_at: message.date || new Date().toISOString(),
          message_hash: fallbackHash,
        }, messageCols, where));
        importedMessages++;
      } else {
        skippedMessages++;
      }
    }

    if (file) {
      const fileKey = `${roomId}|${file.fileName}|${file.fileSize}|${message.date || ""}`;
      if (seenFiles.has(fileKey)) {
        skippedFiles++;
      } else {
        seenFiles.add(fileKey);
        const where = `SELECT 1 FROM files WHERE room_id = ${sql(roomId)} AND file_name = ${sql(file.fileName)} AND COALESCE(file_size, 0) = ${Number(file.fileSize) || 0} AND created_at = ${sql(message.date || "")}`;
        statements.push(insertSelect("files", {
          uploader_id: user?.id || "",
          uploader_name: user?.name || "",
          sender_id: user?.id || "",
          sender_name: user?.name || "",
          file_name: file.fileName,
          file_type: file.fileType,
          mime_type: file.mimeType,
          file_size: file.fileSize,
          content: fileContextText,
          summary: fileSummary,
          extracted_text: fileContextText,
          room_id: roomId,
          room_title: roomTitle,
          telegram_file_id: null,
          telegram_file_unique_id: null,
          r2_key: file.localPath,
          tags_json: JSON.stringify({
            source_type: "telegram_export",
            local_path: file.localPath,
            abs_path: file.absPath,
            export_path: file.localPath,
            source_room: roomTitle,
            context_messages: nearbyMessages,
          }),
          saved_by: "telegram_export_importer",
          source_type: "telegram_export",
          created_at: message.date || new Date().toISOString(),
        }, fileCols, where));
        statements.push(updateWhere("files", {
          content: fileContextText,
          summary: fileSummary,
          extracted_text: fileContextText,
          tags_json: JSON.stringify({
            source_type: "telegram_export",
            local_path: file.localPath,
            abs_path: file.absPath,
            export_path: file.localPath,
            source_room: roomTitle,
            context_messages: nearbyMessages,
          }),
          saved_by: "telegram_export_importer",
          source_type: "telegram_export",
        }, fileCols, `room_id = ${sql(roomId)} AND file_name = ${sql(file.fileName)} AND COALESCE(file_size, 0) = ${Number(file.fileSize) || 0} AND created_at = ${sql(message.date || "")}`));
        importedFiles++;
      }
    }
  }

  const sqlFile = path.join(os.tmpdir(), `telegram_export_import_${Date.now()}.sql`);
  fs.writeFileSync(sqlFile, statements.filter(Boolean).join("\n"), "utf8");
  runWrangler(dbName, ["--file", sqlFile]);
  fs.unlinkSync(sqlFile);

  console.log(`Imported messages: ${importedMessages}`);
  console.log(`Skipped duplicate messages: ${skippedMessages}`);
  console.log(`Imported files: ${importedFiles}`);
  console.log(`Skipped duplicate files: ${skippedFiles}`);
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
