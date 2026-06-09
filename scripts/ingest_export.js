#!/usr/bin/env node
"use strict";

/**
 * scripts/ingest_export.js
 *
 * 여러 Telegram Export 폴더를 KOH_AI_bot D1 DB에 일괄 적재.
 *
 * 사용법:
 *   node scripts/ingest_export.js "C:\...\telegram_exports\202605_202606"
 *   node scripts/ingest_export.js "C:\...\telegram_exports\202605_202606" --dry-run
 *   node scripts/ingest_export.js "C:\...\telegram_exports\202605_202606" --db 6r-ai-db
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

// ── CLI 파싱 ──────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { positional: [] };
  for (let i = 2; i < argv.length; i++) {
    const part = argv[i];
    if (part.startsWith("--")) {
      const key = part.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) args[key] = true;
      else { args[key] = next; i++; }
    } else {
      args.positional.push(part);
    }
  }
  return args;
}

// ── wrangler 설정 읽기 ────────────────────────────────────────────────────────

function readWranglerDbName() {
  const file = path.join(process.cwd(), "wrangler.toml");
  if (!fs.existsSync(file)) return "6r-ai-db";
  const text = fs.readFileSync(file, "utf8");
  const m = text.match(/database_name\s*=\s*"([^"]+)"/);
  return m ? m[1] : "6r-ai-db";
}

// ── wrangler 실행 ─────────────────────────────────────────────────────────────

function winCmdExists(cmd) {
  if (process.platform !== "win32") return true;
  const r = spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/c", "where", cmd], {
    stdio: ["ignore", "pipe", "pipe"], encoding: "utf8",
  });
  return r.status === 0;
}

function runWrangler(dbName, args) {
  const localWrangler = path.join(
    process.cwd(), "node_modules", ".bin",
    process.platform === "win32" ? "wrangler.cmd" : "wrangler"
  );
  const localWranglerJs = path.join(process.cwd(), "node_modules", "wrangler", "bin", "wrangler.js");
  const cmd = process.env.ComSpec || "cmd.exe";

  const candidates = process.platform === "win32"
    ? [
        ...(winCmdExists("npx.cmd") ? [{ command: cmd, prefix: ["/d", "/c", "npx.cmd", "wrangler"], shell: false }] : []),
        ...(fs.existsSync(localWranglerJs) ? [{ command: process.execPath, prefix: [localWranglerJs], shell: false }] : []),
        { command: localWrangler, prefix: [], shell: true },
        ...(winCmdExists("wrangler.cmd") ? [{ command: cmd, prefix: ["/d", "/c", "wrangler.cmd"], shell: false }] : []),
      ]
    : [
        { command: "npx", prefix: ["wrangler"], shell: false },
        { command: localWrangler, prefix: [], shell: false },
        { command: "wrangler", prefix: [], shell: false },
      ];

  const capture = args.includes("--json");
  const errors = [];
  for (const c of candidates) {
    const fullArgs = [...c.prefix, "d1", "execute", dbName, "--remote", ...args];
    const r = spawnSync(c.command, fullArgs, {
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
      encoding: "utf8",
      shell: c.shell,
    });
    if (r.error) {
      errors.push(`${c.command}: ${r.error.message}`);
      continue;
    }
    if (r.status === 0) return r.stdout || "";
    errors.push(`${c.command} exit ${r.status}: ${(r.stderr || r.stdout || "").slice(0, 300)}`);
  }
  throw new Error(["wrangler 실행 실패", ...errors].join("\n"));
}

function parseWranglerResults(out) {
  try {
    const parsed = JSON.parse(out);
    return parsed?.[0]?.results || parsed?.results || [];
  } catch { return []; }
}

function columnsFor(dbName, table) {
  try {
    const out = runWrangler(dbName, ["--command", `PRAGMA table_info(${table});`, "--json"]);
    const rows = parseWranglerResults(out);
    return new Set(rows.map(r => r.name));
  } catch { return new Set(); }
}

// ── SQL 헬퍼 ──────────────────────────────────────────────────────────────────

function sql(v) {
  if (v === null || v === undefined || v === "") return "NULL";
  return `'${String(v).replace(/'/g, "''")}'`;
}

function insertWhereNotExists(table, cols, values, whereClause) {
  const colStr = cols.join(", ");
  const valStr = values.map(sql).join(", ");
  return `INSERT INTO ${table} (${colStr}) SELECT ${valStr} WHERE NOT EXISTS (SELECT 1 FROM ${table} WHERE ${whereClause});`;
}

function upsertMsg(table, cols, values, whereClause) {
  // INSERT if not exists, then UPDATE source_status/updated_at if row exists
  const insert = insertWhereNotExists(table, cols, values, whereClause);
  const updateCols = ["source_status", "original_room"].filter(c => cols.includes(c));
  if (!updateCols.length) return insert;
  const setStr = updateCols.map(c => {
    const idx = cols.indexOf(c);
    return `${c} = ${sql(values[idx])}`;
  }).join(", ");
  const update = `UPDATE ${table} SET ${setStr} WHERE ${whereClause} AND COALESCE(source_status, 'legacy') != 'active';`;
  return `${insert}\n${update}`;
}

// ── 텍스트 정규화 ─────────────────────────────────────────────────────────────

function normalizeText(value) {
  if (Array.isArray(value)) {
    return value.map(item => {
      if (typeof item === "string") return item;
      if (item && typeof item.text === "string") return item.text;
      return "";
    }).join("");
  }
  return typeof value === "string" ? value : "";
}

function hashText(value) {
  return crypto.createHash("sha1").update(String(value || "")).digest("hex").slice(0, 16);
}

// ── 사용자 파싱 ───────────────────────────────────────────────────────────────

function userFromMessage(msg) {
  const id = msg.from_id || msg.actor_id || "";
  const name = msg.from || msg.actor || "";
  if (!id && !name) return null;
  const norm = String(name || "").toLowerCase().replace(/\s+/g, "_").replace(/[^\w가-힣]/g, "");
  return {
    id: String(id || `export:${norm || hashText(name)}`),
    name: String(name || id),
  };
}

// ── 파일 파싱 ─────────────────────────────────────────────────────────────────

function fileFromMessage(msg, exportDir) {
  const filePath = msg.file || msg.photo || msg.media || "";
  if (!filePath) return null;
  const fileName = path.basename(filePath);
  const absPath = path.resolve(exportDir, filePath);
  let size = Number(msg.file_size || 0) || 0;
  if (!size && fs.existsSync(absPath)) {
    try { size = fs.statSync(absPath).size; } catch { /* ignore */ }
  }
  const isPhoto = msg.photo || /\.(jpg|jpeg|png|webp|gif)$/i.test(fileName);
  const ext = path.extname(fileName).replace(".", "").toLowerCase();
  return {
    fileName,
    fileType: isPhoto ? "photo" : (ext || String(msg.media_type || "file")),
    mimeType: msg.mime_type || (isPhoto ? "image/jpeg" : ""),
    fileSize: size,
    localPath: filePath,    // relative (as in result.json)
    absPath,                // absolute (for local access)
  };
}

