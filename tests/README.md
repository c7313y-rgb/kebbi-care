# Gmail CSV取込の検証

`node tools/build-production.mjs` の後、`node --test tests/mail.test.mjs` を実行。

対象：CSVパース、旧3形式、正規形式と出力再取込、引用符と改行、日付、施設・人物IDと権限、列対応、ファイル全体の検証、再送、訂正の保護、障害後の再試行、Gmailアカウント不一致、送信元制限、自己宛メール、MIME階層、attachmentId、ページ送り、定期実行・起動時実行、手動CSVプレビューと取込、メールと手動の重複排除、Kebbi APIの確定済み記録の保護。

ブラウザ確認は `tests/browser.mjs`。PlaywrightとChromeが必要。ローカルHTTPサーバーだけを使用し、実メールの読取りや送信を行わない。本番画面は模擬Gmailサービスで検証する。

実際の generousadmin@gmail.com による認証、Googleへのデプロイ、実Kebbiメール受信試験は、設置後に操作マニュアル11頁の確認項目で実施する。
