// The language AI-DLC's own lines are shown to the person in. English is the
// wording the source is written in: a catalogue maps each English line to
// its wording in the chosen language, and a line with no entry is shown as it
// was written. Only lines a person reads at a terminal pass through here.
// Output a program or the agent reads (--json, --quiet, a directive, a hook's
// JSON) never does, because code and the stage instructions match its English.
//
// The agent's own prose follows the conversation language (org.md); this
// setting is about the lines the tools print themselves.

export const DISPLAY_LANGUAGES = ["en", "ja"] as const;
export type DisplayLanguage = (typeof DISPLAY_LANGUAGES)[number];

// The dispatcher's process id, handed to the tool it starts. A tool adopts the
// language only when its parent is that dispatcher, so a tool that a command
// starts for its own use, and whose output that command reads, keeps English.
const PERSON_COMMAND_ENV = "AIDLC_DISPLAY_FOR_PERSON";

// The first word of a command a person types and reads the answer to.
const PERSON_COMMANDS = new Set([
  "config",
  "doctor",
  "--doctor",
  "help",
  "--help",
  "-h",
  "rollback",
  "status",
  "--status",
  "uninstall",
  "update",
  "use",
  "versions",
]);

type Pattern = { match: RegExp; shown: string; weight: number };
type Catalogue = {
  exact: ReadonlyMap<string, string>;
  byFirstWord: ReadonlyMap<string, Pattern[]>;
  anyFirstWord: Pattern[];
};

let language: DisplayLanguage | null = null;
let catalogue: Catalogue | null = null;
let showing = false;

export function isDisplayLanguage(value: unknown): value is DisplayLanguage {
  return (DISPLAY_LANGUAGES as readonly unknown[]).includes(value);
}

// The language shown where nothing records one.
export const DEFAULT_DISPLAY_LANGUAGE: DisplayLanguage = "ja";

// Chooses the language for one run, over what the settings record.
export const DISPLAY_LANGUAGE_ENV = "AIDLC_DISPLAY_LANGUAGE";

// `LC_ALL=C` or `LC_MESSAGES=C` is how a script asks any program for its
// untranslated messages. The test suite runs under LC_MESSAGES=C because its
// expectations are the English source lines, and many tests drop every AIDLC_
// variable before they start a tool, so a variable of our own would not arrive.
function environmentAsksForSourceWording(): boolean {
  const messages = process.env.LC_ALL || process.env.LC_MESSAGES;
  return messages === "C" || messages === "POSIX";
}

export function displayLanguageFromEnvironment(): DisplayLanguage | null {
  const chosen = process.env[DISPLAY_LANGUAGE_ENV];
  if (isDisplayLanguage(chosen)) return chosen;
  return environmentAsksForSourceWording() ? "en" : null;
}

// A settings file that cannot be read never costs the person their output:
// the lines are shown in the default language and the command that owns
// settings reports it.
export function displayLanguage(): DisplayLanguage {
  if (language !== null) return language;
  language = displayLanguageFromEnvironment() ?? DEFAULT_DISPLAY_LANGUAGE;
  if (displayLanguageFromEnvironment() !== null) return language;
  try {
    const { resolveAidlcSettings } = require("./aidlc-settings.ts") as typeof import("./aidlc-settings.ts");
    const projectDir = process.env.AIDLC_PROJECT_DIR || process.env.AIDLC_RUNTIME_PROJECT_DIR || process.cwd();
    const recorded = resolveAidlcSettings(projectDir).flags?.displayLanguage;
    if (isDisplayLanguage(recorded)) language = recorded;
  } catch {
    language = DEFAULT_DISPLAY_LANGUAGE;
  }
  return language;
}

