# Amazon product monitoring

Daily CDC US monitoring is scheduled in Codex at 09:00 Asia/Calcutta. The host and Codex must be available; this is not an always-on hosted scheduler.

Run `npm run amazon:sync` to pull a fresh all-listings report and all available Catalog Items datasets. The dashboard action uses the same worker. Sync locks prevent overlapping runs. Failed or incomplete pulls preserve the previous committed comparison baseline.

Keep `data-store/amazon-monitor` on persistent storage and back it up. It contains immutable source observations, comparisons, review acknowledgements, and sync history. Configure `AMAZON_MONITOR_DATA_DIR` to move it to another persistent directory. Never publish credentials or this data directory as public assets.

For deployment, provision a Node.js scheduler that runs `npm run amazon:sync` daily from the application root with the same environment and persistent directory. The browser alone does not schedule pulls. Use only one scheduler for the application. FBA inventory and historical orders have separate source files; the product monitoring job does not refresh those datasets.

Changes show detection time, previous/current values and API availability. They do not prove who changed a listing or when Amazon changed it. Ratings/review redistribution is not supplied by the configured product APIs. One unavailable catalog item remains explicitly flagged.

### Main administrator and reversing a parent merge

Run `npm run admin:setup` in an interactive terminal. Select an enabled existing dashboard user ID (the configured loopback development user is also supported locally). Enter and confirm an administrator password of at least 12 characters; input is hidden. Restart the dashboard server after setup. The server stores only a salted scrypt hash in the ignored `.env` file, using `AUTH_MAIN_ADMIN_USER_ID` and `AUTH_MAIN_ADMIN_PASSWORD_HASH`. The configured main administrator receives access to both dashboard accounts. Do not share the password in chat or commit `.env`.

In a merged child's review, the main administrator can choose **Reverse merge**, review B → A, and enter their password. Other users cannot call this endpoint successfully, even with a correct password. Five failed attempts lock password verification for 15 minutes. The operation atomically updates only the selected SKU's local parent mapping and appends the authenticated actor, time, and previous/current parents to encrypted audit history. Legacy merges retain a legacy actor label when their original actor was not recorded. Audit history is visible in the review and dedicated ASIN history page. Retention follows the existing encrypted Amazon storage policy.

A reversal does not call Amazon or change source snapshots or sales totals. Repeating a reversal or reversing a superseded mapping is rejected. Future completed Amazon pulls remain authoritative, as with forward merges. Reversal restores a previous local parent assignment; it is not an Amazon listing edit.
