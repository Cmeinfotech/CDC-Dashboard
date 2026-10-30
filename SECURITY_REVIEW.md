# Amazon SP-API security review — 12 October 2026

Status: code hardening implemented; production authorization and operational compliance are not certified. No live Amazon requests, existing-data deletion, production deployment, or database migration were performed during this review.

## Implemented controls

- Outside loopback development mode, middleware and every API handler require a verified RS256 identity token, expected issuer/audience, an approved enabled user, MFA (`amr: ["mfa"]`), and expiry within 15 minutes of issue. Headers such as `oai-authenticated-user-id` do not grant access. Server-configured account entitlements are enforced, including CDC-only Amazon access.
- Cross-site writes and writes without a matching Origin are denied. Responses use no-store, nosniff, frame denial and referrer restrictions; production uses HSTS. Middleware emits structured access-decision logs without tokens, raw user names or query parameters. The production host must collect, protect, monitor and retain these logs; they record access decisions, not completion of the downstream action.
- Missing security configuration denies access. Production additionally requires explicit deployment verification and HTTPS origin configuration. This is an operator review gate, not proof of compliance.
- Notification dismissal is persisted in the encrypted Amazon monitor store and enforced server-side. Password-login users must have `role: "lead"` in `DASHBOARD_USERS_JSON`; omitted roles are members. Verified identity users may close notifications when their server-approved role is `lead` or they are the configured main administrator.
- Password-login user creation is restricted to the server-configured bootstrap administrator and stored in an AES-GCM encrypted file. The file is application data and must be included in protected backups; its encryption key is derived from `DASHBOARD_SESSION_SECRET`, which must remain stable to retain dashboard-created users.
- New Amazon monitor/viewer files use AES-256-GCM with random nonces, authenticated expiry and file binding. Plaintext legacy files are blocked. Buyer/contact/address/gift/payment fields are removed as additional minimization. This filter is not a complete PII classifier; full catalog attributes and order purchases still need classification against the DPP.
- Encrypted files expire after 90 days by default (configurable 1–180 days for reviewed non-PII purposes). Expired envelopes cannot be read. Daily maintenance removes authenticated expired files. The monitor also runs cleanup on sync. Database cleanup is account-scoped and transactional, and only runs after the retention plan is explicitly approved.
- Official regional SP-API endpoints only; credentials cannot be sent to arbitrary absolute resource URLs. HTTPS Amazon S3 report downloads reject redirects and untrusted hosts. Downloads/timeouts are bounded. A 429 respects Retry-After with exponential backoff and jitter. Safe GETs retry transient server errors; ambiguous POST failures do not create duplicate reports.
- A local revocation switch blocks CDC data access and new Amazon processing. Old raw pull/export scripts are disabled without a bypass flag.
- Remote production MySQL requires a trusted TLS CA; encrypted database volumes/backups must be verified before database access is enabled.

## Required setup before production

The application authenticator enrollment and local password login were removed at the owner's request. With LOCAL_DASHBOARD_ACCESS=true, the development server bound to 127.0.0.1 opens the dashboard directly. Non-loopback requests, cross-site requests and production cannot use this mode. Existing data remains in the dashboard namespace. This convenience mode is not certification of Amazon compliance; managed device controls, encryption and access restrictions still need verification.

Production retains verified identity and HTTPS gates. Existing organization or infrastructure access controls can satisfy the deployment design; no particular authenticator app is mandated by this code.

Set these through protected deployment secrets, never client bundles:

| Variable | Required value |
| --- | --- |
| `APP_ORIGIN` | Exact public HTTPS origin, without trailing slash |
| `AUTH_JWT_PUBLIC_KEY` | Gateway RSA public key PEM, at least 2048 bits |
| `AUTH_JWT_ISSUER` / `AUTH_JWT_AUDIENCE` | Exact configured gateway issuer and app audience |
| `AUTH_USERS_JSON` | Approved users: `[{"subject":"IDP-SUBJECT","userId":"unique-person-id","enabled":true,"accounts":["cdc"]}]` |
| `AMAZON_DATA_KEY` | Random 32-byte key as 64 hexadecimal characters from managed secrets/KMS |
| `AMAZON_DATA_RETENTION_DAYS` | Approved retention for non-PII files; default 90 |
| `DATA_RETENTION_APPROVED` | `true` only after classifying existing database data and reviewing the deletion schedule |
| `DB_ENCRYPTION_VERIFIED` | `true` only after verifying actual database/backup encryption |
| `DB_SSL_CA` | Trusted CA PEM for remote MySQL, with server-side certificate validation |
| `SECURITY_DEPLOYMENT_VERIFIED` | `true` only after all production controls below are verified |
| `AMAZON_ACCESS_REVOKED` | Set `true` immediately when authorization is revoked or processing is no longer permitted |

User IDs change from the old shared `dashboard` fallback to approved unique identities. An authorized owner must review existing row ownership before any scoped reassignment; this patch does not reassign old records automatically.

Existing plaintext exports in `outputs/`, `work/`, deployment ZIPs, downloaded workbooks, database snapshots and backups need inventory, classification, restricted access, encryption or approved deletion. They were preserved; blocking application reads does not encrypt or erase them. Encrypting files alone does not sanitize old disk blocks or backups. Use managed encrypted volumes and NIST 800-88 disposal procedures as applicable.

