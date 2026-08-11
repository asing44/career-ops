"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => InboxWardenPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian6 = require("obsidian");

// src/settings.ts
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  apiKey: "",
  model: "claude-haiku-4-5",
  confidenceThreshold: 0.7,
  batchCap: 40,
  dryRun: true,
  // default-on until P3 sign-off
  captureFolder: "05 - Capture",
  terminalStatuses: ["archived", "completed", "processed"],
  typeRoutesPath: "00 - META/Skill-Configs/type-routes.json",
  operationsFolders: [
    "50 - Operations/Projects",
    "50 - Operations/Pursuits",
    "50 - Operations/Intervals",
    "50 - Operations/Adventures"
  ],
  ribbonIcon: "inbox"
};
var InboxWardenSettingTab = class extends import_obsidian.PluginSettingTab {
  plugin;
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian.Setting(containerEl).setName("Anthropic API key").setDesc(
      "Stored in plain text in this plugin's data.json. Used only for the unconfident-item classification batch."
    ).addText(
      (t) => t.setPlaceholder("sk-ant-\u2026").setValue(this.plugin.settings.apiKey).onChange(async (v) => {
        this.plugin.settings.apiKey = v.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Model").setDesc("Model for the classification batch call.").addText(
      (t) => t.setValue(this.plugin.settings.model).onChange(async (v) => {
        this.plugin.settings.model = v.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Confidence threshold").setDesc("Rule confidence below this escalates to the Claude batch (0\u20131).").addSlider(
      (s) => s.setLimits(0, 1, 0.05).setValue(this.plugin.settings.confidenceThreshold).setDynamicTooltip().onChange(async (v) => {
        this.plugin.settings.confidenceThreshold = v;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Sidebar icon").setDesc(
      "Lucide icon name for the ribbon button (e.g. inbox, mail, trash, list-checks). Browse names at lucide.dev. Applies immediately."
    ).addText(
      (t) => t.setPlaceholder("inbox").setValue(this.plugin.settings.ribbonIcon).onChange(async (v) => {
        this.plugin.settings.ribbonIcon = v.trim() || "inbox";
        await this.plugin.saveSettings();
        this.plugin.refreshRibbon();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Dry run").setDesc("Preview frontmatter changes without writing anything.").addToggle(
      (t) => t.setValue(this.plugin.settings.dryRun).onChange(async (v) => {
        this.plugin.settings.dryRun = v;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Capture folder").addText(
      (t) => t.setValue(this.plugin.settings.captureFolder).onChange(async (v) => {
        this.plugin.settings.captureFolder = v.replace(/\/$/, "");
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Terminal statuses").setDesc("Comma-separated. Items with these statuses are not inbox-eligible.").addText(
      (t) => t.setValue(this.plugin.settings.terminalStatuses.join(", ")).onChange(async (v) => {
        this.plugin.settings.terminalStatuses = v.split(",").map((s) => s.trim()).filter(Boolean);
        await this.plugin.saveSettings();
      })
    );
  }
};

// src/sweep.ts
var BODY_CAP = 600;
function isEligible(fm, fileName, settings) {
  if (fileName.startsWith("_") || fileName === ".md") return false;
  if (!fm || Object.keys(fm).length === 0) return true;
  if (fm["skipped_at"]) return false;
  const relates = fm["relates_to"];
  if (relates && (!Array.isArray(relates) || relates.length > 0)) return false;
  const status = fm["status"];
  if (typeof status === "string" && settings.terminalStatuses.includes(status))
    return false;
  return true;
}
async function sweepInbox(app, settings) {
  const prefix = settings.captureFolder + "/";
  const files = app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(prefix));
  const items = [];
  for (const file of files) {
    const cache = app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter;
    if (!isEligible(fm, file.name, settings)) continue;
    items.push({
      file,
      title: file.basename,
      body: await readBody(app, file),
      hasFrontmatter: !!fm && Object.keys(fm).length > 0,
      frontmatter: fm ?? {},
      suggestion: null,
      resolution: "pending"
    });
  }
  items.sort((a, b) => b.file.stat.ctime - a.file.stat.ctime);
  return items;
}
async function readBody(app, file) {
  const raw = await app.vault.cachedRead(file);
  const body = raw.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
  return body.length > BODY_CAP ? body.slice(0, BODY_CAP) + "\u2026" : body;
}

// src/view/TriageView.ts
var import_obsidian5 = require("obsidian");

// src/inventory.ts
var ACTIVE_STATUSES = /* @__PURE__ */ new Set(["in-progress", "todo", "scheduled"]);
function activeParents(app, settings) {
  const parents = [];
  for (const folder of settings.operationsFolders) {
    const prefix = folder + "/";
    for (const file of app.vault.getMarkdownFiles()) {
      if (!file.path.startsWith(prefix)) continue;
      const fm = app.metadataCache.getFileCache(file)?.frontmatter;
      const status = fm?.["status"];
      if (typeof status === "string" && !ACTIVE_STATUSES.has(status)) continue;
      parents.push({
        path: file.path,
        name: file.basename,
        kind: folder.split("/").pop()?.toLowerCase().replace(/s$/, "") ?? ""
      });
    }
  }
  return parents.sort((a, b) => a.name.localeCompare(b.name));
}

// src/typeRoutes.ts
var import_obsidian2 = require("obsidian");
async function loadTypeRoutes(app, settings) {
  const file = app.vault.getFileByPath(settings.typeRoutesPath);
  if (!file) {
    new import_obsidian2.Notice(
      `Inbox Warden: type-routes.json not found at ${settings.typeRoutesPath}`
    );
    return {};
  }
  try {
    const raw = await app.vault.cachedRead(file);
    return JSON.parse(raw);
  } catch (e) {
    new import_obsidian2.Notice(`Inbox Warden: failed to parse type-routes.json (${e})`);
    return {};
  }
}

// src/rules/enums.ts
var VALID_TYPES = [
  "project",
  "pursuit",
  "shop",
  "gift",
  "interval",
  "adventure",
  "print",
  "meeting",
  "task",
  "note",
  "event",
  "recipe",
  "reflection",
  "literature",
  "quote",
  "term",
  "fleeting"
];
var VALID_TYPE_SET = new Set(VALID_TYPES);
var VALID_URGENCY = ["4-crit", "3-high", "2-med", "1-low"];
var VALID_URGENCY_SET = new Set(VALID_URGENCY);
var VALID_RETURN = [
  "4-pivotal",
  "3-solid",
  "2-nice",
  "1-trivial"
];
var VALID_RETURN_SET = new Set(VALID_RETURN);
var VALID_DISPOSITIONS = [
  "route",
  "delete",
  "skip",
  "parent-link"
];
var VALID_DISPOSITION_SET = new Set(VALID_DISPOSITIONS);
var AREA_TAGS = /* @__PURE__ */ new Set([
  "home",
  "health",
  "work",
  "finances",
  "together",
  "improvement",
  "creative",
  "systems",
  "metaself"
]);
var UMBRELLA_TAGS = /* @__PURE__ */ new Set([
  "philosophy",
  "mind",
  "design",
  "productivity",
  "living"
]);
var CTX_TAGS = /* @__PURE__ */ new Set([
  "ctx/weekend",
  "ctx/errand",
  "ctx/together"
]);
var URGENCY_RANK = {
  "1-low": 1,
  "2-med": 2,
  "3-high": 3,
  "4-crit": 4
};
var RETURN_FALLBACK = {
  project: "3-solid",
  pursuit: "3-solid",
  interval: "3-solid",
  shop: "2-nice",
  gift: "2-nice",
  adventure: "2-nice",
  print: "2-nice",
  recipe: "2-nice",
  event: "2-nice",
  literature: "2-nice",
  reflection: "2-nice",
  meeting: "1-trivial",
  quote: "1-trivial",
  term: "1-trivial"
};

// src/rules/timeSignals.ts
function plainDate(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day));
}
function isoDate(d) {
  return d.toISOString().slice(0, 10);
}
function addDays(d, n) {
  return new Date(d.getTime() + n * 864e5);
}
function weekday(d) {
  return (d.getUTCDay() + 6) % 7;
}
function pmod(n, m) {
  return (n % m + m) % m;
}
function monthEnd(year, month) {
  const nxt = plainDate(year + (month === 12 ? 1 : 0), month % 12 + 1, 1);
  return addDays(nxt, -1);
}
function nextWeekday(today, wd) {
  return addDays(today, pmod(wd - weekday(today) - 1, 7) + 1);
}
function upcomingSunday(today) {
  return nextWeekday(today, 6);
}
var URL_RE = /https?:\/\/\S+/g;
var FENCE_RE = /```[\s\S]*?```/g;
var NOISE_LINE_RE = /^.*(?:INPUT\[|BUTTON\[|meta-bind|templateFile|- \[x\]).*$/gm;
var URGENT_RE = /\b(?:soon|asap)\b/i;
var DOW = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6
};
var MONTHS = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12
};
var BY = "\\b(?:by|before)\\s+(?:the\\s+)?";
var DOW_RX = Object.keys(DOW).join("|");
var MON_RX = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");
var RE_BY_TOMORROW = new RegExp(`${BY}tomorrow\\b`);
var RE_BY_DOW = new RegExp(`${BY}(${DOW_RX})\\b`);
var RE_BY_MON_DAY = new RegExp(`${BY}(${MON_RX})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`);
var RE_BY_MON = new RegExp(`${BY}(${MON_RX})\\b`);
var RE_BY_END_OF = new RegExp(
  `${BY}end\\s+of\\s+(?:the\\s+)?(week|weekend|month|year|summer|fall|autumn|winter|spring)\\b`
);
var RE_THIS_WINDOW = /\bthis\s+(week|weekend|month|summer|fall|autumn|winter|spring)\b/;
function seasonEnd(season, today) {
  let d;
  if (season === "fall" || season === "autumn") {
    d = plainDate(today.getUTCFullYear(), 11, 30);
  } else if (season === "summer") {
    d = plainDate(today.getUTCFullYear(), 8, 31);
  } else if (season === "spring") {
    d = plainDate(today.getUTCFullYear(), 5, 31);
  } else {
    const y = today.getUTCMonth() + 1 >= 3 ? today.getUTCFullYear() + 1 : today.getUTCFullYear();
    d = monthEnd(y, 2);
  }
  if (d.getTime() < today.getTime()) {
    d = season === "winter" ? monthEnd(d.getUTCFullYear() + 1, 2) : plainDate(d.getUTCFullYear() + 1, d.getUTCMonth() + 1, d.getUTCDate());
  }
  return d;
}
function windowEnd(word, today) {
  if (word === "week" || word === "weekend") return upcomingSunday(today);
  if (word === "month") return monthEnd(today.getUTCFullYear(), today.getUTCMonth() + 1);
  if (word === "year") return plainDate(today.getUTCFullYear(), 12, 31);
  return seasonEnd(word, today);
}
function resolveDeadline(scan, today) {
  const s = scan.toLowerCase();
  if (RE_BY_TOMORROW.test(s)) return isoDate(addDays(today, 1));
  let m = s.match(RE_BY_DOW);
  if (m) return isoDate(nextWeekday(today, DOW[m[1]]));
  m = s.match(RE_BY_MON_DAY);
  if (m) {
    const mo = MONTHS[m[1]];
    const day = parseInt(m[2], 10);
    let d = plainDate(today.getUTCFullYear(), mo, day);
    if (d.getUTCMonth() + 1 !== mo || d.getUTCDate() !== day) return null;
    if (d.getTime() < today.getTime()) d = plainDate(d.getUTCFullYear() + 1, mo, day);
    return isoDate(d);
  }
  m = s.match(RE_BY_MON);
  if (m) {
    let d = monthEnd(today.getUTCFullYear(), MONTHS[m[1]]);
    if (d.getTime() < today.getTime()) d = monthEnd(d.getUTCFullYear() + 1, d.getUTCMonth() + 1);
    return isoDate(d);
  }
  m = s.match(RE_BY_END_OF);
  if (m) return isoDate(windowEnd(m[1], today));
  m = s.match(RE_THIS_WINDOW);
  if (m) return isoDate(windowEnd(m[1], today));
  return null;
}
function cleanBody(body) {
  if (!body) return "";
  let t = body.replace(FENCE_RE, " ");
  t = t.replace(NOISE_LINE_RE, " ");
  return t.replace(URL_RE, " ");
}
function extractTimeSignals(title, body, today) {
  const scan = (title || "") + "\n" + cleanBody(body);
  return {
    urgency: URGENT_RE.test(scan) ? "3-high" : null,
    deadline: resolveDeadline(scan, today)
  };
}
function mergeTimeSignals(suggestion, signals) {
  const next = signals.urgency;
  if (next && (URGENCY_RANK[suggestion.urgency ?? ""] ?? 0) < URGENCY_RANK[next]) {
    suggestion.urgency = next;
  }
  if (signals.deadline && !suggestion.deadline) {
    suggestion.deadline = signals.deadline;
  }
  return suggestion;
}

// src/rules/signals.ts
function escape(word) {
  return word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function hasWord(text, ...terms) {
  return terms.some((t) => new RegExp(`\\b${escape(t)}\\b`, "i").test(text));
}

// src/rules/tags.ts
var AREA_KEYWORDS = [
  ["home", ["townhome", "decor", "chore", "chores", "repair", "kitchen", "garage", "furniture", "vent", "vents", "lawn", "closet", "domestic", "dimensions"]],
  ["health", ["fitness", "workout", "nutrition", "medical", "sleep", "doctor", "gym", "diet", "therapy", "dentist"]],
  ["work", ["trinoor", "nuclear", "phep", "helix", "assetsuite", "client", "career", "hss"]],
  ["finances", ["budget", "spending", "invest", "investment", "bill", "actualbudget", "savings"]],
  ["together", ["meegy", "megan", "date night", "family", "friends", "relationship"]],
  ["improvement", ["learn", "learning", "course", "study", "skill-building", "read"]],
  ["creative", ["art", "music", "guitar", "paint", "drawing", "craft", "song"]],
  ["systems", ["claudius", "claude api", "pkm", "automation", "make.com", "obsidian", "vault", "mcp", "widget", "skill"]],
  ["metaself", ["values", "future self", "vision", "stoic", "meaning", "purpose", "identity"]]
];
var UMBRELLA_KEYWORDS = [
  ["philosophy", ["philosophy", "stoic", "ethics", "meaning of"]],
  ["mind", ["mindset", "psychology", "cognition", "attention", "focus"]],
  ["design", ["design", "layout", "typography", "aesthetic"]],
  ["productivity", ["productivity", "workflow", "efficiency", "system"]],
  ["living", ["lifestyle", "daily life", "home life", "living"]]
];
var CTX_KEYWORDS = [
  ["ctx/errand", /\b(costco|target|store|errand|while (we're |i'm )?out|pick up.*(store|shop))\b/i],
  ["ctx/weekend", /\b(this weekend|on the weekend|weekend trip|try that trail)\b/i],
  ["ctx/together", /\b(date night|with meegy|both free|together we)\b/i]
];
function inferTags(title, body) {
  const text = `${title}
${body}`;
  const out = [];
  for (const [tag, kws] of AREA_KEYWORDS) if (hasWord(text, ...kws)) out.push(tag);
  for (const [tag, kws] of UMBRELLA_KEYWORDS) if (hasWord(text, ...kws)) out.push(tag);
  for (const [tag, re] of CTX_KEYWORDS) if (re.test(text)) out.push(tag);
  return [...new Set(out)];
}
function normalizeTags(tags) {
  const out = [];
  for (const t of tags) {
    if (typeof t !== "string") continue;
    if (AREA_TAGS.has(t) || UMBRELLA_TAGS.has(t) || CTX_TAGS.has(t) || t.startsWith("topic/")) {
      if (!out.includes(t)) out.push(t);
    }
  }
  return out;
}

// src/rules/typeInference.ts
var PRODUCT_NOUNS = [
  "cable",
  "cord",
  "mount",
  "bracket",
  "holder",
  "organizer",
  "charger",
  "pad",
  "bin",
  "tray",
  "hook",
  "rack",
  "cover",
  "filter",
  "container",
  "caddy",
  "shelf",
  "stand"
];
var PURCHASE_VERBS = ["buy", "order", "purchase", "shop for"];
var TODO_VERBS = ["email", "call", "pick up", "book", "pay", "confirm", "text", "schedule"];
function namedRecipientOrOccasion(text) {
  return hasWord(text, "gift", "present") || /\b[a-z]+'s\s+(birthday|anniversary|graduation|wedding|baby shower)\b/i.test(text) || hasWord(text, "birthday", "christmas", "anniversary", "hanukkah") || /\bfor\s+(mom|dad|meegy|megan|grandma|grandpa|my\s+\w+)\b/i.test(text);
}
function hasProductNoun(text) {
  return PRODUCT_NOUNS.some((n) => new RegExp(`\\b${n}s?\\b`, "i").test(text));
}
function hasTodoStructure(text) {
  return hasWord(text, ...TODO_VERBS);
}
function namesTechnicalObject(text) {
  return hasWord(
    text,
    "canvas",
    "template",
    "templates",
    "skill",
    "script",
    "api",
    "plugin",
    "automation",
    "workflow",
    "widget",
    "base",
    "hook",
    "obsidian",
    "todoist"
  );
}
function hasProjectScope(text) {
  return hasWord(text, "build out", "design a framework", "create a system", "set up a system") || /\bframework for\b/i.test(text);
}
function openEndedPursuit(text) {
  return hasWord(text, "maintain", "keep up", "stay on top of", "keep up with", "ongoing");
}
function positiveMatch(title, text) {
  if (hasWord(text, "3d print", "filament", "stl", "gcode") || /\b3d[-\s]?print/i.test(text))
    return { type: "print", strength: 3 };
  if (hasWord(text, "recipe", "ingredients", "meal prep") || hasWord(text, "cook", "bake"))
    return { type: "recipe", strength: 2 };
  if (namedRecipientOrOccasion(text)) return { type: "gift", strength: 3 };
  const purchaseText = text.replace(/\b(in order to|order of|out of order)\b/gi, "");
  if (hasWord(purchaseText, ...PURCHASE_VERBS)) return { type: "shop", strength: 2 };
  if (hasWord(text, "1:1", "sync with", "standup", "stand-up") || /\btalk to\s+\w/i.test(text) || /\bmeeting\b.*\bre:?/i.test(text))
    return { type: "meeting", strength: 2 };
  if (hasWord(text, "every week", "every day", "habit", "routine", "weekly review", "recurring", "system check"))
    return { type: "interval", strength: 2 };
  if (hasWord(text, "trip", "hike", "road trip", "camping", "getaway", "date night") || /\bwith\s+meegy\b/i.test(text))
    return { type: "adventure", strength: 2 };
  if (hasWord(text, "concert", "performance", "festival", "recital") || /\btalk\b.*\bat\b/i.test(text))
    return { type: "event", strength: 2 };
  if (/["'].+["']\s*[—-]\s*\w/.test(text) || /\b\w+\s+said\b/i.test(text) || hasWord(text, "according to"))
    return { type: "quote", strength: 2 };
  if (hasWord(text, "definition", "means", "refers to") || /^definition:/i.test(title.trim()))
    return { type: "term", strength: 2 };
  if (hasWord(text, "read", "watch", "listen", "book", "article", "podcast", "video", "documentary"))
    return { type: "literature", strength: 2 };
  if (hasWord(text, "retro", "journal", "looking back", "what i learned", "reflection"))
    return { type: "reflection", strength: 2 };
  if (hasWord(text, "build", "ship", "finish", "launch", "build out") && hasProjectScope(text))
    return { type: "project", strength: 3 };
  if (hasWord(text, "build out") || hasProjectScope(text)) return { type: "project", strength: 2 };
  if (openEndedPursuit(text)) return { type: "pursuit", strength: 2 };
  if (hasWord(
    text,
    "email",
    "call",
    "text",
    "pay",
    "pick up",
    "check",
    "ask",
    "book",
    "confirm",
    "cancel",
    "reply",
    "follow up",
    "decide",
    "update",
    "set up",
    "optimize",
    "write",
    "create",
    "renew",
    "return"
  ))
    return { type: "task", strength: 2 };
  if (hasWord(text, "realized that", "idea:", "what if", "occurred to me") || /\bzk\b/i.test(text))
    return { type: "fleeting", strength: 2 };
  if (/^note:/i.test(title.trim())) return { type: "note", strength: 2 };
  return { type: null, strength: 0 };
}
function inferType(title, body, rawTags, tuneParentAvailable = true) {
  const text = `${title}
${body}`;
  const lower = text.toLowerCase();
  let { type, strength } = positiveMatch(title, text);
  if (/^\s*should i\b/i.test(title)) {
    if (namesTechnicalObject(text)) {
      type = "task";
      strength = 2;
    } else {
      type = "fleeting";
      strength = 2;
    }
  }
  if ((type === "task" || type === null) && hasProductNoun(text) && (rawTags.has("home") || rawTags.has("finances")) && !hasTodoStructure(text)) {
    type = "shop";
    strength = 2;
  }
  if (type === "project" && !hasProjectScope(text) && !hasWord(text, "build out")) {
    type = "task";
    strength = 2;
  }
  const hasClaudius = rawTags.has("claudius");
  const hasSystems = rawTags.has("systems");
  const hasWorkGuard = rawTags.has("work");
  let coerced = false;
  let tuneLink = false;
  if (hasClaudius || hasSystems && !hasWorkGuard) {
    tuneLink = tuneParentAvailable;
    coerced = true;
    if (type === "pursuit" && openEndedPursuit(lower)) {
    } else if (type === "project" && hasProjectScope(lower)) {
    } else if (type === null || type === "project" || type === "fleeting") {
      type = "task";
      strength = Math.max(strength, 2);
    }
  }
  return { type, strength, coerced, tuneLink };
}

// src/rules/scoring.ts
function inferUrgency(title, body) {
  const text = `${title}
${body}`;
  if (hasWord(text, "today", "asap", "urgent", "right now", "immediately")) return "4-crit";
  if (hasWord(text, "soon", "this week")) return "3-high";
  if (hasWord(text, "someday", "eventually", "some day", "at some point", "no rush")) return "1-low";
  return null;
}
var PIVOTAL = ["foundational", "overhaul", "paradigm", "new capability", "rework the system"];
var CONSUMABLE = ["sponges", "sponge", "filters", "filter", "detergent", "refill", "restock"];
var SOLID = ["deliverable", "skill", "automation", "routine", "workflow", "system", "fitness"];
var TRIVIAL_SIGNAL = ["cosmetic", "for fun", "entertainment", "just curious"];
function inferReturn(title, body, type) {
  const text = `${title}
${body}`;
  if (hasWord(text, ...PIVOTAL)) return "4-pivotal";
  if (hasWord(text, ...CONSUMABLE) || hasWord(text, ...SOLID)) return "3-solid";
  if (hasWord(text, ...TRIVIAL_SIGNAL)) return "1-trivial";
  if (type === null) return null;
  return RETURN_FALLBACK[type] ?? null;
}

// src/rules/parent.ts
var STOPWORDS = /* @__PURE__ */ new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "into",
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "sept",
  "oct",
  "nov",
  "dec"
]);
var TIME_ANCHORED_KINDS = /* @__PURE__ */ new Set(["adventure", "interval", "event"]);
var TRANSITIVE_SIGNALS = ["implement", "add to", "set up", "wire into", "integrate into", "needed for", "needed by"];
var PREP_SIGNALS = ["bring", "pack", "book", "buy", "reserve", "prep for", "needed for", "needed at", "needed by"];
function parentTokens(name) {
  return name.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}
function isTimeAnchored(parent) {
  if (TIME_ANCHORED_KINDS.has(parent.kind)) return true;
  return /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b/i.test(parent.name) || /\b\d{1,2}\b/.test(parent.name);
}
function hasDeliverableSignal(text, tokens, timeAnchored) {
  for (const tok of tokens) {
    if (new RegExp(`\\bfor\\s+(the\\s+)?${tok}\\b`, "i").test(text)) return true;
  }
  if (hasWord(text, ...TRANSITIVE_SIGNALS)) return true;
  if (timeAnchored && hasWord(text, ...PREP_SIGNALS)) return true;
  return false;
}
function matchParent(title, body, parents) {
  const text = `${title}
${body}`;
  let best = null;
  for (const parent of parents) {
    const tokens = parentTokens(parent.name);
    if (tokens.length === 0) continue;
    const overlap = tokens.filter((t) => new RegExp(`\\b${t}\\b`, "i").test(text));
    if (overlap.length === 0) continue;
    if (!hasDeliverableSignal(text, overlap, isTimeAnchored(parent))) continue;
    if (!best || overlap.length > best.score) best = { path: parent.path, score: overlap.length };
  }
  return best ? best.path : null;
}

// src/rules/disposition.ts
var DELETE_SIGNALS = ["duplicate", "already done", "obsolete", "nvm", "never mind", "disregard", "no longer needed"];
var SKIP_SIGNALS = ["not now", "later maybe", "waiting on", "on hold", "revisit later"];
var DIRECTIVE_SIGNALS = ["bump", "raise priority", "lower priority", "reschedule", "reprioritize", "push out", "done with", "close out"];
function inferDisposition(title, body, type, parentPath) {
  const text = `${title}
${body}`;
  if (hasWord(text, ...DELETE_SIGNALS)) return "delete";
  if (hasWord(text, ...SKIP_SIGNALS)) return "skip";
  if (type !== null) return "route";
  if (parentPath !== null) return "parent-link";
  return "route";
}
function isDirectiveCandidate(title, body, parentPath) {
  if (parentPath === null) return false;
  return hasWord(`${title}
${body}`, ...DIRECTIVE_SIGNALS);
}

// src/rules/confidence.ts
var STRENGTH_CONFIDENCE = {
  0: 0.3,
  1: 0.55,
  2: 0.72,
  3: 0.85
};
function scoreConfidence(input) {
  let confidence = STRENGTH_CONFIDENCE[input.strength] ?? 0.3;
  if (input.coerced) confidence = Math.max(confidence, 0.75);
  if (input.disposition === "delete" || input.disposition === "skip") confidence = Math.max(confidence, 0.8);
  let confident = confidence >= 0.6;
  if (input.disposition === "route" && input.type === null) {
    confident = false;
    confidence = Math.min(confidence, 0.4);
  }
  return { confidence: Math.round(confidence * 100) / 100, confident };
}

// src/rules/classify.ts
var TUNE_PARENT_PATH = "50 - Operations/Intervals/Tune.md";
function frontmatterTags(fm) {
  const raw = fm["tags"] ?? fm["tag"];
  const list = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
  return list.filter((t) => typeof t === "string").map((t) => t.replace(/^#/, "").trim().toLowerCase()).filter((t) => t.length > 0);
}
function todayFromNow(now) {
  return plainDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}
function buildRationale(type, disposition, parentPath, coerced) {
  if (disposition === "delete") return "Reads as noise, duplicate, or already handled.";
  if (disposition === "skip") return "Real but not actionable yet \u2014 held for later.";
  if (coerced && type === "task") return "Systems/Claudius work \u2014 coerced to task, linked to Tune.";
  if (coerced) return `Systems/Claudius ${type ?? "item"} \u2014 linked to Tune.`;
  if (type && parentPath) return `Reads as ${type}; linked to an active parent.`;
  if (type) return `Positive match on ${type} signals.`;
  if (parentPath) return "No confident type; links to an active parent.";
  return "No confident type \u2014 needs a manual pick.";
}
function classifyItem(input, parents, routes, now = /* @__PURE__ */ new Date()) {
  const { title, body } = input;
  const fmTags = frontmatterTags(input.frontmatter);
  const inferred = inferTags(title, body);
  const rawTagSet = /* @__PURE__ */ new Set([...fmTags, ...inferred]);
  const typeRes = inferType(title, body, rawTagSet);
  let type = typeRes.type;
  if (type !== null && !routes[type]) type = null;
  const tags = normalizeTags([...fmTags, ...inferred]);
  const urgency = inferUrgency(title, body);
  const ret = inferReturn(title, body, type);
  let parentPath = matchParent(title, body, parents);
  if (typeRes.tuneLink) parentPath = TUNE_PARENT_PATH;
  const signals = extractTimeSignals(title, body, todayFromNow(now));
  const merged = mergeTimeSignals(
    { urgency, deadline: null },
    signals
  );
  const disposition = inferDisposition(title, body, type, parentPath);
  const { confidence, confident } = scoreConfidence({
    strength: typeRes.strength,
    coerced: typeRes.coerced,
    disposition,
    type
  });
  return {
    disposition,
    type,
    confident,
    confidence,
    tags,
    urgency: merged.urgency,
    return: ret,
    deadline: merged.deadline,
    parentPath,
    rationale: buildRationale(type, disposition, parentPath, typeRes.coerced),
    source: "rules",
    directiveCandidate: isDirectiveCandidate(title, body, parentPath)
  };
}

// src/claude.ts
var import_obsidian3 = require("obsidian");
var API_URL = "https://api.anthropic.com/v1/messages";
var API_VERSION = "2023-06-01";
var TIMEOUT_MS = 3e4;
async function escalateUnconfident(items, settings, routes, parents = []) {
  const targets = items.filter((i) => i.suggestion && !i.suggestion.confident);
  if (targets.length === 0) return { attempted: 0, resolved: 0, error: null };
  if (!settings.apiKey) {
    return { attempted: targets.length, resolved: 0, error: "No API key set." };
  }
  const cap = Math.max(1, settings.batchCap);
  let resolved = 0;
  let firstError = null;
  for (let i = 0; i < targets.length; i += cap) {
    const chunk = targets.slice(i, i + cap);
    try {
      const classifications = await classifyChunk(chunk, settings, parents);
      resolved += mergeClassifications(chunk, classifications, routes, parents);
    } catch (e) {
      firstError = firstError ?? String(e instanceof Error ? e.message : e);
    }
  }
  return { attempted: targets.length, resolved, error: firstError };
}
async function reprocessItem(item, instruction, settings, routes, parents = []) {
  if (!settings.apiKey) return { ok: false, error: "No API key set." };
  if (!item.suggestion) return { ok: false, error: "Item has no suggestion." };
  try {
    const list = await classifyChunk([item], settings, parents, instruction);
    const merged = mergeClassifications([item], list, routes, parents);
    return merged > 0 ? { ok: true, error: null } : { ok: false, error: "No classification returned." };
  } catch (e) {
    return { ok: false, error: String(e instanceof Error ? e.message : e) };
  }
}
async function classifyChunk(chunk, settings, parents, instruction) {
  const body = {
    model: settings.model,
    max_tokens: 8e3,
    system: SYSTEM_PROMPT,
    tools: [SUBMIT_TOOL],
    tool_choice: { type: "tool", name: "submit_classifications" },
    messages: [
      { role: "user", content: buildUserContent(chunk, parents, instruction) }
    ]
  };
  const resp = await withTimeout(
    (0, import_obsidian3.requestUrl)({
      url: API_URL,
      method: "POST",
      contentType: "application/json",
      headers: {
        "x-api-key": settings.apiKey,
        "anthropic-version": API_VERSION
      },
      body: JSON.stringify(body),
      throw: false
      // inspect status ourselves for a useful message
    }),
    TIMEOUT_MS
  );
  if (resp.status !== 200) {
    const msg = resp.json?.error?.message ?? `HTTP ${resp.status}`;
    throw new Error(`Claude API: ${msg}`);
  }
  const toolUse = (resp.json?.content ?? []).find(
    (b) => b.type === "tool_use"
  );
  const list = toolUse?.input?.classifications;
  if (!Array.isArray(list)) {
    throw new Error("Claude API: no classifications in response.");
  }
  return list;
}
function mergeClassifications(chunk, classifications, routes, parents = []) {
  const parentByName = new Map(
    parents.map((p) => [p.name.toLowerCase(), p.path])
  );
  let merged = 0;
  for (const c of classifications) {
    const item = chunk[c.id];
    if (!item?.suggestion) continue;
    const type = c.type && VALID_TYPE_SET.has(c.type) && routes[c.type] ? c.type : null;
    let disposition = c.disposition;
    if (!disposition || !VALID_DISPOSITION_SET.has(disposition)) {
      disposition = item.suggestion.disposition;
    }
    const routeNullType = disposition === "route" && type === null;
    const prev = item.suggestion;
    const next = {
      ...prev,
      disposition,
      type,
      urgency: c.urgency && VALID_URGENCY_SET.has(c.urgency) ? c.urgency : prev.urgency,
      return: c.return && VALID_RETURN_SET.has(c.return) ? c.return : prev.return,
      deadline: isIsoDate(c.deadline) ? c.deadline : prev.deadline,
      tags: Array.isArray(c.tags) ? c.tags.filter((t) => typeof t === "string") : prev.tags,
      parentPath: typeof c.parent === "string" ? parentByName.get(c.parent.toLowerCase()) ?? prev.parentPath : prev.parentPath,
      rationale: c.rationale?.trim() || prev.rationale,
      confident: !routeNullType,
      confidence: routeNullType ? Math.min(prev.confidence, 0.4) : 0.8,
      source: "claude"
    };
    item.suggestion = next;
    merged++;
  }
  return merged;
}
function buildUserContent(chunk, parents, instruction) {
  const blocks = chunk.map((item, id) => {
    const s = item.suggestion;
    const guess = s.type ? `${s.disposition} \u2192 ${s.type}` : s.disposition;
    const body = item.body ? item.body.slice(0, 1200) : "(no body)";
    return [
      `### id: ${id}`,
      `title: ${item.title}`,
      `current guess: ${guess}`,
      `body:
${body}`
    ].join("\n");
  });
  const lead = instruction ? `Reclassify id 0 following this user instruction exactly, overriding the current guess where they conflict:
"${instruction}"

Return the updated classification via the submit_classifications tool.` : `Classify these ${chunk.length} inbox captures. The deterministic rules pass was not confident about them. Return one classification per id via the submit_classifications tool.`;
  const parentList = parents.length ? `

Active parents (use these exact names for the "parent" field):
` + parents.map((p) => `- ${p.name} (${p.kind})`).join("\n") : "";
  return lead + parentList + "\n\n" + blocks.join("\n\n---\n\n");
}
var SYSTEM_PROMPT = `You triage personal-knowledge-vault captures for a WALL\xB7E-THNK Obsidian inbox.
For each capture, decide:
- disposition: "route" (file it as a typed note), "parent-link" (attach to an existing project/pursuit), "skip" (real but not yet actionable), or "delete" (noise, duplicate, or already handled).
- type (only when disposition is "route"): one of project, pursuit, shop, gift, interval, adventure, print, meeting, task, note, event, recipe, reflection, literature, quote, term, fleeting. Pick the single best fit. If nothing fits, return null and the item will get a manual pick.
- urgency: one of 4-crit, 3-high, 2-med, 1-low, or null.
- return (long-term value): one of 4-pivotal, 3-solid, 2-nice, 1-trivial, or null.
- deadline: an ISO date (YYYY-MM-DD) only if the text states or clearly implies one, else null.
- tags: 0-4 short lowercase area tags (e.g. home, health, work, finances, creative, systems).
- parent: the exact name of one active parent from the provided list, when the capture belongs under it (required for "parent-link"; optional for "route"); else null. Never invent a name not on the list.
- rationale: one short sentence.
Prefer "note" or "fleeting" over an ill-fitting specific type. Only "delete" on clear noise. Be decisive \u2014 these reached you because the rules were unsure.`;
var SUBMIT_TOOL = {
  name: "submit_classifications",
  description: "Submit one classification per capture, keyed by the id given in the prompt.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      classifications: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "integer" },
            disposition: {
              type: "string",
              enum: ["route", "parent-link", "skip", "delete"]
            },
            // Nullable enums use anyOf (string-branch + null-branch), NOT
            // `type: ["string","null"] + enum`. Anthropic's strict validator
            // rejects an enum whose declared type is a union — every enum value
            // must match a single declared type. (Bug fixed 2026-07-12.)
            type: {
              anyOf: [
                {
                  type: "string",
                  enum: [
                    "project",
                    "pursuit",
                    "shop",
                    "gift",
                    "interval",
                    "adventure",
                    "print",
                    "meeting",
                    "task",
                    "note",
                    "event",
                    "recipe",
                    "reflection",
                    "literature",
                    "quote",
                    "term",
                    "fleeting"
                  ]
                },
                { type: "null" }
              ]
            },
            urgency: {
              anyOf: [
                { type: "string", enum: ["4-crit", "3-high", "2-med", "1-low"] },
                { type: "null" }
              ]
            },
            return: {
              anyOf: [
                {
                  type: "string",
                  enum: ["4-pivotal", "3-solid", "2-nice", "1-trivial"]
                },
                { type: "null" }
              ]
            },
            deadline: { anyOf: [{ type: "string" }, { type: "null" }] },
            tags: { type: "array", items: { type: "string" } },
            parent: { anyOf: [{ type: "string" }, { type: "null" }] },
            rationale: { type: "string" }
          },
          required: ["id", "disposition"]
        }
      }
    },
    required: ["classifications"]
  },
  strict: true
};
function isIsoDate(v) {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}
function withTimeout(p, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`timed out after ${ms / 1e3}s`)),
      ms
    );
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

// src/commit.ts
var import_obsidian4 = require("obsidian");
var CommitVerificationError = class extends Error {
  requestedAction;
  sourcePath;
  constructor(plan, detail) {
    super(`verification failed for ${plan.action} at ${plan.item.file.path}: ${detail}`);
    this.name = "CommitVerificationError";
    this.requestedAction = plan.action;
    this.sourcePath = plan.item.file.path;
  }
};
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString().slice(0, 16);
}
function planCommit(item, routes) {
  if (item.resolution === "deleted") {
    return { item, action: "trash" };
  }
  if (item.resolution === "skipped") {
    return { item, action: "frontmatter", patch: { skipped_at: nowIso() } };
  }
  if (item.resolution !== "approved" || !item.suggestion) {
    return { item, action: "none" };
  }
  const s = item.suggestion;
  if (s.disposition === "delete") {
    return { item, action: "trash" };
  }
  if (s.disposition === "skip") {
    return { item, action: "frontmatter", patch: { skipped_at: nowIso() } };
  }
  const patch = { ran_at: nowIso() };
  if (s.disposition === "route" && s.type) {
    patch["type"] = s.type;
    const defaults = routes[s.type]?.defaults;
    if (defaults) Object.assign(patch, defaults);
    if (s.parentPath) patch["relates_to"] = [`[[${basename(s.parentPath)}]]`];
    if (s.tags.length) patch["tags"] = s.tags;
    if (s.urgency) patch["urgency"] = s.urgency;
    if (s.return) patch["return"] = s.return;
    if (s.deadline) patch["deadline"] = s.deadline;
  } else if (s.disposition === "parent-link" && s.parentPath) {
    patch["relates_to"] = [`[[${basename(s.parentPath)}]]`];
    patch["status"] = "processed";
  } else {
    return { item, action: "none" };
  }
  return { item, action: "frontmatter", patch };
}
function basename(path) {
  return path.split("/").pop()?.replace(/\.md$/, "") ?? path;
}
function frontmatterFrom(content) {
  const info = (0, import_obsidian4.getFrontMatterInfo)(content);
  if (!info.exists) return {};
  const parsed = (0, import_obsidian4.parseYaml)(info.frontmatter);
  return parsed && typeof parsed === "object" ? parsed : {};
}
function valuesEqual(actual, expected) {
  if (Object.is(actual, expected)) return true;
  if (Array.isArray(actual) && Array.isArray(expected)) {
    return actual.length === expected.length && actual.every((value, index) => valuesEqual(value, expected[index]));
  }
  if (actual !== null && expected !== null && typeof actual === "object" && typeof expected === "object") {
    const actualRecord = actual;
    const expectedRecord = expected;
    const actualKeys = Object.keys(actualRecord);
    const expectedKeys = Object.keys(expectedRecord);
    return actualKeys.length === expectedKeys.length && expectedKeys.every(
      (key) => key in actualRecord && valuesEqual(actualRecord[key], expectedRecord[key])
    );
  }
  return false;
}
function mismatchedOwnedFields(frontmatter, patch) {
  return Object.entries(patch).filter(([key, expected]) => !valuesEqual(frontmatter[key], expected)).map(([key]) => key);
}
async function verifyFrontmatter(app, plan, sourcePath, sourceBasename, patch) {
  const source = app.vault.getFileByPath(sourcePath);
  if (source) {
    let content;
    try {
      content = await app.vault.read(source);
    } catch (error) {
      throw new CommitVerificationError(
        plan,
        `post-write readback unavailable (${String(error)})`
      );
    }
    const mismatches = mismatchedOwnedFields(frontmatterFrom(content), patch);
    if (mismatches.length === 0) return source;
    throw new CommitVerificationError(
      plan,
      `owned field(s) missing or mismatched: ${mismatches.join(", ")}`
    );
  }
  const candidates = app.vault.getMarkdownFiles().filter(
    (file) => file.basename === sourceBasename || file.name === `${sourceBasename}.md`
  );
  const matches = [];
  for (const candidate of candidates) {
    try {
      const content = await app.vault.read(candidate);
      if (mismatchedOwnedFields(frontmatterFrom(content), patch).length === 0) {
        matches.push(candidate);
      }
    } catch {
    }
  }
  if (matches.length !== 1) {
    throw new CommitVerificationError(
      plan,
      matches.length === 0 ? "unable to locate and verify a unique destination" : `destination is ambiguous (${matches.length} matching notes)`
    );
  }
  return matches[0];
}
async function applyCommit(app, plan) {
  const sourcePath = plan.item.file.path;
  const sourceBasename = plan.item.file.basename;
  if (plan.action === "none") {
    return {
      requestedAction: "none",
      verified: true,
      sourcePath,
      finalPath: sourcePath
    };
  }
  if (plan.action === "trash") {
    try {
      await app.fileManager.trashFile(plan.item.file);
    } catch (e) {
      if (String(e).includes("ENOENT")) {
        const adapter = app.vault.adapter;
        if (!await adapter.exists(".trash")) await adapter.mkdir(".trash");
        await app.fileManager.trashFile(plan.item.file);
      } else {
        throw e;
      }
    }
    if (await app.vault.adapter.exists(sourcePath)) {
      throw new CommitVerificationError(plan, "source file remains after trash");
    }
    return {
      requestedAction: "trash",
      verified: true,
      sourcePath,
      finalPath: null
    };
  }
  if (plan.action === "frontmatter" && plan.patch) {
    const patch = plan.patch;
    await app.fileManager.processFrontMatter(plan.item.file, (fm) => {
      for (const [k, v] of Object.entries(patch)) fm[k] = v;
    });
    const finalFile = await verifyFrontmatter(
      app,
      plan,
      sourcePath,
      sourceBasename,
      patch
    );
    return {
      requestedAction: "frontmatter",
      verified: true,
      sourcePath,
      finalPath: finalFile.path
    };
  }
  throw new CommitVerificationError(plan, "frontmatter plan has no patch");
}
function describePlan(plan) {
  if (plan.action === "none") return "no-op";
  if (plan.action === "trash") return "\u2192 trash";
  return `\u2192 frontmatter: ${JSON.stringify(plan.patch)}`;
}

// src/view/TriageView.ts
var VIEW_TYPE_TRIAGE = "inbox-warden-triage";
var AREA_TAGS2 = /* @__PURE__ */ new Set([
  "tinkering",
  "home",
  "personal",
  "family",
  "claudius",
  "tune",
  "professional"
]);
var TriageView = class extends import_obsidian5.ItemView {
  plugin;
  items = [];
  routes = {};
  parents = [];
  // path of the card whose edit panel is currently open (null = none). Held
  // across re-renders so a field edit / reprocess doesn't collapse the panel.
  editingPath = null;
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType() {
    return VIEW_TYPE_TRIAGE;
  }
  getDisplayText() {
    return "Inbox triage";
  }
  getIcon() {
    return this.plugin.settings.ribbonIcon || "inbox";
  }
  async onOpen() {
    await this.refresh();
  }
  async refresh() {
    this.items = await sweepInbox(this.app, this.plugin.settings);
    this.parents = activeParents(this.app, this.plugin.settings);
    this.routes = await loadTypeRoutes(this.app, this.plugin.settings);
    for (const item of this.items) {
      const cached = this.plugin.suggestionCache[item.file.path];
      if (cached && cached.mtime === item.file.stat.mtime) {
        item.suggestion = { ...cached.suggestion };
        continue;
      }
      item.suggestion = classifyItem(
        { title: item.title, body: item.body, frontmatter: item.frontmatter },
        this.parents,
        this.routes
      );
    }
    const live = new Set(this.items.map((i) => i.file.path));
    for (const path of Object.keys(this.plugin.suggestionCache)) {
      if (!live.has(path)) delete this.plugin.suggestionCache[path];
    }
    this.render();
    await this.escalate();
  }
  async escalate() {
    if (!this.plugin.settings.apiKey) return;
    const res = await escalateUnconfident(
      this.items,
      this.plugin.settings,
      this.routes,
      this.parents
    );
    if (res.attempted === 0) return;
    await this.persistSuggestions();
    this.render();
    if (res.error) {
      new import_obsidian5.Notice(
        `Claude escalation: ${res.resolved}/${res.attempted} resolved \u2014 ${res.error}`
      );
    } else {
      new import_obsidian5.Notice(
        `Claude resolved ${res.resolved}/${res.attempted} unsure item(s).`
      );
    }
  }
  /** Snapshots every claude/manual suggestion into the plugin's persisted
   * cache (rules output stays live and is never cached) and writes data.json.
   * Cheap — call after any suggestion mutation worth surviving a refresh. */
  async persistSuggestions() {
    for (const item of this.items) {
      const s = item.suggestion;
      if (!s || s.source !== "claude" && s.source !== "manual") continue;
      this.plugin.suggestionCache[item.file.path] = {
        mtime: item.file.stat.mtime,
        suggestion: { ...s }
      };
    }
    await this.plugin.saveSettings();
  }
  /** Re-renders from `this.items` as-is — does NOT re-sweep, so in-progress
   * resolutions (approve/skip/delete) survive. Use `refresh()` instead only
   * when the underlying vault state needs re-reading. */
  render() {
    const container = this.contentEl;
    const prevScroll = container.querySelector(".iw-list")?.scrollTop ?? 0;
    container.empty();
    container.addClass("inbox-warden");
    const header = container.createDiv({ cls: "iw-header" });
    header.createEl("h3", { text: "Inbox triage" });
    const refreshBtn = header.createEl("button", { text: "\u21BB Sweep" });
    refreshBtn.addEventListener("click", () => this.refresh());
    header.createSpan({
      cls: "iw-count",
      text: `${this.items.length} eligible`
    });
    if (this.plugin.settings.dryRun) {
      header.createSpan({ cls: "iw-dryrun", text: "DRY RUN" });
    }
    const list = container.createDiv({ cls: "iw-list" });
    if (this.items.length === 0) {
      list.createDiv({ cls: "iw-empty", text: "Inbox clear. \u{1F389}" });
      return;
    }
    for (const item of this.items) {
      const card = list.createDiv({ cls: "iw-card" });
      const title = card.createDiv({ cls: "iw-title" });
      const link = title.createEl("a", { text: item.title });
      link.addEventListener("click", (e) => {
        e.preventDefault();
        this.app.workspace.openLinkText(item.file.path, "", false);
      });
      const s = item.suggestion;
      if (s) {
        const badge = title.createSpan({
          cls: ["iw-badge", s.confident ? "iw-confident" : "iw-unsure"],
          text: s.type ? `${s.disposition} \u2192 ${s.type}` : s.disposition
        });
        if (!s.confident) badge.prepend("\u26A0 ");
        if (s.source === "claude") {
          title.createSpan({ cls: "iw-source", text: "\u2728 claude" });
        }
      }
      const meta = card.createDiv({ cls: "iw-meta" });
      const status = item.frontmatter["status"];
      meta.createSpan({
        cls: "iw-m-dim",
        text: item.hasFrontmatter ? `status: ${status ?? "\u2014"}` : "no frontmatter"
      });
      meta.createSpan({
        cls: "iw-m-dim",
        text: new Date(item.file.stat.ctime).toISOString().slice(0, 10)
      });
      if (s?.urgency) {
        meta.createSpan({
          cls: ["iw-chip", `iw-urg-${s.urgency.split("-")[0]}`],
          text: s.urgency
        });
      }
      if (s?.return) {
        meta.createSpan({
          cls: ["iw-chip", `iw-ret-${s.return.split("-")[0]}`],
          text: `\u2934 ${s.return}`
        });
      }
      if (s?.deadline) {
        meta.createSpan({ cls: ["iw-chip", "iw-chip-due"], text: `due ${s.deadline}` });
      }
      if (s?.parentPath) {
        meta.createSpan({
          cls: "iw-m-parent",
          text: `\u2192 ${s.parentPath.split("/").pop()?.replace(/\.md$/, "")}`
        });
      }
      if (s?.tags.length) {
        for (const t of s.tags) {
          const cls = ["iw-tag"];
          if (AREA_TAGS2.has(t)) cls.push(`iw-area-${t}`);
          meta.createSpan({ cls, text: t });
        }
      }
      if (item.body) {
        card.createDiv({ cls: "iw-body", text: item.body });
      }
      if (s?.rationale) {
        card.createDiv({ cls: "iw-rationale", text: s.rationale });
      }
      const actions = card.createDiv({ cls: "iw-actions" });
      const resolutionLabel = actions.createSpan({ cls: "iw-resolution" });
      const paint = () => {
        const resolved = item.resolution !== "pending";
        card.toggleClass("iw-resolved", resolved);
        card.removeClass("iw-res-approved", "iw-res-skipped", "iw-res-deleted");
        resolutionLabel.empty();
        if (resolved) {
          card.addClass(`iw-res-${item.resolution}`);
          resolutionLabel.setText(`\u2713 ${item.resolution} `);
          resolutionLabel.createSpan({ cls: "iw-undo", text: "undo" }).addEventListener("click", () => {
            item.resolution = "pending";
            paint();
            this.updateFooter();
          });
        }
      };
      paint();
      const mkBtn = (text, resolution, cls) => {
        const btn = actions.createEl("button", { text, cls });
        btn.addEventListener("click", () => {
          item.resolution = item.resolution === resolution ? "pending" : resolution;
          paint();
          this.updateFooter();
        });
      };
      mkBtn("Approve", "approved", "iw-approve");
      mkBtn("Skip", "skipped", "iw-skip");
      mkBtn("Delete", "deleted", "iw-delete");
      const editBtn = actions.createEl("button", {
        text: this.editingPath === item.file.path ? "Edit \u25B2" : "Edit \u25BE",
        cls: "iw-edit"
      });
      editBtn.addEventListener("click", () => {
        this.editingPath = this.editingPath === item.file.path ? null : item.file.path;
        this.render();
      });
      if (item.suggestion) {
        if (this.editingPath === item.file.path) {
          this.buildFields(card, item);
        }
        this.buildInstruction(card, item);
      }
    }
    list.scrollTop = prevScroll;
    const footer = container.createDiv({ cls: "iw-footer" });
    this.queuedEl = footer.createSpan({ cls: "iw-queued" });
    this.resetBtn = footer.createEl("button", {
      text: "Reset all",
      cls: "iw-reset"
    });
    this.resetBtn.addEventListener("click", () => {
      for (const item of this.items) item.resolution = "pending";
      this.render();
    });
    footer.createEl("button", {
      text: "Approve all confident",
      cls: "iw-bulk"
    }).addEventListener("click", () => {
      let n = 0;
      for (const item of this.items) {
        if (item.resolution === "pending" && item.suggestion?.confident) {
          item.resolution = "approved";
          n++;
        }
      }
      new import_obsidian5.Notice(
        n > 0 ? `Approved ${n} confident item(s).` : "No confident items to approve."
      );
      this.render();
    });
    this.commitBtn = footer.createEl("button", { cls: "iw-commit" });
    this.commitBtn.addEventListener("click", () => this.commit());
    this.updateFooter();
  }
  commitBtn = null;
  resetBtn = null;
  queuedEl = null;
  // Per-card reprocess drafts, keyed by path — the instruction box is always
  // visible, so its text must survive the frequent re-renders (edit toggle,
  // field edits) that would otherwise wipe an uncommitted draft.
  drafts = /* @__PURE__ */ new Map();
  /**
   * Field dropdowns, collapsed under the per-card Edit toggle. Each change
   * mutates item.suggestion in place and marks it manual (authoritative).
   */
  buildFields(card, item) {
    const s = item.suggestion;
    const editor = card.createDiv({ cls: "iw-editor" });
    const markManual = () => {
      s.source = "manual";
      s.confidence = 0.9;
      s.confident = !(s.disposition === "route" && s.type === null);
      void this.persistSuggestions();
    };
    const grid = editor.createDiv({ cls: "iw-editor-grid" });
    const mkSelect = (label, options, current, onPick) => {
      const wrap = grid.createDiv({ cls: "iw-field" });
      wrap.createEl("label", { text: label });
      const sel = wrap.createEl("select");
      for (const o of options) {
        const opt = sel.createEl("option", { value: o.value, text: o.text });
        if (o.value === current) opt.selected = true;
      }
      sel.addEventListener("change", () => {
        onPick(sel.value);
        markManual();
        this.render();
      });
    };
    const NONE = "\u2014";
    const withNone = (vals) => [
      { value: NONE, text: NONE },
      ...vals.map((v) => ({ value: v, text: v }))
    ];
    mkSelect(
      "disposition",
      ["route", "parent-link", "skip", "delete"].map((v) => ({ value: v, text: v })),
      s.disposition,
      (v) => s.disposition = v
    );
    const routable = VALID_TYPES.filter((t) => this.routes[t]);
    mkSelect(
      "type",
      [{ value: NONE, text: NONE }, ...routable.map((t) => ({ value: t, text: t }))],
      s.type ?? NONE,
      (v) => s.type = v === NONE ? null : v
    );
    mkSelect("urgency", withNone(VALID_URGENCY), s.urgency ?? NONE, (v) => {
      s.urgency = v === NONE ? null : v;
    });
    mkSelect("return", withNone(VALID_RETURN), s.return ?? NONE, (v) => {
      s.return = v === NONE ? null : v;
    });
    mkSelect(
      "parent",
      [
        { value: NONE, text: NONE },
        ...this.parents.map((p) => ({ value: p.path, text: p.name }))
      ],
      s.parentPath ?? NONE,
      (v) => s.parentPath = v === NONE ? null : v
    );
    const dl = grid.createDiv({ cls: "iw-field" });
    dl.createEl("label", { text: "deadline" });
    const dlInput = dl.createEl("input", {
      type: "text",
      placeholder: "YYYY-MM-DD",
      value: s.deadline ?? ""
    });
    dlInput.addEventListener("change", () => {
      const v = dlInput.value.trim();
      s.deadline = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
      markManual();
      this.render();
    });
    const tg = grid.createDiv({ cls: "iw-field iw-field-wide" });
    tg.createEl("label", { text: "tags" });
    const tgInput = tg.createEl("input", {
      type: "text",
      placeholder: "home, health, \u2026",
      value: s.tags.join(", ")
    });
    tgInput.addEventListener("change", () => {
      s.tags = tgInput.value.split(",").map((t) => t.trim()).filter(Boolean);
      markManual();
      this.render();
    });
  }
  /**
   * Always-visible natural-language reprocess box. Sends the item + instruction
   * to Claude and applies the returned suggestion in place. Draft text is kept
   * in `this.drafts` so it survives re-renders while the box sits open.
   */
  buildInstruction(card, item) {
    const path = item.file.path;
    const nl = card.createDiv({ cls: "iw-nl" });
    const ta = nl.createEl("textarea", {
      cls: "iw-nl-input",
      placeholder: "Reprocess instruction \u2192 e.g. task under Garage Buildout, high urgency"
    });
    ta.value = this.drafts.get(path) ?? "";
    ta.addEventListener("input", () => this.drafts.set(path, ta.value));
    const processBtn = nl.createEl("button", { text: "Process", cls: "iw-process" });
    const statusEl = nl.createSpan({ cls: "iw-nl-status" });
    processBtn.addEventListener("click", async () => {
      const instruction = ta.value.trim();
      if (!instruction) return;
      if (!this.plugin.settings.apiKey) {
        statusEl.setText("No API key (settings).");
        return;
      }
      processBtn.disabled = true;
      statusEl.setText("Processing\u2026");
      const res = await reprocessItem(
        item,
        instruction,
        this.plugin.settings,
        this.routes,
        this.parents
      );
      if (res.ok) {
        this.drafts.delete(path);
        await this.persistSuggestions();
        new import_obsidian5.Notice(`Reprocessed \u201C${item.title}\u201D.`);
        this.render();
      } else {
        processBtn.disabled = false;
        statusEl.setText(res.error ?? "Failed.");
      }
    });
  }
  updateFooter() {
    if (!this.commitBtn) return;
    const resolved = this.items.filter((i) => i.resolution !== "pending");
    const pending = this.items.length - resolved.length;
    const by = (r) => resolved.filter((i) => i.resolution === r).length;
    this.queuedEl?.setText(
      resolved.length === 0 ? "" : `Queued: ${by("approved")} approve \xB7 ${by("skipped")} skip \xB7 ${by("deleted")} delete`
    );
    if (this.resetBtn) this.resetBtn.disabled = resolved.length === 0;
    this.commitBtn.disabled = resolved.length === 0;
    this.commitBtn.setText(
      this.plugin.settings.dryRun ? `Preview ${resolved.length} change(s) (${pending} pending)` : `Commit ${resolved.length} change(s) (${pending} pending)`
    );
  }
  async commit() {
    const resolved = this.items.filter((i) => i.resolution !== "pending");
    const plans = resolved.map((item) => planCommit(item, this.routes));
    if (this.plugin.settings.dryRun) {
      const lines = plans.map((p) => `${p.item.title}: ${describePlan(p)}`);
      console.log("[Inbox Warden] dry run:\n" + lines.join("\n"));
      new import_obsidian5.Notice(
        `Dry run \u2014 ${plans.length} plan(s) logged to console. Disable dry run in settings to write.`
      );
      return;
    }
    const noops = plans.filter((p) => p.action === "none");
    let written = 0;
    const done = /* @__PURE__ */ new Set();
    const failures = [];
    for (const plan of plans) {
      if (plan.action === "none") continue;
      try {
        const result = await applyCommit(this.app, plan);
        if (!result.verified) continue;
        written++;
        done.add(plan.item.file.path);
      } catch (e) {
        failures.push(plan.item.title);
        new import_obsidian5.Notice(`Inbox Warden: failed on ${plan.item.title} \u2014 ${e}`);
      }
    }
    const writable = plans.length - noops.length;
    new import_obsidian5.Notice(
      `Committed ${written}/${writable} item(s).` + (noops.length ? ` ${noops.length} skipped (no writable plan): ${noops.map((p) => p.item.title).join(", ")}` : "") + (failures.length ? ` ${failures.length} failed and remain actionable: ${failures.join(", ")}.` : "")
    );
    this.items = this.items.filter((i) => !done.has(i.file.path));
    for (const path of done) delete this.plugin.suggestionCache[path];
    await this.plugin.saveSettings();
    this.render();
  }
  async onClose() {
    this.contentEl.empty();
  }
};

// src/main.ts
var PathListModal = class extends import_obsidian6.Modal {
  constructor(app, count, paths) {
    super(app);
    this.count = count;
    this.paths = paths;
  }
  onOpen() {
    this.titleEl.setText(`${this.count} eligible inbox paths`);
    this.contentEl.createDiv({
      cls: "iw-paths-hint",
      text: "Clipboard unavailable \u2014 select and copy manually. Compare against 00 - META/Bases/Inbox.base."
    });
    const ta = this.contentEl.createEl("textarea", { cls: "iw-paths" });
    ta.value = this.paths;
    ta.readOnly = true;
  }
  onClose() {
    this.contentEl.empty();
  }
};
var InboxWardenPlugin = class extends import_obsidian6.Plugin {
  settings = DEFAULT_SETTINGS;
  // Persisted claude/manual suggestions keyed by file path, so a commit's
  // refresh (or a view reopen / app restart) doesn't re-bill the API for
  // items already classified. Rules-pass suggestions are never cached.
  suggestionCache = {};
  ribbonEl = null;
  async onload() {
    await this.loadSettings();
    this.registerView(VIEW_TYPE_TRIAGE, (leaf) => new TriageView(leaf, this));
    this.refreshRibbon();
    this.addCommand({
      id: "sweep-inbox",
      name: "Sweep inbox",
      callback: () => this.openTriage()
    });
    this.addCommand({
      id: "audit-sweep",
      name: "Audit sweep vs Base (list eligible paths)",
      callback: async () => {
        const items = await sweepInbox(this.app, this.settings);
        const paths = items.map((i) => i.file.path).join("\n");
        try {
          await navigator.clipboard.writeText(paths);
          new import_obsidian6.Notice(
            `${items.length} eligible items \u2014 paths copied to clipboard.
Compare against 00 - META/Bases/Inbox.base.`
          );
        } catch {
          new PathListModal(this.app, items.length, paths).open();
        }
      }
    });
    this.addSettingTab(new InboxWardenSettingTab(this.app, this));
  }
  /** (Re)creates the ribbon button with the configured icon. Obsidian has no
   * API to mutate an existing ribbon icon, so we remove and re-add. */
  refreshRibbon() {
    this.ribbonEl?.remove();
    this.ribbonEl = this.addRibbonIcon(
      this.settings.ribbonIcon || "inbox",
      "Sweep inbox",
      () => this.openTriage()
    );
  }
  async openTriage() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_TRIAGE);
    let leaf;
    if (existing.length > 0) {
      leaf = existing[0];
      if (leaf.view instanceof TriageView) await leaf.view.refresh();
    } else {
      leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE_TRIAGE, active: true });
    }
    this.app.workspace.revealLeaf(leaf);
  }
  async onunload() {
  }
  async loadSettings() {
    const data = await this.loadData() ?? {};
    this.suggestionCache = data["__suggestionCache"] ?? {};
    delete data["__suggestionCache"];
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
  }
  async saveSettings() {
    await this.saveData({
      ...this.settings,
      __suggestionCache: this.suggestionCache
    });
  }
};
