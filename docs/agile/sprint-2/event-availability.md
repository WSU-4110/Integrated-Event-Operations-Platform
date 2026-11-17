# NFR-05 event availability

The target is 99.5% availability for each of the event hub, registration status, and organizer dashboard from two hours before the published event starts until two hours after it ends. Record the exact window in UTC and track approved maintenance separately.

## Monitor the event

| Check | Expected result |
| --- | --- |
| `GET /api/healthz` | HTTP 200 shows the web process responds. Lightsail uses this check. |
| `GET /api/status` | HTTP 200 when PostgreSQL responds and HTTP 503 when it does not. Inspect the JSON for separate integration signals. |
| Participant event hub | Published event content is visible. Confirm this independently of Discord and confirmation email. |
| Registration status | A designated test participant can see the expected registration status. |
| Organizer dashboard | A designated organizer can sign in and load the dashboard. |

Run the first two checks from outside the deployment at one-minute intervals. Set a 15-second probe timeout to account for database connection failures. Use an authorized test account for the signed-in checks and record any failure and recovery times. The status endpoint is diagnostic and cannot prove that a participant or organizer workflow works.

- `discordLinkStore` indicates whether the website can read the bot's participant link table. An `up` result does not verify the bot's Discord connection. Confirm bot availability with a separate Discord check. `unknown` means the database probe failed before the link store could be checked.
- `confirmationEmail` reports the latest confirmation request accepted or rejected by the provider in the last 15 minutes. `unknown` means there is no recent observation on this web process, and `disabled` means no provider key is configured. Acceptance is not inbox delivery. Confirm delivery with a designated test inbox.
- An optional integration failure is reported separately and does not fail the Lightsail check. If one integration is unavailable, tell organizers which workflow is affected and verify the participant hub and other unaffected flows independently.

## Record incidents

Keep one row per affected workflow. Use the first observed failure and first verified restoration in UTC. Record approved maintenance with its approval and time range.

| Workflow | Unavailable since (UTC) | Restored at (UTC) | Impact and workaround | Owner | Approved maintenance reference |
| --- | --- | --- | --- | --- | --- |
| | | | | | |

Calculate availability per workflow as `100 × (eligible minutes − unavailable eligible minutes) / eligible minutes`. Eligible minutes are the event window minus approved maintenance. Count an outage only once per workflow, even if several checks detect it. The target is met only after measuring the actual event window.
