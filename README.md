# ChatX

ChatX is a desktop Electron chat app with a Railway backend.

## Features

- Email + password account system
- Email verification flow (register -> verify -> login)
- Group servers and text channels
- Friend requests and DM chat
- Realtime messaging with Socket.IO
- Desktop app installer (.exe)
- React Native mobile app project (Expo) with APK build profile

## Desktop app (Electron)

Run locally:

```bash
npm install
npm run dev:server
npm run dev:desktop
```

Build Windows installer:

```bash
npm install
npm run build:installer
```

Installer output:

- `dist/ChatX Setup 2.0.0.exe`

## Railway backend deploy

1. Push the project to GitHub.
2. Railway -> New Project -> Deploy from GitHub repo.
3. Start command:

```bash
node server/index.js
```

4. Required env vars:

```bash
CHATX_JWT_SECRET=very-long-random-secret
CHATX_PUBLIC_BASE_URL=https://chatx-production-cc2e.up.railway.app
```

## Email verification setup (SMTP)

Add SMTP variables in Railway:

```bash
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_user
SMTP_PASS=your_password
SMTP_FROM="ChatX <no-reply@yourdomain.com>"
```

Notes:

- If SMTP is configured, verification email is sent automatically.
- If SMTP is missing, API returns a temporary `verificationPreviewUrl` for testing.

## Mobile app (React Native / Expo)

Folder:

- `mobile/`

Install and run:

```bash
cd mobile
npm install
npm run start
```

Build Android APK (Expo EAS cloud build):

```bash
cd mobile
npm install -g eas-cli
npx eas login
npm run build:apk
```

APK build profile is already configured in `mobile/eas.json` (`preview` -> `apk`).

## Important notes

- Local DB is file based (`server/data.json`).
- On Railway, file storage can be ephemeral. For stable production data use PostgreSQL.
- Desktop app keeps the session token locally, so account stays logged in between launches.
