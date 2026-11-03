# 自在稼働記録 販売基盤の設定

自在稼働記録の認証・ライセンス・会社ユーザー管理は、点呼確認簿とは独立したSupabaseプロジェクトで運用します。

## 1. Supabaseプロジェクト

1. 新しいSupabaseプロジェクトを作成します。
2. `supabase/migrations/202609150001_initial_schema.sql` をSQL Editorで実行します。
3. Authenticationのメール認証を有効にします。
4. Authentication > Emails > SMTP Settingsで独自SMTPを有効にします。Supabaseの標準メール送信は開発用途に制限されるため、本番環境では必須です。
5. Authentication > Rate Limitsでメール送信間隔と上限を確認します。
6. Site URLを自在稼働記録の公開URLに設定します。
7. Redirect URLsへ `<公開URL>/account.html` を追加します。
8. Project URLとanon public keyを `cloud-config.js` に設定します。

`service_role` keyはブラウザーへ配置しないでください。
SMTPのパスワードやAPIキーもリポジトリへ保存せず、Supabase Dashboard上だけで設定してください。

## 2. Edge Functions

次のFunctionsをデプロイします。

- `stripe-webhook`: Stripe決済完了から購入者ライセンスを有効化
- `invite-company-user`: 会社管理者による利用者招待。管理者を含む20名上限

Functionsへ次のSecretsを設定します。

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PERSONAL_PAYMENT_LINK_ID=plink_1UFjAeHQJJ8q7UxW9GZ1l5Qs`
- `STRIPE_COMPANY_PAYMENT_LINK_ID=plink_1UFjAuHQJJ8q7UxWGkWSVqUW`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_URL`（自在稼働記録の公開URL）
- `APP_ORIGIN`（自在稼働記録のオリジン）

ローカル開発用の変数名は `supabase/functions/.env.example` に記載しています。値を入れた `.env` や秘密鍵ファイルは `.gitignore` の対象です。秘密値をチャット、Issue、コミット、スクリーンショットへ貼り付けないでください。

## 3. Stripe Webhook

Stripe Workbenchで次のWebhook送信先を追加します。

`https://<project-ref>.supabase.co/functions/v1/stripe-webhook`

イベントは `checkout.session.completed` を選択します。発行された署名シークレットを `STRIPE_WEBHOOK_SECRET` に設定します。

## 4. Stripeセキュリティ警告への対応

### Node.jsバージョン

このリポジトリには `package.json`、`Dockerfile`、`render.yaml`、Node.jsバージョンファイル、GitHub Actionsはありません。サーバー処理はSupabase Edge FunctionsのDenoランタイムで実行されるため、このリポジトリにNode.js 22.23.4を追加しても本番ランタイムは更新されません。`npm:`形式のimportもDeno上で実行されます。

別のサーバーやデプロイ先でも同じStripeキーを使用している場合は、Stripeが指定した修正版（22.23.4、24.22.1、26.12.1のいずれか）へ、その環境の実際の設定を更新します。

- `package.json`: `engines.node`を完全な修正版（例: `22.23.4`）にする
- `.nvmrc` / `.node-version`: `22.23.4`にする
- `Dockerfile`: `FROM node:22.23.4-...`のように修正版を固定し、イメージをキャッシュなしで再ビルドする
- `render.yaml`: `NODE_VERSION`を`22.23.4`にする
- ホスティング管理画面: リポジトリ外のRuntime/Environment設定も同じ版へ変更する

変更後は再デプロイし、実行環境で`node --version`が指定版以上であることを確認します。メジャー番号だけの指定や、手元のNode.jsだけの更新では不十分です。

### 環境のクリーンアップ

新しいキーは、次の作業が完了するまで発行しません。

