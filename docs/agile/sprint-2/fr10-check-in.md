> Current behavior: pending and approved registrations are active and can check in; waitlisted and declined registrations cannot. This follows Remove/Restore and supersedes the original approved-only description below. FR-10 is merged in #78; subsequent attendance work targets main.

# FR-10: Check in an approved participant

Implement issue #11 independently on `arian/fr-10-check-in`, based on main. Do not merge or deploy this branch automatically. Use the existing `checked_in_at` and `checked_in_by` fields from migration 0005; no new database migration is needed.

## Requirements

- An organizer authorized by the existing Google/session and ADMIN_EMAILS guard searches the dashboard, reviews approval and attendance, and confirms check-in.
- `POST /api/admin/registrations/{id}/check-in` checks the current event and **approved** status on the server. Pending, waitlisted and declined cannot check in, even though the older main branch calls pending registrations active for Discord access.
- One conditional database update records the database timestamp and authenticated organizer ID on the participant's event registration. Client-supplied status, time or organizer must not be trusted.
- Existing check-in fields are never overwritten by repeated or concurrent requests. Missing records, ineligible status, duplicate check-in and failed writes return clear errors. No optimistic success or counter update before a successful save.
- Dashboard refreshes rows and statistics on success, displays attendance time, and supports the existing checked-in/not-checked-in filters. On an uncertain or stale response, reload attendance before retrying.
- Approval is a separate concern (the FR-05 proposal restores the original approval workflow); this branch does not silently approve participants or substitute active/pending for approved. Attendance correction/undo and its reason/history remain FR-11 (#12).
- No Discord, email or other external integration is required to save attendance. The website registration is the attendance source of truth; the bot's similarly named fields are not written by this endpoint.

## Implementation and verification plan

1. Add failing real-PostgreSQL HTTP tests for authorized success, role protection, all unapproved states, invalid/missing/other-event IDs, duplicate/concurrent check-in, forged client metadata, dashboard counts/filtering, failed writes and stale approval.
2. Add conditional check-in route, documented API/result type and generated client. Add an organizer confirmation/action with visible saved time and accessible failure feedback. Reuse existing migrations.
3. Run the complete API suite, TypeScript checks, production builds, independent review, and the actual built browser with real local sessions/API/PostgreSQL. Test confirm/cancel, unapproved controls, save failure, success/count/filter updates, duplicate/stale requests and desktop/mobile layout.
4. Commit on the isolated feature branch. Attempt an unmerged regular PR if permitted; if GitHub still denies write access, provide a clean-applied patch with exact PR instructions. No live participant data, merges, deployments or messages.

## Verification and handoff

- Baseline: 54 API tests passed. New tests failed against the missing endpoint before implementation. Final full suite: 65 passed, 0 failed, 0 skipped, using a throwaway PostgreSQL database.
- TypeScript library/API/frontend checks and production builds passed.
- Actual local Chromium used the built React app, real API, session authentication and PostgreSQL. Checked search, confirmation cancellation (no request/write), unapproved controls, forced database-write failure with red feedback, disabled saving state and no optimistic counter, saved time/organizer, count and both attendance filters, stale approval and duplicate refresh, and signed-out protection. No horizontal overflow at 1920/1440/1280/1200/1199/1024/768/390/320 pixels; zero application JavaScript errors.
- Independent review found a filter-change/in-flight save cache race. The browser reproduced the stale list before the fix; registration-prefix invalidation now refreshes the current list even if filters change during save. The reviewer verified the fix and approved. Existing API formatting outside the check-in change was preserved.
- No live participant records, real Google sign-in, Discord actions, email or deployments were used. Browser authentication uses local session fixtures; the sign-in redirect was observed with the login destination stubbed locally to avoid external OAuth. API authorization is checked with real session/allowlist logic.
- GitHub branch creation returned 403 Resource not accessible by integration. Changes are committed locally and handed over as a patch plus exact regular-PR instructions. No branch was merged and main was not changed.
