# Connecting X, Instagram and LinkedIn

The Social screen publishes through each platform's official API. Each needs
a developer app registered by you; the API then connects your account with
OAuth and stores the tokens encrypted (`APP_ENCRYPTION_KEY`). Until an app's
credentials are in `backend/.env`, that platform shows **Not configured**.

Callback URLs — register these exactly:

| Platform | Callback |
|---|---|
| X | `https://maplestudios.co.in/api/connect/x/callback` |
| Instagram | `https://maplestudios.co.in/api/connect/instagram/callback` |
| LinkedIn | `https://maplestudios.co.in/api/connect/linkedin/callback` |

> The API endpoints and versions the publishers call are constants in
> `backend/src/lib/social/*.ts`. Platforms change these; if a connect or
> publish fails with an unexpected response, check those constants against the
> platform's current docs first.

## X

1. developer.x.com → create a Project and an App inside it.
2. User authentication settings → OAuth 2.0 on, type **Web App, Automated App
   or Bot** (a confidential client), callback URL above, website
   `https://maplestudios.co.in`.
3. Scopes used: `tweet.read tweet.write users.read offline.access`
   (offline.access gives the refresh token).
4. Copy **Client ID** and **Client Secret** → `X_CLIENT_ID`, `X_CLIENT_SECRET`.
5. Check the posting limit of the tier you're on; it has changed several
   times. The free tier has historically allowed a modest monthly write quota.

Phase 1 posts text only on X.

## Instagram

Instagram's API only publishes for **Business or Creator** accounts that are
**linked to a Facebook Page**. Do that in the Instagram app first
(Settings → Account type, then link the Page).

1. developers.facebook.com → Create app → type **Business**.
2. Add products **Facebook Login for Business** and **Instagram Graph API**.
3. Facebook Login → Settings → Valid OAuth Redirect URIs: the callback above.
4. App Roles → add yourself (admin/tester). In **development mode** your own
   linked account can connect and publish without App Review; review is only
   needed to publish for other people's accounts.
5. Permissions requested: `instagram_basic`, `instagram_content_publish`,
   `pages_show_list`, `pages_read_engagement`, `business_management`.
6. Settings → Basic → **App ID** and **App Secret** → `META_APP_ID`, `META_APP_SECRET`.

Instagram cannot publish a text-only post: every Instagram post needs at
least one image URL (the Media library's URLs work). Stories are not
available through the API.

## LinkedIn

1. linkedin.com/developers → Create app. It must be attached to a LinkedIn
   **Page** (your company page), and the page must verify the app.
2. Products → add **Sign In with LinkedIn using OpenID Connect** and **Share on
   LinkedIn** (both are self-serve).
3. Auth → Redirect URLs: the callback above.
4. Scopes used: `openid profile email w_member_social`.
5. **Client ID** and **Client Secret** → `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`.

This publishes to the connected **personal** profile. Posting as the company
page needs the Marketing Developer Platform (a separate approval) and is not
in Phase 1. LinkedIn tokens last ~60 days; the Social screen shows when a
reconnect is due.

### Outreach on LinkedIn is human-sent

LinkedIn has no API for connection requests or messages, and automating them
breaks its User Agreement (accounts get restricted). The Outreach screen
tracks targets, stages and follow-ups and renders the message from a
template; you send it from LinkedIn yourself and mark the stage.

## After filling `.env`

`ssh maple 'pm2 restart maple-studios-api --update-env'`, then open
`/admin/social` and press **Connect** for the platform.
