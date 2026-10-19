# Sprint 1 review

- **Date:** _to fill in_
- **Attendees and stakeholders:** _to fill in_

Prepared 2026-10-19 from GitHub and the live site. "Accepted?" and the feedback sections are for the team to fill in during the review.

## Sprint goal

The rebranded BuilderWars site is live at builderwars.dev with working registration and organizer sign-in, and the Replit waitlist data is preserved.

**Result:** partly met. The rebranded site is live on AWS (at the Lightsail service URL; builderwars.dev is registered and its DNS is being connected), organizer sign-in works, and the waitlist data is exported. Registration is not built yet.

## Demonstrated

Live site: https://container-service-builderwars.a9btvbt0h4tje.us-east-2.cs.amazonlightsail.com (builderwars.dev once DNS and HTTPS are connected).

| Item | What to show | Issue | Accepted? |
| --- | --- | --- | --- |
| Rebranded site | BuilderWars name, purple pixel logo set, Newlab Detroit venue, updated schedule (building entry closes 10 PM, doors reopen 7 AM), eligibility, FAQ, sponsors (AWS, FREE WILI, WSU Engineering Student Senate), updated sponsorship and information packets | [#15](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/15) (rebrand items) | |
| Hosting on AWS | Site and API running on Amazon Lightsail with a managed PostgreSQL database; tables created automatically on start | [#24](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/24), [#23](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/23) | |
| Automatic deploys | Merging to `main` builds and deploys through GitHub Actions; the run waits for Lightsail and shows the app's logs; every PR is typechecked and built (CI) | — | |
| Organizer sign-in | `/admin` → Google sign-in → admin dashboard; signed-out and non-admin requests are refused by the server | [#20](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/20), [#2](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/2) | |
| Agile records | Product backlog, sprint folder, team page in `docs/agile/` | — | |

## Sprint 1 issues

None of the eight Sprint 1 issues is closed yet.

| Issue | Status at the end of the sprint |
| --- | --- |
| [#1](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/1) FR-01 Submit event registration | Not started. The site still has the waitlist form; registration fields were not decided yet. Email sender still to be replaced. |
| [#2](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/2) NFR-01 Security and access control | Partly done: server-side admin checks, verified-email sign-in, secrets kept in GitHub, encrypted and verified database connection. |
| [#3](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/3) FR-02 Assign initial registration status | Not started (depends on #1). |
| [#4](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/4) FR-03 Search and view participant records | The admin dashboard from Replit already lists and searches waitlist entries; not yet checked against this issue's acceptance criteria. |
| [#5](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/5) FR-04 Update participant approval status | Not started. |
| [#20](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/20) FR-19 Authenticate organizers | Done and verified on the live site, except role-based permissions (all admins currently have the same access). Team to decide whether to close it. |
| [#21](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/21) NFR-02 Privacy and data minimization | Partly done: Google tokens aren't stored, logs redact credentials. The data-use notice on forms is not done. |
| [#23](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/23) NFR-04 Reliable records | Partly done: Lightsail takes daily database snapshots; schema changes run as versioned migrations; waitlist exported. Restore test and waitlist import not done. |

## Feedback received

_To fill in during the review._

## Not finished, moving to Sprint 2

Proposed, team to confirm:

- #1 registration, #3 initial status, #5 approval status
- Remaining parts of #2, #21, and #23
- #4, after checking the existing dashboard against its criteria
- #20's role-based permissions, if the team wants them
- Connecting builderwars.dev (DNS, HTTPS, `CANONICAL_HOST`)
- Reminder: Sprint 2 ends November 17, after the event (November 14–15). Event-day features have to work before November 14.