export function _resetDisplayLanguageForTests(value: DisplayLanguage | null = null): void {
  language = value;
  catalogue = null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const HOLE = /\{(\d+)\}/g;

const AGREEMENT_ONLY: ReadonlyMap<string, string> = new Map([
  ["s", ""],
  ["es", ""],
  ["y", ""],
  ["ies", ""],
  ["is", ""],
  ["are", ""],
  ["does", ""],
  ["do", ""],
  ["has", ""],
  ["have", ""],
  ["reports", ""],
  ["s report", ""],
  ["it", "それ"],
  ["them", "それら"],
  ["its", "その"],
  ["their", "それらの"],
]);

function firstWord(value: string): string {
  return /^\S+/.exec(value)?.[0] ?? "";
}

// Colour codes and list marks stay where they were; the words between them
// are what the catalogue knows.
const COLOUR = "(?:\u001b\\[[0-9;]*m)*";
const DRESSED = new RegExp(
  `^(${COLOUR}\\s*(?:(?:[-*•✓✗✔✖⚠!]|\\d+[.)])\\s+)?${COLOUR})([\\s\\S]*?)(${COLOUR}\\s*)$`,
);
const PROSE = /[A-Za-z]{2,}/;
const RUNS_ON = /[.!?]\s+\S/;
// Where one piece of a line ends: a gap that sets out columns, or the space after a sentence or a label.
const PIECE_ENDS = /\s{2,}(?=\S)|(?<=[.!?:;])\s+(?=\S)/g;

/** A line as the catalogue keys it: without the list mark, colour codes and spaces around it. */
export function catalogueKey(line: string): string {
  return DRESSED.exec(line)?.[2] ?? line;
}

function buildCatalogue(entries: Readonly<Record<string, string>>): Catalogue {
  const exact = new Map<string, string>();
  const byFirstWord = new Map<string, Pattern[]>();
  const anyFirstWord: Pattern[] = [];
  for (const [written, wording] of Object.entries(entries)) {
    const english = catalogueKey(written);
    const shown = catalogueKey(wording);
    if (!english.includes("{")) {
      exact.set(english, shown);
      continue;
    }
    const literal = english.replace(HOLE, "");
    if (literal === english) {
      exact.set(english, shown);
      continue;
    }
    // A template kept as written changes nothing, and as a pattern it would
    // only stand in the way of a wording for the same line.
    if (shown === english) continue;
    // A template that is nearly all holes would match any line.
    const weight = literal.replace(/\s/g, "").length;
    if (weight < 4) continue;
    const order: number[] = [];
    let source = "";
    let last = 0;
    for (const hole of english.matchAll(HOLE)) {
      source += `${escapeRegExp(english.slice(last, hole.index))}(.*?)`;
      order.push(Number(hole[1]));
      last = (hole.index ?? 0) + hole[0].length;
    }
    source += escapeRegExp(english.slice(last));
    const pattern: Pattern = {
      match: new RegExp(`^${source}$`, "s"),
      shown: shown.replace(HOLE, (_, n: string) => `{${order.indexOf(Number(n))}}`),
      weight,
    };
    const head = english.slice(0, english.search(HOLE));
    const word = /\s/.test(head) ? firstWord(head) : "";
    if (word) {
      const list = byFirstWord.get(word) ?? [];
      list.push(pattern);
      byFirstWord.set(word, list);
    } else if (weight > order.length) {
      // With no first word to hold it in place, a template needs more of its
      // own letters than it has holes, or it would match unrelated sentences.
      anyFirstWord.push(pattern);
    }
  }
  const heaviestFirst = (a: Pattern, b: Pattern) => b.weight - a.weight;
  for (const list of byFirstWord.values()) list.sort(heaviestFirst);
  anyFirstWord.sort(heaviestFirst);
  return { exact, byFirstWord, anyFirstWord };
}

function loadedCatalogue(): Catalogue | null {
  if (catalogue !== null) return catalogue;
  if (displayLanguage() !== "ja") return null;
  const { DISPLAY_JA } = require("./aidlc-display-ja.ts") as typeof import("./aidlc-display-ja.ts");
  catalogue = buildCatalogue(DISPLAY_JA);
  return catalogue;
}

function phraseShown(table: Catalogue, phrase: string, depth: number): string | null {
  const known = table.exact.get(phrase);
  if (known !== undefined) return known;
  const anchored = table.byFirstWord.get(firstWord(phrase)) ?? [];
  for (const pattern of [...anchored, ...table.anyFirstWord]) {
    const found = pattern.match.exec(phrase);
    if (!found) continue;
    // A value that runs on into another sentence means the template caught a
    // line it was not written for; the line is then read piece by piece.
    if (found.slice(1).some((value) => RUNS_ON.test(value))) continue;
    return pattern.shown.replace(HOLE, (_, n: string) => {
      const value = found[Number(n) + 1] ?? "";
      // A value that only makes the English sentence agree (a plural ending,
      // is/are, it/them) has no place, or a word of its own, in the wording.
      const agreement = AGREEMENT_ONLY.get(value.trim());
      if (agreement !== undefined) return agreement;
      const dressed = DRESSED.exec(value);
      const label = dressed ? table.exact.get(dressed[2]) : undefined;
      if (dressed && label !== undefined) return `${dressed[1]}${label}${dressed[3]}`;
      return depth < 3 && PROSE.test(value) && /\s/.test(value) ? textShown(table, value, depth + 1) : value;
    });
  }
  return null;
}

// A piece that labels what follows it is known with or without its colon.
function labelShown(table: Catalogue, piece: string, depth: number): string | null {
  const shown = phraseShown(table, piece, depth);
  if (shown !== null || !piece.endsWith(":")) return shown;
  const bare = phraseShown(table, piece.slice(0, -1), depth);
  return bare === null ? null : `${bare}:`;
}

function textShown(table: Catalogue, text: string, depth: number): string {
  const dressed = DRESSED.exec(text);
  if (!dressed) return text;
  const [, lead, words, tail] = dressed;
  if (!PROSE.test(words)) return text;
  const whole = phraseShown(table, words, depth);
  if (whole !== null) return `${lead}${whole}${tail}`;
  // A line put together from pieces (a verdict column and its check, a label
  // and its sentences, several sentences one after another): from each piece
  // on, the longest run of pieces the catalogue knows is shown in the
  // language, so a wording that spans several sentences still matches. A
  // piece the catalogue does not know stays as written.
  const pieces: string[] = [];
  const gaps: string[] = [];
  let from = 0;
  for (const cut of words.matchAll(PIECE_ENDS)) {
    pieces.push(words.slice(from, cut.index));
    gaps.push(cut[0]);
    from = (cut.index ?? 0) + cut[0].length;
  }
  pieces.push(words.slice(from));
  if (pieces.length === 1 || pieces.length > 60 || depth > 3) return text;
  let out = "";
  for (let start = 0; start < pieces.length; ) {
    let end = pieces.length;
    let shown: string | null = null;
    for (; end > start; end--) {
      if (start === 0 && end === pieces.length) continue;
      let run = pieces[start];
      for (let index = start + 1; index < end; index++) run += gaps[index - 1] + pieces[index];
      const dressedRun = DRESSED.exec(run);
      const known = dressedRun && PROSE.test(dressedRun[2]) ? labelShown(table, dressedRun[2], depth + 1) : null;
      if (known !== null && dressedRun) {
        shown = `${dressedRun[1]}${known}${dressedRun[3]}`;
        break;
      }
    }
    if (shown === null) {
      shown = pieces[start];
      end = start + 1;
    }
    out += shown + (end < pieces.length ? gaps[end - 1] : "");
    start = end;
  }
  return `${lead}${out}${tail}`;
}

/** One or more lines, each shown in the display language when the catalogue has it. */
export function inDisplayLanguage(text: string): string {
  if (!PROSE.test(text)) return text;
  const table = loadedCatalogue();
  if (table === null) return text;
  const start = text.trimStart();
  // A structured answer is for a program, whatever command printed it.
  if (start.startsWith("{") || start.startsWith("[{") || start.startsWith('["')) {
    try {
      JSON.parse(text);
      return text;
    } catch {
      // Words that happen to open with a bracket.
    }
  }
  return text
    .split("\n")
    .map((line) => (line === "" ? line : textShown(table, line, 0)))
    .join("\n");
}

type Writer = (chunk: unknown, ...rest: unknown[]) => boolean;

function showStream(stream: NodeJS.WriteStream): void {
  const write = stream.write.bind(stream) as Writer;
  (stream as { write: Writer }).write = (chunk, ...rest) =>
    write(typeof chunk === "string" ? inDisplayLanguage(chunk) : chunk, ...rest);
}

// Bun's console does not write through process.stdout.write, so both are taken.
function showEverythingThisProcessPrints(): void {
  if (showing) return;
  showing = true;
  showStream(process.stdout);
  showStream(process.stderr);
  for (const name of ["log", "info", "warn", "error"] as const) {
    const print = console[name].bind(console);
    console[name] = (...args: unknown[]) =>
      print(...args.map((arg) => (typeof arg === "string" ? inDisplayLanguage(arg) : arg)));
  }
}

/** The dispatcher's call: a command the person typed, answered in words for them. */
export function showPersonCommandInDisplayLanguage(argv: readonly string[]): void {
  // Only the commands made for a person to read. A terminal is no sign of a
  // person: some harnesses run the agent's engine commands in one, and the
  // stage instructions match the English of those answers.
  // `engine status` is the one engine answer the agent prints as it is, so the
  // person reads it whoever typed the command.
  const forPerson = PERSON_COMMANDS.has(argv[0] ?? "") || (argv[0] === "engine" && argv[1] === "status");
  if (!forPerson) return;
  if (argv.includes("--json") || argv.includes("--quiet")) return;
  if (displayLanguage() === "en") return;
  process.env[PERSON_COMMAND_ENV] = String(process.pid);
  showEverythingThisProcessPrints();
}

/** A tool's call: adopt the language when the dispatcher started it for the person. */
export function adoptDisplayLanguage(): void {
  const dispatcher = process.env[PERSON_COMMAND_ENV];
  if (!dispatcher) return;
  if (dispatcher !== String(process.pid) && dispatcher !== String(process.ppid)) return;
  if (displayLanguage() === "en") return;
  showEverythingThisProcessPrints();
}

// The process id of the engine run whose answer the agent reads. An engine
// command that run starts for itself reads its child's lines back and matches
// their English, so only the outermost run words its step for the person.
const ENGINE_RUN_ENV = "AIDLC_DISPLAY_ENGINE_RUN";

/** The engine's first call: the outermost run takes the name, before it starts any command of its own. */
export function claimEngineRunForPerson(): void {
  if (!process.env[ENGINE_RUN_ENV]) process.env[ENGINE_RUN_ENV] = String(process.pid);
}

/**
 * A step the engine hands the agent, serialized with the lines the agent says
 * to the person as written (`narration`, `change_notices`, an error's
 * `message`) in the display language. The engine's own copy stays English: it
 * matches those lines later, and its hashes and receipts are taken from it.
 * Null when there is nothing to reword, or the reworded step would not fit the
 * transport limit, and the caller then sends the step as written. A question
 * is the agent's to put in the conversation's language, and a `print` or a
 * note is an instruction to the agent, so neither is touched.
 */
export function stepSerializedForPerson(directive: object, maxBytes: number): string | null {
  const step = directive as Readonly<Record<string, unknown>>;
  if (process.env[ENGINE_RUN_ENV] !== String(process.pid)) return null;
  if (displayLanguage() === "en") return null;
  const worded: Record<string, unknown> = { ...step };
  if (typeof step.narration === "string") worded.narration = inDisplayLanguage(step.narration);
  if (Array.isArray(step.change_notices)) {
    worded.change_notices = step.change_notices.map((line) => (typeof line === "string" ? inDisplayLanguage(line) : line));
  }
  if (step.kind === "error" && typeof step.message === "string") worded.message = inDisplayLanguage(step.message);
  const serialized = JSON.stringify(worded);
  if (serialized === JSON.stringify(step)) return null;
  return Buffer.byteLength(serialized, "utf-8") > maxBytes ? null : serialized;
}

export function displayLanguageShowsThisProcess(): boolean {
  return showing;
}
