// Lists the English lines the person-facing commands can print and says which
// have no entry in a display-language catalogue (core/tools/aidlc-display-ja.ts).
//
//   bun scripts/display-language-catalogue.ts            counts per source file
//   bun scripts/display-language-catalogue.ts --missing  the lines with no entry, as JSON
//   bun scripts/display-language-catalogue.ts --unused   entries no source line writes any more
//   bun scripts/display-language-catalogue.ts --all <file>  every line of one source file, as JSON
//
// A line is read from the source text, so a string put together at run time
// from values shows up as a template with `{0}`, `{1}` where the values go.
// An entry whose wording equals its key says the line is kept as written (a
// command, a flag list), which is how it stops being listed as missing.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";
import { DISPLAY_JA } from "../core/tools/aidlc-display-ja.ts";
import { catalogueKey } from "../core/tools/aidlc-display-language.ts";

const REPO = join(import.meta.dir, "..");

// The tools whose lines reach a person at a terminal: the dispatcher, the
// commands a person types, and the modules those commands take their words from.
export const PERSON_FACING_SOURCES = [
  "core/tools/aidlc.ts",
  "core/tools/aidlc-command.ts",
  "core/tools/aidlc-init.ts",
  "core/tools/aidlc-lifecycle.ts",
  "core/tools/aidlc-doctor.ts",
  "core/tools/aidlc-doctor-bundle.ts",
  "core/tools/aidlc-config-diagnostics.ts",
  "core/tools/aidlc-machine-config.ts",
  "core/tools/aidlc-statusline-choice.ts",
  "core/tools/aidlc-uninstall-plan.ts",
  "core/tools/aidlc-release.ts",
  "core/tools/aidlc-distribution.ts",
  "core/tools/aidlc-channel.ts",
  "core/tools/aidlc-utility.ts",
  "core/tools/aidlc-workspace-doctor.ts",
  "core/tools/aidlc-gitignore.ts",
  "core/tools/aidlc-update.ts",
  "core/tools/aidlc-windows-uninstall.ts",
  "core/tools/aidlc-plugin.ts",
  "core/tools/aidlc-model-policy.ts",
  "core/tools/aidlc-recorded-switches.ts",
  "core/tools/aidlc-folder-depth.ts",
  "core/tools/aidlc-install-paths.ts",
  "core/tools/aidlc-transaction.ts",
  "core/tools/aidlc-completions.ts",
  "core/tools/aidlc-kiro-session.ts",
  "core/tools/aidlc-kiro-ide-workflows.ts",
  "core/tools/aidlc-kiro-ide-terminal.ts",
  "core/tools/aidlc-archive.ts",
  "core/tools/aidlc-includes.ts",
  "core/tools/aidlc-settings.ts",
  "core/tools/aidlc-lib.ts",
  // Each harness's own lines (how to trust the project, where its settings
  // live), which the packager writes into harness.json for doctor and config.
  "harness/claude/manifest.ts",
  "harness/codex/manifest.ts",
  "harness/copilot/manifest.ts",
  "harness/cursor/manifest.ts",
  "harness/kiro/manifest.ts",
  "harness/kiro-ide/manifest.ts",
  "harness/opencode/manifest.ts",
  // The engine and the tools it calls: the lines of a step the agent says to
  // the person as written (narration, change notices, an error's message).
  "core/tools/aidlc-orchestrate.ts",
  "core/tools/aidlc-directive.ts",
  "core/tools/aidlc-state.ts",
  "core/tools/aidlc-log.ts",
  "core/tools/aidlc-jump.ts",
  "core/tools/aidlc-testing-posture.ts",
  "core/tools/aidlc-plan-approval-ask.ts",
  "core/tools/aidlc-guard-switch.ts",
  "core/tools/aidlc-guard-fences.ts",
  "core/tools/aidlc-guard-operation.ts",
  "core/tools/aidlc-before-pick.ts",
  "core/tools/aidlc-brought-files.ts",
  "core/tools/aidlc-new-chat.ts",
  "core/tools/aidlc-rules-held.ts",
  "core/tools/aidlc-questions.ts",
  "core/tools/aidlc-question-store.ts",
  "core/tools/aidlc-reply-reader.ts",
  "core/tools/aidlc-learnings.ts",
  "core/tools/aidlc-validity.ts",
  "core/tools/aidlc-unit.ts",
  "core/tools/aidlc-unit-landing.ts",
  "core/tools/aidlc-unit-holders.ts",
  "core/tools/aidlc-unit-walk-view.ts",
  "core/tools/aidlc-worktree.ts",
  "core/tools/aidlc-swarm.ts",
  "core/tools/aidlc-swarm-checkpoints.ts",
  "core/tools/aidlc-bolt.ts",
  "core/tools/aidlc-construction-checkpoints.ts",
  "core/hooks/aidlc-continue-workflow.ts",
] as const;