1. 影響を受けた可能性があるNode.jsサーバーを停止または外部通信から隔離し、ディスクやコンテナを使い回さず、修正版のベースイメージまたはクリーンなホストから再構築します。
2. 依存関係をロックファイルから再インストールし、デプロイキャッシュ、ビルド成果物、コンテナキャッシュ、一時ファイルを破棄します。未知の起動項目、cron、追加ユーザー、SSHキー、プロセス、外向き通信がないか確認します。
3. 管理に使用した端末もOS・ブラウザー・パッケージを更新し、マルウェアスキャンを実施します。侵害が疑われる端末では新しいキーを生成・表示しません。
4. Supabase DashboardのEdge Functionsを再デプロイし、不要なFunction Secretsを削除します。マネージドDeno環境なので、SupabaseホストのOSを利用者が手動で清掃する必要はありません。
5. Stripe WorkbenchのAPIリクエスト、Events、Webhook配信履歴と、SupabaseのEdge Function Logs・Auth Audit Logsを保存して確認します。警告対象期間の前からローテーション完了後までを対象にします。
6. 未知のIP/User-AgentからのStripe API呼び出し、キー・Webhook・チームメンバーの変更、想定外の返金・顧客・Payment Link操作、Webhook署名エラー、Supabaseの不審な管理操作や認証試行を調べます。
7. 侵害の兆候がある場合はStripeとSupabaseのサポートへ連絡し、同じ環境に置かれていた`SUPABASE_SERVICE_ROLE_KEY`、SMTP認証情報、デプロイトークン等もすべてローテーションします。

ログは調査が終わるまで削除しません。クリーンアップとはログ消去ではなく、侵害された可能性がある実行環境を信頼済みのイメージから再構築することです。

### Stripeキーと環境変数の差し替え

1. Stripe Dashboardで、現在のシークレットキーが使用されているサーバーと権限を確認します。可能なら用途をStripe Webhook処理に限定したRestricted keyを使用します。
2. クリーンな管理端末から新しいキーを作成します。旧キーは、この時点ではまだ失効させません。
3. Supabase Dashboardの対象プロジェクトで **Edge Functions > Secrets** を開き、`STRIPE_SECRET_KEY`を新しい値へ置き換えます。値をリポジトリ内のファイルへ保存しません。
4. Stripe WorkbenchでWebhook endpointの署名シークレットをローテーションし、失効猶予が選べる場合は猶予期間を設定します。新しい`whsec_...`をSupabaseの`STRIPE_WEBHOOK_SECRET`へ設定します。APIキーとWebhook署名シークレットは別の認証情報です。
5. `stripe-webhook`を再デプロイし、Stripeのテスト送信で`checkout.session.completed`がHTTP 2xxになり、Supabaseログに署名エラーがないことを確認します。必要なら少額の実決済と返金でも購入者ライセンスの有効化を確認します。
6. 新しいキーで正常動作を確認した直後に旧Stripeシークレットキーを失効させ、Webhook署名シークレットの猶予期間終了後に旧シークレットを失効させます。
7. Supabase Secrets一覧、CI/CD、ホスティング管理画面、ローカルの`.env`を確認し、旧値をすべて削除します。シェル履歴、ログ、バックアップに秘密値が残った場合は、その保管先も侵害扱いにします。
8. StripeのAPIログを再確認し、旧キー失効後の拒否リクエストや新キーの想定外利用がないことを監視します。実施日時、担当者、対象キーの名前または末尾4文字だけを記録し、値自体は記録しません。

Supabase CLIを使う場合も、コマンドライン引数へ秘密値を直接書くとシェル履歴やプロセス一覧へ残る可能性があります。権限を所有者のみに制限したリポジトリ外の一時envファイルを`supabase secrets set --env-file <path> --project-ref <project-ref>`へ渡し、反映確認後に安全に削除してください。通常はDashboardでの差し替えを推奨します。

ローカル開発では`supabase/functions/.env.example`を`supabase/functions/.env.local`へコピーして値を設定し、`supabase functions serve --env-file supabase/functions/.env.local`で読み込みます。`.env.local`はコミットしません。

## 5. 販売商品

- 個人版: 400円（税込・買い切り）
  - Payment Link: `https://buy.stripe.com/bJe3cv48Hcbu1rd4dT4gg03`
- 会社版: 8,000円（税込・買い切り）
  - 管理者1名を含む合計20名まで
  - Payment Link: `https://buy.stripe.com/9B6aEXdJh6Ragm77q54gg04`

## 6. 点呼確認簿との境界

点呼確認簿の販売商品、価格、ライセンス判定は変更しません。自在稼働記録からは、利用者が任意に接続した場合だけ案件名と稼働記録を同期します。自在稼働記録の購入情報、会社ユーザー、便設定は点呼確認簿へ送信しません。
