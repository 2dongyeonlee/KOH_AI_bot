#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const DEFAULT_DB = "6r-ai-db";

function parseArgs(argv) {
  const args = { positional: [] };
  for (let i = 2; i < argv.length; i++) {
    const item = argv[i];
    if (!item.startsWith("--")) {
      args.positional.push(item);
      continue;
    }
    const key = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) args[key] = true;
    else args[key] = next, i++;
  }
  return args;
}

function readWranglerDbName() {
  const file = path.join(process.cwd(), "wrangler.toml");
  if (!fs.existsSync(file)) return DEFAULT_DB;
  const text = fs.readFileSync(file, "utf8");
  return text.match(/database_name\s*=\s*"([^"]+)"/)?.[1] || DEFAULT_DB;
}

function commandExists(command) {
  if (process.platform !== "win32") return true;
  const result = spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/c", "where", command], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
  return result.status === 0;
}

function runWrangler(dbName, args) {
  const localWrangler = path.join(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "wrangler.cmd" : "wrangler");
  const localWranglerJs = path.join(process.cwd(), "node_modules", "wrangler", "bin", "wrangler.js");
  const cmd = process.env.ComSpec || "cmd.exe";
  const candidates = process.platform === "win32"
    ? [
        ...(fs.existsSync(localWranglerJs) ? [{ command: process.execPath, prefix: [localWranglerJs], shell: false }] : []),
        ...(commandExists("npx.cmd") ? [{ command: cmd, prefix: ["/d", "/c", "npx.cmd", "wrangler"], shell: false }] : []),
        ...(fs.existsSync(localWrangler) ? [{ command: localWrangler, prefix: [], shell: true }] : []),
        ...(commandExists("wrangler.cmd") ? [{ command: cmd, prefix: ["/d", "/c", "wrangler.cmd"], shell: false }] : []),
      ]
    : [
        { command: "npx", prefix: ["wrangler"], shell: false },
        ...(fs.existsSync(localWrangler) ? [{ command: localWrangler, prefix: [], shell: false }] : []),
        { command: "wrangler", prefix: [], shell: false },
      ];

  const capture = args.includes("--json");
  const errors = [];
  for (const candidate of candidates) {
    const fullArgs = [...candidate.prefix, "d1", "execute", dbName, "--remote", ...args];
    const result = spawnSync(candidate.command, fullArgs, {
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
      encoding: "utf8",
      shell: candidate.shell,
    });
    if (!result.error && result.status === 0) return result.stdout || "";
    errors.push([
      "wrangler execution failed",
      `command: ${candidate.command}`,
      `args: ${fullArgs.join(" ")}`,
      result.error?.message || result.stderr || result.stdout || `exit ${result.status}`,
      "fix: run npm.cmd install, then check npx.cmd wrangler --version",
    ].join("\n"));
  }
  throw new Error(errors.join("\n---\n"));
}

function parseRows(output) {
  try {
    const parsed = JSON.parse(output);
    return parsed?.[0]?.results || parsed?.results || [];
  } catch {
    return [];
  }
}

function columnsFor(dbName, table) {
  const out = runWrangler(dbName, ["--command", `PRAGMA table_info(${table});`, "--json"]);
  return new Set(parseRows(out).map((row) => row.name));
}

