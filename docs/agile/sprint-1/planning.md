# Sprint 1 planning

- **Milestone:** Sprint-1, due October 20, 2026 (GitHub stores this as midnight UTC, which is the evening of October 19 in Detroit)
- **Planning meeting date:** _to fill in_
- **Attendees:** _to fill in_

## Sprint goal

_Proposed 2026-10-10, team to confirm:_ the rebranded BuilderWars site is live at builderwars.dev with working registration and organizer sign-in, and the Replit waitlist data is preserved.

## Committed issues

| Issue | Title | Owner |
| --- | --- | --- |
| [#1](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/1) | [FR-01] Submit event registration | |
| [#2](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/2) | [NFR-01] Security and Access Control | |
| [#3](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/3) | [FR-02] Assign Initial Registration Status | |
| [#4](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/4) | [FR-03] Search and View Participant Records | |
| [#5](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/5) | [FR-04] Update Participant Approval Status | |
| [#20](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/20) | [FR-19] Authenticate Organizers and Enforce Dashboard Permissions | |
| [#21](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/21) | [NFR-02] Privacy and Data Minimization | |
| [#23](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/23) | [NFR-04] Reliable Event Records and Integrations | |

The rebrand and migration updates in [product-backlog.md](../product-backlog.md) that map to these issues are part of this sprint.

## Starting tasks

From the kickoff presentation, adjusted as needed:

- Define stakeholders and first SRS issues — Mohammad, Arian
- Audit the site, admin access, data, and DNS — Tajwar, Mohammad
- Map Discord roles and prototype verification — Tahmid, Sammy

## Decisions

- **2026-10-10 (Mohammad):** Migration and rebrand work is delivered inside existing issues instead of new issues. Details in [product-backlog.md](../product-backlog.md).
- **2026-10-10 (Mohammad):** Name, domain, location, schedule, eligibility, FAQ, sponsor, Instagram, and visual identity changes recorded in [product-backlog.md](../product-backlog.md).
- **2026-10-10 (Mohammad):** Organizers sign in with Google. First admins are the club's Gmail account and Mohammad's personal account; more can be added later.
- **2026-10-10 (Mohammad):** Project submissions stay on Shipyard.
- **2026-10-11 (Mohammad):** Host on AWS, in the club's account, with PostgreSQL. Claude recommended Lightsail (container service plus managed database) over App Runner (closed to new customers), ECS with a load balancer (too much cost and setup), and Lambda (would need the API rewritten). Steps in [deployment.md](../../deployment.md).
- **2026-10-11 (Mohammad):** builderwars.dev is not purchased yet. awsbuilderwars.dev should redirect to it, as long as that costs nothing extra.
- **2026-10-18 (Mohammad):** awsbuilderwars.dev will not redirect. Its DNS is in Replit, which only offers A, CNAME, TXT, and MX records, so a free redirect to Lightsail isn't possible, and the address wasn't shared widely. It stops working when the Replit site is turned off.
- **2026-10-11 (Mohammad):** Waitlist data exported from the old admin portal and stored privately. The 10–15 waitlisted people are imported as registered rather than emailed that registration is open. If registration asks for more than the waitlist did (Discord username, dietary restrictions), they are asked for it later, for example in the registration confirmation email.
- **2026-10-11 (Mohammad):** Registration opens now. Email goes through Resend; the free plan covers this volume.
- **2026-10-18 (Mohammad):** The updated sponsorship and information packets are the source of truth for event details, and the site follows them. The venue is Newlab Detroit, 1st floor (not the STEM Innovation Learning Center), and the Saturday workshop and dinner times moved earlier. The sponsorship packet now expects 100+ attendees.
- **2026-10-10 (Mohammad):** Updated sponsor packet and sponsor logos (AWS, FREE WILI, Engineering Student Senate) provided. Information packet and code of conduct are on hold until they're finished.
- **2026-10-18 (Mohammad):** builderwars.dev registered through Route 53 in the club's AWS account. Lightsail's domain registration doesn't offer .dev; builderwars.org was the fallback if .dev couldn't be registered anywhere.

## Done so far

- [PR #26](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/pull/26): removed the Replit linux-x64-only install restriction so the project builds on macOS, Windows, and ARM Linux.
- [PR #27](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/pull/27): pinned pnpm 10 and updated the setup docs.
- [PR #28](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/pull/28): rebranded the site to BuilderWars: name, venue, schedule, eligibility, FAQ, sponsors, Instagram, sponsor packet, purple accent, and the pixel logo set.
