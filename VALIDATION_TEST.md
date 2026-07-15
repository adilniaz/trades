# Trades Purification Tracker — Validation Test Checklist

Test all features end-to-end. Run in order — later sections depend on earlier state.

**App URL:** http://localhost:3000
**Admin login:** use `ADMIN_EMAIL` / `ADMIN_PASSWORD` from your local `.env` (never committed)
**Start fresh:** clear browser cookies before each test session to avoid stale sessions.

---

## 1. Authentication

### 1.1 Login
- [ ] Visit `/login` — form renders with email + password fields
- [ ] Submit with wrong password → error message shown, no redirect
- [ ] Submit with correct admin credentials → redirected to `/overview`
- [ ] Visiting `/overview` while logged out → redirected to `/login`
- [ ] Login error message always says "Invalid email or password" (no user enumeration)

### 1.2 No Public Signup
- [ ] No `/register` route exists (should 404)
- [ ] No signup link visible anywhere in the app

### 1.3 Session persistence
- [ ] Log in as admin → close tab → reopen `/overview` → still logged in (session persists)
- [ ] Sign out via sidebar → redirected to `/login` → visiting `/overview` requires login again

### 1.4 Account lockout
- [ ] Attempt login with wrong password 5+ times for the same email → account locked
- [ ] Correct password during lockout → "Invalid email or password" (no lockout disclosure)
- [ ] After 15 minutes → correct password succeeds

---

## 2. Dashboard — Holdings Overview

### 2.1 Holdings table
- [ ] `/overview` loads showing holdings table
- [ ] Table columns: Company, Ticker, Shares, Avg Cost, Current Value, Unrealized P/L, Purifiable %, Purifiable Gains
- [ ] If no transactions exist → empty state shown

### 2.2 Summary cards
- [ ] Total portfolio value card visible
- [ ] Total unrealized gain/loss card visible
- [ ] Total purifiable amount card visible

### 2.3 Navigation
- [ ] Clicking a company row → navigates to `/companies/[id]`
- [ ] Sidebar links present: Overview, Import Transactions, Request Company, Settings

---

## 3. Company Transactions

*Prerequisite: have at least one approved company from admin (see §3.5).*

### 3.1 View company
- [ ] `/companies/[id]` shows company name, ticker, non-compliant %
- [ ] Transaction table lists all transactions for that company
- [ ] Columns: Date, Type, Shares, Price/Share, Amount, Purified

### 3.2 Add BUY transaction
- [ ] "Add Transaction" button opens form
- [ ] Select type "BUY" → shares + price fields appear
- [ ] Fill date, shares, price per share → submit
- [ ] Transaction appears in table
- [ ] Position and average cost update after buy

### 3.3 Add SELL transaction
- [ ] Select type "SELL" → shares + price fields appear
- [ ] Sell fewer shares than held → transaction saved, position decreases
- [ ] Try selling more shares than held → validation error

### 3.4 Add DIVIDEND transaction
- [ ] Select type "DIVIDEND" → amount field appears (no shares/price)
- [ ] Fill date, amount → submit → dividend appears in table

### 3.5 Edit transaction
- [ ] Click edit on a transaction row → form pre-fills
- [ ] Change quantity or price → save → values update, position recalculates

### 3.6 Delete transaction
- [ ] Click delete on a transaction → confirmation dialog
- [ ] Confirm → transaction soft-deleted (flagged `deletedAt`, not removed from DB)
- [ ] Re-adding the same type/quantity restores expected state

### 3.7 Purification display
- [ ] Purifiable gains shown for unpurified held shares
- [ ] Purifiable dividends shown for unpurified dividends
- [ ] "Breakeven" price displayed

---

## 4. Purification

### 4.1 Mark as purified
- [ ] "Mark as Purified" button visible on the company page
- [ ] Click → purification confirmed
- [ ] Purified transactions show "Purified" badge/indicator
- [ ] Purifiable gains/dividends reset to zero after purification

