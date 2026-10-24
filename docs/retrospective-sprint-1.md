# Sprint 1 Retrospective

## 1. Date and Attendees

**Project:** Integrated Event Operations Platform  
**Date:** October 23, 2026  
**Attendees:** Mohammad Altiwainy, Tahmid Ambia, Tajwar Khan, Arian Azad, Sammy Moussa

## 2. Start / Stop / Continue

### Start

- Select an owner, write acceptance criteria, and estimate hours for each task before work begins; the leader helps any member who needs a task.
- Hold a daily Teams stand-up of about 15 minutes and update task progress and hours remaining in the workbook.
- Record a teammate’s written review and relevant test results before merging each PR.

### Stop

- Leaving most implementation work to a few members.
- Merging PRs without recorded review feedback.
- Rushing through demonstrations or presenting unfinished features without explaining their status.

### Continue

- Link requirements, issues, and PRs so delivered work can be traced.
- Preserve registration records when confirmation emails fail.
- Test normal workflows alongside invalid entries, duplicate submissions, and unauthorized access.

## 3. Two Actions for Sprint 2

This is a proposed action plan. The named owners and estimates below need team agreement before the report is submitted as the team’s final minutes.

| Action | Proposed owner | When | Completion evidence |
|---|---|---|---|
| Establish shared task ownership and daily progress tracking. | Mohammad Altiwainy | At Sprint 2 planning, then each working day | Every member has a task with acceptance criteria and an hour estimate. Teams contains stand-up updates, the workbook records daily hours remaining, and each member can explain their own progress. |
| Fix and verify the admin table’s layout and scrolling behavior. | Tajwar Khan | Before the next Sprint 2 review or demonstration | A PR shows the table using the available desktop width and keeping headers visible while scrolling. Arian records checks with long records and at desktop and mobile sizes. |

## 4. Staff and Class Feedback and Our Response

The feedback has been mapped below to specific proposed tasks and changes to our process. This is the response documented in this draft; implementation and successful test results have not been confirmed. Each response will be followed up through the associated issue, PR, test record, or demo. Peer comments describe what viewers observed and are not treated as proof that a feature is absent or broken.

### Distribution of Work and Shared Understanding

> **MP:** “the bulk of the project was done by only three members in the sprint 1 that is not a good sign.”

> **MP:** “If the members cannot figure out what tasks they are eligible to start, the leader of the group should assign it to them.”

The class also questioned whether all members understood the project’s progress.

**Response:** Assign complete tasks to every member, including implementation, backend, security, and usability testing work. Record ownership and progress on issues and in the workbook. Each member should be able to explain their task, its current status, and its remaining work.

### UML Diagrams

> **MP:** “I need you show me some UML diagram of different sprint backlogs in the next sprint to see what is the process.”

**Response (Arian, with the feature owners):** Prepare UML diagrams for selected Sprint 2 stories, beginning with participant editing and Discord verification. Include the actors, normal workflow, and failure paths, and use the diagrams to explain the process at the next review.

### Functional Delivery and Demonstration

> **SB:** “Not much functional requirement delivered and some basic stuff did not work.”

> **Class:** “I could not tell what exactly their website does.”

**Response:** Prioritize complete workflows and test them before presenting. Begin the next demonstration by explaining that the platform manages event registration, organizer approvals, and participant access. Demonstrate the participant’s next step after registration and clearly identify features that remain unfinished.

### Admin Dashboard Width and Headers

> **Class:** “Their registration table seems very big and has a horizontal scroll which isn't good for the ui, but it can be later improved.”

> **Class:** “The admin page needs some work; the table headers should continuously float when scrolling down.”

**Response (Tajwar; usability checks by Arian):** Expand the dashboard into the unused page width, adjust column sizing and wrapping, and keep column headers visible during vertical scrolling. Evaluate pagination so large registration lists remain manageable.

### Design, Readability, and Mobile Use

> **SB:** “Also the UI design needs to be rethink and recreate maybe!”

> **Class:** “the color choices made some content difficult to read.”

> **Class:** “They should make it more compatible for mobile.”

**Response:** Review text contrast, page length, navigation, and information density. Test with browser device emulation and, where available, a physical phone. Keep the event’s purpose and primary registration action easy to find.

### Persistence and Access Control

> **Class:** “I could not tell whether the profile changes were saved and would still appear after logging out and signing back in.”

> **Class:** “wasn't sure if anyone can just access the admin page.”

**Response (Arian and Sammy):** Demonstrate that a saved record or status change survives refresh and a new sign-in session. Show that signed-out users and unauthorized accounts cannot access organizer data. Record the corresponding test results.

### Discord Integration and Participant Editing

