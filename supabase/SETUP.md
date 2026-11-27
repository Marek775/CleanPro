# Drop Admin — staging setup
The migrations are source code only and have not been executed.
1. Create a dedicated staging Supabase project. Apply migrations in numeric order using the SQL editor or CLI.
2. Disable public signups and provision a test administrator in Supabase Auth. Enable MFA before production.
3. Using a trusted SQL operator, insert the verified Auth UUID into drop_private.admins. Never grant membership from browser code.
4. Configure the future admin frontend with the project URL and publishable key only. Never commit service-role keys, database passwords or customer data.
5. Test anonymous access denial, authenticated non-admin denial, admin reads, forbidden direct writes, valid and invalid fulfillment transitions and audit records.
6. Implement server-side checkout with canonical prices, transactionally created order items, idempotency, rate limits and verified payment webhooks. Do not accept client totals or client payment status.
7. Add customer and delivery data with retention controls, backups, audit review and restricted access before accepting actual orders.
8. Add a separate cash-on-delivery policy before enabling COD. Current fulfillment transition requires paid status.
9. Keep drop-admin-demo.html isolated; it must never read production data.
Production launch requires successful staging tests, authenticated admin UI, supplier/product verification, seller information, payment integration and legal review.
