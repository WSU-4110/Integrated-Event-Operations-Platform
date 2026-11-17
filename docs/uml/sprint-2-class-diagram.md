# Sprint 2 Class Diagram

The main classes, interfaces, and database tables added or changed in Sprint 2, grouped by who built them. Tables are shown as classes with their key columns. The chatbot's activity diagram is in [chatbot-activity-diagram.md](../chatbot-activity-diagram.md).

```mermaid
classDiagram
    direction LR

    %% Registrations and organizer dashboard (Mohammad)
    class Registration {
        +int id
        +string eventId
        +string email
        +string status
        +Date checkedInAt
        +string checkedInBy
        +int attendanceVersion
    }
    class RegistrationStatusChange {
        +int registrationId
        +string fromStatus
        +string toStatus
        +string changedBy
    }
    class AdminRouter {
        +listRegistrations(query)
        +updateRegistration(id, input)
        +changeStatus(id, status)
        +checkIn(id)
        +exportCsv()
    }
    class StatusChangeError {
        +int status
    }
    AdminRouter ..> Registration : reads and updates
    AdminRouter ..> RegistrationStatusChange : records
    AdminRouter ..> StatusChangeError : throws
    StatusChangeError --|> Error
    Registration "1" --> "*" RegistrationStatusChange

    %% Event content, check-in corrections (Arian)
    class EventContentStrategy {
        <<interface>>
        +prepare(input) EventContentDetails
    }
    class AnnouncementStrategy {
        +prepare(input) EventContentDetails
    }
    class ResourceLinkStrategy {
        +prepare(input) EventContentDetails
    }
    class EventContent {
        +int id
        +string kind
        +string title
        +string body
        +string url
        +int position
        +bool published
    }
    class AttendanceCorrection {
        +int registrationId
        +string reason
        +Date originalCheckedInAt
        +string correctedBy
        +int attendanceVersion
    }
    EventContentStrategy <|.. AnnouncementStrategy
    EventContentStrategy <|.. ResourceLinkStrategy
    AnnouncementStrategy ..> EventContent : prepares
    ResourceLinkStrategy ..> EventContent : prepares
    Registration "1" --> "*" AttendanceCorrection

    %% Verification codes and FAQ chatbot (Tajwar)
    class VerificationCode {
        +int registrationId
        +string codeHash
        +Date expiresAt
        +Date usedAt
        +Date invalidatedAt
    }
    class AiProvider {
        <<interface>>
        +complete(request) Promise~string~
    }
    class AnthropicProvider {
        -string apiKey
        -string model
        +complete(request) Promise~string~
    }
    class ChatService {
        -AiProvider provider
        +answer(messages) Promise~ChatReply~
    }
    class RateLimiter {
        +allow(visitorId) bool
    }
    Registration "1" --> "*" VerificationCode
    AiProvider <|.. AnthropicProvider
    ChatService --> AiProvider : depends on
    ChatService ..> RateLimiter : checked first by the chat route

    %% Event schedule and Event Hub (Sammy)
    class EventScheduleItem {
        +int id
        +string title
        +string location
        +Date startTime
        +Date endTime
        +bool published
        +int position
    }

    %% Discord bot (Tahmid; lockout by Sammy)
    class VerificationService {
        +verify(user, email) VerifyResult
        +isRateLimited(discordUserId) bool
        +getLink(discordUserId) ParticipantLink
    }
    class VerificationAttemptRepository {
        +record(attempt)
        +isLockedOut(discordUserId, windowMs) bool
    }
    class ParticipantLink {
        +string discordUserId
        +int registrationId
        +bool active
    }
    class Team {
        +string name
        +int ownerLinkId
    }
    VerificationService --> VerificationAttemptRepository
    VerificationService ..> ParticipantLink : creates
    ParticipantLink --> Registration : links Discord to
    Team "1" --> "*" ParticipantLink : members
```

## Design patterns

- **Strategy:** `EventContentStrategy` in `artifacts/api-server/src/lib/eventContent.ts`. `AnnouncementStrategy` and `ResourceLinkStrategy` each validate one kind of event content (FR-13, PR #68).
- **Adapter:** `AiProvider` in `artifacts/api-server/src/lib/chat/aiProvider.ts`. `AnthropicProvider` adapts the Anthropic API to it, and `ChatService` depends only on the interface (FR-20, PR #87).

## Owners

| Area | Owner | Classes |
| --- | --- | --- |
| Registrations and organizer dashboard | Mohammad Altiwainy | Registration, RegistrationStatusChange, AdminRouter, StatusChangeError |
| Discord bot verification, roles, and teams | Tahmid Ambia | VerificationService, ParticipantLink, Team |
| Event content, check-in, and attendance corrections | Arian Azad | EventContentStrategy, AnnouncementStrategy, ResourceLinkStrategy, EventContent, AttendanceCorrection |
| Verification codes and FAQ chatbot | Tajwar Khan | VerificationCode, AiProvider, AnthropicProvider, ChatService, RateLimiter |
| Event schedule, Event Hub, and verification lockout | Sammy Moussa | EventScheduleItem, VerificationAttemptRepository |
