// src/rpc.ts
import { createReadStream, watch } from "node:fs";
import { mkdir as mkdir2, readFile as readFile4, rename, stat as stat3, writeFile as writeFile2 } from "node:fs/promises";
import os2 from "node:os";
import path5 from "node:path";
import { fileURLToPath } from "node:url";
import {
  addView,
  deleteView,
  moveView,
  parseBase as parseBase2,
  renameView,
  setFilters,
  setViewOption,
  stringifyBase,
  uniqueViewName,
  viewNameError
} from "@type32/obsidian-bases-parser";

// src/bases.ts
import path3 from "node:path";
import { parseBase, runQuery, toDisplay } from "@type32/obsidian-bases-parser";

// src/graph.ts
import { readFile as readFile2, stat as stat2 } from "node:fs/promises";
import path2 from "node:path";
import { parse as parseYaml2 } from "yaml";

// src/vault.ts
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
var DEFAULT_VAULT = "/Users/ruska/Documents/ob\u8D44\u6599\u5E93";
var SKIP_DIRS = /* @__PURE__ */ new Set([".git", ".obsidian", ".trash", "node_modules"]);
var MAX_TREE_ENTRIES = 4e3;
var MAX_TEXT_BYTES = 15e5;
var MAX_ASSET_BYTES = 25 * 1024 * 1024;
var VaultError = class extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.name = "VaultError";
    this.code = code;
  }
};
function expandHome(input) {
  const trimmed = input.trim();
  if (trimmed === "~") return os.homedir();
  if (trimmed.startsWith("~/")) return path.join(os.homedir(), trimmed.slice(2));
  return trimmed;
}
async function assertDirectory(input) {
  const expanded = expandHome(input);
  if (!expanded) throw new VaultError("empty-path", "\u76EE\u5F55\u4E0D\u80FD\u4E3A\u7A7A");
  const resolved = path.resolve(expanded);
  let info;
  try {
    info = await stat(resolved);
  } catch {
    throw new VaultError("not-found", `\u627E\u4E0D\u5230\u76EE\u5F55\uFF1A${resolved}`);
  }
  if (!info.isDirectory()) throw new VaultError("not-directory", `\u4E0D\u662F\u6587\u4EF6\u5939\uFF1A${resolved}`);
  return realpath(resolved);
}
function relativePath(root, absolute) {
  return path.relative(root, absolute).split(path.sep).join("/");
}
async function resolveInside(root, rel) {
  const rootReal = await realpath(root);
  const cleaned = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!cleaned || cleaned.split("/").includes("..")) throw new VaultError("outside", "\u8DEF\u5F84\u8D85\u51FA\u8D44\u6599\u5E93");
  const target = path.resolve(rootReal, cleaned);
  const relToRoot = path.relative(rootReal, target);
  if (relToRoot.startsWith("..") || path.isAbsolute(relToRoot)) throw new VaultError("outside", "\u8DEF\u5F84\u8D85\u51FA\u8D44\u6599\u5E93");
  return target;
}
async function walk(root, dir, budget) {
  let names;
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  names.sort((a, b) => a.localeCompare(b, "zh"));
  const dirs = [];
  const files = [];
  for (const name2 of names) {
    if (budget.left <= 0) break;
    if (name2.startsWith(".") || name2 === "node_modules") continue;
    const absolute = path.join(dir, name2);
    let info;
    try {
      info = await stat(absolute);
    } catch {
      continue;
    }
    budget.left -= 1;
    const rel = relativePath(root, absolute);
    if (info.isDirectory()) {
      if (SKIP_DIRS.has(name2)) continue;
      dirs.push({ name: name2, path: rel, type: "dir", children: await walk(root, absolute, budget) });
    } else if (info.isFile()) {
      files.push({ name: name2, path: rel, type: "file", ext: path.extname(name2).slice(1).toLowerCase() });
    }
  }
  return [...dirs, ...files];
}
async function readTree(root) {
  const budget = { left: MAX_TREE_ENTRIES };
  const tree = await walk(root, root, budget);
  return { tree, truncated: budget.left <= 0 };
}
function flatten(nodes, into = []) {
  for (const node of nodes) {
    if (node.type === "file") {
      const ext = node.ext ?? "";
      const stem = ext ? node.name.slice(0, -(ext.length + 1)) : node.name;
      into.push({ path: node.path, stem, ext });
    } else if (node.children) flatten(node.children, into);
  }
  return into;
}
var TEXT_EXT = /* @__PURE__ */ new Set(["md", "markdown", "txt", "csv", "json", "canvas", "base", "css", "js", "ts", "yml", "yaml"]);
var IMAGE_EXT = /* @__PURE__ */ new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp", "heic"]);
var AUDIO_EXT = /* @__PURE__ */ new Set(["m4a", "mp3", "wav", "ogg", "oga", "flac", "aac", "opus"]);
var VIDEO_EXT = /* @__PURE__ */ new Set(["mp4", "mov", "webm", "mkv", "m4v"]);
function kindFor(ext) {
  if (ext === "md" || ext === "markdown") return "markdown";
  if (ext === "pdf") return "pdf";
  if (ext === "base") return "base";
  if (IMAGE_EXT.has(ext)) return "image";
  if (AUDIO_EXT.has(ext)) return "audio";
  if (VIDEO_EXT.has(ext)) return "video";
  if (TEXT_EXT.has(ext)) return "text";
  return "binary";
}
async function readNote(root, rel) {
  const absolute = await resolveInside(root, rel);
  const info = await stat(absolute);
  if (!info.isFile()) throw new VaultError("not-file", "\u4E0D\u662F\u6587\u4EF6");
  if (info.size > MAX_TEXT_BYTES) throw new VaultError("too-large", "\u7B14\u8BB0\u592A\u5927\uFF0C\u9605\u8BFB\u89C6\u56FE\u53EA\u6253\u5F00 1.5 MB \u4EE5\u5185\u7684\u6587\u672C");
  const text = await readFile(absolute, "utf8");
  return { text, bytes: info.size, mtime: info.mtimeMs };
}
async function readAsset(root, rel) {
  const absolute = await resolveInside(root, rel);
  const info = await stat(absolute);
  if (!info.isFile()) throw new VaultError("not-file", "\u4E0D\u662F\u6587\u4EF6");
  if (info.size > MAX_ASSET_BYTES) throw new VaultError("too-large", "\u9644\u4EF6\u8D85\u8FC7 25 MB\uFF0C\u9762\u677F\u91CC\u4E0D\u9884\u89C8");
  return { absolute, bytes: info.size };
}
var WIKI = /!?\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
function wikiTargets(markdown) {
  const found = /* @__PURE__ */ new Set();
  for (const match of markdown.matchAll(WIKI)) {
    const raw = match[1]?.trim();
    if (raw) found.add(raw);
  }
  return [...found];
}
function findByTarget(index, target) {
  const cleaned = target.replace(/\\/g, "/").replace(/^\.\//, "");
  const base = path.posix.basename(cleaned);
  const stem = base.replace(/\.[^.]+$/, "");
  const exact = index.find((entry) => entry.path === cleaned || entry.path === `${cleaned}.md`);
  if (exact) return exact;
  const byName = index.filter((entry) => entry.stem === stem || entry.stem === base || path.posix.basename(entry.path) === base);
  return byName[0];
}

// src/graph.ts
var MAX_GRAPH_FILES = 2e3;
var WIKI2 = /(!?)\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g;
var TAG = /(^|[\s(（])#([^\s#)\]】，。、]+)/g;
async function buildGraph(root) {
  const listed = await readTree(root);
  const index = flatten(listed.tree).slice(0, MAX_GRAPH_FILES);
  const nodes = /* @__PURE__ */ new Map();
  const byStem = /* @__PURE__ */ new Map();
  for (const entry of index) {
    const absolute = path2.join(root, entry.path);
    const info = await stat2(absolute).catch(() => void 0);
    let frontmatter;
    const tags = [];
    const links = [];
    const embeds = [];
    if (entry.ext === "md" || entry.ext === "markdown") {
      try {
        const raw = await readFile2(absolute, "utf8");
        const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
        if (match) {
          try {
            const yaml = parseYaml2(match[1] ?? "");
            if (yaml && typeof yaml === "object" && !Array.isArray(yaml)) frontmatter = yaml;
          } catch {
            frontmatter = void 0;
          }
        }
        const body = match ? raw.slice(match[0].length) : raw;
        for (const found of body.matchAll(TAG)) tags.push(`#${found[2] ?? ""}`);
        for (const found of raw.matchAll(WIKI2)) {
          const link = (found[2] ?? "").trim();
          if (!link) continue;
          const record = { link, display: found[3] || link };
          if (found[1] === "!") embeds.push(record);
          else links.push(record);
        }
      } catch {
      }
    }
    nodes.set(entry.path, {
      path: entry.path,
      name: entry.ext === "md" || entry.ext === "markdown" ? entry.stem : entry.path.split("/").pop() ?? entry.path,
      stem: entry.stem,
      ext: entry.ext,
      folder: entry.path.includes("/") ? entry.path.slice(0, entry.path.lastIndexOf("/")) : "",
      ctime: info?.birthtimeMs ?? 0,
      mtime: info?.mtimeMs ?? 0,
      size: info?.size ?? 0,
      frontmatter,
      tags,
      links,
      embeds
    });
    byStem.set(entry.stem, entry.path);
  }
  const resolve = (link) => {
    const clean = link.replace(/^\.\//, "");
    if (nodes.has(clean)) return clean;
    if (nodes.has(`${clean}.md`)) return `${clean}.md`;
    return byStem.get(clean.replace(/\.[^.]+$/, "")) ?? null;
  };
  const backlinks = /* @__PURE__ */ new Map();
  for (const [source, node] of nodes) {
    for (const link of node.links) {
      const target = resolve(link.link);
      if (!target || target === source) continue;
      const list = backlinks.get(target) ?? [];
      list.push(source);
      backlinks.set(target, list);
    }
  }
  return { nodes, byStem, backlinks, paths: [...nodes.keys()], truncated: listed.truncated };
}
function resolveLink(graph, link) {
  const clean = link.replace(/^\.\//, "");
  if (graph.nodes.has(clean)) return clean;
  if (graph.nodes.has(`${clean}.md`)) return `${clean}.md`;
  return graph.byStem.get(clean.replace(/\.[^.]+$/, "")) ?? null;
}

// src/bases.ts
function formatDate(ms, withTime) {
  const date = new Date(ms);
  const pad = (value) => String(value).padStart(2, "0");
  const day = `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
  return withTime ? `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}` : day;
}
function displayValue(value) {
  if (value.type === "Date") return formatDate(value.ms, value.time);
  if (value.type === "Link") {
    return value.display ? `[[${value.path}|${value.display}]]` : `[[${value.path}]]`;
  }
  if (value.type === "List") return value.items.map((item) => displayValue(item)).join("\u3001");
  if (value.type === "Error") return value.message;
  return toDisplay(value);
}
async function renderBase(root, text, basePath = "") {
  const parsed = parseBase(text);
  if (parsed.error) return { views: [], error: parsed.error };
  const base = parsed.base;
  const graph = await buildGraph(root);
  const host = {
    file: (target) => graph.nodes.get(target) ?? null,
    resolve: (link, _from) => resolveLink(graph, link),
    backlinks: (target) => graph.backlinks.get(target) ?? []
  };
  const paths = graph.paths;
  const views = [];
  const notes = [];
  if (graph.truncated) notes.push(`\u8D44\u6599\u5E93\u6587\u4EF6\u592A\u591A\uFF0C\u53EA\u68C0\u67E5\u4E86\u524D ${graph.paths.length} \u4E2A\u3002`);
  for (const view of base.views) {
    const result = runQuery(base, view.name, {
      host,
      paths,
      now: Date.now(),
      thisPath: basePath || path3.basename(root)
    });
    const order = Array.isArray(view.order) ? view.order.filter((item) => typeof item === "string") : [];
    const grouping = view.groupBy?.property;
    const defaults = view.type === "table" ? ["file.name"] : ["file.name", "file.tags", "file.mtime", "file.backlinks"];
    const columns = order.length > 0 ? order : defaults;
    if (grouping && !columns.includes(grouping)) columns.push(grouping);
    const toRow = (row) => {
      const values = {};
      for (const column of columns) values[column] = displayValue(row.property(column));
      const file = graph.nodes.get(row.path);
      const name2 = displayValue(row.property("file.name")) || (row.path.split("/").pop() ?? row.path);
      return {
        path: row.path,
        name: name2,
        ext: file?.path.split(".").pop() ?? "",
        folder: displayValue(row.property("file.folder")),
        values
      };
    };
    const groups = result.groups.map((group) => ({
      key: group.key === null ? null : displayValue(group.key),
      rows: group.rows.map(toRow)
    }));
    const rows = result.rows.map(toRow);
    const summaries = {};
    for (const [property, value] of result.summaries) summaries[property] = displayValue(value);
    const viewNotes = [];
    if (result.total > rows.length) viewNotes.push(`\u53EA\u663E\u793A ${rows.length} \u6761\uFF0C\u5171 ${result.total} \u6761\u3002`);
    if (result.errors.length > 0) viewNotes.push(`${result.errors.length} \u884C\u7684\u7B5B\u9009\u8868\u8FBE\u5F0F\u51FA\u9519\uFF0C\u5DF2\u8DF3\u8FC7\u3002`);
    if (view.type !== "table" && !["cards", "list", "board", "kanban", "gallery"].includes(view.type)) {
      viewNotes.push(`\u300C${view.type}\u300D\u89C6\u56FE\u6309\u5217\u8868\u663E\u793A\u3002`);
    }
    views.push({
      name: view.name,
      type: view.type,
      columns,
      rows,
      groups,
      summaries,
      total: result.total,
      ...viewNotes.length > 0 ? { note: viewNotes.join(" ") } : {}
    });
  }
  if (notes.length > 0) {
    for (const view of views) view.note = [view.note, ...notes].filter(Boolean).join(" ");
  }
  return { views };
}

// src/frontmatter.ts
import { parse as parseYaml3 } from "yaml";
var ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
var ISO_DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;
var WIKILINK = /^\[\[[^\]]+\]\]$/;
function propertyKind(key, value) {
  if (typeof value === "boolean") return "checkbox";
  if (typeof value === "number") return "number";
  if (Array.isArray(value)) return key === "tags" ? "tags" : "list";
  if (typeof value === "string") {
    if (ISO_DATETIME.test(value)) return "datetime";
    if (ISO_DATE.test(value)) return "date";
    if (WIKILINK.test(value.trim())) return "link";
  }
  return "text";
}
function propertyText(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => propertyText(item)).filter(Boolean).join("\u3001");
  return JSON.stringify(value);
}
function splitFrontmatter(text) {
  const empty = { properties: [], body: text, raw: {} };
  if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) return empty;
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return empty;
  let parsed;
  try {
    parsed = parseYaml3(match[1] ?? "");
  } catch {
    return empty;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ...empty, body: text.slice(match[0].length) };
  const raw = parsed;
  const properties = Object.entries(raw).map(([key, value]) => ({
    key,
    kind: propertyKind(key, value),
    value: propertyText(value),
    ...Array.isArray(value) ? { items: value.map((item) => propertyText(item)).filter(Boolean) } : {}
  }));
  return { properties, body: text.slice(match[0].length), raw };
}

// src/settings.ts
import { mkdir, readFile as readFile3, writeFile } from "node:fs/promises";
import path4 from "node:path";
function settingsFile() {
  const home = process.env.DSH_HOME || path4.join(process.env.HOME || "", ".dsh");
  return path4.join(home, "dsh-notta", "settings.json");
}
async function readSavedPath() {
  try {
    const parsed = JSON.parse(await readFile3(settingsFile(), "utf8"));
    return typeof parsed.vaultPath === "string" && parsed.vaultPath.trim() ? parsed.vaultPath : void 0;
  } catch {
    return void 0;
  }
}
async function writeSavedPath(vaultPath) {
  const file = settingsFile();
  await mkdir(path4.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify({ vaultPath }, null, 2)}
`, "utf8");
}
async function resolveVaultPath(config) {
  const candidates = [await readSavedPath(), config?.vaultPath, DEFAULT_VAULT];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return await assertDirectory(candidate);
    } catch {
      continue;
    }
  }
  return DEFAULT_VAULT;
}

