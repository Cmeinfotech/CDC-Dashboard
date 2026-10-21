# cPanel deployment

## Before you start

**Security gate:** complete [SECURITY_REVIEW.md](SECURITY_REVIEW.md) before deploying. Old ZIP archives predate the security changes and must not be used. Rebuild/package the patched source, configure organization MFA access, protected keys, encrypted storage and approved retention, and verify deployment controls. Missing security configuration blocks data access.

- Your cPanel plan needs **Setup Node.js App** and Node.js 22.13 or newer.
- Create a MySQL database and database user in cPanel, then assign the user **All Privileges** for that database.

## Deploy

1. In cPanel **phpMyAdmin**, select the new database, choose **Import**, and import `database/cdc_mysql.sql`.
2. Upload the latest `cdc-dashboard-cpanel-asin-export-fields-fix-2026-08-25.zip` in **File Manager** and extract it outside `public_html` (for example, `/home/USERNAME/cdc-dashboard`).
3. In **Setup Node.js App**, create an application using Node.js 22, choose that extracted application root, and set the startup file to `server.js`. This ZIP already includes the production runtime, so no NPM install or build is needed.
4. In the application environment variables, add `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_CONNECTION_LIMIT=10`, and `DEFAULT_USER_ID=dashboard` using the values created in cPanel.
5. Click **Restart** in Setup Node.js App and open the assigned application URL. No additional build command is needed for this ZIP.

## Data separation

CDC and Nana Jewellers stay separate automatically. The selected account is part of every stored record key, so uploads, reports, filters, ASIN tracking, and attribute changes do not mix.
