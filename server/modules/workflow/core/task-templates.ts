/**
 * Task Templates for component-level development workflow
 *
 * Defines standard task formats for:
 *   [コンポーネント] — UI component implementation (1 file = 1 task)
 *   [ドキュメント]   — Function-level JSDoc + Markdown spec
 *   [デバッグ]       — TypeScript/runtime error fixes
 */

export interface ComponentTaskSpec {
  filePath: string;           // relative path inside project, e.g. client/src/components/CustomerTable.tsx
  description: string;        // human-readable purpose
  props?: string;             // TypeScript props interface snippet
  requirements?: string[];    // acceptance criteria bullets
  dependencies?: string[];    // other component filePaths this depends on
}

export interface TaskCreationPayload {
  title: string;
  description: string;
  department_id: string;
  task_type: string;
  project_path: string;
  source_task_id?: string;
  priority?: number;
}

/**
 * Build a [コンポーネント] task payload for a single UI component.
 */
export function buildComponentTaskPayload(
  spec: ComponentTaskSpec,
  projectPath: string,
  parentTaskId?: string,
): TaskCreationPayload {
  const lines = [
    `## 実装対象`,
    `ファイル: \`${spec.filePath}\``,
    ``,
    `## 説明`,
    spec.description,
    ``,
  ];

  if (spec.props) {
    lines.push(`## Props インターフェース`, `\`\`\`typescript`, spec.props, `\`\`\``, ``);
  }

  if (spec.requirements && spec.requirements.length > 0) {
    lines.push(`## 受け入れ条件`);
    for (const req of spec.requirements) {
      lines.push(`- ${req}`);
    }
    lines.push(``);
  }

  lines.push(
    `## 完了条件（必ず確認すること）`,
    `1. \`${spec.filePath}\` が実際に作成されていること`,
    `2. \`npm run build\` がエラーなし（TypeScript エラー0件）`,
    `3. コンポーネントが正しく export されていること`,
    ``,
    `## ⚠️ 実装方法`,
    `claude CLI: bash で直接ファイルを作成し git add && git commit すること。`,
    `copilot/api: *** Start Patch / *** End Patch 形式でファイルを出力すること。`,
  );

  return {
    title: `[コンポーネント] ${spec.filePath.split("/").pop()} - ${spec.description.slice(0, 40)}`,
    description: lines.join("\n"),
    department_id: "dev",
    task_type: "development",
    project_path: projectPath,
    ...(parentTaskId ? { source_task_id: parentTaskId } : {}),
    priority: 10,
  };
}

/**
 * Build a [ドキュメント] task payload for a completed component.
 * Auto-generated after component task succeeds.
 */
export function buildDocumentTaskPayload(
  filePath: string,
  projectPath: string,
  parentTaskId: string,
): TaskCreationPayload {
  const fileName = filePath.split("/").pop() ?? filePath;
  const docPath = `docs/components/${fileName.replace(/\.tsx?$/, ".md")}`;

  return {
    title: `[ドキュメント] ${fileName} - 関数レベル仕様書`,
    description: [
      `## 目的`,
      `\`${filePath}\` の実装をもとに、関数レベルの仕様書を作成する。`,
      ``,
      `## 出力ファイル`,
      `\`${docPath}\``,
      ``,
      `## 記載内容（必須）`,
      `1. **コンポーネント概要** — 1〜3行の説明`,
      `2. **Props インターフェース** — TypeScript 型定義をそのまま記載`,
      `3. **各関数の仕様** — 以下の JSDoc 形式で全関数を記述:`,
      `   - \`@param\` 引数名・型・説明`,
      `   - \`@returns\` 戻り値・型`,
      `   - \`@sideEffect\` 副作用（API呼び出し・状態更新等）`,
      `4. **使用例** — 実際のJSX/TSコードスニペット`,
      `5. **依存関係** — import している API・hooks・型の一覧`,
      ``,
      `## 完了条件`,
      `- \`${docPath}\` が作成されていること`,
      `- 全 export 関数/コンポーネントがドキュメント化されていること`,
    ].join("\n"),
    department_id: "dev",
    task_type: "general",
    project_path: projectPath,
    source_task_id: parentTaskId,
    priority: 5,
  };
}

/**
 * Build a [デバッグ] task payload when component check fails.
 * Auto-generated when tsc/build errors are detected.
 */
export function buildDebugTaskPayload(
  filePath: string,
  projectPath: string,
  errorOutput: string,
  parentTaskId: string,
): TaskCreationPayload {
  const fileName = filePath.split("/").pop() ?? filePath;

  return {
    title: `[デバッグ] ${fileName} - ビルドエラー修正`,
    description: [
      `## 問題`,
      `\`${filePath}\` のビルド/TypeScript チェックでエラーが検出されました。`,
      ``,
      `## エラー内容`,
      `\`\`\``,
      errorOutput.slice(0, 2000),
      `\`\`\``,
      ``,
      `## 対象ファイル`,
      `\`${filePath}\``,
      ``,
      `## 完了条件`,
      `- \`tsc --noEmit\` でエラー0件`,
      `- \`npm run build\` が成功すること`,
      ``,
      `## ⚠️ 注意`,
      `型エラーを \`any\` で回避するのは禁止。正しい型定義で修正すること。`,
    ].join("\n"),
    department_id: "qa",
    task_type: "development",
    project_path: projectPath,
    source_task_id: parentTaskId,
    priority: 20,
  };
}