### 4.2 Calculation correctness
- [ ] BUY 100 shares @ $10 → position 100, avg cost $10
- [ ] BUY 50 shares @ $12 → position 150, avg cost ~$10.67
- [ ] SELL 30 shares → realized P/L calculated correctly (running-average method)
- [ ] Purifiable gains = remaining unrealized gains × nonCompliantPct (for unpurified sells only)
- [ ] Verify against the worked example in `_docs/averaging_down.md` if making formula changes

---

## 5. Import Transactions (CSV)

### 5.1 Form
- [ ] `/import-transactions` shows file upload form
- [ ] Company dropdown lists all approved companies
- [ ] "Download Template" link available

### 5.2 Valid import
- [ ] Upload valid CSV (date, type, shares, price/amount) → success message with count
- [ ] Imported transactions appear in the company's transaction table
- [ ] Holdings recalculated after import

### 5.3 Validation errors
- [ ] Upload CSV with invalid date → error shown, no rows imported
- [ ] Upload CSV with unknown type → error shown
- [ ] Upload CSV with negative values → validation error
- [ ] Upload more than 5000 rows → rejected with size error
- [ ] Upload file > 2MB → rejected with size error

### 5.4 Duplicate handling
- [ ] Import the same CSV twice → rows can be imported (no unique constraint on individual transactions, duplicates need manual cleanup)

---

## 6. Request Company (User)

### 6.1 Form
- [ ] `/request-company` shows a form with name and ticker fields
- [ ] Submit with valid data → success message

### 6.2 Admin workflow
- [ ] Login as admin → `/admin/companies` shows the request in PENDING status
- [ ] Click "Approve" → company status changes to APPROVED, appears in user dropdowns
- [ ] Click "Reject" on another request → company is hard-deleted
- [ ] Approving requires filling in `nonCompliantPct` (admin-only field)

---

## 7. Admin — Companies

*ADMIN only.*

### 7.1 Company list
- [ ] `/admin/companies` lists all companies with name, ticker, status, nonCompliantPct
- [ ] Status badges: APPROVED (green), PENDING (yellow)
- [ ] Edit and Delete buttons per row

### 7.2 Create company
- [ ] `/admin/companies/new` form renders
- [ ] Fill name, ticker, nonCompliantPct → save → company appears in list
- [ ] Ticker must be unique among active rows → duplicate ticker shows error
- [ ] nonCompliantPct must be 0–100 with max 2 decimal places

### 7.3 Edit company
- [ ] Click edit on a company → form pre-fills all fields
- [ ] Change name/ticker/nonCompliantPct → save → reflected in list
- [ ] Audit log entry created for the edit

### 7.4 Soft-delete company
- [ ] Click delete on a company → confirmation dialog
- [ ] Confirm → company `deletedAt` set, removed from active dropdowns
- [ ] Company's transactions still exist (soft-delete only on company, not cascade)
- [ ] Creating a new company with the same ticker → succeeds (unique constraint only on active rows)

### 7.5 Bulk import companies
- [ ] `/admin/companies/import` shows CSV upload form
- [ ] Upload CSV (name, ticker, nonCompliantPct) → companies created
- [ ] Company names containing commas → comma must be stripped (documented limitation)

---

## 8. Admin — Users

*ADMIN only.*

### 8.1 User list
- [ ] `/admin/users` lists all users with email, role, status (active/inactive)
- [ ] Create User, Deactivate, Reset Password buttons/actions per row

### 8.2 Create user
- [ ] `/admin/users/new` form renders
- [ ] Fill email, password (min 8 chars, upper/lower/digit/special) → user created
- [ ] Duplicate email → error shown
- [ ] Audit log entry created

### 8.3 Deactivate user
- [ ] Click "Deactivate" on a user → confirmation
- [ ] Confirm → user `active: false`, sessions invalidated (tokenVersion bump)
- [ ] Deactivated user cannot log in → "Invalid email or password"
- [ ] Cannot deactivate own account → error or button hidden

### 8.4 Reset password
- [ ] Click "Reset Password" → enter new password → saved
- [ ] New password works for login, old password doesn't
- [ ] User's existing sessions invalidated (tokenVersion bump)
- [ ] Audit log entry created

---

## 9. Admin — Settings

