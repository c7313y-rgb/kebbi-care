# Kebbi Care DB v3.2 デモ

公開URL：https://c7313y-rgb.github.io/kebbi-care/db-demo/

- `kebbi.html`：Kebbi操作デモ（申し送りをする・受ける・健康チェック・連絡・確定待ち。通信ログ表示）
- `admin.html`：管理画面デモ（本番の Index.html と同じ画面。管理キー demo-admin／閲覧キー demo-viewer）
- `gas-code.js`：本番の Apps Script コードをそのまま連結したもの。`runtime.js` がブラウザ内でGoogleの代わりをする
- データは架空で、ブラウザの localStorage だけに保存される。実在の利用者・職員の情報は入力しない

本番の設置・仕様は「Kebbi_Care_DB_v3_開発者用.zip」の開発者向け仕様書を参照。このフォルダは、同じリポジトリの職員向けアプリ（ルートの index.html 等）とは独立しています。