// ── 주변 메시지 컨텍스트 ──────────────────────────────────────────────────────

function contextMessages(messages, index, radius = 3) {
  const start = Math.max(0, index - radius);
  const end = Math.min(messages.length, index + radius + 1);
  const out = [];
  for (let i = start; i < end; i++) {
    const m = messages[i];
    const text = normalizeText(m?.text || m?.caption).replace(/\s+/g, " ").trim();
    if (!text) continue;
    out.push({ id: m.id || "", date: m.date || "", from: m.from || m.actor || "", text: text.slice(0, 300) });
  }
  return out.slice(0, 7);
}

// ── media_group_key 생성 ──────────────────────────────────────────────────────
// 같은 방+발신자의 3분 단위 시간 버킷으로 이미지를 묶음

function mediaGroupKey(roomId, userId, dateStr) {
  const ms = dateStr ? Date.parse(dateStr) : Date.now();
  const bucket = Math.floor((isNaN(ms) ? Date.now() : ms) / (3 * 60 * 1000));
  return `${roomId}:${userId}:${bucket}`;
}

// ── 스키마 마이그레이션 ───────────────────────────────────────────────────────

function ensureColumns(dbName, table, colDefs, existingCols, dryRun = false) {
  const stmts = [];
  for (const [col, def] of Object.entries(colDefs)) {
    if (!existingCols.has(col)) {
      stmts.push(`ALTER TABLE ${table} ADD COLUMN ${col} ${def};`);
    }
  }
  if (!stmts.length) return;
  if (dryRun) {
    console.log(`[DRY-RUN] Schema migrations for ${table}:`);
    stmts.forEach(s => console.log(`  ${s}`));
    return;
  }
  for (const stmt of stmts) {
    try {
      runWrangler(dbName, ["--command", stmt]);
      console.log(`  [SCHEMA] ${stmt}`);
    } catch (e) {
      // Column may already exist (race); ignore
      if (!String(e.message).includes("duplicate column")) throw e;
    }
  }
}