function sql(value) {
  if (value === null || value === undefined || value === "") return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function execSqlFile(dbName, statements) {
  const body = statements.filter(Boolean).join("\n");
  if (!body.trim()) return;
  const file = path.join(os.tmpdir(), `koh_ingest_${Date.now()}_${Math.random().toString(16).slice(2)}.sql`);
  fs.writeFileSync(file, body, "utf8");
  try {
    runWrangler(dbName, ["--file", file]);
  } finally {
    try { fs.unlinkSync(file); } catch { /* ignore */ }
  }
}

function ensureColumns(dbName, table, definitions, existingColumns, dryRun) {
  const statements = [];
  for (const [name, ddl] of Object.entries(definitions)) {
    if (!existingColumns.has(name)) statements.push(`ALTER TABLE ${table} ADD COLUMN ${name} ${ddl};`);
  }
  if (dryRun || !statements.length) {
    if (dryRun && statements.length) statements.forEach((s) => console.log(`[DRY-RUN] ${s}`));
    return;
  }
  for (const statement of statements) {
    try {
      runWrangler(dbName, ["--command", statement]);
      console.log(`[SCHEMA] ${statement}`);
    } catch (error) {
      if (!String(error?.message || error).includes("duplicate column")) throw error;
    }
  }
}

function ensureExportSchema(dbName, dryRun) {
  const messageCols = columnsFor(dbName, "messages");
  const fileCols = columnsFor(dbName, "files");

  ensureColumns(dbName, "messages", {
    source_type: "TEXT DEFAULT ''",
    source_status: "TEXT DEFAULT 'legacy'",
    original_room: "TEXT DEFAULT ''",
    export_message_id: "TEXT DEFAULT ''",
    from_name: "TEXT DEFAULT ''",
    from_id: "TEXT DEFAULT ''",
    reply_to_message_id: "TEXT DEFAULT ''",
    source_path: "TEXT DEFAULT ''",
    media_group_key: "TEXT DEFAULT ''",
  }, messageCols, dryRun);

  ensureColumns(dbName, "files", {
    source_type: "TEXT DEFAULT ''",
    source_status: "TEXT DEFAULT 'legacy'",
    original_room: "TEXT DEFAULT ''",
    export_message_id: "TEXT DEFAULT ''",
    from_name: "TEXT DEFAULT ''",
    from_id: "TEXT DEFAULT ''",
    source_path: "TEXT DEFAULT ''",
    media_group_key: "TEXT DEFAULT ''",
  }, fileCols, dryRun);

  if (!dryRun) {
    runWrangler(dbName, ["--command", `CREATE TABLE IF NOT EXISTS export_ingest_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_path TEXT,
      original_room TEXT,
      scanned_messages INTEGER DEFAULT 0,
      imported_messages INTEGER DEFAULT 0,
      skipped_messages INTEGER DEFAULT 0,
      failed_messages INTEGER DEFAULT 0,
      imported_files INTEGER DEFAULT 0,
      skipped_files INTEGER DEFAULT 0,
      failed_files INTEGER DEFAULT 0,
      active_messages INTEGER DEFAULT 0,
      active_files INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );`]);
  }
}

function normalizeText(value) {
  if (Array.isArray(value)) {
    return value.map((item) => typeof item === "string" ? item : (item?.text || "")).join("");
  }
  return typeof value === "string" ? value : "";
}

function hashText(value) {
  return crypto.createHash("sha1").update(String(value || "")).digest("hex").slice(0, 16);
}

function userFromMessage(message) {
  const id = message.from_id || message.actor_id || "";
  const name = message.from || message.actor || "";
  if (!id && !name) return null;
  const fallback = String(name || "").toLowerCase().replace(/\s+/g, "_").replace(/[^\w가-힣]/g, "");
  return {
    id: String(id || `export:${fallback || hashText(name)}`),
    name: String(name || id),
  };
}

function fileFromMessage(message, exportDir) {
  const filePath = message.file || message.photo || message.media || "";
  if (!filePath) return null;
  const fileName = path.basename(filePath);
  const absPath = path.resolve(exportDir, filePath);
  let fileSize = Number(message.file_size || 0) || 0;
  if (!fileSize && fs.existsSync(absPath)) {
    try { fileSize = fs.statSync(absPath).size; } catch { /* ignore */ }
  }
  const isPhoto = !!message.photo || /\.(jpg|jpeg|png|webp|gif)$/i.test(fileName);
  return {
    fileName,
    fileType: isPhoto ? "photo" : (path.extname(fileName).replace(".", "").toLowerCase() || String(message.media_type || "file")),
    mimeType: message.mime_type || (isPhoto ? "image/jpeg" : ""),
    fileSize,
    localPath: filePath,
    absPath,
  };
}

function contextMessages(messages, index, radius = 3) {
  const out = [];
  for (let i = Math.max(0, index - radius); i < Math.min(messages.length, index + radius + 1); i++) {
    const message = messages[i];
    const text = normalizeText(message?.text || message?.caption).replace(/\s+/g, " ").trim();
    if (text) out.push({ id: message.id || "", date: message.date || "", from: message.from || message.actor || "", text: text.slice(0, 300) });
  }
  return out.slice(0, 7);
}

function mediaGroupKey(roomId, userId, dateString) {
  const time = Date.parse(dateString || "") || Date.now();
  return `${roomId}:${userId || ""}:${Math.floor(time / (3 * 60 * 1000))}`;
}

function insertSelect(table, values, existingColumns, whereNotExists = "") {
  const entries = Object.entries(values).filter(([key]) => existingColumns.has(key));
  if (!entries.length) return "";
  const columns = entries.map(([key]) => key).join(", ");
  const valuesSql = entries.map(([, value]) => sql(value)).join(", ");
  if (whereNotExists) return `INSERT INTO ${table} (${columns}) SELECT ${valuesSql} WHERE NOT EXISTS (${whereNotExists});`;
  return `INSERT INTO ${table} (${columns}) VALUES (${valuesSql});`;
}

function updateWhere(table, values, existingColumns, whereClause) {
  const entries = Object.entries(values).filter(([key]) => existingColumns.has(key));
  if (!entries.length || !whereClause) return "";
  const setSql = entries.map(([key, value]) => `${key} = ${sql(value)}`).join(", ");
  return `UPDATE ${table} SET ${setSql} WHERE ${whereClause};`;
}

function discoverExports(inputPath) {
  const fullPath = path.resolve(inputPath);
  if (!fs.existsSync(fullPath)) throw new Error(`path not found: ${fullPath}`);
  const stat = fs.statSync(fullPath);
  if (stat.isFile()) {
    if (path.basename(fullPath).toLowerCase() !== "result.json") throw new Error(`not a result.json file: ${fullPath}`);
    return [{ name: path.basename(path.dirname(fullPath)), dir: path.dirname(fullPath), resultPath: fullPath }];
  }
  if (fs.existsSync(path.join(fullPath, "result.json"))) {
    return [{ name: path.basename(fullPath), dir: fullPath, resultPath: path.join(fullPath, "result.json") }];
  }
  return fs.readdirSync(fullPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ name: entry.name, dir: path.join(fullPath, entry.name), resultPath: path.join(fullPath, entry.name, "result.json") }))
    .filter((entry) => fs.existsSync(entry.resultPath));
}

