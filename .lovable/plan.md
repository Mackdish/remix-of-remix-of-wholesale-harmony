## Inventory & Sales Management System — Build Plan

This is a large multi-module ERP. I'll build it in phases so you get a working system quickly and we layer complexity on top. Phase 1 gets you a usable core (auth, products, stock, sales, dashboard). Later phases add finance, reporting depth, and advanced features.

### Tech foundation
- Lovable Cloud (Postgres + Auth + Storage) for database, users, files, backups
- TanStack Start (already scaffolded) for UI and server functions
- Role-based access via a `user_roles` table + `has_role()` security-definer function (Admin, Manager, Cashier, StoreKeeper, Accountant)
- All secrets server-side; RLS on every table

### Phase 1 — Core operations (this build)
1. **Design system** — professional dashboard aesthetic (deep navy + accent, clean typography, data-dense tables, cards, charts). Defined in `src/styles.css` as semantic tokens.
2. **Auth & roles** — email/password login, `/auth` page, `_authenticated` gate, `user_roles` table, `app_role` enum, `has_role()` function, audit log table with triggers.
3. **Schema** — `categories`, `products` (with barcode, prices, stock levels, image), `suppliers`, `customers`, `stock_movements`, `purchases` + `purchase_items`, `sales` + `sale_items`, `payments`, `expenses`, `returns`, `audit_log`, `settings`. Full RLS + GRANTs.
4. **Dashboard** — today/week/month sales, profit, stock value, low-stock count, out-of-stock count, receivables, payables, recent transactions, sales trend chart, top products chart.
5. **Products & Categories** — CRUD, image upload, search by name/code/barcode, low-stock badges, activate/deactivate.
6. **Suppliers & Customers** — CRUD, balances, categories (wholesale/retail/cash/VIP), credit limits.
7. **Purchases** — record purchase → auto-increment stock + supplier balance.
8. **Sales / POS** — cashier screen: search/scan product, cart, discount, payment method (cash/M-Pesa/bank/cheque/mixed), auto stock decrement, customer balance update on credit sales, receipt view (print-ready, with QR code).
9. **Stock module** — live quantities, movements ledger, adjustments (damaged/expired/count), low-stock alerts.
10. **Basic reports** — sales by day/product/customer, stock valuation, profit report (revenue − COGS), all exportable to CSV.
11. **Settings** — business name, logo, address, tax, currency, receipt footer.
12. **Audit trail** — every write logged with user, action, table, before/after.

### Phase 2 (next iterations, after Phase 1 is approved)
- Expense module + P&L, cash flow, VAT reports
- Returns (customer + supplier) with refund workflows
- Purchase orders, supplier payment schedules
- Stock-taking sessions with variance approval
- Advanced reports (fast/slow/dead stock, salesperson profit, quarterly/yearly)
- Barcode label printing
- Notifications center (in-app + optional email)
- 2FA, session timeout, password policy
- Automated backups (Cloud already handles Postgres backups; add export tool)
- Multi-branch, loyalty, M-Pesa integration, forecasting

### Technical notes
- Enable Lovable Cloud first (adds Postgres, Auth, Storage, secrets).
- All money stored as `numeric(14,2)`; quantities as `numeric(14,3)`.
- Stock movements are the source of truth; `products.stock_qty` is a cached aggregate updated by DB trigger on movement insert.
- Sales use a transaction: insert sale → insert items → insert stock_movements → update customer balance → insert payment. Wrapped in a Postgres function called from a `createServerFn` under `requireSupabaseAuth` with role check.
- Product images in Storage bucket `product-images`; receipts rendered client-side and printable via browser print CSS.
- Charts via `recharts` (already common) — will `bun add` if not present.
- Reports export via client-side CSV generation; PDF for receipts via print CSS (Phase 1) — full PDF/Excel export in Phase 2.

### What I need from you before starting
1. Confirm you want **Phase 1 scope** as above (I'll build it end-to-end in this turn; it will be substantial but functional).
2. **Currency + tax**: default currency (e.g. KES) and default VAT rate (e.g. 16%)? I can default to KES / 16% and let you change in Settings.
3. **Business name** for the initial Settings row (you can change it anytime).
4. **First admin account**: I'll create the schema so the first user to sign up auto-becomes Admin. OK? (Alternative: you tell me an email and I seed it.)

Reply with the four answers (or "go with defaults, business name = X, admin = first signup") and I'll build Phase 1.
