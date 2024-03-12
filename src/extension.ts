import * as fs from "fs";
import * as readline from "readline";
import * as vscode from "vscode";

/**
 * 拡張機能をアクティブ化します。
 * 拡張機能は、コマンドが初めて実行されたときにアクティブ化されます。
 *
 * @param context - VS Code の拡張機能コンテキスト
 */
export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand(
    "md-qopen.open",
    async () => {
      // Show the quick pick to select a file
      const file = await vscode.window.showQuickPick(getFiles(), {
        placeHolder: "Select a file to open",
      });

      // Open the selected file
      if (file) {
        vscode.workspace.openTextDocument(file.link).then((document) => {
          vscode.window.showTextDocument(document);
        });
      }
    },
  );

  context.subscriptions.push(disposable);
}

class QuickPickFile implements vscode.QuickPickItem {
  // from vscode.QuickPickItem
  label: string;
  description?: string;

  link: vscode.Uri;

  constructor(label: string, link: vscode.Uri) {
    this.label = label;
    this.link = link;
  }
}

async function getFiles(): Promise<QuickPickFile[]> {
  // markdownファイルを検索する。
  // ただし、vscode settingsのsearch.excludeに設定されているファイルは除外する。
  const searchExclude: { [key: string]: boolean } | undefined = vscode.workspace
    .getConfiguration("search")
    .get("exclude");
  let excludePatterns: string | undefined = undefined;
  if (searchExclude) {
    const trueKeys = Object.keys(searchExclude).filter(
      (key) => searchExclude[key] === true,
    );
    excludePatterns = "{" + trueKeys.join(",") + "}";
  }
  console.info("exclude", excludePatterns);
  const files = await vscode.workspace.findFiles("**/*.md", excludePatterns);

  // front matterからtitleを取得して選択候補として返す
  const frontmatterHeader = "---";
  const maxLineCount = 10;
  const quickPickFiles = await Promise.all(
    files.map(async (file) => {
      const title = await readMarkdownFrontMatterContents(
        file.fsPath,
        frontmatterHeader,
        maxLineCount,
      );
      if (title === undefined) {
        return undefined;
      }

      return new QuickPickFile(title, file);
    }),
  );
  const filteredQuicPickFiles = quickPickFiles.filter(
    (item): item is QuickPickFile => item !== undefined,
  );

  return filteredQuicPickFiles;
}

export function deactivate() {}

async function readMarkdownFrontMatterContents(
  filePath: string,
  frontmatterHeader: string,
  maxLineCount: number,
): Promise<string | undefined> {
  const searchTag = "title: ";
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let lineCount = -1;
  let tagValue = "";
  for await (const line of rl) {
    lineCount++;
    if (lineCount > maxLineCount) {
      break;
    }

    const lineContent = line.trim();
    if (lineCount === 0 && lineContent !== frontmatterHeader) {
      // front matterで始まっていなければ終了
      rl.close();
      fileStream.close();
      return undefined;
    }
    if (lineCount === 0 && lineContent === frontmatterHeader) {
      // front matterのヘッダーなのでデータとしては破棄
      continue;
    }
    if (lineCount !== 0 && lineContent === frontmatterHeader) {
      // front matterの終わりなのでコンテンツの読み込み終了
      break;
    }

    if (lineContent.startsWith(searchTag) === false) {
      continue;
    }

    tagValue = lineContent.substring(searchTag.length);
    break;
  }
  rl.close();
  fileStream.close();

  return tagValue;
}
