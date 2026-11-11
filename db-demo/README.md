# Kebbi Care 4.0 管理アプリ

公開URL: https://c7313y-rgb.github.io/kebbi-care/db-demo/

新しい画面、管理統計、8場面のKebbi音声、PDFプレビュー・印刷を公開しています。公開ページは架空データをメモリ上に表示するデモです。実マスタ・管理キー・施設記録は含めず、公開デモで実データの取込や保存は行いません。

施設の共有記録を扱う本番アプリは、generousadmin@gmail.com のGoogle Apps Scriptへ設置します。公開ページの「本番へ」から発行済みURLを登録できます。Gmail・Driveの実接続には、所有者のGoogle認証が必要です。

- [環境設定ガイド](setup.html)
- [図解操作マニュアル](docs/manual.html)
- [PDFマニュアル](docs/Kebbi_Generous_操作マニュアル.pdf)
- [本番設置仕様](production/README.md)
- [本番設置用ZIP](production/Kebbi_Care_4_設置用.zip)
- [開発者向けソースZIP](production/Kebbi_Care_4_開発者ソース.zip)

## 機能

CSVアップロード・マスタID照合・8区分の日本語表示・期間/利用者/施設での絞込・再生履歴・健康チェック・受取時間中央値・未受取経過日数・健康チェック実施記録率・PDF/CSV出力。本番ではKebbi API、Gmail添付、Drive直接取込を同じ非公開DBに反映します。更新前と毎日のバックアップを保持します。

Kebbi音声はMP3で配信します。Windows Edge/Chrome、iPhone/iPad Safari、Android Chromeを対象とし、クリック・タップで開始します。Mac専用ソフトは不要です。元音声見本から生成した再現音声で、端末読み上げ音声は使いません。

## 開発

`db-demo/source/` が共有画面の原本です。`node tools/build-care-pages.mjs` で公開デモを作り、`node tools/build-production.mjs` でGoogle設置用8ファイルを生成します。旧API用 `gas-code.js` / `mail-import.js` は互換性のため維持し、新しい共有処理を本番ビルドで組み込みます。

管理キーはGitHubに含めません。本番設置時にGoogle側で発行し、管理者が非公開で保管します。デモページに管理キーは不要です。

検証: 共通処理36テスト、Chromium/WebKitの外部MP3・埋込MP3計64回の音声再生。Google本番認証とWindows/iOS/Android実機の受入確認は設置後に実施します。テスト用Firefoxは起動不具合により未検証です。

職員向けアプリ（リポジトリ直下）は今回の更新対象に含めません。
