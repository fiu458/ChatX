# ChatX

`ChatX` yra Discord tipo Electron chat programa su Railway backend.

## Kas yra padaryta

- Prisijungimas/registracija su `email + password`
- Grupės (serveriai) ir tekstiniai kanalai
- Draugų sistema su friend request/accept
- DM (privatus chat tarp draugų)
- Realtime žinutės per `socket.io`
- Integruotas numatytas serveris: `https://chatx-production-cc2e.up.railway.app`
- Windows installer (`.exe`) su `ChatX` ikona

## Lokalios komandos

```bash
npm install
npm run dev:server
npm run dev:desktop
```

## Railway deploy (backend)

1. Į GitHub kelk visą projektą (be `node_modules`).
2. Railway -> `New Project` -> `Deploy from GitHub repo`.
3. Railway start komanda:

```bash
node server/index.js
```

4. Jei reikia, pridėk env:

```bash
CHATX_JWT_SECRET=very-long-random-secret
CHATX_ADMIN_KEY=very-long-admin-key
```

## Desktop installer build

```bash
npm install
npm run build:installer
```

Rezultatas bus `dist` aplanke (`ChatX Setup ... .exe`).

## Svarbios pastabos

- `server/data.json` naudojamas kaip paprasta local DB failų saugykla.
- Railway diskas gali būti laikinas (ephemeral), todėl rimtam production reikėtų Postgres.
- Jei nori pakeisti serverio URL desktop app'e, naudok `CHATX_SERVER_URL` env paleidimo metu.

## Admin monitoring (registracijos, login, žinutės)

`CHATX_ADMIN_KEY` leidžia pasiekti admin API. Slaptažodžiai plaintext formatu nerodomi.

### Gauti suvestinę

```bash
curl -H "x-admin-key: YOUR_ADMIN_KEY" https://chatx-production-cc2e.up.railway.app/api/admin/summary
```

### Vartotojai ir login istorija

```bash
curl -H "x-admin-key: YOUR_ADMIN_KEY" https://chatx-production-cc2e.up.railway.app/api/admin/users
```

### Audit įvykiai (register/login/message/socket)

```bash
curl -H "x-admin-key: YOUR_ADMIN_KEY" "https://chatx-production-cc2e.up.railway.app/api/admin/audit?limit=200"
```

### Visos žinutės (group + dm)

```bash
curl -H "x-admin-key: YOUR_ADMIN_KEY" "https://chatx-production-cc2e.up.railway.app/api/admin/messages?kind=all&limit=200"
```

### Jei vartotojas pamiršo slaptažodį (admin reset)

```bash
curl -X POST -H "x-admin-key: YOUR_ADMIN_KEY" -H "Content-Type: application/json" \
  -d "{\"newPassword\":\"NewSecure123\"}" \
  https://chatx-production-cc2e.up.railway.app/api/admin/users/USER_ID/reset-password
```

## Interaktyvi admin konsole (1/2/3 meniu)

Paleisk:

```bash
npm run admin:console
```

Skriptas veikia per meniu:

- `1` Summary
- `2` Users / login istorija
- `3` Audit logs (register/login/messages/socket)
- `4` Messages
- `5` Reset user password
- `6` Keisti serveri arba admin key
- `0` Exit

Numatyti env:

```bash
CHATX_ADMIN_SERVER=https://chatx-production-cc2e.up.railway.app
CHATX_ADMIN_KEY=your-admin-key
```

Pastaba apie SSH:

- Railway paprastai neduoda nuolatinio klasikinio SSH.
- Vietoj to naudok Railway shell/CLI arba paleisk sia admin konsole savo kompiuteryje.