The retired browser-local import store no longer reads or writes reports. Any existing `cdc-imported-data-v3-real` browser localStorage copies must be inventoried and cleared on managed devices after the owner reviews them. No existing browser copies were automatically deleted by this patch.

Detailed order data/purchases may be PII under the current DPP. Apply the delivery-based maximum retention and permitted-purpose conditions to those records; the generic non-PII TTL is insufficient. Do not approve deployment until the detailed-order workflow, existing records and backups have been reviewed. The account-scoped database cleanup uses ingestion timestamps and is a housekeeping limit, not evidence of PII delivery-based compliance.

For Amazon-requested deletion, authorization revocation or termination: block access immediately, inventory all online copies and exports, then securely delete within the applicable 30-day deadline, address backups, and retain disposal evidence. The local switch does not automatically receive Amazon revocation events or erase databases/backups.

Verify MFA gateway behavior, unique user approval/revocation and access review, TLS 1.2+, WAF/firewall/network isolation, endpoint protection, managed credential/key rotation and recovery, private storage placement, database and backup encryption, security audit logging/alerts and retention, vulnerability scanning, required penetration testing, incident contact/runbook and reporting deadlines. Production packaging must exclude `.env`, private outputs, work files and data-store contents. Do not publish data directories as web assets.

## Verification and maintenance

Final local result: production build succeeded and all 19 regression/security tests passed. A content scan of 3,073 generated build files found no matches for the two configured long credential values checked. The full TypeScript check still fails in the existing non-security code noted below. Test/audit outputs are saved locally under `work/security-test-results.txt`, `work/security-types.txt` and `work/security-audit.json`; these files must remain private.

- `npm run test:security` tests forged and tampered identities, MFA/expiry/issuer/audience, account authorization, CSRF, encryption/tampering/expiry, retention boundaries, endpoint safety, Retry-After and safe retry behavior.
- `npm test` builds production and tests anonymous protection of dashboard, monitor and private API routes, plus authenticated rendering.
- `node scripts/amazon-security-maintenance.mjs` gives a read-only count of plaintext/expired files in the live monitor/viewer roots; it prints no contents or credentials.
- Schedule `node scripts/amazon-security-maintenance.mjs --purge-expired` daily on the protected application host. Database cleanup runs on authenticated upload/dashboard/tracking/history access after approval; inactive database accounts still require a scheduled database retention job.
- Run a network-enabled dependency audit. An offline audit returning zero is not reliable; verify vendor advisories as well.

Official policy references: [current DPP](https://sellercentral.amazon.com/solution-provider/policy?policyType=DPP&locale=en_US), [policies and agreements](https://developer-docs.amazon/sp-api/docs/policies-and-agreements), [report limits](https://developer-docs.amazon/sp-api/lang-en_us/docs/report-type-values-analytics).

## Findings still open

- Read-only maintenance inventory found 44 plaintext files in the live monitor/viewer roots. No files were deleted, encrypted in place or migrated; these files are blocked by the encrypted readers. Other export/work/backup locations are outside that count.
- Patched SheetJS to official 0.20.3, React/React DOM/RSC to 19.3.0, Vite to 8.3.4, vinext to 1.1.0, Cloudflare plugin to 1.63.1, and Wrangler to 4.149.0. Compatible transitive patches and targeted ZIP-parser/bundler overrides were applied. Network-enabled final audit: **7 high findings in one dependency chain** rooted in [braces stack-exhaustion advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). The audit reports no patched braces release. Remaining affected chain includes micromatch, fast-glob, Next lint plugin and vinext build plugins. Do not run these tools against untrusted source/glob patterns; keep development local/private. Resolve or formally assess this remaining dependency exposure before approving deployment; the production review gate remains closed.
- The full TypeScript check still reports existing dashboard/import/worker errors. Newly changed security modules, Amazon client/reports, retention module and database connector have no remaining diagnostics in the targeted error review. A passing Vite production build does not substitute for a clean full TypeScript check.
- Organization MFA gateway, secret/KMS configuration, database retention scheduling, live database behavior, encryption/backups, infrastructure security and deployment testing remain unverified. No external account settings were changed.


October 12 correction: removed in-app enrollment, login page and local credential configuration. Login-free access is scoped to loopback development only. API transport, revocation, CSRF, encrypted storage and retention checks remain enabled. Amazon''s August 25, 2026 policy update also covers device/storage encryption, lockout, WAF for internet-facing endpoints, vulnerability management and incident response: https://developer.amazonservices.com/policy-update-for-sp-api. Those operational controls cannot be certified by a code build.

## October 23 application login change

At the owner's request, a single-account username/password login page was added for cPanel deployments as an alternative to an external MFA gateway. Credentials and a separate 32-byte HMAC session secret are configured only in the server environment (`DASHBOARD_LOGIN_USERNAME`, `DASHBOARD_LOGIN_PASSWORD`, `DASHBOARD_SESSION_SECRET`). Sessions use an HTTP-only, Secure-on-HTTPS cookie with an eight-hour expiry; the login endpoint enforces same-origin requests and a temporary lockout after repeated failures. This is password authentication, not MFA, and does not resolve the operational or Amazon policy review findings above. Do not set `SECURITY_DEPLOYMENT_VERIFIED=true` until the deployment controls and open findings have been reviewed and accepted by the responsible security owner.
