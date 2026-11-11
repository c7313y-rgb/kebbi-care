# Kebbi Care DB v3.3 Gmail連携版と公開デモ

公開URL：https://c7313y-rgb.github.io/kebbi-care/db-demo/

- `kebbi.html`：Kebbi操作デモ（申し送りをする・受ける・健康チェック・連絡・確定待ち。通信ログ表示）
- `admin.html`：管理画面デモ（管理キー demo-admin／閲覧キー demo-viewer）。メール取込の架空CSV体験を追加
- `gas-code.js`：本番の Apps Script コードをそのまま連結したもの。`runtime.js` がブラウザ内でGoogleの代わりをする
- データは架空で、ブラウザの localStorage だけに保存される。実在の利用者・職員の情報は入力しない

## ジェネラスで使い始める

- [環境設定ガイド](https://c7313y-rgb.github.io/kebbi-care/db-demo/setup.html)
- [図解操作マニュアル](https://c7313y-rgb.github.io/kebbi-care/db-demo/docs/manual.html)
- [PDFマニュアル](https://c7313y-rgb.github.io/kebbi-care/db-demo/docs/Kebbi_Generous_操作マニュアル.pdf)
- [本番ソースと設置仕様](production/README.md)

Gmailの受信先は `generousadmin@gmail.com`。送信元メールアドレスは、本番管理画面の「メール取込」で後から登録できます。約5分ごとの自動取込、管理者ログイン時の確認、手動確認に対応します。GitHub Pagesは入口と架空デモを提供し、実メール・実データはGoogle側で扱います。

初回は受信アカウントの所有者によるApps Script設置・Google認証が必要です。GitHubへの公開だけで受信箱の権限が与えられることはありません。初期の公開範囲は所有者のみです。

対応：既存Kebbiひな形の申し送り・健康チェック・看護師申し送り、v3記録出力CSV、英字列形式。UTF-8／Shift_JIS、1ファイル1MB・500行まで。登録は常に確定待ち。送信元・施設・人物ID・列形式を検査し、添付と記録の両方で重複を防止します。既存記録をメールで自動上書きしません。

`mail-import.js` がサーバー取込処理、`mail-ui.js` が画面。`node tools/build-production.mjs` で `production/` を生成します。`node --test tests/mail.test.mjs` でGoogleサービスの模擬テストを実行できます。

このフォルダは、同じリポジトリの職員向けアプリ（ルートの index.html 等）とは独立しています。

