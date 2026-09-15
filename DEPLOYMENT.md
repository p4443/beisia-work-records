# 自在稼働記録 販売基盤の設定

自在稼働記録の認証・ライセンス・会社ユーザー管理は、点呼確認簿とは独立したSupabaseプロジェクトで運用します。

## 1. Supabaseプロジェクト

1. 新しいSupabaseプロジェクトを作成します。
2. `supabase/migrations/202609150001_initial_schema.sql` をSQL Editorで実行します。
3. Authenticationのメール認証を有効にします。
4. Site URLを自在稼働記録の公開URLに設定します。
5. Redirect URLsへ `<公開URL>/account.html` を追加します。
6. Project URLとanon public keyを `cloud-config.js` に設定します。

`service_role` keyはブラウザーへ配置しないでください。

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

## 3. Stripe Webhook

Stripe Workbenchで次のWebhook送信先を追加します。

`https://<project-ref>.supabase.co/functions/v1/stripe-webhook`

イベントは `checkout.session.completed` を選択します。発行された署名シークレットを `STRIPE_WEBHOOK_SECRET` に設定します。

## 4. 販売商品

- 個人版: 400円（税込・買い切り）
  - Payment Link: `https://buy.stripe.com/bJe3cv48Hcbu1rd4dT4gg03`
- 会社版: 8,000円（税込・買い切り）
  - 管理者1名を含む合計20名まで
  - Payment Link: `https://buy.stripe.com/9B6aEXdJh6Ragm77q54gg04`

## 5. 点呼確認簿との境界

点呼確認簿の販売商品、価格、ライセンス判定は変更しません。自在稼働記録からは、利用者が任意に接続した場合だけ案件名と稼働記録を同期します。自在稼働記録の購入情報、会社ユーザー、便設定は点呼確認簿へ送信しません。
