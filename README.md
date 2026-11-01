# iot-discord-bot

Discord Bot for IOT - IMIN Olympia Training.

It links Discord members to their IOT accounts (roles by permission, rank and plan),
runs the account review and report-vote workflow, manages support case channels, mirrors IOT revise rooms as voice
channels, and exposes a few HTTP webhooks for IOT services.

## Requirements

- Node.js 26 (see `.nvmrc`). Node runs the TypeScript sources directly, so there is no build step.
- A Discord bot with the **Message Content** privileged intent enabled in the Developer Portal.
- Firebase credentials for the IOT project, and Google Cloud credentials for Translate.

## Setup

```sh
npm ci
cp .env.example .env   # then fill in the values
npm run deploy-command # register slash commands in the guild (once, or after changing them)
npm start
```

All configuration comes from environment variables, validated at startup; see
[`.env.example`](.env.example). Never commit `.env` or any credential file.

For local profile-card rendering without a system Chromium, run
`npx puppeteer browsers install chrome` once.

## Development

```sh
npm run dev        # restart on file changes
npm run typecheck  # tsc --noEmit (strict)
npm run lint       # ESLint with type-aware rules
npm test           # Vitest
npm run check      # all of the above
```

## Layout

| Path | What it does |
| --- | --- |
| `src/main.ts` | Wires everything together: Discord client, schedules, Firebase listeners, HTTP server |
| `src/env.ts` | Environment validation |
| `src/firebase.ts` | Firebase Admin setup and user lookups |
| `src/iot/socket-client.ts` | RPC client for `iot_socket` |
| `src/iot/revise-rooms.ts` | Syncs revise rooms to voice channels |
| `src/discord/slash-commands.ts` | `/ping`, `/server`, `/iot`, `/support`, ... |
| `src/discord/text-commands.ts` | `/acc`, `/review`, `/link`, ... typed in staff channels |
| `src/discord/buttons.ts`, `votes.ts` | Review buttons and report voting |
| `src/http/server.ts` | HTTP webhooks |

## Scheduled jobs

- Every 6 hours: clear `#iot-updates` and repost the accounts waiting for review.
- Daily at 03:00 (and once at startup): delete `case_*` support channels in "help channels" with no message for more than 14 days.

## HTTP endpoints

| Endpoint | Auth | Purpose |
| --- | --- | --- |
| `POST /send_dm` | `Authorization: Bearer $WEBHOOK_SECRET` | DM a Discord user: `{ "uid": "<discord id>", "message": "..." }`. Disabled when `WEBHOOK_SECRET` is unset. |
| `POST /iot_chat` | none | Relays revise-room chat to `#iot-chat` |
| `POST /discord_webhook` | none | Posts deploy notifications to `#updates` |

## Docker

```sh
docker build . -t iot/iot-discord-bot
docker run -d --name iot-discord-bot --restart always -p 8080:8080 --env-file .env iot/iot-discord-bot
```
