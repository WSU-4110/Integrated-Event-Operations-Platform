# Google sign-in setup

Organizers sign in to `/admin` with Google (#20). Admin access is granted by email address through the `ADMIN_EMAILS` setting; signing in with Google alone gives no access.

Create the Google client while signed in to the **club's Gmail account**, so it stays with the club.

## 1. Project

Google Cloud console (console.cloud.google.com) → project picker → New project → name it `BuilderWars`.

## 2. Consent screen

APIs & Services → OAuth consent screen (also shown as "Google Auth Platform"):

- App name: `BuilderWars`
- User support email and developer contact: the club's Gmail
- Audience: **External**
- Data access: leave the default scopes (`openid`, `email`, `profile`). They are non-sensitive, so Google doesn't need to review the app.
- Leave the publishing status on **Testing**. Under Audience → Test users, add every admin's Google account (the same addresses as `ADMIN_EMAILS`). Only listed test users can sign in, which is all the admin pages need. Admins see a "Google hasn't verified this app" screen; choose Continue.
- Google's 7-day expiry for Testing-mode tokens doesn't matter here, because the app doesn't keep Google tokens.
- Publishing needs a verified domain. It's only necessary if people other than admins ever sign in; if so, verify builderwars.dev with a DNS record once the site is live.

## 3. Client

APIs & Services → Credentials → Create credentials → OAuth client ID:

- Application type: **Web application**
- Name: `BuilderWars site`
- Authorized redirect URIs:
  - `https://builderwars.dev/api/callback`
  - `https://www.builderwars.dev/api/callback`
  - `http://localhost:8080/api/callback` (local development)
  - the container service's default URL plus `/api/callback`, for testing before the domain is connected (Lightsail → Containers → container-service-builderwars shows the URL)

Create it, then copy the client ID and client secret into the GitHub secrets `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (see `docs/deployment.md`). Don't paste the secret anywhere else.

## 4. Admins

Set the GitHub secret `ADMIN_EMAILS` to a comma-separated list, for example the club's Gmail and Mohammad's Gmail. To add an admin, add them as a test user on the consent screen and to the secret, then rerun the Deploy workflow. To remove one, take them out of both.