const HOLE = "\u0000";

// The text of a string put together from literals, with HOLE where a value is
// filled in. `filled` collects the expressions that fill the holes: each may
// hold lines of its own (`${heading("Machine", out)}`).
function flattened(node: ts.Expression, filled: ts.Expression[]): string | null {
  if (ts.isParenthesizedExpression(node)) return flattened(node.expression, filled);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    let out = node.head.text;
    for (const span of node.templateSpans) {
      filled.push(span.expression);
      out += HOLE + span.literal.text;
    }
    return out;
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const leftFilled: ts.Expression[] = [];
    const rightFilled: ts.Expression[] = [];
    const left = flattened(node.left, leftFilled);
    const right = flattened(node.right, rightFilled);
    if (left === null && right === null) return null;
    filled.push(...(left === null ? [node.left] : leftFilled), ...(right === null ? [node.right] : rightFilled));
    return (left ?? HOLE) + (right ?? HOLE);
  }
  return null;
}

// Words a person reads, as opposed to an identifier, a path or a pattern.
function readsAsWords(line: string): boolean {
  const literal = line.split(HOLE).join(" ").trim();
  // A line of a shell script the tool writes out, not a sentence.
  if (literal.includes("${")) return false;
  // A command pattern on its own, which the packager rewrites per harness.
  if (/^"?bun \./.test(literal)) return false;
  // The leftover file of an earlier version: aidlc-utility.ts alone names it
  // among the shipped files (t-compose-approve-carries-on), so no catalogue does.
  if (literal.includes(".aidlc-compose-pending")) return false;
  if (/^[A-Z][a-z]+:?$/.test(literal)) return true;
  // A heading set in capitals (LEARN MORE). One capital word alone is as
  // often an error code or a variable's name, so those are entered by hand.
  if (/^[A-Z]+( [A-Z]+)+:?$/.test(literal)) return true;
  const words = literal.match(/[A-Za-z][A-Za-z'-]+/g) ?? [];
  return words.length >= 2 && /[a-z]/.test(literal) && /[A-Za-z]\s+[A-Za-z(]/.test(literal);
}

function numbered(line: string): string {
  let next = 0;
  return line.replaceAll(HOLE, () => `{${next++}}`);
}

export function linesOf(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(join(REPO, file), "utf8"), ts.ScriptTarget.Latest, true);
  const found = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isTypeNode(node)) return;
    if (ts.isExpression(node)) {
      const filled: ts.Expression[] = [];
      const flat = flattened(node, filled);
      if (flat !== null) {
        for (const line of flat.split("\n")) {
          const key = catalogueKey(line);
          if (key !== HOLE && readsAsWords(key)) found.add(numbered(key));
        }
        for (const value of filled) visit(value);
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...found];
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const known = new Set(Object.keys(DISPLAY_JA).map(catalogueKey));
  const only = argv.includes("--all") ? argv[argv.indexOf("--all") + 1] : null;
  if (only) {
    process.stdout.write(`${JSON.stringify(linesOf(only), null, 1)}\n`);
  } else {
    const written = new Map<string, string>();
    for (const file of PERSON_FACING_SOURCES) {
      for (const line of linesOf(file)) if (!written.has(line)) written.set(line, file);
    }
    const missing = [...written].filter(([line]) => !known.has(line));
    if (argv.includes("--missing")) {
      process.stdout.write(`${JSON.stringify(missing.map(([line]) => line), null, 1)}\n`);
    } else if (argv.includes("--unused")) {
      process.stdout.write(`${JSON.stringify([...known].filter((key) => !written.has(key)), null, 1)}\n`);
    } else {
      for (const file of PERSON_FACING_SOURCES) {
        const lines = [...written].filter(([, from]) => from === file);
        const open = lines.filter(([line]) => !known.has(line)).length;
        process.stdout.write(`${String(lines.length).padStart(5)} lines, ${String(open).padStart(5)} with no entry  ${file}\n`);
      }
      process.stdout.write(`${written.size} lines, ${missing.length} with no entry\n`);
    }
  }
}
