#!/usr/bin/env node
// scripts/push-to-github.mjs
// 沙箱内发布器：当 git.exe 无法出网时，用 GitHub Git-database API 重建本地提交链并更新 refs。
// 原理：以 GitHub 上 main 当前提交为共同祖先，按顺序逐条创建 blob/tree/commit——
// 内容、作者、时间与本地完全一致，因此生成的 SHA 与本地一致；最后 PATCH main 与 tag ref。
// 用法（PowerShell）：
//   $env:DSH_GH_TOKEN = gh auth token
//   node scripts/push-to-github.mjs
// 前提：本地历史与 GitHub main 有共同祖先；所需对象均为松散存储（未 pack）。
import { readFileSync, existsSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import path from "node:path";

const TOKEN = process.env.DSH_GH_TOKEN || "";
const API = "https://api.github.com";
const OWNER = "wqy-cell";
const REPO = "dsh-task-flow";
const BRANCH = "main";
const TAG_REF = "refs/tags/v2.0.0";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GITDIR = path.join(ROOT, ".git");

function log(...a) { console.log("[push]", ...a); }

async function api(method, p, body) {
  const res = await fetch(API + p, {
    method,
    headers: {
      authorization: "Bearer " + TOKEN,
      accept: "application/vnd.github+json",
      "user-agent": "dsh-task-flow-release",
      ...(body !== undefined ? { "content-type": "application/json" } : {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
  if (!res.ok) throw new Error(`${method} ${p} -> ${res.status} ${text.slice(0, 200)}`);
  return data;
}

/* ---------- 松散对象读取 ---------- */
function readObject(sha) {
  if (typeof sha !== "string" || !/^[0-9a-f]{40}$/i.test(sha)) throw new Error("bad sha: " + sha);
  const p = path.join(GITDIR, "objects", sha.slice(0, 2), sha.slice(2));
  if (!existsSync(p)) throw new Error("对象已被 pack，无法在沙箱内发布：" + sha + " —— 请在普通终端手动 git push");
  const buf = inflateSync(readFileSync(p));
  const nul = buf.indexOf(0);
  const type = buf.slice(0, nul).toString("utf8").split(" ")[0];
  return { type, content: buf.slice(nul + 1) };
}

function isoWithTz(epoch, tz) {
  const d = new Date(epoch * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}${tz.slice(0, 3)}:${tz.slice(3)}`;
}

function parsePerson(line) {
  const m = /^(.*) <(.*)> (\d+) ([+-]\d{4})$/.exec(line);
  if (!m) throw new Error("bad person line: " + line);
  return { name: m[1], email: m[2], date: isoWithTz(parseInt(m[3], 10), m[4]) };
}

function parseCommit(sha) {
  const { content } = readObject(sha);
  const text = content.toString("utf8");
  const lines = text.split("\n");
  const headers = {};
  let i = 0;
  while (i < lines.length) {
    if (lines[i] === "") { i++; break; }
    const sp = lines[i].indexOf(" ");
    headers[lines[i].slice(0, sp)] = lines[i].slice(sp + 1);
    i++;
  }
  return {
    sha,
    tree: headers.tree,
    parents: headers.parent ? [headers.parent] : [],
    author: parsePerson(headers.author),
    committer: parsePerson(headers.committer),
    message: lines.slice(i).join("\n")
  };
}

function parseTree(sha, prefix = "") {
  const { content } = readObject(sha);
  const out = new Map();
  let i = 0;
  while (i < content.length) {
    const sp = content.indexOf(32, i);
    const mode = content.slice(i, sp).toString("utf8");
    const nul = content.indexOf(0, sp);
    const name = content.slice(sp + 1, nul).toString("utf8");
    const entrySha = content.slice(nul + 1, nul + 21).toString("hex");
    const full = prefix ? prefix + "/" + name : name;
    if (mode === "40000") {
      for (const [k, v] of parseTree(entrySha, full)) out.set(k, v);
    } else {
      out.set(full, { mode, type: mode === "160000" ? "commit" : "blob", sha: entrySha });
    }
    i = nul + 21;
  }
  return out;
}

function treeChanges(parentTreeSha, treeSha) {
  const a = parentTreeSha ? parseTree(parentTreeSha) : new Map();
  const b = parseTree(treeSha);
  const changes = [];
  for (const [p, e] of b) {
    const old = a.get(p);
    if (!old || old.sha !== e.sha || old.mode !== e.mode) changes.push({ path: p, mode: e.mode, type: e.type, sha: e.sha });
  }
  for (const p of a.keys()) if (!b.has(p)) changes.push({ path: p, mode: null, type: null, sha: null });
  return changes;
}

/* ---------- 主流程 ---------- */
async function main() {
  if (!TOKEN) throw new Error("缺少 DSH_GH_TOKEN：先执行 $env:DSH_GH_TOKEN = gh auth token");
  const headRefFile = path.join(GITDIR, "refs", "heads", BRANCH);
  if (!existsSync(headRefFile)) throw new Error("找不到 refs/heads/" + BRANCH);
  const headSha = readFileSync(headRefFile, "utf8").trim();

  const repo = await api("GET", `/repos/${OWNER}/${REPO}`);
  const refData = await api("GET", `/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`).catch(() => null);
  const boundary = refData && refData.object && refData.object.sha ? refData.object.sha : null;
  if (!boundary) throw new Error("GitHub 上的 main 不存在或读取失败");
  log("GitHub main =", boundary.slice(0, 10), "· 本地 HEAD =", headSha.slice(0, 10));
  if (boundary === headSha) { log("已是最新，无需推送"); return; }

  // 本地提交链：从 HEAD 走到边界
  const chain = [];
  let cur = headSha;
  while (true) {
    const c = parseCommit(cur);
    chain.push(c);
    if (c.sha === boundary) break;
    if (!c.parents.length) throw new Error("本地历史与 GitHub 无共同祖先");
    cur = c.parents[0];
    if (chain.length > 500) throw new Error("提交链过长，放弃");
  }
  chain.reverse();
  log("待推送提交", chain.length, "条");

  const apiSha = new Map();          // 本地 sha → GitHub 已确认 sha（内容一致时应相等）
  apiSha.set(boundary, boundary);
  let mismatches = 0;

  for (const c of chain) {
    if (c.sha === boundary) continue;
    const parentLocal = c.parents[0];
    const parentRemote = apiSha.get(parentLocal);
    if (!parentRemote) throw new Error("父提交不在 GitHub 上：" + parentLocal.slice(0, 10));

    // 1) 上传本提交新增的 blob
    const changes = treeChanges(parentLocal, c.tree);
    const createdBlobs = new Set();
    for (const ch of changes) {
      if (ch.sha === null) continue;
      if (ch.type !== "blob") continue;
      if (createdBlobs.has(ch.sha)) continue;
      createdBlobs.add(ch.sha);
      const { content } = readObject(ch.sha);
      await api("POST", `/repos/${OWNER}/${REPO}/git/blobs`, {
        content: content.toString("base64"),
        encoding: "base64"
      });
    }

    // 2) 基于父树构建新树（只提交变更路径；父树 sha 从 GitHub 读取，避免依赖本地对象）
    const parentRemoteCommit = await api("GET", `/repos/${OWNER}/${REPO}/git/commits/${parentRemote}`);
    const treeResp = await api("POST", `/repos/${OWNER}/${REPO}/git/trees`, {
      base_tree: parentRemoteCommit.tree.sha,
      tree: changes.map((ch) => ({
        path: ch.path,
        mode: ch.mode === null ? undefined : (ch.mode === "100755" ? "100755" : "100644"),
        type: ch.sha === null ? undefined : "blob",
        sha: ch.sha === null ? null : ch.sha
      }))
    });

    // 3) 创建提交
    const commitResp = await api("POST", `/repos/${OWNER}/${REPO}/git/commits`, {
      message: c.message,
      tree: treeResp.sha,
      parents: [parentRemote],
      author: c.author,
      committer: c.committer
    });
    if (commitResp.sha !== c.sha) {
      mismatches++;
      log("⚠ SHA 不一致（本地", c.sha.slice(0, 10), "vs GitHub", commitResp.sha.slice(0, 10), "）——已按 GitHub 侧继续");
    }
    apiSha.set(c.sha, commitResp.sha);
    log("✓", c.sha.slice(0, 10), c.message.split("\n")[0].slice(0, 48));
  }

  const finalSha = apiSha.get(headSha);
  // 4) 更新 main ref
  await api("PATCH", `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, { sha: finalSha, force: false });
  log("main →", finalSha.slice(0, 10));

  // 5) 建 tag（轻量：直接指向最终提交）
  const tagResp = await api("POST", `/repos/${OWNER}/${REPO}/git/refs`, { ref: TAG_REF, sha: finalSha })
    .catch(async (e) => {
      // 已存在则更新
      return api("PATCH", `/repos/${OWNER}/${REPO}/git/refs/tags/v2.0.0`, { sha: finalSha, force: true });
    });
  log("tag", TAG_REF, "→", finalSha.slice(0, 10));
  log("完成。mismatches =", mismatches);
}

main().catch((e) => { console.error("[push] 失败：", e.message); process.exit(1); });