function processRoom(dbName, room, messageCols, fileCols, dryRun) {
  const data = JSON.parse(fs.readFileSync(room.resultPath, "utf8"));
  const messages = Array.isArray(data.messages) ? data.messages : [];
  const originalRoom = room.name;
  const roomId = data.id ? String(data.id) : `export:${hashText(originalRoom)}`;
  const roomTitle = data.name || originalRoom;
  const statements = [];
  const seenMessages = new Set();
  const seenFiles = new Set();
  let importedMessages = 0;
  let importedFiles = 0;
  let importedPhotos = 0;
  let skippedMessages = 0;
  let skippedFiles = 0;

  for (let index = 0; index < messages.length; index++) {
    const message = messages[index];
    if (message.type && message.type !== "message" && message.type !== "service") continue;

    const text = normalizeText(message.text || message.caption);
    const file = fileFromMessage(message, room.dir);
    const nearby = file ? contextMessages(messages, index, 3) : [];
    const nearbyText = nearby.map((item) => item.text).join(" / ");
    const fileContext = text || nearbyText;
    const fileSummary = fileContext ? fileContext.slice(0, 1000) : (file ? `Telegram export file: ${file.fileName}` : "");
    const content = text || (file ? `[file] ${file.fileName}${fileSummary ? "\n" + fileSummary : ""}`.trim() : "");
    const user = userFromMessage(message);
    const exportMessageId = message.id ? String(message.id) : hashText(`${message.date}|${user?.id || ""}|${content}`);
    const replyId = message.reply_to_message_id || message.reply_to_message?.id || "";
    const groupKey = file ? mediaGroupKey(roomId, user?.id || "", message.date || "") : "";

    if (content) {
      const messageKey = `${roomId}|${originalRoom}|${exportMessageId}`;
      if (seenMessages.has(messageKey)) {
        skippedMessages++;
      } else {
        seenMessages.add(messageKey);
        const where = `SELECT 1 FROM messages WHERE source_type = 'telegram_export' AND original_room = ${sql(originalRoom)} AND export_message_id = ${sql(exportMessageId)}`;
        const values = {
          room_id: roomId,
          room_title: roomTitle,
          sender_id: user?.id || "",
          sender_name: user?.name || "",
          from_id: String(message.from_id || message.actor_id || user?.id || ""),
          from_name: String(message.from || message.actor || user?.name || ""),
          content: content.slice(0, 4000),
          saved_by: "telegram_export_importer",
          source_type: "telegram_export",
          source_status: "active",
          original_room: originalRoom,
          export_message_id: exportMessageId,
          telegram_message_id: exportMessageId,
          reply_to_message_id: replyId,
          source_path: room.resultPath,
          media_group_key: groupKey,
          created_at: message.date || new Date().toISOString(),
        };
        const updateKey = `id = (
          SELECT MAX(id) FROM messages
          WHERE source_type = 'telegram_export'
            AND original_room = ${sql(originalRoom)}
            AND export_message_id = ${sql(exportMessageId)}
        )`;
        statements.push(insertSelect("messages", values, messageCols, where));
        statements.push(updateWhere("messages", values, messageCols, updateKey));
        importedMessages++;
      }
    } else {
      skippedMessages++;
    }

    if (file) {
      const fileKey = `${roomId}|${originalRoom}|${exportMessageId}|${file.fileName}`;
      if (seenFiles.has(fileKey)) {
        skippedFiles++;
        continue;
      }
      seenFiles.add(fileKey);
      if (file.fileType === "photo" || /^image\//i.test(file.mimeType)) importedPhotos++;
      const where = `SELECT 1 FROM files WHERE source_type = 'telegram_export' AND original_room = ${sql(originalRoom)} AND export_message_id = ${sql(exportMessageId)} AND file_name = ${sql(file.fileName)}`;
      const tags = JSON.stringify({
        source_type: "telegram_export",
        local_path: file.localPath,
        abs_path: file.absPath,
        source_room: originalRoom,
        context_messages: nearby,
      });
      const values = {
        uploader_id: user?.id || "",
        uploader_name: user?.name || "",
        sender_id: user?.id || "",
        sender_name: user?.name || "",
        from_id: String(message.from_id || message.actor_id || user?.id || ""),
        from_name: String(message.from || message.actor || user?.name || ""),
        file_name: file.fileName,
        file_type: file.fileType,
        mime_type: file.mimeType,
        file_size: file.fileSize || 0,
        content: fileContext.slice(0, 4000),
        summary: fileSummary.slice(0, 1000),
        extracted_text: fileContext.slice(0, 4000),
        room_id: roomId,
        room_title: roomTitle,
        telegram_file_id: null,
        telegram_file_unique_id: null,
        source_path: file.absPath,
        r2_key: null,
        tags_json: tags,
        saved_by: "telegram_export_importer",
        source_type: "telegram_export",
        source_status: "active",
        original_room: originalRoom,
        export_message_id: exportMessageId,
        telegram_message_id: exportMessageId,
        media_group_key: groupKey,
        created_at: message.date || new Date().toISOString(),
      };
      const updateKey = `id = (
        SELECT MAX(id) FROM files
        WHERE source_type = 'telegram_export'
          AND original_room = ${sql(originalRoom)}
          AND export_message_id = ${sql(exportMessageId)}
          AND file_name = ${sql(file.fileName)}
      )`;
      statements.push(insertSelect("files", values, fileCols, where));
      statements.push(updateWhere("files", values, fileCols, updateKey));
      importedFiles++;
    }
  }

  if (!dryRun) execSqlFile(dbName, statements);
  else console.log(`[DRY-RUN] ${originalRoom}: ${statements.length} SQL statements`);
  return { scanned: messages.length, messages: importedMessages, files: importedFiles, photos: importedPhotos, skippedMessages, skippedFiles, failedMessages: 0, failedFiles: 0 };
}

function fixOriginalRoom(dbName, dryRun) {
  console.log("=== Fix original_room from source_path ===");
  const out = runWrangler(dbName, ["--command",
    "SELECT DISTINCT source_path, original_room FROM messages WHERE source_type = 'telegram_export' AND source_path LIKE '%result.json';",
    "--json"]);
  const rows = parseRows(out);
  if (!rows.length) {
    console.log("No telegram_export messages with result.json source_path found.");
    return;
  }
  const corrections = [];
  for (const row of rows) {
    const correctRoom = path.basename(path.dirname(row.source_path));
    if (correctRoom && correctRoom !== "." && correctRoom !== row.original_room) {
      corrections.push({ sourcePath: row.source_path, wrongRoom: row.original_room, correctRoom });
    }
  }
  if (!corrections.length) {
    console.log("All original_room values are already correct.");
    return;
  }
  console.log(`Corrections needed: ${corrections.length} room(s)`);
  corrections.forEach((c) => console.log(`  "${c.wrongRoom}" → "${c.correctRoom}"`));

  const msgStatements = corrections.map((c) =>
    `UPDATE messages SET original_room = ${sql(c.correctRoom)} WHERE source_type = 'telegram_export' AND original_room = ${sql(c.wrongRoom)} AND source_path = ${sql(c.sourcePath)};`
  );
  const fileStatements = corrections.map((c) =>
    `UPDATE files SET original_room = ${sql(c.correctRoom)} WHERE source_type = 'telegram_export' AND original_room = ${sql(c.wrongRoom)} AND room_id IN (SELECT DISTINCT room_id FROM messages WHERE source_type = 'telegram_export' AND original_room = ${sql(c.correctRoom)});`
  );

  if (dryRun) {
    [...msgStatements, ...fileStatements].forEach((s) => console.log(`[DRY-RUN] ${s}`));
    return;
  }
  execSqlFile(dbName, msgStatements);
  console.log(`Messages updated: ${corrections.length} room(s)`);
  execSqlFile(dbName, fileStatements);
  console.log(`Files updated: ${corrections.length} room(s)`);
  console.log("=== Done ===");
}

function main() {
  const args = parseArgs(process.argv);

  if (args["fix-original-room"]) {
    const dryRun = !!args["dry-run"];
    const dbName = args.db || readWranglerDbName();
    fixOriginalRoom(dbName, dryRun);
    return;
  }

  const inputPath = args.path || args.positional[0];
  if (!inputPath) {
    console.error("usage: node scripts/ingest_export.js --path <result.json-or-export-root> [--remote] [--dry-run] [--db 6r-ai-db]");
    console.error("       node scripts/ingest_export.js --fix-original-room [--dry-run] [--db 6r-ai-db]");
    process.exit(1);
  }

  const dryRun = !!args["dry-run"];
  const dbName = args.db || readWranglerDbName();
  const sourcePath = path.resolve(inputPath);
  const rooms = discoverExports(sourcePath);
  if (!rooms.length) throw new Error(`no result.json found: ${sourcePath}`);

  console.log("=== KOH_AI_bot Export Ingest ===");
  console.log(`Source: ${sourcePath}`);
  console.log(`D1 database: ${dbName}`);
  console.log(`Found export rooms: ${rooms.length}`);

  ensureExportSchema(dbName, dryRun);
  const messageCols = dryRun ? new Set([...columnsFor(dbName, "messages"), "source_status", "export_message_id", "source_path", "media_group_key"]) : columnsFor(dbName, "messages");
  const fileCols = dryRun ? new Set([...columnsFor(dbName, "files"), "source_status", "export_message_id"]) : columnsFor(dbName, "files");

  let scanned = 0;
  let importedMessages = 0;
  let skippedMessages = 0;
  let failedMessages = 0;
  let importedFiles = 0;
  let skippedFiles = 0;
  let failedFiles = 0;
  let photos = 0;

  for (const room of rooms) {
    process.stdout.write(`[${room.name}] importing... `);
    try {
      const result = processRoom(dbName, room, messageCols, fileCols, dryRun);
      scanned += result.scanned;
      importedMessages += result.messages;
      skippedMessages += result.skippedMessages;
      failedMessages += result.failedMessages;
      importedFiles += result.files;
      skippedFiles += result.skippedFiles;
      failedFiles += result.failedFiles;
      photos += result.photos || 0;
      console.log(`messages ${result.messages}, files ${result.files}, photos ${result.photos || 0}, skipped ${result.skippedMessages + result.skippedFiles}`);
    } catch (error) {
      failedMessages++;
      failedFiles++;
      console.log(`failed: ${String(error?.message || error).slice(0, 160)}`);
    }
  }

  let activeMessages = 0;
  let activeFiles = 0;
  if (!dryRun) {
    activeMessages = parseRows(runWrangler(dbName, ["--command", "SELECT COUNT(*) AS count FROM messages WHERE source_status = 'active';", "--json"]))[0]?.count || 0;
    activeFiles = parseRows(runWrangler(dbName, ["--command", "SELECT COUNT(*) AS count FROM files WHERE source_status = 'active';", "--json"]))[0]?.count || 0;
    runWrangler(dbName, ["--command", `INSERT INTO export_ingest_runs (
      source_path, original_room, scanned_messages, imported_messages, skipped_messages, failed_messages,
      imported_files, skipped_files, failed_files, active_messages, active_files
    ) VALUES (
      ${sql(sourcePath)}, ${sql(rooms.length === 1 ? rooms[0].name : path.basename(sourcePath))},
      ${scanned}, ${importedMessages}, ${skippedMessages}, ${failedMessages},
      ${importedFiles}, ${skippedFiles}, ${failedFiles}, ${activeMessages}, ${activeFiles}
    );`]);
  }

  console.log("=== Done ===");
  console.log(`Loaded messages: ${scanned}`);
  console.log(`Imported messages: ${importedMessages}`);
  console.log(`Skipped duplicate messages: ${skippedMessages}`);
  console.log(`Imported files: ${importedFiles}`);
  console.log(`Skipped duplicate files: ${skippedFiles}`);
  console.log(`Imported photos: ${photos}`);
  if (!dryRun) {
    console.log(`Active messages: ${activeMessages}`);
    console.log(`Active files: ${activeFiles}`);
  }
}

try {
  main();
} catch (error) {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
}
