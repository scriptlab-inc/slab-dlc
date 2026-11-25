// Japanese wording for the lines AI-DLC prints for the person at a terminal.
// A key is the English line as the source writes it, with `{0}`, `{1}` where a
// value is filled in; the value says the same thing in Japanese. Commands,
// flags, file names and setting names stay as they are typed. A wording equal
// to its key says the line is kept as written: a command form, a line written
// into a file, or a word other code matches.
// `bun scripts/display-language-catalogue.ts --missing` lists the lines with no entry.
//
// The entries are data files, not modules: an English line that names a
// command is a key here, and the checks that keep hand-written commands out of
// the tools' own strings read every module under tools/.

import DISPLAY_JA_CONFIG from "./data/display-ja-config.json";
import DISPLAY_JA_DISPATCHER from "./data/display-ja-dispatcher.json";
import DISPLAY_JA_DOCTOR from "./data/display-ja-doctor.json";
import DISPLAY_JA_ENGINE_PLAN from "./data/display-ja-engine-plan.json";
import DISPLAY_JA_ENGINE_STATE from "./data/display-ja-engine-state.json";
import DISPLAY_JA_ENGINE_STEPS from "./data/display-ja-engine-steps.json";
import DISPLAY_JA_ENGINE_UNITS from "./data/display-ja-engine-units.json";
import DISPLAY_JA_HARNESS from "./data/display-ja-harness.json";
import DISPLAY_JA_HEADINGS from "./data/display-ja-headings.json";
import DISPLAY_JA_LIFECYCLE from "./data/display-ja-lifecycle.json";
import DISPLAY_JA_PIECES from "./data/display-ja-pieces.json";
import DISPLAY_JA_SHARED from "./data/display-ja-shared.json";
import DISPLAY_JA_STATUS from "./data/display-ja-status.json";
import DISPLAY_JA_TOOLS from "./data/display-ja-tools.json";

// Labels every command puts before its lines, and the display language's own lines.
const DISPLAY_JA_LABELS: Readonly<Record<string, string>> = {
  "error:": "エラー:",
  "fix:": "直し方:",
  "usage:": "使い方:",
  "tip:": "ヒント:",
  "action:": "必要な操作:",
  "rerun with --help for valid usage": "正しい使い方は、--help を付けてもう一度実行すると確認できます",
  "Warnings are advisory - if everything works, ignore them.": "警告は参考情報です。問題なく動いていれば、無視してかまいません。",
  "Add --verbose to see every check.": "すべての点検項目を見るには --verbose を付けてください。",
  "--display-language must be one of {0}": "--display-language には {0} のいずれかを指定してください",
  "Display language: {0} {1}": "表示の言語: {0} {1}",
  "Display language [{0}, Enter keep]:": "表示の言語 [{0}、Enter で今のまま]:",
  "display language": "表示の言語",
  "the display language": "表示の言語",
  // Lines the engine keeps in English for its own matching and hands the
  // person through a step, where only the copy that is sent is reworded.
  "Picking up where we left off, at {0} for {1}. If you'd rather redo it, go back to another stage, or start fresh, just say so.":
    "前回の続きから再開します。再開する場所は、{1} の {0} です。やり直したいとき、別のステージに戻りたいとき、最初から始めたいときは、そう伝えてください。",
  "Picking up where we left off, at {0}. If you'd rather redo it, go back to another stage, or start fresh, just say so.":
    "前回の続きから再開します。再開する場所は {0} です。やり直したいとき、別のステージに戻りたいとき、最初から始めたいときは、そう伝えてください。",
  "To start this in a clean chat instead, {0}.": "代わりに新しいチャットで始めるには、次のようにします: {0}。",
  "This project has no git, so AI-DLC can't undo the changes it makes to your files; to get an undo, run `git init` and commit them.":
    "このプロジェクトには git が無いため、AI-DLC はファイルに加えた変更を元に戻せません。元に戻せるようにするには、`git init` を実行して変更をコミットしてください。",
  // The size of a plan, filled into the line that announces it.
  "{0} stage{1}, {2} approval gate{3}": "ステージ {0} 件{1}、承認ゲート {2} 件{3}",
  // What config says after it changes one setting.
  // Keyed with the space after the full stop, so a file name's own dots stay in {3}.
  "{0}: {1} -> {2} in {3}. {4}": "{0}: {3} で {1} から {2} に変えました。{4}",
  "{0}: {1} -> {2} in {3}.": "{0}: {3} で {1} から {2} に変えました。",
  // Doctor's count line and the short pieces it is put together from.
  "{0} problem{1}, {2} warning{3}.": "問題 {0} 件{1}、警告 {2} 件{3}。",
  "{0} problem{1}": "問題 {0} 件{1}",
  "{0} warning{1}": "警告 {0} 件{1}",
  "{0} all {1} checks passed": "{0} 全 {1} 件の点検に合格しました",
  // Headings set in capitals.
  "USAGE": "使い方",
  "EXAMPLES": "例",
  "EXAMPLE": "例",
  "OPTIONS": "オプション",
  "OUTPUT": "出力",
  "SECTIONS": "セクション",
  "HARNESSES": "ハーネス",
  "ARGUMENTS": "引数",
  "INVOKE": "呼び出し方",
  "POLICY": "方針",
  "INSPECTION": "確認",
  "SET UP A PROJECT": "プロジェクトの設定",
  "MANAGE THE MACHINE INSTALL": "このマシンへのインストールの管理",
  "LEARN MORE": "さらに詳しく",
  "PLUGIN COMMANDS": "プラグインのコマンド",
  "RELEASE SOURCE": "リリースの取得元",
  "THE PIECE OF WORK YOU ARE ON": "今の作業",
  "COMMON FLAGS": "共通のフラグ",
  "KIRO CLI": "KIRO CLI",
  "WRITE TARGET": "書き込み先",
  "MUTATION CONTROL": "変更の制御",
  "INITIALIZATION PHASE": "Initialization フェーズ",
  "IDEATION PHASE": "Ideation フェーズ",
  "INCEPTION PHASE": "Inception フェーズ",
  "CONSTRUCTION PHASE": "Construction フェーズ",
  "OPERATION PHASE": "Operation フェーズ",
  "HTML H{0}": "HTML H{0}",
};

// A later part wins where two sources write the same line.
export const DISPLAY_JA: Readonly<Record<string, string>> = {
  ...DISPLAY_JA_ENGINE_UNITS,
  ...DISPLAY_JA_ENGINE_PLAN,
  ...DISPLAY_JA_ENGINE_STATE,
  ...DISPLAY_JA_ENGINE_STEPS,
  ...DISPLAY_JA_PIECES,
  ...DISPLAY_JA_HARNESS,
  ...DISPLAY_JA_TOOLS,
  ...DISPLAY_JA_SHARED,
  ...DISPLAY_JA_STATUS,
  ...DISPLAY_JA_HEADINGS,
  ...DISPLAY_JA_DISPATCHER,
  ...DISPLAY_JA_CONFIG,
  ...DISPLAY_JA_LIFECYCLE,
  ...DISPLAY_JA_DOCTOR,
  ...DISPLAY_JA_LABELS,
};
