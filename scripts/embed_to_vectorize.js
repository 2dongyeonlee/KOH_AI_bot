#!/usr/bin/env node
/**
 * D1 → Vectorize 벌크 색인 스크립트
 *
 * 사용법:
 *   CLOUDFLARE_ACCOUNT_ID=xxx CLOUDFLARE_API_TOKEN=xxx node scripts/embed_to_vectorize.js
 *
 * 필요한 환경 변수:
 *   CLOUDFLARE_ACCOUNT_ID  - Cloudflare 계정 ID (Dashboard > 우측 하단)
 *   CLOUDFLARE_API_TOKEN   - API 토큰 (D1 읽기 + AI 실행 + Vectorize 쓰기 권한 필요)
 *
 * 필요 없는 것:
 *   - wrangler 설치 불필요
 *   - 추가 npm 패키지 불필요 (fetch는 Node 18+에서 기본 제공)
 */

const ACCOUNT_ID    = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN     = process.env.CLOUDFLARE_API_TOKEN;
const D1_DB_ID      = "d55c7eaa-ef2e-40e5-8283-a50008dc5fb2";
const VECTORIZE_IDX = "koh-ai-vectors";
const AI_MODEL      = "@cf/baai/bge-m3";
const BATCH_SIZE    = 10;

if (!ACCOUNT_ID || !API_TOKEN) {
  console.error("CLOUDFLARE_ACCOUNT_ID 와 CLOUDFLARE_API_TOKEN 환경 변수 필요");
  process.exit(1);
}

const headers = {
  "Authorization": `Bearer ${API_TOKEN}`,
  "Content-Type": "application/json",
};

async function d1Query(sql, params = []) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${D1_DB_ID}/query`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ sql, params }),
  });
  const data = await res.json();
  if (!data.success) throw new Error("D1 query failed: " + JSON.stringify(data.errors));
  return data.result?.[0]?.results || [];
}

async function embedBatch(texts) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${encodeURIComponent(AI_MODEL)}`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ text: texts }),
  });
  const data = await res.json();
  if (!data.success) throw new Error("AI embed failed: " + JSON.stringify(data.errors));
  return data.result?.data || [];
}

async function vectorizeUpsert(vectors) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/vectorize/v2/indexes/${VECTORIZE_IDX}/upsert`;
  const ndjson = vectors.map(v => JSON.stringify(v)).join("\n");
  const res = await fetch(url, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/x-ndjson" },
    body: ndjson,
  });
  const data = await res.json();
  if (!data.success) throw new Error("Vectorize upsert failed: " + JSON.stringify(data.errors));
  return data.result;
}

async function main() {
  console.log("D1 → Vectorize 색인 시작");
  console.log("Account:", ACCOUNT_ID);
  console.log("D1 DB:", D1_DB_ID);
  console.log("Index:", VECTORIZE_IDX);
  console.log("");

  let offset = 0;
  let totalIndexed = 0;
  let errorCount = 0;

  while (true) {
    let rows;
    try {
      rows = await d1Query(
        `SELECT rowid, content, summary, file_name, status_tag
         FROM messages ORDER BY rowid LIMIT ? OFFSET ?`,
        [BATCH_SIZE, offset]
      );
    } catch (e) {
      console.error(`D1 쿼리 오류 (offset=${offset}):`, e.message);
      break;
    }

    if (!rows.length) {
      console.log("모든 레코드 처리 완료.");
      break;
    }

    const texts = rows.map(r =>
      [r.file_name, r.summary, r.content]
        .filter(Boolean).join(" ").slice(0, 2000)
    );

    let embeddings;
    try {
      embeddings = await embedBatch(texts);
    } catch (e) {
      console.error(`임베딩 오류 (offset=${offset}):`, e.message);
      errorCount += rows.length;
      offset += BATCH_SIZE;
      continue;
    }

    const vectors = rows
      .map((row, i) => ({
        id: String(row.rowid),
        values: embeddings[i],
        metadata: {
          file_name: String(row.file_name || ""),
          status_tag: String(row.status_tag || ""),
        },
      }))
      .filter(v => v.values && v.values.length > 0);

    if (vectors.length > 0) {
      try {
        const result = await vectorizeUpsert(vectors);
        totalIndexed += vectors.length;
        console.log(`offset ${offset}: ${vectors.length}건 색인 (누계: ${totalIndexed})`, result);
      } catch (e) {
        console.error(`Vectorize upsert 오류 (offset=${offset}):`, e.message);
        errorCount += vectors.length;
      }
    }

    offset += BATCH_SIZE;

    // Rate limit 방지
    await new Promise(r => setTimeout(r, 200));
  }

  console.log("");
  console.log("=== 완료 ===");
  console.log(`처리: ${totalIndexed}건`);
  console.log(`오류: ${errorCount}건`);
}

main().catch(e => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