*ADMIN only.*

### 9.1 Transaction fee
- [ ] `/admin/settings` shows transaction fee input
- [ ] Change fee to 15 → save → reflected on page
- [ ] Breakeven calculations include the updated fee
- [ ] Audit log entry created

---

## 10. Admin — Audit Log

### 10.1 Audit log list
- [ ] `/admin/audit-log` lists all admin actions
- [ ] Columns: Timestamp, Actor, Action, Target Type, Target ID
- [ ] Expand row or click to see before/after JSON snapshots

### 10.2 Coverage
- [ ] Company create/edit/delete → logged
- [ ] User create/deactivate/reset-password → logged
- [ ] Settings change → logged

---

## 11. Admin — Reports

### 11.1 Reports page
- [ ] `/admin/reports` loads without errors
- [ ] Relevant data displayed (user activity, company stats, etc.)

---

## 12. Multi-Role (ADMIN vs USER)

### 12.1 USER permissions
- [ ] Create a USER account via admin
- [ ] Login as USER → `/overview` loads, sidebar shows user-level links
- [ ] Sidebar does NOT show admin links (Companies, Users, Settings, Audit Log, Reports)
- [ ] Visiting `/admin/companies` directly → redirected to `/overview` with forbidden error
- [ ] Visiting `/admin/users` directly → same
- [ ] Visiting `/admin/settings` directly → same

### 12.2 USER actions
- [ ] USER can: view holdings, view company transactions, add/edit/delete own transactions, import transactions, request companies, change password
- [ ] USER cannot: approve company requests, create/edit/delete companies, manage users, change settings

---

## 13. Settings (User)

### 13.1 Change password
- [ ] `/settings` shows change password form
- [ ] Current password + new password → submit → success
- [ ] Wrong current password → error shown
- [ ] New password must meet strength requirements (min 8, upper/lower/digit/special)
- [ ] Old password no longer works after change

---

## 14. Export (CSV)

### 14.1 Transaction export
- [ ] Click "Export Transactions" (or equivalent) → CSV file downloads
- [ ] CSV contains all transaction data for the user
- [ ] File name includes timestamp

### 14.2 Holdings export
- [ ] Click "Export Holdings" → CSV file downloads
- [ ] CSV contains holdings summary

### 14.3 Formula injection defense
- [ ] Verify CSV fields starting with `=`, `+`, `-`, `@` are prefixed with apostrophe in exported files

---

## 15. Responsive Design

*Test in Chrome DevTools → Toggle Device Toolbar (Cmd+Shift+M).*

**Viewports:** 375px (iPhone SE), 414px (iPhone 14), 768px (iPad), 1280px (desktop)

### 15.1 Sidebar navigation
- [ ] 375px: hamburger icon visible; sidebar hidden
- [ ] Tap hamburger → sidebar sheet slides in; tap overlay → closes
- [ ] 768px: sidebar visible beside main content
- [ ] 1280px: full sidebar visible

### 15.2 Dashboard
- [ ] 375px: holdings table scrollable horizontally (no clipping)
- [ ] Summary cards stack vertically on mobile

### 15.3 Tables (transactions, admin lists)
- [ ] All tables horizontally scrollable on mobile
- [ ] No horizontal page overflow at any viewport

### 15.4 Forms
- [ ] All form inputs full-width at 375px
- [ ] Submit buttons adequately sized (≥ 44px tap target)
- [ ] No overflow on any form page

### 15.5 Global checks
- [ ] No page has horizontal scrollbar at 375px
- [ ] All buttons/links have ≥ 44px tap target height
- [ ] Text is readable (≥ 13px) at all viewports

---

## Quick Regression Smoke Test

*Run this after every implementation session to catch regressions:*

- [ ] Login works with admin credentials
- [ ] `/overview` loads and shows holdings
- [ ] Add a BUY transaction → position updates
- [ ] Add a SELL transaction → position recalculates
- [ ] Admin pages load: `/admin/companies`, `/admin/users`, `/admin/settings`, `/admin/audit-log`
- [ ] Export downloads a valid CSV file
- [ ] `npm test` → all tests pass