> **Class:** “I could not tell if the discord aspect actually works.”

The oral feedback recorded by the team also said:

> “edit option next to delete, to change participants’ info, have discord connected to that to automatically update changed info and role(s)”

**Response (Tahmid and Sammy):** Clearly state Discord’s implementation status. Implement and demonstrate verification and role assignment, then connect relevant participant edits to the linked Discord account. Show synchronization failures clearly instead of silently reporting success.

### Validation and Email Delivery

> **Class:** “Error Processing”

> **Class:** “the emails automatically go into the junk folder”

The oral feedback recorded by the team also said:

> “when there’s a missing required text field or non .edu is used to register, show in red to be more alerting”

**Response:** Add red field borders and specific written error messages while preserving valid entries. Investigate confirmation email delivery and coordinate with the relevant email administrators where needed. Keep the junk-folder notice and resend option while delivery is being investigated.

### Unfinished Features and Future Scope

> **Class:** “I noticed that student hub is still in testing ‘TBD’ stage.”

> **Class:** “looking for team feature was uncertain of finality”

> **Class:** “would like to see how it can be generalized for future events.”

**Response:** Identify which participant hub and team features are committed for Sprint 2 and label unfinished work clearly. Prioritize features needed for the upcoming hackathon. Record support for future events as a separate backlog item rather than implying it is already available.

## 5. Sprint 2 Backlog

The table is ordered by proposed priority and sized in person-hours. These are draft planning estimates, not actual hours worked or estimates already agreed by the team. Feature estimates include implementation, developer checks, and review; the separate acceptance-testing task covers integrated user workflows.

| Priority | Task and acceptance criteria | Proposed owner | Starting estimate (hours) |
|---|---|---|---:|
| 1 | Prepare UML activity or sequence diagrams for participant editing and Discord verification, including actors, normal steps, and failure paths; check them with the feature owners before those features are implemented. | Arian Azad | 6 |
| 2 | Send approval notices and verification codes for issue #6; check successful delivery, failed delivery, and the participant’s next step. | Mohammad Altiwainy | 16 |
| 3 | Expand the admin table into the available desktop width, retain visible headers during vertical scrolling, and make long registration lists manageable; test long records and mobile access. | Tajwar Khan | 10 |
| 4 | Add red borders and specific written messages for missing required fields and invalid `.edu` emails; preserve valid entries and support keyboard correction. | Arian Azad | 4 |
| 5 | Implement Discord verification and participant role assignment; show successful linking and refused invalid verification attempts. | Tahmid Ambia | 16 |
| 6 | Add an organizer Edit action beside Delete; validate participant changes, save them, and reject unauthorized requests. | Sammy Moussa | 12 |
| 7 | Synchronize relevant participant edits with linked Discord information and roles after editing and verification are available; make failures visible and provide a recovery path. | Tahmid Ambia | 8 |
| 8 | Implement event check-in with duplicate prevention and saved attendance records. | Sammy Moussa | 12 |
| 9 | Complete a bounded participant hub with the event schedule, announcements, and clear post-registration guidance; remove or label unfinished controls and review readability. | Tajwar Khan | 14 |
| 10 | Record acceptance tests for persistence after refresh and a new session, organizer access, registration failures, responsive layout, and readability; log defects and rehearse these flows for the demo. | Arian Azad | 14 |
| 11 | Investigate confirmation email delivery, document findings and any configuration changes, and retain the spam-folder notice and resend option while needed. | Mohammad Altiwainy | 8 |
| | **Total proposed effort** | | **120** |

### Capacity and Scope

The proposed distribution is 24 hours per member: Mohammad 24, Tahmid 24, Tajwar 24, Arian 24, and Sammy 24. This is a planning proposal, not a record of work performed or verified availability. The team must check actual capacity, dependencies, and estimates before committing; reduce scope or split tasks if needed. UML preparation precedes the corresponding features, and Discord synchronization depends on participant editing and Discord verification.

Event-day features need to be ready before the November 14–15 event. Team formation and generalizing the platform for future events remain outside this proposed commitment until separately scoped and prioritized.

### Daily Tracking and Follow-up

- Copy the agreed tasks, owners, and starting hour estimates into the Sprint 2 workbook.
- After each daily Teams stand-up, record work still remaining on each task. Do not enter hours spent in the remaining-work cells.
- Increase an estimate when additional work is discovered, reduce it as work is completed, and enter 0 when the task is finished. Leave future days unfilled.
- Keep the workbook’s totals and burndown chart linked to those daily entries, and record reasons for significant scope or estimate changes.
- Keep Teams discussion history and issue/PR evidence. At Presentation 3, check the two actions in Section 3 against the evidence and explain anything incomplete.