// ── 단일 방(result.json) 처리 ──────────────────────────────────────────────────

function processRoom(dbName, exportDir, originalRoom, messageCols, fileCols, dryRun) {
  const resultPath = path.join(exportDir, "result.json");
  if (!fs.existsSync(resultPath)) return { messages: 0, files: 0, skipped: 0 };

  let data;
  try { data = JSON.parse(fs.readFileSync(resultPath, "utf8")); }
  catch (e) { console.warn(`  [WARN] result.json 파싱 오류: ${e.message}`); return { messages: 0, files: 0, skipped: 0 }; }

  const messages = Array.isArray(data.messages) ? data.messages : [];
  // room_id: group id (< 0) 또는 export-based ID
  const roomId = data.id ? String(data.id) : `export:${hashText(originalRoom)}`;
  const roomTitle = data.name || originalRoom;
  const statements = [];
  let importedMessages = 0, importedFiles = 0, importedPhotos = 0, skipped = 0;
  const seenMessages = new Set(), seenFiles = new Set();

  for (let idx = 0; idx < messages.length; idx++) {
    const msg = messages[idx];
    if (msg.type && msg.type !== "message" && msg.type !== "service") continue;

    const text = normalizeText(msg.text || msg.caption);
    const file = fileFromMessage(msg, exportDir);
    const nearby = file ? contextMessages(messages, idx, 3) : [];
    const nearbyText = nearby.map(m => m.text).join(" / ");
    const fileContext = text || nearbyText;
    const fileSummary = fileContext ? fileContext.slice(0, 1000) : (file ? `Telegram export file: ${file.fileName}` : "");
    const contentForMsg = text || (file ? `[file] ${file.fileName}${fileSummary ? "\n" + fileSummary : ""}`.trim() : "");
    const user = userFromMessage(msg);
    const msgId = msg.id ? String(msg.id) : hashText(`${msg.date}|${user?.id || ""}|${contentForMsg}`);

    // messages
    const dedupeKeyMsg = `${roomId}|${originalRoom}|${msgId}`;
    if (seenMessages.has(dedupeKeyMsg)) { skipped++; }
    else {
      seenMessages.add(dedupeKeyMsg);
      if (contentForMsg) {
        const whereMsg = `source_type = 'telegram_export' AND original_room = ${sql(originalRoom)} AND telegram_message_id = ${sql(msgId)}`;
        const msgCols = ["telegram_message_id", "room_id", "room_title", "sender_id", "sender_name",
          "from_id", "from_name",
          "content", "saved_by", "source_type", "source_status", "original_room",
          "reply_to_message_id", "created_at", "raw_json"]
          .filter(c => messageCols.has(c));
        const msgVals = msgCols.map(c => ({
          telegram_message_id: msgId,
          room_id: roomId,
          room_title: roomTitle,
          sender_id: user?.id || "",
          sender_name: user?.name || "",
          from_id: String(msg.from_id || msg.actor_id || user?.id || ""),
          from_name: String(msg.from || msg.actor || user?.name || ""),
          content: contentForMsg.slice(0, 4000),
          saved_by: "telegram_export_importer",
          source_type: "telegram_export",
          source_status: "active",
          original_room: originalRoom,
          reply_to_message_id: msg.reply_to_message_id ? String(msg.reply_to_message_id) : null,
          created_at: msg.date || new Date().toISOString(),
          raw_json: JSON.stringify({ id: msg.id, date: msg.date, from: msg.from, from_id: msg.from_id }),
        }[c]));
        statements.push(upsertMsg("messages", msgCols, msgVals, whereMsg));
        importedMessages++;
      } else { skipped++; }
    }

    // files
    if (file) {
      const dedupeKeyFile = `${roomId}|${originalRoom}|${msgId}|${file.fileName}`;
      if (seenFiles.has(dedupeKeyFile)) { skipped++; }
      else {
        seenFiles.add(dedupeKeyFile);
        const mgKey = mediaGroupKey(roomId, user?.id || "", msg.date || "");
        const whereFile = `source_type = 'telegram_export' AND original_room = ${sql(originalRoom)} AND telegram_message_id = ${sql(msgId)} AND file_name = ${sql(file.fileName)}`;
        const fCols = ["uploader_id", "uploader_name", "sender_id", "sender_name",
          "from_id", "from_name",
          "file_name", "file_type", "mime_type", "file_size",
          "content", "summary", "extracted_text",
          "room_id", "room_title",
          "telegram_file_id", "telegram_file_unique_id",
          "source_path", "r2_key",
          "tags_json", "saved_by", "source_type", "source_status",
          "original_room", "telegram_message_id", "media_group_key",
          "created_at"]
          .filter(c => fileCols.has(c));
        if (file.fileType === "photo" || /^image\//i.test(file.mimeType)) importedPhotos++;
        const fVals = fCols.map(c => ({
          uploader_id: user?.id || "",
          uploader_name: user?.name || "",
          sender_id: user?.id || "",
          sender_name: user?.name || "",
          from_id: String(msg.from_id || msg.actor_id || user?.id || ""),
          from_name: String(msg.from || msg.actor || user?.name || ""),
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
          tags_json: JSON.stringify({
            source_type: "telegram_export",
            local_path: file.localPath,
            abs_path: file.absPath,
            source_room: originalRoom,
            context_messages: nearby,
          }),
          saved_by: "telegram_export_importer",
          source_type: "telegram_export",
          source_status: "active",
          original_room: originalRoom,
          telegram_message_id: msgId,
          media_group_key: mgKey,
          created_at: msg.date || new Date().toISOString(),
        }[c]));
        statements.push(upsertMsg("files", fCols, fVals, whereFile));
        importedFiles++;
      }
    }
  }

  const filtered = statements.filter(Boolean);
  if (!filtered.length) return { messages: importedMessages, files: importedFiles, photos: importedPhotos, skipped };

  if (dryRun) {
    console.log(`  [DRY-RUN] Would execute ${filtered.length} SQL statements`);
    console.log(`  [DRY-RUN] Sample:\n${filtered.slice(0, 2).join("\n").slice(0, 500)}`);
    return { messages: importedMessages, files: importedFiles, photos: importedPhotos, skipped };
  }

  const tmpFile = path.join(os.tmpdir(), `koh_ingest_${Date.now()}_${hashText(originalRoom)}.sql`);
  fs.writeFileSync(tmpFile, filtered.join("\n"), "utf8");
  try {
    runWrangler(dbName, ["--file", tmpFile]);
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }

  return { messages: importedMessages, files: importedFiles, photos: importedPhotos, skipped };
}

// ── 메인 ─────────────────────────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv);
  const exportRoot = args.positional[0] || args.path;
  if (!exportRoot) {
    console.error([
      "사용법:",
      `  node scripts/ingest_export.js <export-root-path>`,
      `  node scripts/ingest_export.js "C:\\Users\\pc\\Documents\\...\\202605_202606"`,
      "",
      "옵션:",
      "  --dry-run    실제 저장 없이 처리 결과만 출력",
      "  --db <name>  D1 database 이름 (기본값: wrangler.toml에서 읽음)",
    ].join("\n"));
    process.exit(1);
  }

  const dryRun = !!args["dry-run"];
  const dbName = args.db || readWranglerDbName();
  const rootPath = path.resolve(exportRoot);

  if (!fs.existsSync(rootPath)) {
    console.error(`경로가 존재하지 않습니다: ${rootPath}`);
    process.exit(1);
  }

  console.log(`\n=== KOH_AI_bot Export Ingest ===`);
  console.log(`Root: ${rootPath}`);
  console.log(`DB:   ${dbName}`);
  if (dryRun) console.log(`MODE: DRY-RUN (저장 안 함)`);
  console.log("");

  // 스키마 조회
  console.log("스키마 확인 중...");
  const messageCols = columnsFor(dbName, "messages");
  const fileCols = columnsFor(dbName, "files");

  if (!messageCols.size) {
    console.error("messages 테이블이 없거나 D1 접근 실패. wrangler 설정을 확인하세요.");
    process.exit(1);
  }

  // 필요한 컬럼 추가 (없으면 ALTER TABLE)
  console.log("신규 컬럼 추가 (이미 있으면 skip)...");
  ensureColumns(dbName, "messages", {
    source_type:          "TEXT DEFAULT ''",
    source_status:        "TEXT DEFAULT 'legacy'",
    original_room:        "TEXT DEFAULT ''",
    from_name:            "TEXT DEFAULT ''",
    from_id:              "TEXT DEFAULT ''",
    reply_to_message_id:  "TEXT DEFAULT ''",
    telegram_message_id:  "TEXT DEFAULT ''",
  }, messageCols, dryRun);

  ensureColumns(dbName, "files", {
    source_type:          "TEXT DEFAULT ''",
    source_status:        "TEXT DEFAULT 'legacy'",
    original_room:        "TEXT DEFAULT ''",
    source_path:          "TEXT DEFAULT ''",
    media_group_key:      "TEXT DEFAULT ''",
    from_name:            "TEXT DEFAULT ''",
    from_id:              "TEXT DEFAULT ''",
    telegram_message_id:  "TEXT DEFAULT ''",
  }, fileCols, dryRun);

  // 컬럼 목록 다시 조회 (ALTER 이후)
  const msgColsFinal = dryRun ? new Set([...messageCols,
    "source_type", "source_status", "original_room",
    "from_name", "from_id", "reply_to_message_id", "telegram_message_id",
  ]) : columnsFor(dbName, "messages");
  const fileColsFinal = dryRun ? new Set([...fileCols,
    "source_type", "source_status", "original_room",
    "source_path", "media_group_key", "from_name", "from_id", "telegram_message_id",
  ]) : columnsFor(dbName, "files");

  // export 하위 폴더 탐색
  const entries = fs.readdirSync(rootPath, { withFileTypes: true });
  const roomDirs = entries
    .filter(e => e.isDirectory())
    .map(e => ({ name: e.name, dir: path.join(rootPath, e.name) }))
    .filter(({ dir }) => fs.existsSync(path.join(dir, "result.json")));

  if (!roomDirs.length) {
    // 루트 자체에 result.json이 있을 수도 있음
    if (fs.existsSync(path.join(rootPath, "result.json"))) {
      roomDirs.push({ name: path.basename(rootPath), dir: rootPath });
    } else {
      console.error(`result.json을 포함한 하위 폴더가 없습니다: ${rootPath}`);
      process.exit(1);
    }
  }

  console.log(`발견된 export 방: ${roomDirs.length}개\n`);

  let totalMessages = 0, totalFiles = 0, totalPhotos = 0, totalSkipped = 0;
  const results = [];

  for (const { name, dir } of roomDirs) {
    process.stdout.write(`[${name}] 처리 중... `);
    try {
      const { messages, files, photos, skipped } = processRoom(
        dbName, dir, name, msgColsFinal, fileColsFinal, dryRun
      );
      totalMessages += messages;
      totalFiles += files;
      totalPhotos += (photos || 0);
      totalSkipped += skipped;
      results.push({ room: name, messages, files, photos: photos || 0, skipped, ok: true });
      console.log(`메시지 ${messages}건, 파일 ${files}건 (사진 ${photos || 0}건), 중복skip ${skipped}건`);
    } catch (e) {
      results.push({ room: name, ok: false, error: e.message });
      console.log(`실패: ${e.message.slice(0, 120)}`);
    }
  }

  console.log("\n=== 완료 ===");
  console.log(`source root: ${rootPath}`);
  console.log(`총 메시지:   ${totalMessages}건`);
  console.log(`총 파일:     ${totalFiles}건`);
  console.log(`총 사진:     ${totalPhotos}건`);
  console.log(`중복 skip:   ${totalSkipped}건`);

  const failed = results.filter(r => !r.ok);
  if (failed.length) {
    console.log(`\n실패 ${failed.length}건:`);
    failed.forEach(r => console.log(`  [${r.room}] ${r.error}`));
  }

  if (dryRun) {
    console.log("\n[DRY-RUN] 실제 저장 안 함. 저장하려면 --dry-run 없이 실행하세요.");
  } else {
    console.log(`\nsource_status='active' 로 저장 완료.`);
    console.log("worker.js에서 /debug_active_legacy 로 건수를 확인하세요.");
  }
}

try {
  main();
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