// src/rpc.ts
var ROUTE_PREFIX = "/dsh-notta";
var RPC_PATH = `${ROUTE_PREFIX}/rpc`;
var ASSET_PATH = `${ROUTE_PREFIX}/asset`;
var VENDOR_PREFIX = `${ROUTE_PREFIX}/vendor/`;
var EVENTS_PATH = `${ROUTE_PREFIX}/events`;
var MAX_BODY_BYTES = 64 * 1024;
var MIME = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
  ".css": "text/css; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".flac": "audio/flac",
  ".aac": "audio/aac",
  ".opus": "audio/ogg",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".bmp": "image/bmp",
  ".heic": "image/heic"
};
function sendJson(res, status, value) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(value));
}
async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new VaultError("payload", "\u8BF7\u6C42\u4F53\u8FC7\u5927");
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return {};
  return JSON.parse(text);
}
function asRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function parseQuery(input) {
  const terms = [];
  const pattern = /(path|file|tag|content):(?:"([^"]*)"|(\S+))|"([^"]*)"|(\S+)/gi;
  let match;
  while ((match = pattern.exec(input)) !== null) {
    const field = (match[1] ?? "").toLowerCase();
    const quoted = match[2];
    const bare = match[3];
    const freeQuoted = match[4];
    const free = match[5];
    const value = quoted ?? bare ?? freeQuoted ?? free ?? "";
    if (!value) continue;
    const mapped = field === "path" || field === "file" || field === "tag" ? field : "text";
    terms.push({ field: mapped, value });
  }
  return terms;
}
async function runSearch(root, query) {
  const terms = parseQuery(query);
  if (terms.length === 0) return [];
  const listed = await readTree(root);
  const index = flatten(listed.tree);
  const hits = [];
  let scanned = 0;
  for (const entry of index) {
    if (hits.length >= 30) break;
    const lowerPath = entry.path.toLowerCase();
    const lowerName = (entry.path.split("/").pop() ?? "").toLowerCase();
    let count = 0;
    let content;
    let tags = [];
    const needsContent = terms.some((term) => term.field === "tag" || term.field === "text");
    if (needsContent && (entry.ext === "md" || entry.ext === "markdown" || entry.ext === "txt" || entry.ext === "base" || entry.ext === "canvas")) {
      if (scanned >= 300) continue;
      scanned += 1;
      try {
        const raw = (await readNote(root, entry.path)).text;
        content = raw.toLowerCase();
        const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
        if (front) {
          try {
            const parsed = parseYaml(front[1] ?? "");
            const listedTags = parsed?.tags;
            tags = Array.isArray(listedTags) ? listedTags.map((item) => String(item).toLowerCase()) : typeof listedTags === "string" ? [listedTags.toLowerCase()] : [];
          } catch {
            tags = [];
          }
        }
      } catch {
        content = void 0;
      }
    }
    let ok = true;
    for (const term of terms) {
      const needle = term.value.toLowerCase();
      let found = 0;
      if (term.field === "path") found = lowerPath.includes(needle) ? 1 : 0;
      else if (term.field === "file") found = lowerName.includes(needle) ? 1 : 0;
      else if (term.field === "tag") {
        const hit = content?.includes(`#${needle}`) || tags.some((tag) => tag === needle || tag.startsWith(`${needle}/`));
        found = hit ? 1 : 0;
      } else found = content ? content.split(needle).length - 1 : lowerPath.includes(needle) ? 1 : 0;
      if (found === 0) {
        ok = false;
        break;
      }
      count += found;
    }
    if (!ok) continue;
    hits.push({
      path: entry.path,
      title: entry.stem,
      kind: kindFor(entry.ext),
      count: Math.max(count, 1)
    });
  }
  hits.sort((left, right) => right.count - left.count || left.path.localeCompare(right.path, "zh"));
  return hits;
}
async function browse(dirInput) {
  let dir;
  try {
    dir = await assertDirectory(dirInput);
  } catch {
    const parent2 = path5.dirname(expandHome(dirInput));
    dir = await assertDirectory(parent2).catch(() => assertDirectory(os2.homedir()));
  }
  const parent = path5.dirname(dir);
  const { readdir: readdir2, stat: stat4 } = await import("node:fs/promises");
  const names = await readdir2(dir);
  const dirs = [];
  for (const name2 of names.sort((a, b) => a.localeCompare(b, "zh"))) {
    if (name2.startsWith(".")) continue;
    try {
      const absolute = path5.join(dir, name2);
      if ((await stat4(absolute)).isDirectory()) dirs.push({ name: name2, path: absolute });
    } catch {
      continue;
    }
  }
  return { path: dir, parent: parent === dir ? null : parent, dirs };
}
async function dispatch(store, op, payload) {
  if (op === "status") {
    let exists = false;
    try {
      await assertDirectory(store.getPath());
      exists = true;
    } catch {
      exists = false;
    }
    return { vaultPath: store.getPath(), exists, settingsFile: settingsFile() };
  }
  if (op === "setVault") {
    const next = await assertDirectory(String(payload.path || ""));
    const saved = await store.setPath(next);
    return saved;
  }
  if (op === "browse") {
    const start = typeof payload.path === "string" && payload.path.trim() ? payload.path : store.getPath();
    return browse(start);
  }
  const root = await assertDirectory(store.getPath());
  if (op === "tree") {
    const listed = await readTree(root);
    return { vaultPath: root, ...listed, index: flatten(listed.tree) };
  }
  if (op === "fs.write") {
    const rel = String(payload.path || "");
    if (!/\.(md|markdown|txt|canvas|base)$/i.test(rel)) {
      throw new VaultError("not-text", "\u8FD9\u91CC\u53EA\u80FD\u4FDD\u5B58\u6587\u672C\u7B14\u8BB0");
    }
    const text = String(payload.text ?? "");
    if (text.length > 2e6) throw new VaultError("too-large", "\u5185\u5BB9\u8D85\u8FC7 2 MB\uFF0C\u9762\u677F\u91CC\u4E0D\u4FDD\u5B58");
    const absolute = await resolveInside(root, rel);
    const info = await stat3(absolute).catch(() => void 0);
    if (!info) throw new VaultError("not-found", "\u6587\u4EF6\u5DF2\u7ECF\u4E0D\u5728\u4E86");
    const expected = Number(payload.mtime);
    const force = payload.force === true;
    if (!force && Number.isFinite(expected) && Math.abs(info.mtimeMs - expected) > 1) {
      throw new VaultError("conflict", "\u6587\u4EF6\u5728\u78C1\u76D8\u4E0A\u88AB\u6539\u8FC7\u4E86\uFF0C\u5148\u51B3\u5B9A\u8981\u4E0D\u8981\u8986\u76D6");
    }
    const temporary = `${absolute}.dsh-notta-${process.pid}.tmp`;
    await writeFile2(temporary, text, "utf8");
    await rename(temporary, absolute);
    const after = await stat3(absolute);
    return { path: rel, mtime: after.mtimeMs, bytes: after.size };
  }
  if (op === "fs.delete") {
    const rel = String(payload.path || "").replace(/^\/+/, "");
    if (!rel) throw new VaultError("bad-request", "\u4E0D\u80FD\u5220\u9664\u8D44\u6599\u5E93\u6839\u76EE\u5F55");
    const absolute = await resolveInside(root, rel);
    const info = await stat3(absolute).catch(() => void 0);
    if (!info) throw new VaultError("not-found", "\u627E\u4E0D\u5230\u8981\u5220\u9664\u7684\u6761\u76EE");
    const trash = path5.join(root, ".trash");
    await mkdir2(trash, { recursive: true });
    const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
    const target = path5.join(trash, `${stamp}-${path5.basename(absolute)}`);
    await rename(absolute, target);
    return { path: rel, trashed: path5.relative(root, target).split(path5.sep).join("/") };
  }
  if (op === "fs.createNote" || op === "fs.createFolder" || op === "fs.rename" || op === "fs.move") {
    const from = String(payload.path || "").replace(/^\/+/, "");
    const rawName = String(payload.name || "").trim();
    if (rawName && (/[\\/]/.test(rawName) || rawName === "." || rawName === "..")) {
      throw new VaultError("bad-name", "\u540D\u79F0\u4E0D\u80FD\u5305\u542B / \u6216 \\");
    }
    const relToRoot = (absolute) => {
      const relative = path5.relative(root, absolute).split(path5.sep).join("/");
      if (!relative || relative.startsWith("..") || path5.isAbsolute(relative)) {
        throw new VaultError("outside", "\u8DEF\u5F84\u8D85\u51FA\u8D44\u6599\u5E93");
      }
      return relative;
    };
    if (op === "fs.rename") {
      if (!from) throw new VaultError("bad-request", "\u7F3A\u5C11\u539F\u8DEF\u5F84");
      if (!rawName) throw new VaultError("bad-name", "\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A");
      const absolute = await resolveInside(root, from);
      const target2 = path5.join(path5.dirname(absolute), rawName);
      const nextRel = relToRoot(target2);
      if (nextRel === from) return { path: from, kind: "file" };
      if (await stat3(target2).then(() => true).catch(() => false)) {
        throw new VaultError("exists", `\u5DF2\u7ECF\u6709\u4E00\u4E2A\u53EB\u300C${rawName}\u300D\u7684\u6761\u76EE\u4E86`);
      }
      await rename(absolute, target2);
      return { path: nextRel, kind: "file" };
    }
    if (op === "fs.move") {
      if (!from) throw new VaultError("bad-request", "\u7F3A\u5C11\u539F\u8DEF\u5F84");
      const dirInput2 = String(payload.dir || "").replace(/^\/+/, "");
      const absolute = await resolveInside(root, from);
      const dirAbs2 = dirInput2 ? await resolveInside(root, dirInput2) : root;
      const targetRel = relToRoot(path5.join(dirAbs2, path5.basename(absolute)));
      if (targetRel === from) return { path: from, kind: "file" };
      if (targetRel.startsWith(`${from}/`)) throw new VaultError("bad-target", "\u4E0D\u80FD\u628A\u6587\u4EF6\u5939\u79FB\u52A8\u5230\u5B83\u81EA\u5DF1\u91CC\u9762");
      const info = await stat3(absolute).catch(() => void 0);
      if (!info) throw new VaultError("not-found", "\u627E\u4E0D\u5230\u8981\u79FB\u52A8\u7684\u6761\u76EE");
      if (await stat3(path5.join(dirAbs2, path5.basename(absolute))).then(() => true).catch(() => false)) {
        throw new VaultError("exists", `\u76EE\u6807\u6587\u4EF6\u5939\u91CC\u5DF2\u7ECF\u6709\u300C${path5.basename(absolute)}\u300D\u4E86`);
      }
      await rename(absolute, path5.join(dirAbs2, path5.basename(absolute)));
      return { path: targetRel, kind: info.isDirectory() ? "dir" : "file" };
    }
    const dirInput = String(payload.dir || "").replace(/^\/+/, "");
    const dirAbs = dirInput ? await resolveInside(root, dirInput) : root;
    const noteMode = op === "fs.createNote";
    let name2 = rawName;
    if (!name2) {
      const base = "\u672A\u547D\u540D";
      name2 = noteMode ? `${base}.md` : base;
      let counter = 1;
      while (await stat3(path5.join(dirAbs, name2)).then(() => true).catch(() => false)) {
        name2 = noteMode ? `${base} ${counter}.md` : `${base} ${counter}`;
        counter += 1;
      }
    } else if (noteMode && !/\.md$/i.test(name2)) {
      name2 = `${name2}.md`;
    }
    const target = path5.join(dirAbs, name2);
    const createdRel = relToRoot(target);
    if (await stat3(target).then(() => true).catch(() => false)) {
      throw new VaultError("exists", `\u5DF2\u7ECF\u6709\u4E00\u4E2A\u53EB\u300C${name2}\u300D\u7684\u6761\u76EE\u4E86`);
    }
    if (noteMode) await writeFile2(target, "", "utf8");
    else await mkdir2(target);
    return { path: createdRel, kind: noteMode ? "markdown" : "dir" };
  }
  if (op === "base.addView" || op === "base.deleteView" || op === "base.renameView" || op === "base.setLayout" || op === "base.setFilter" || op === "base.moveView") {
    const rel = String(payload.path || "");
    if (!/\.base$/i.test(rel)) throw new VaultError("not-base", "\u53EA\u6709 .base \u6587\u4EF6\u80FD\u7F16\u8F91\u89C6\u56FE");
    const absolute = await resolveInside(root, rel);
    const text = await readFile4(absolute, "utf8");
    const parsed = parseBase2(text);
    if (parsed.error) throw new VaultError("base-parse", parsed.error);
    const base = parsed.base;
    let next = base;
    const view = typeof payload.view === "string" ? payload.view : "";
    if (op === "fs.write") {
      const rel2 = String(payload.path || "");
      if (!/\.(md|markdown|txt|canvas|base)$/i.test(rel2)) {
        throw new VaultError("not-text", "\u8FD9\u91CC\u53EA\u80FD\u4FDD\u5B58\u6587\u672C\u7B14\u8BB0");
      }
      const text2 = String(payload.text ?? "");
      if (text2.length > 2e6) throw new VaultError("too-large", "\u5185\u5BB9\u8D85\u8FC7 2 MB\uFF0C\u9762\u677F\u91CC\u4E0D\u4FDD\u5B58");
      const absolute2 = await resolveInside(root, rel2);
      const info = await stat3(absolute2).catch(() => void 0);
      if (!info) throw new VaultError("not-found", "\u6587\u4EF6\u5DF2\u7ECF\u4E0D\u5728\u4E86");
      const expected = Number(payload.mtime);
      const force = payload.force === true;
      if (!force && Number.isFinite(expected) && Math.abs(info.mtimeMs - expected) > 1) {
        throw new VaultError("conflict", "\u6587\u4EF6\u5728\u78C1\u76D8\u4E0A\u88AB\u6539\u8FC7\u4E86\uFF0C\u5148\u51B3\u5B9A\u8981\u4E0D\u8981\u8986\u76D6");
      }
      const temporary = `${absolute2}.dsh-notta-${process.pid}.tmp`;
      await writeFile2(temporary, text2, "utf8");
      await rename(temporary, absolute2);
      const after = await stat3(absolute2);
      return { path: rel2, mtime: after.mtimeMs, bytes: after.size };
    }
    if (op === "fs.delete") {
      const rel2 = String(payload.path || "").replace(/^\/+/, "");
      if (!rel2) throw new VaultError("bad-request", "\u4E0D\u80FD\u5220\u9664\u8D44\u6599\u5E93\u6839\u76EE\u5F55");
      const absolute2 = await resolveInside(root, rel2);
      const info = await stat3(absolute2).catch(() => void 0);
      if (!info) throw new VaultError("not-found", "\u627E\u4E0D\u5230\u8981\u5220\u9664\u7684\u6761\u76EE");
      const trash = path5.join(root, ".trash");
      await mkdir2(trash, { recursive: true });
      const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
      const target = path5.join(trash, `${stamp}-${path5.basename(absolute2)}`);
      await rename(absolute2, target);
      return { path: rel2, trashed: path5.relative(root, target).split(path5.sep).join("/") };
    }
    if (op === "fs.createNote" || op === "fs.createFolder") {
      const dir = String(payload.dir || "").replace(/^\/+/, "");
      const name2 = String(payload.name || "").trim();
      if (!name2) throw new VaultError("bad-name", "\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A");
      if (/[\\/]/.test(name2) || name2 === "." || name2 === "..") throw new VaultError("bad-name", "\u540D\u79F0\u4E0D\u80FD\u5305\u542B / \u6216 \\");
      const dirAbs = dir ? await resolveInside(root, dir) : root;
      const target = path5.join(dirAbs, op === "fs.createNote" ? `${name2}.md` : name2);
      const relPath = path5.relative(root, target).split(path5.sep).join("/");
      if (!relPath || relPath.startsWith("..") || path5.isAbsolute(relPath)) {
        throw new VaultError("outside", "\u8DEF\u5F84\u8D85\u51FA\u8D44\u6599\u5E93");
      }
      const exists = await stat3(target).then(() => true).catch(() => false);
      if (exists) throw new VaultError("exists", `\u5DF2\u7ECF\u6709\u4E00\u4E2A\u53EB\u300C${path5.basename(target)}\u300D\u7684\u6761\u76EE\u6807\u4E86`);
      if (op === "fs.createNote") await writeFile2(target, "", "utf8");
      else await mkdir2(target);
      return { path: relPath, kind: op === "fs.createNote" ? "markdown" : "dir" };
    }
    if (op === "base.addView") {
      next = addView(base, typeof payload.type === "string" && payload.type.trim() ? payload.type.trim() : "table");
      if (typeof payload.name === "string" && payload.name.trim()) {
        const created = next.views[next.views.length - 1]?.name;
        if (created) next = renameView(next, created, uniqueViewName(next, payload.name.trim()));
      }
    } else if (op === "base.deleteView") {
      if (!view) throw new VaultError("bad-request", "\u7F3A\u5C11\u89C6\u56FE\u540D");
      if (base.views.length <= 1) throw new VaultError("last-view", "\u81F3\u5C11\u8981\u4FDD\u7559\u4E00\u4E2A\u89C6\u56FE");
      if (!base.views.some((item) => item.name === view)) throw new VaultError("not-found", `\u6CA1\u6709\u53EB\u300C${view}\u300D\u7684\u89C6\u56FE`);
      next = deleteView(base, view);
    } else if (op === "base.renameView") {
      const to = String(payload.to || "").trim();
      if (!view) throw new VaultError("bad-request", "\u7F3A\u5C11\u89C6\u56FE\u540D");
      if (!to) throw new VaultError("bad-request", "\u65B0\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A");
      const problem = viewNameError(base, to, view);
      if (problem) throw new VaultError("bad-name", problem);
      next = renameView(base, view, to);
    } else if (op === "base.setLayout") {
      const type = String(payload.type || "");
      if (!["table", "cards", "list", "board", "kanban"].includes(type)) {
        throw new VaultError("bad-request", "\u4E0D\u652F\u6301\u7684\u5E03\u5C40");
      }
      next = setViewOption(base, view, "type", type);
    } else if (op === "base.setFilter") {
      const expression = typeof payload.expression === "string" ? payload.expression.trim() : "";
      next = setFilters(base, view, expression ? expression : null);
    } else {
      const index = Number(payload.index);
      if (!Number.isInteger(index) || index < 0 || index >= base.views.length) {
        throw new VaultError("bad-request", "\u76EE\u6807\u4F4D\u7F6E\u8D85\u51FA\u8303\u56F4");
      }
      next = moveView(base, view, index);
    }
    const written = stringifyBase(next);
    await writeFile2(absolute, written, "utf8");
    return {
      path: rel,
      kind: "base",
      bytes: Buffer.byteLength(written, "utf8"),
      title: path5.posix.basename(rel, path5.posix.extname(rel)),
      base: await renderBase(root, written, rel)
    };
  }
  if (op === "links") {
    const rel = String(payload.path || "");
    const graph = await buildGraph(root);
    const node = graph.nodes.get(rel);
    if (!node) throw new VaultError("not-found", "\u627E\u4E0D\u5230\u8FD9\u7BC7\u7B14\u8BB0");
    const nameOf = (target) => graph.nodes.get(target)?.name ?? target;
    const backlinks = [...new Set(graph.backlinks.get(rel) ?? [])].map((source) => ({ path: source, title: nameOf(source) }));
    const seen = /* @__PURE__ */ new Set();
    const outlinks = [];
    for (const link of node.links) {
      const target = resolveLink(graph, link.link);
      const key = target ?? link.link;
      if (seen.has(key)) continue;
      seen.add(key);
      outlinks.push({
        label: link.display,
        path: target,
        title: target ? nameOf(target) : null
      });
    }
    const embeds = [];
    const seenEmbeds = /* @__PURE__ */ new Set();
    for (const embed of node.embeds) {
      const target = resolveLink(graph, embed.link);
      const key = target ?? embed.link;
      if (seenEmbeds.has(key)) continue;
      seenEmbeds.add(key);
      embeds.push({ label: embed.display, path: target, title: target ? nameOf(target) : null });
    }
    return { path: rel, backlinks, outlinks, embeds };
  }
  if (op === "search") {
    const query = String(payload.query || "");
    if (!query.trim()) throw new VaultError("empty-query", "\u641C\u7D22\u5185\u5BB9\u4E0D\u80FD\u4E3A\u7A7A");
    return { query, hits: await runSearch(root, query) };
  }
  if (op === "read") {
    const rel = String(payload.path || "");
    const ext = path5.posix.extname(rel).slice(1).toLowerCase();
    const kind = kindFor(ext);
    if (kind === "binary" || kind === "pdf" || kind === "image") {
      const asset = await readAsset(root, rel);
      return { path: rel, kind, bytes: asset.bytes, title: path5.posix.basename(rel, path5.posix.extname(rel)) };
    }
    const note = await readNote(root, rel);
    if (kind === "base") {
      return {
        path: rel,
        kind,
        bytes: note.bytes,
        title: path5.posix.basename(rel, path5.posix.extname(rel)),
        base: await renderBase(root, note.text, rel)
      };
    }
    const split = kind === "markdown" ? splitFrontmatter(note.text) : { properties: [], body: note.text };
    const listed = await readTree(root);
    const index = flatten(listed.tree);
    const embeds = {};
    const files = {};
    const noteDir = path5.posix.dirname(rel);
    if (kind === "markdown") {
      const embedTargets = /* @__PURE__ */ new Set();
      for (const embedded of split.body.matchAll(/!\[\[([^\]|#]+)/g)) {
        const target = (embedded[1] ?? "").trim();
        if (target) embedTargets.add(target);
      }
      for (const target of wikiTargets(split.body)) {
        const hit = findByTarget(index, target);
        if (!hit) continue;
        const record = { path: hit.path, kind: kindFor(hit.ext), ext: hit.ext };
        if (hit.ext === "base" && embedTargets.has(target)) {
          try {
            const baseText = (await readNote(root, hit.path)).text;
            record.base = await renderBase(root, baseText, hit.path);
          } catch {
          }
        }
        files[target] = record;
        if (!files[hit.path]) files[hit.path] = record;
        if (hit.ext !== "md" && hit.ext !== "markdown") continue;
        if (embeds[target] || embeds[hit.stem]) continue;
        try {
          const linked = await readNote(root, hit.path);
          const body = splitFrontmatter(linked.text).body;
          const embedded = { markdown: body, title: hit.stem, path: hit.path };
          embeds[target] = embedded;
          embeds[hit.stem] = embedded;
          embeds[hit.path] = embedded;
        } catch {
          continue;
        }
      }
      for (const match of split.body.matchAll(/!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
        const src = match[1] ?? "";
        if (!src || /^(https?:|data:)/i.test(src)) continue;
        let decoded = src;
        try {
          decoded = decodeURIComponent(src);
        } catch {
          decoded = src;
        }
        const fromNote = path5.posix.normalize(path5.posix.join(noteDir === "." ? "" : noteDir, decoded));
        const exact = index.find((entry) => entry.path === fromNote || entry.path === decoded);
        const hit = exact ?? findByTarget(index, path5.posix.basename(decoded));
        if (!hit) continue;
        const record = { path: hit.path, kind: kindFor(hit.ext), ext: hit.ext };
        files[src] = record;
        if (!files[hit.path]) files[hit.path] = record;
      }
    }
    return {
      path: rel,
      kind,
      bytes: note.bytes,
      title: path5.posix.basename(rel, path5.posix.extname(rel)),
      text: kind === "markdown" ? split.body : note.text,
      mtime: note.mtime,
      properties: split.properties,
      embeds,
      files,
      noteDir
    };
  }
  throw new VaultError("unknown-op", `\u672A\u77E5\u64CD\u4F5C\uFF1A${op || "(\u7A7A)"}`);
}
function vendorRoot() {
  return path5.resolve(path5.dirname(fileURLToPath(import.meta.url)), "../vendor");
}
function registerRoutes(ctx, store) {
  const webServer = ctx.webServer;
  if (!webServer) throw new Error("dsh-notta \u9700\u8981 webServer\uFF0C\u5F53\u524D profile \u6CA1\u6709\u7F51\u9875\u670D\u52A1");
  const clients = /* @__PURE__ */ new Set();
  let watcher;
  let watchedRoot;
  let debounce;
  const ensureWatch = async () => {
    const root = await assertDirectory(store.getPath());
    if (watcher && watchedRoot === root) return;
    watcher?.close();
    watchedRoot = root;
    try {
      watcher = watch(root, { recursive: true }, (_event, filename) => {
        const name2 = String(filename ?? "");
        if (name2.startsWith(".trash") || name2.startsWith(".obsidian")) return;
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => {
          for (const client of clients) client.write('data: {"type":"change"}\n\n');
        }, 250);
      });
      watcher.on("error", () => {
        watcher?.close();
        watcher = void 0;
      });
    } catch {
      watcher = void 0;
    }
  };
  const disposeRoute = webServer.register({
    kind: "prefix",
    path: ROUTE_PREFIX,
    handler: async (req, res) => {
      const rejection = ctx.connection?.requestRejection(req);
      if (rejection !== void 0) {
        res.statusCode = rejection;
        res.end();
        return;
      }
      const url = new URL(req.url ?? "/", "http://localhost");
      try {
        if (req.method === "GET" && url.pathname.startsWith(VENDOR_PREFIX)) {
          const name2 = path5.basename(url.pathname);
          if (name2 !== path5.basename(decodeURIComponent(url.pathname.slice(VENDOR_PREFIX.length)))) {
            res.statusCode = 400;
            res.end();
            return;
          }
          const file = path5.join(vendorRoot(), name2);
          const ext = path5.extname(name2);
          res.statusCode = 200;
          res.setHeader("content-type", MIME[ext] || "application/octet-stream");
          res.setHeader("cache-control", "public, max-age=86400");
          createReadStream(file).on("error", () => {
            if (!res.headersSent) res.statusCode = 404;
            res.end();
          }).pipe(res);
          return;
        }
        if (req.method === "GET" && url.pathname === EVENTS_PATH) {
          await ensureWatch();
          res.writeHead(200, {
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-store",
            connection: "keep-alive"
          });
          res.write("retry: 2000\n\n");
          res.write('data: {"type":"ready"}\n\n');
          clients.add(res);
          const ping = setInterval(() => {
            res.write(": ping\n\n");
          }, 25e3);
          req.on("close", () => {
            clearInterval(ping);
            clients.delete(res);
          });
          return;
        }
        if (req.method === "GET" && url.pathname === ASSET_PATH) {
          const rel = url.searchParams.get("path") || "";
          const root = await assertDirectory(store.getPath());
          const asset = await readAsset(root, rel);
          const ext = path5.extname(asset.absolute).toLowerCase();
          res.statusCode = 200;
          res.setHeader("content-type", MIME[ext] || "application/octet-stream");
          res.setHeader("content-disposition", "inline");
          res.setHeader("cache-control", "private, max-age=60");
          res.setHeader("x-content-type-options", "nosniff");
          createReadStream(asset.absolute).pipe(res);
          return;
        }
        if (req.method !== "POST" || url.pathname !== RPC_PATH) {
          sendJson(res, 404, { ok: false, error: { code: "not-found", message: "\u63A5\u53E3\u4E0D\u5B58\u5728" } });
          return;
        }
        const body = asRecord(await readJsonBody(req));
        const value = await dispatch(store, String(body.op || ""), asRecord(body.payload));
        sendJson(res, 200, { ok: true, value });
      } catch (error) {
        const failure = error instanceof VaultError ? { code: error.code, message: error.message } : { code: "failed", message: error instanceof Error ? error.message : String(error) };
        if (!res.headersSent) sendJson(res, 200, { ok: false, error: failure });
        else res.end();
      }
    }
  });
  return () => {
    disposeRoute();
    if (debounce) clearTimeout(debounce);
    watcher?.close();
    watcher = void 0;
    for (const client of clients) client.end();
    clients.clear();
  };
}
async function saveVaultPath(ctx, config, next, options = {}) {
  const editor = options.config === false ? void 0 : ctx.get?.("configEditor");
  const entry = ctx.fiber?.entry;
  if (editor?.edit && entry) {
    try {
      await editor.edit(entry, (current) => ({ ...current, ...config, vaultPath: next }));
      await writeSavedPath(next);
      return "config";
    } catch {
      await writeSavedPath(next);
      return "file";
    }
  }
  await writeSavedPath(next);
  return "file";
}

// src/index.ts
var name = "dsh-notta";
var inject = [];
function apply(ctx, rawConfig) {
  let vaultPath = rawConfig?.vaultPath || DEFAULT_VAULT;
  const store = {
    getPath: () => vaultPath,
    setPath: async (next) => {
      await saveVaultPath(ctx, rawConfig ?? {}, next, { config: false });
      vaultPath = next;
      return { vaultPath: next, saved: "file" };
    }
  };
  ctx.inject(["connection", "webServer"], (scope) => {
    scope.effect(() => {
      let disposed = false;
      void resolveVaultPath(rawConfig).then((resolved) => {
        if (!disposed) vaultPath = resolved;
      });
      const stop = registerRoutes(scope, store);
      return () => {
        disposed = true;
        stop();
      };
    }, "dsh-notta: routes");
  });
}
export {
  apply,
  inject,
  name
};
