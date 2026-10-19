# Sprint 1 review

- **Date:** _to fill in_
- **Attendees and stakeholders:** _to fill in_

Prepared 2026-10-19 from GitHub and the live site, and updated at the end of the sprint. "Accepted?" and the feedback sections are for the team to fill in during the review.

## Sprint goal

The rebranded BuilderWars site is live at builderwars.dev with working registration and organizer sign-in, and the Replit waitlist data is preserved.

**Result: met.** https://builderwars.dev is live on AWS over HTTPS with registration open, organizer sign-in, approval, and the imported waitlist. All 8 Sprint 1 issues are closed.

## Demonstrated

Live site: https://builderwars.dev (admin: https://builderwars.dev/admin)

| Item | What to show | Issue | Accepted? |
| --- | --- | --- | --- |
| Rebranded site | BuilderWars name, purple pixel logo set, Newlab Detroit, schedule, FAQ, sponsors, packets | [#15](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/15) (rebrand items) | |
| Registration | Form with data-use notice; duplicate and non-.edu emails rejected; confirmation email with the information packet; waitlisted people complete their registration with the same email | [#1](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/1), [#3](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/3) | |
| Admin dashboard | Search and filters, stats, CSV export, resend confirmation email | [#4](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/4) | |
| Approval | Approve, waitlist, or decline with a confirmation; change history; a stale change from a second organizer is refused | [#5](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/5) | |
| Organizer sign-in | Google sign-in; server-side admin checks (401/403) | [#20](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/20), [#2](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/2) | |
| Hosting and deploys | Lightsail with PostgreSQL; every merge to `main` builds, deploys, waits for the health check, and shows the logs; CI typechecks, builds, and runs 23 API security tests on every PR | [#24](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/24), [#2](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/2) | |
| Backups | Restore test: a copy restored from Lightsail's backup matched the live database | [#23](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/23) | |
| Agile records | Product backlog, sprint folder, contributions list | — | |

## Sprint 1 issues

All closed. Each issue's closing comment lists how its requirements are met and which later issues carry related work.

| Issue | Delivered in |
| --- | --- |
| [#1](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/1) FR-01 Submit event registration | [PR #47](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/pull/47), [#48](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/pull/48), [#49](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/pull/49) |
| [#2](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/2) NFR-01 Security and access control | [PR #36](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/pull/36), [#37](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/pull/37), [#52](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/pull/52) |
| [#3](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/3) FR-02 Assign initial registration status | [PR #47](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/pull/47), [#50](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/pull/50); configurable initial status moves to [#19](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/19) |
| [#4](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/4) FR-03 Search and view participant records | [PR #47](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/pull/47), [#50](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/pull/50), [#51](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/pull/51); Discord and check-in columns come with [#7](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/7) and [#11](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/11) |
| [#5](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/5) FR-04 Update participant approval status | [PR #50](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/pull/50); the approval email is [#6](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/6) |
| [#20](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/20) FR-19 Authenticate organizers | [PR #37](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/pull/37), [#38](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/pull/38); one admin level for now |
| [#21](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/21) NFR-02 Privacy and data minimization | [PR #47](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/pull/47), [#52](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/pull/52); [#16](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/16) and [#18](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/18) must follow it |
| [#23](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/23) NFR-04 Reliable records | [PR #48](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/pull/48), [#50](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/pull/50), [#51](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/pull/51), [#53](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/pull/53) |

## Feedback received

_To fill in during the review._

## Moving to Sprint 2

Proposed, team to confirm:

- [#6](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/6) approval email and verification code: next, so approved people hear back
- [#7](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/7)–[#10](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/10) Discord linking, roles, resend, and revocation
- [#11](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/11)–[#15](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/15) check-in, schedule (including the live schedule with a progress bar), announcements, event hub
- [#22](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/22), [#24](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/24), [#25](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/25) usability, availability, and performance
- Email the waitlist once Wayne State IT allows the sender into student inboxes
- Team formation: proposed backlog item, needs an issue if the team agrees
- Reminder: Sprint 2 ends November 17, after the event (November 14–15). Event-day features have to work before November 14.
