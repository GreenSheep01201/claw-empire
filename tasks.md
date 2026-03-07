# Tasks

## Upcoming

- [ ] 本番環境サーバー構築 (`deploy/` ディレクトリ整備)
  - [ ] `deploy/claw-empire.service` — systemd ユニットファイル
  - [ ] `deploy/.env.production.template` — 本番用環境変数テンプレート
  - [ ] `deploy/nginx/claw-empire.conf` — nginx リバースプロキシ設定
  - [ ] `deploy/README.md` — デプロイ手順書
- [ ] スタッフ整理スクリプト (`scripts/cleanup-staff.mjs`)
- [ ] i18n: 残存 Korean 文字列の確認・翻訳
- [ ] LocalServerPanel: バリデーション強化・ログリアルタイム更新
- [ ] AppListPanel: プロジェクト × サーバー関連付け UI 補完

---

## 2026-03-07 (完了)

- [x] i18n: 残存 Korean 文字列 → 日本語翻訳 (第1弾)
  - `i18n: translate standalone Korean strings to Japanese`
- [x] i18n: 残存 Korean 文字列 → 日本語翻訳 (第2弾・完全対応)
  - `i18n: translate remaining standalone Korean strings to Japanese`
- [x] スタッフ `break` ステータス → `idle` リセット (5名)
- [x] 本番環境デプロイセット (`deploy/`) 作成

---

## 2026-03-03 (完了)

- [x] 現在 Discord チャンネル自動取得未対応の原因分析
- [x] サーバー: Discord トークンベースのチャンネル一覧取得関数追加
- [x] サーバー: `/api/messenger/discord/channels` ルート追加
- [x] フロント: Discord チャンネル取得 API 関数追加
- [x] フロント: 設定モーダルでトークン入力時に自動取得・対象 ID オートコンプリート連動
- [x] サーバー: Discord 受信機（ポーリング）追加 & ライフサイクル連結
- [x] サーバー: `/api/messenger/receiver/discord` 状態ルート追加
- [x] フロント: 受信状態に Discord 受信機ステータス表示
- [x] テストコード追加（Discord チャンネル取得 / 受信機）
- [x] 静的検証 (`tsc -b`) 通過
- [x] ドキュメント: `docs/releases/v2.0.1.md` リリースノート新規作成
- [x] ドキュメント: `docs/releases/README.md` に `v2.0.1` インデックス追加
- [x] ドキュメント: `README.md`, `README_ko.md`, `README_jp.md`, `README_zh.md` 最新リリースセクション `v2.0.1` 同期
- [x] ドキュメント: OpenAPI 反映 (`docs/openapi.json`, `docs/api.md`) — Discord 受信機 / チャンネル取得エンドポイント追加
