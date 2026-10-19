# Sprint 1 contributions

Factual input for peer reviews: what each member's GitHub account shows between 2026-09-26 (when the sprint milestones were created) and 2026-10-19. Compiled from the repository's commits, pull requests, issues, wiki history, and activity feed.

GitHub only shows part of the work. Meetings, the presentation, planning, Discord, design, and anything done outside this repository don't appear here, so add those from your own knowledge when writing peer reviews. Ratings and "areas to improve" are each student's own judgment and are not part of this file.

## Summary

Updated at the end of the sprint (2026-10-19, after PR #53).

| Member | Commits on `main` | PRs opened | PRs merged | Issues opened | Other |
| --- | --- | --- | --- | --- | --- |
| Mohammad Altiwainy (@maltiwainy229) | 42 | 28 (#26–#53) | 19 | 19 (#7–#25) | Repo admin: collaborators, GitHub Actions secrets and variables; AWS (domain, Lightsail, IAM, restore test) and Google sign-in setup |
| Tahmid Ambia (@ambiatahmid06) | 0 | 0 | 2 (#32, #33) | 0 | — |
| Tajwar Khan (@Taj354) | 0 | 0 | 3 (#46, #47, #48) | 0 | — |
| Arian Azad (@arian0418) | 0 | 0 | 2 (#50, #53) | 6 (#1–#6) | — |
| Sammy Moussa (@Sammym05) | 0 | 0 | 2 (#51, #52) | 0 | 3 wiki pages |

No pull request in this window had a GitHub review recorded; PRs were merged without approving reviews.

## Details

### Mohammad Altiwainy (@maltiwainy229)

- Opened issues #7–#25 (FR-06 to FR-19, NFR-01 to NFR-06) on 2026-09-26.
- Opened PRs #26–#53 and merged 19 of them (#26–#31, #34–#45, #49):
  - Moving off Replit: #26 (platform lock), #27 (pnpm pin), #34 (development notes)
  - Rebrand: #28 (name, venue, schedule, FAQ, sponsors, purple accent, logo set), #30 (404 page), #33 (venue and packet updates)
  - Hosting: #31 (Docker image), #36 (CI, deploy workflow, migrations), #40–#44 (deploy checks and logs)
  - Sign-in: #37 (Google sign-in, multiple admins, #20), #38
  - Registration and approval: #47 (registration, #1), #48 (waitlist completion, resend), #49 (spam notice), #50 (approval status, #5), #51 (dashboard load errors, connection drops)
  - Security and reliability: #52 (API tests, security headers, #2), #53 (restore test record, #23)
  - Docs: #29 (agile docs), #32, #35, #39, #45, #46
- Set up the AWS resources (domain, Lightsail database and container service, IAM deploy role, DNS and HTTPS), the Google sign-in client, Resend email, and the repository's deploy secrets; imported the waitlist; ran the database restore test. These happened outside GitHub; the PRs above document them.
- Closed issues #1–#5, #20, #21, and #23 with comments mapping each requirement to the delivered work.
- Per the README's "AI assistance" section, Claude was used as a coding assistant on this work.

### Tahmid Ambia (@ambiatahmid06)

- Merged PR #32 (old-domain docs) and PR #33 (venue and packet updates) on 2026-10-18.

### Tajwar Khan (@Taj354)

- Merged PR #46 (domain live over HTTPS), PR #47 (registration, #1), and PR #48 (waitlist completion and resend button) on 2026-10-19.

### Arian Azad (@arian0418)

- Opened issues #1–#6 on 2026-09-26: FR-01 Submit event registration, NFR-01 Security and Access Control, FR-02 Assign Initial Registration Status, FR-03 Search and View Participant Records, FR-04 Update Participant Approval Status, FR-05 Send Approval Notice and Verification Code.
- Merged PR #50 (approval status, #5) and PR #53 (restore test record, #23) on 2026-10-19.

### Sammy Moussa (@Sammym05)

- Merged PR #51 (dashboard load errors, dropped connections) and PR #52 (API security tests, #2) on 2026-10-19.
- Created three wiki pages on 2026-10-04: Home (overview, features, stack, process, team, status), Project Scope & Architecture (scope, system architecture, high-level flow), and System Requirements (functional and non-functional requirements, requirement tracking).
