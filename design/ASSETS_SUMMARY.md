デザイン資産まとめ（短縮版）

目的
- 「チャットを追加」機能のデザイン資産を一箇所にまとめ、レビュー／実装チームが参照しやすい形に整備する。
-- フォント候補（3案）＋推奨フォールバックスタック
-- カラーパレット＋WCAGコントラスト検証結果
-- CSS トークン定義（:root / ダークテーマ）
-- アイコンセット（SVG 原本 + 使用ルール）
-- モック（主要3画面：ライト／ダーク／コンパクト）＋差分アノテーション／アクセシビリティ注記
-- エクスポート済みアセット一覧（形式・解像度・命名規則）

ファイル一覧（本リポジトリ内）
- design/fonts.md
- design/colors_and_tokens.css
- design/wcag_report.md
- design/icons/README.md
- design/icons/idea.svg
- design/icons/create_task.svg
- design/icons/chat.svg
- design/mocks/chat_light.svg
- design/mocks/chat_dark.svg
- design/mocks/chat_compact.svg
- design/ASSET_EXPORT_LIST.md

次のアクション（実装チーム向け）
- fonts.md のフォントファイルを fonts/ に配布する（ライセンスに従って）。
- colors_and_tokens.css を実装リポジトリのデザイントークンに統合する。
- icons/*.svg をそのままアイコンソースとして利用。PNGが必要な場合は ASSET_EXPORT_LIST.md の指定に従いエクスポート。
- モックはクリック可能プロトタイプ用の素材ではなく、実装時のレイアウト／マージン／アクセシビリティ要件の参照用。

注意
- WCAG の数値は design/wcag_report.md にある計算を基にしています。最終的な実装ではブラウザ環境やフォントレンダリング差分により見え方が変わるため、QA で再検証してください。

