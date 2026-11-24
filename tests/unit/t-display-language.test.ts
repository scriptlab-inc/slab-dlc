// covers: file:core/tools/aidlc-display-language.ts
// covers: file:core/tools/aidlc-display-ja.ts
//
// The display language: a person who chose Japanese reads the terminal
// commands' lines in Japanese, a script reading --json reads what it always
// read, and every line those commands can print has a wording.

import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DISPLAY_JA } from "../../core/tools/aidlc-display-ja.ts";
import {
  _resetDisplayLanguageForTests,
  catalogueKey,
  claimEngineRunForPerson,
  inDisplayLanguage,
  stepSerializedForPerson,
} from "../../core/tools/aidlc-display-language.ts";
import { linesOf, PERSON_FACING_SOURCES } from "../../scripts/display-language-catalogue.ts";
import { REPO_ROOT } from "../harness/fixtures.ts";

const DISPATCHER = join(REPO_ROOT, "core", "tools", "aidlc.ts");
const temporary: string[] = [];

afterAll(() => {
  for (const path of temporary) rmSync(path, { recursive: true, force: true });
});

afterEach(() => {
  _resetDisplayLanguageForTests();
});

function holes(line: string): string[] {
  return [...line.matchAll(/\{\d+\}/g)].map((hole) => hole[0]).sort();
}

