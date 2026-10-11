# Product backlog

The backlog is the set of GitHub issues in this repository. Each sprint is a milestone. Issue numbers and titles below are copied from GitHub; GitHub is the source of truth if they differ.

The site and its first version came from Replit. Moving it off Replit and rebranding it is not tracked as separate issues. Each of those updates is delivered inside the issue it belongs to, and listed under [Migration and rebrand updates](#migration-and-rebrand-updates) so none of them is lost.

## Schedule constraint

The event is Saturday–Sunday, November 14–15, 2026. Sprint-2 ends November 17, after the event. Anything participants or organizers need on event day (registration, approval, Discord access, check-in, the live schedule) has to be working before November 14, not by the end of Sprint-2.

## Issues by sprint

### Sprint-1

| Issue | Title |
| --- | --- |
| [#1](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/1) | [FR-01] Submit event registration |
| [#2](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/2) | [NFR-01] Security and Access Control |
| [#3](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/3) | [FR-02] Assign Initial Registration Status |
| [#4](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/4) | [FR-03] Search and View Participant Records |
| [#5](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/5) | [FR-04] Update Participant Approval Status |
| [#20](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/20) | [FR-19] Authenticate Organizers and Enforce Dashboard Permissions |
| [#21](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/21) | [NFR-02] Privacy and Data Minimization |
| [#23](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/23) | [NFR-04] Reliable Event Records and Integrations |

### Sprint-2

| Issue | Title |
| --- | --- |
| [#6](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/6) | [FR-05] Send Approval Notice and Verification Code |
| [#7](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/7) | [FR-06] Verify and Link a Discord Account |
| [#8](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/8) | [FR-07] Assign Discord Role and Private Channel Access |
| [#9](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/9) | [FR-08] Handle Verification Failure and Code Resend |
| [#10](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/10) | [FR-09] Revoke Discord Event Access |
| [#11](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/11) | [FR-10] Check In an Approved Participant |
| [#12](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/12) | [FR-11] Prevent Duplicate Check-In and Correct Attendance |
| [#13](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/13) | [FR-12] Manage the Event Schedule |
| [#14](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/14) | [FR-13] Manage Announcements and Resources |
| [#15](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/15) | [FR-14] View the BuilderWars Event Hub |
| [#22](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/22) | [NFR-03] Usability for Participants and Organizers |
| [#24](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/24) | [NFR-05] Availability During Event Operations |
| [#25](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/25) | [NFR-06] Performance Under Expected Event Load |

### Sprint-3

| Issue | Title |
| --- | --- |
| [#16](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/16) | [FR-15] Submit Post-Event Feedback |
| [#17](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/17) | [FR-16] Export Participant and Attendance Data |
| [#18](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/18) | [FR-17] Generate Feedback and Sponsor Summary |
| [#19](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/19) | [FR-18] Configure a Future Hackathon Event |

## Migration and rebrand updates

Recorded 2026-10-10 from Mohammad's decisions. Each item belongs to the issue in the last column; check it off in the PR that delivers it. The content and visual rebrand shipped together in PR #28, ahead of the issue work, so those rows note that PR.

### Name, content, and logistics

| | Update | Delivered under |
| --- | --- | --- |
| [x] | Event name is **BuilderWars** (not "AWS BuilderWars"). Organized by the AWS Student Builder Group at Wayne State University; AWS is a sponsor. | [#15](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/15), done in [PR #28](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/pull/28) |
| [ ] | Domain is **builderwars.dev** (not awsbuilderwars.dev) | [#24](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/24) |
| [x] | Location: STEM Innovation Learning Center (not Newlab Detroit). Date unchanged. | [#15](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/15), done in [PR #28](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/pull/28) |
| [x] | Schedule: add doors close 10:00 PM Saturday, reopen 7:00 AM Sunday. Check-in stays 10:00 AM Saturday; the rest of the schedule stays. | [#13](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/13), done in [PR #28](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/pull/28) |
| [x] | Countdown targets hacking start, 12:00 PM Saturday Nov 14 Detroit time, computed in the America/Detroit time zone (DST ends Nov 1, so the event is in EST) | [#15](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/15), done in [PR #28](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/pull/28) |
| [ ] | Live schedule on event days: current item highlighted with a progress bar | [#13](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/13), [#15](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/15) |
| [x] | Eligibility: currently enrolled college or university students only. Remove "recent graduates" everywhere (details, "Who is it for", FAQ). | [#15](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/15), done in [PR #28](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/pull/28) |
| [x] | FAQ: experience and beginner answers mention mentors at the event | [#15](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/15), done in [PR #28](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/pull/28) |
| [x] | FAQ "What can we build?": company-specific tracks announced before the event, plus overall top 3 projects (excluding company-specific tracks) | [#15](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/15), done in [PR #28](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/pull/28) |
| [x] | Instagram link goes to https://www.instagram.com/builderwars.hack/ | [#15](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/15), done in [PR #28](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/pull/28) |
| [x] | Sponsors: AWS logo in a single color on the dark background; add FREE WILI and the Wayne State Engineering Student Senate; keep "more sponsors to come" | [#15](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/15), done in [PR #28](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/pull/28) |
| [x] | Sponsor packet replaced with the updated version (Google Drive, shared by Mohammad) | [#15](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/15), done in [PR #28](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/pull/28) |

### Visual identity

| | Update | Delivered under |
| --- | --- | --- |
| [x] | Purple replaces light orange as the accent color. Keep the dark, minimal layout. | [#15](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/15), done in [PR #28](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/pull/28) |
| [x] | Pixel / 8-bit logo set based on the BuilderWars Instagram picture and flier, in purple: primary logo, secondary logo, submark, favicon. Used sparingly so the site stays minimal. | [#15](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/15), done in [PR #28](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/pull/28) |
| [x] | "Student Hub" links keep pointing to the AWS Student Builder Group site, wayneaws.dev | [#15](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/15), done in [PR #28](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/pull/28) |

### Infrastructure and data

| | Update | Delivered under |
| --- | --- | --- |
| [x] | Export the waitlist data before anything else: the old site's admin portal still works, and its CSV export has every waitlist column. Store the file privately (never in this repo); test importing it into the new database. Exported 2026-10-11; the import test is still to do. | [#23](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/23) |
| [ ] | New host and database (the Replit deployment no longer applies) | [#24](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/24), [#23](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/23) |
| [ ] | Point builderwars.dev at the new host | [#24](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/24) |
| [ ] | Replace the Replit email connector with a direct email provider | [#1](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/1), [#6](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/6) |
| [ ] | Waitlist becomes registration; import the waitlisted people | [#1](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/1), [#3](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/3) |
| [ ] | ~~Email the waitlist that registration is open.~~ Decided 2026-10-11: import them as registered instead; collect any new required fields later, for example through the registration confirmation email. Mohammad approves any message before it is sent. | [#1](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/1) |
| [ ] | Replace Replit login with Google sign-in; allow several admin emails instead of one (the club's Gmail and Mohammad's personal account first, more later) | [#20](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/20), [#2](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/2) |

### Waiting on someone else — do not drop

| | Item | Needed by |
| --- | --- | --- |
| [ ] | Updated information packet (current one is outdated; leave it off the site until the new one is ready) | Before registration emails go out |
| [ ] | Code of conduct (being written) | Before registration opens, since participants should agree to it |
| [ ] | Company-specific prizes and tracks; Prizes section says "coming soon" until then | Before the event |
| [ ] | Additional sponsors and their logos | As they confirm |

## Proposed new backlog items

New features that no existing issue covers. Each needs team agreement before it becomes an issue.

- **Team formation and submission.** Participants form teams or a team leader submits the team's members; the same team is used for the project submission when hacking ends. Projects are submitted on Shipyard (confirmed 2026-10-10), so this feature records teams and links to Shipyard rather than replacing it. Closest existing issue is [#1](https://github.com/WSU-4110/Integrated-Event-Operations-Platform/issues/1) (registration), which does not cover teams.
