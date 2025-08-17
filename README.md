# モンスター討伐クリッカー（分割版）

このZIPはキャンバスから脱出した**編集しやすい構成**です。

## 使い方
- `index.html` をブラウザで開くだけで動きます。
- またはローカルサーバを使うと快適です：
  ```bash
  # Python
  python -m http.server 8080
  # あるいは VSCode Live Server 拡張
  ```

## 開発の進め方（拡張しやすい）
- 機能を追加したい時は `main.js` を編集します。
- 規模が大きくなったら `src/` ディレクトリを作って ES Modules に分割し、`index.html` から `<script type="module">` で読み込む方式に移行してください。
- 将来 Vite などに移行する場合は、このファイル群を `src/` に入れて `npm create vite@latest` で生成したテンプレートに組み込めます（`npm run dev` でホットリロード）。

## 既知の不具合修正
- `alert()` に生改行が混入すると **SyntaxError** になる問題を修正（`\n\n` に置換）。
- イベントハンドラの二重登録＆閉じ括弧ミスを排除。

## セーブデータ互換
- LocalStorageキー: `monster_clicker_v2_multi_units_ja`
- 旧版のキーからの移行ロジックも残しています（あれば読み込み）。

## ライセンス
- あなたのプロジェクトとしてご自由にどうぞ。