function codeSpans(line: string): string[] {
  return [...line.matchAll(/`[^`]*`/g)].map((span) => span[0]).sort();
}

// A project folder with the language recorded, and a machine root of its own
// so the developer's settings never reach the run.
function projectRecording(language: string | null): { dir: string; env: NodeJS.ProcessEnv } {
  const dir = mkdtempSync(join(tmpdir(), "aidlc-display-language-"));
  temporary.push(dir);
  const root = join(dir, "machine");
  mkdirSync(root);
  const project = join(dir, "project");
  mkdirSync(project);
  if (language !== null) {
    writeFileSync(
      join(project, "aidlc.settings.json"),
      `${JSON.stringify({ schemaVersion: 1, flags: { schemaVersion: 1, displayLanguage: language } })}\n`,
    );
  }
  return { dir: project, env: { ...process.env, AIDLC_INSTALL_ROOT: root, NO_COLOR: "1" } };
}

function aidlc(args: string[], at: { dir: string; env: NodeJS.ProcessEnv }): { stdout: string; stderr: string } {
  const run = spawnSync(process.execPath, [DISPATCHER, ...args], { cwd: at.dir, env: at.env, encoding: "utf8" });
  return { stdout: run.stdout, stderr: run.stderr };
}

describe("the Japanese catalogue", () => {
  test("every wording keeps the values and the code its English line carries", () => {
    // Given the shipped catalogue
    // When each wording is set beside its English line
    const broken = Object.entries(DISPLAY_JA).filter(
      ([english, shown]) =>
        holes(english).join() !== holes(shown).join() || codeSpans(english).join() !== codeSpans(shown).join(),
    );
    // Then none drops a value, or changes a command the person would type
    expect(broken.map(([english]) => english)).toEqual([]);
  });

  test("every line the terminal commands can print has a wording", () => {
    // Given the lines read from the person-facing sources
    const known = new Set(Object.keys(DISPLAY_JA).map(catalogueKey));
    // When each is looked up
    const missing = PERSON_FACING_SOURCES.flatMap((file) => linesOf(file)).filter((line) => !known.has(line));
    // Then none is left in English only; `bun scripts/display-language-catalogue.ts --missing` lists them
    expect(missing).toEqual([]);
  });
});

describe("a line shown in the display language", () => {
  test("is the catalogue's wording, with the line's own mark and values kept", () => {
    // Given Japanese as the display language
    _resetDisplayLanguageForTests("ja");
    // When lines the catalogue knows are shown
    const label = inDisplayLanguage("fix: rerun with --help for valid usage\n");
    const listed = inDisplayLanguage("  - Add --verbose to see every check.\n");
    // Then the words are Japanese, and the indent, the mark and the newline stay
    expect(label).toBe("直し方: 正しい使い方は、--help を付けてもう一度実行すると確認できます\n");
    expect(listed).toBe("  - すべての点検項目を見るには --verbose を付けてください。\n");
  });

  test("is found piece by piece in a line set out in columns or behind a label", () => {
    // Given Japanese as the display language
    _resetDisplayLanguageForTests("ja");
    // When doctor's verdict rows, its count line and config's change line are shown
    const verdict = inDisplayLanguage("  ok    all 6 checks passed\n");
    const counts = inDisplayLanguage("2 problems, 1 warning.\n");
    const changed = inDisplayLanguage("  hook debug: not set -> on in aidlc.settings.local.json. It was not set there before.\n");
    // Then each piece is Japanese, a plural ending is gone, and the file name keeps its dots
    expect(verdict).toBe("  ok    全 6 件の点検に合格しました\n");
    expect(counts).toBe("問題 2 件、警告 1 件。\n");
    expect(changed).toBe(
      "  フックのデバッグ: aidlc.settings.local.json で 未設定 から on に変えました。以前はそこに設定されていませんでした。\n",
    );
  });

  test("stays as written when the catalogue has no wording, or a program reads it", () => {
    // Given Japanese as the display language
    _resetDisplayLanguageForTests("ja");
    // When a line with no wording and a structured answer are shown
    const unknown = inDisplayLanguage("zzz no such line is in the catalogue\n");
    const structured = '{"message":"rerun with --help for valid usage"}\n';
    // Then both come out unchanged
    expect(unknown).toBe("zzz no such line is in the catalogue\n");
    expect(inDisplayLanguage(structured)).toBe(structured);
  });

  test("stays English when English is the display language", () => {
    // Given English, the shipped default
    _resetDisplayLanguageForTests("en");
    // When a line the Japanese catalogue knows is shown
    const shown = inDisplayLanguage("fix: rerun with --help for valid usage\n");
    // Then it is the line as written
    expect(shown).toBe("fix: rerun with --help for valid usage\n");
  });
});

describe("a step the engine hands the agent", () => {
  const ENGINE_RUN = "AIDLC_DISPLAY_ENGINE_RUN";
  const step = {
    kind: "run-stage",
    stage: "requirements-analysis",
    narration:
      "Picking up where we left off, at Requirements Analysis. If you'd rather redo it, go back to another stage, or start fresh, just say so.",
    change_notices: [
      "This project has no git, so AI-DLC can't undo the changes it makes to your files; to get an undo, run `git init` and commit them.",
    ],
    question_note: "Ask the person the question as given.",
  };

  afterEach(() => {
    delete process.env[ENGINE_RUN];
  });

  test("carries the lines the agent says to the person in Japanese, and its own notes as written", () => {
    // Given Japanese as the display language, in the engine run the agent started
    _resetDisplayLanguageForTests("ja");
    claimEngineRunForPerson();
    // When the step is serialized for the person
    const sent = JSON.parse(stepSerializedForPerson(step, 100_000) ?? "null") as typeof step;
    // Then the narration and the notice are Japanese, with the stage's name and the command kept
    expect(sent.narration).toBe(
      "前回の続きから再開します。再開する場所は Requirements Analysis です。やり直したいとき、別のステージに戻りたいとき、最初から始めたいときは、そう伝えてください。",
    );
    expect(sent.change_notices[0]).toContain("`git init`");
    expect(sent.change_notices[0]).toContain("元に戻せません");
    // And the note that instructs the agent, the keys and their order are untouched
    expect(sent.question_note).toBe(step.question_note);
    expect(Object.keys(sent)).toEqual(Object.keys(step));
    // And the engine's own copy, which it matches later, is still English
    expect(step.narration.startsWith("Picking up where we left off, at ")).toBe(true);
  });

  test("says each sentence of a narration put together from several lines", () => {
    // Given Japanese as the display language, in the engine run the agent started
    _resetDisplayLanguageForTests("ja");
    claimEngineRunForPerson();
    // When a narration of three lines joined into one is serialized
    const narration =
      "Setting up the bugfix workflow for this: 5 stages, 5 approval gates. The folder has no code yet, so I'm starting this as a new project without Reverse Engineering. If the work is on existing code, tell me. To start this in a clean chat instead, type /clear, then /aidlc.";
    const sent = JSON.parse(stepSerializedForPerson({ kind: "run-stage", narration }, 100_000) ?? "null") as { narration: string };
    // Then every sentence is Japanese, and the names and the command to type are kept
    expect(sent.narration).toContain("ステージ 5 件、承認ゲート 5 件");
    expect(sent.narration).toContain("Reverse Engineering");
    expect(sent.narration).toContain("代わりに新しいチャットで始めるには");
    expect(sent.narration).toContain("/clear");
    expect(sent.narration).not.toMatch(/[A-Za-z]{3,} [a-z]{3,} [a-z]{3,}/);
  });

  test("is sent as written when it is an instruction, would not fit, or an engine command reads it back", () => {
    // Given Japanese as the display language, in the engine run the agent started
    _resetDisplayLanguageForTests("ja");
    claimEngineRunForPerson();
    // When a print (an instruction with a command) is serialized
    const print = stepSerializedForPerson({ kind: "print", message: "Run `aidlc engine status`, print its output verbatim, then stop." }, 100_000);
    // And a step whose Japanese wording would pass the transport limit
    const tooLong = stepSerializedForPerson(step, JSON.stringify(step).length + 10);
    // And a step of an engine command another engine run started
    process.env[ENGINE_RUN] = "1";
    const nested = stepSerializedForPerson(step, 100_000);
    // Then each is left for the caller to send in English
    expect(print).toBeNull();
    expect(tooLong).toBeNull();
    expect(nested).toBeNull();
  });

  test("is sent as written when English is the display language", () => {
    // Given English, the shipped default
    _resetDisplayLanguageForTests("en");
    claimEngineRunForPerson();
    // When the step is serialized for the person
    const sent = stepSerializedForPerson(step, 100_000);
    // Then there is nothing to reword
    expect(sent).toBeNull();
  });
});

describe("a command the person types", () => {
  const refused = ["config", "flags", "--swarm", "maybe", "--project"];

  test("answers in Japanese in a project that recorded ja", () => {
    // Given a project whose settings record Japanese
    const project = projectRecording("ja");
    // When a config command is refused
    const { stdout } = aidlc(refused, project);
    // Then the refusal's labels are Japanese and the command to type is unchanged
    expect(stdout).toContain("エラー:");
    expect(stdout).toContain("使い方:");
    expect(stdout).toContain("config flags --help");
  });

  test("answers in English where no language is recorded", () => {
    // Given a project with no settings
    const project = projectRecording(null);
    // When the same command is refused
    const { stdout } = aidlc(refused, project);
    // Then the answer is the shipped English
    expect(stdout).toContain("error:");
    expect(stdout).not.toContain("エラー:");
  });

  test("gives a script the same --json answer whatever the language", () => {
    // Given one project recording Japanese and one recording nothing
    const japanese = aidlc([...refused, "--json"], projectRecording("ja"));
    const english = aidlc([...refused, "--json"], projectRecording(null));
    // When both answers are read as a script would
    const message = (out: string) => (JSON.parse(out) as { message: string }).message.replace(/\/\S+/g, "");
    // Then the words are the same
    expect(message(japanese.stdout)).toBe(message(english.stdout));
    expect(japanese.stdout).not.toContain("エラー");
  });

  test("refuses a display language it has no catalogue for", () => {
    // Given a machine root of the person's own
    const project = projectRecording(null);
    // When a language AI-DLC does not ship is recorded
    const { stdout } = aidlc(["config", "flags", "--display-language", "xx", "--global", "--yes"], project);
    // Then the refusal names the languages it has
    expect(stdout).toContain("--display-language must be one of en, ja");
  });
});
