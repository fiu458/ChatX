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