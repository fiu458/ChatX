# ChatX

Moderni Electron chat programa su realtime serveriu (`socket.io`) ir Railway deploy palaikymu.

## 1) Lokalus paleidimas (su terminalu)

```bash
npm install
npm run dev:server
```

Naujame terminale:

```bash
npm run dev:desktop
```

Serveris: `http://localhost:3000`

## 2) Railway deploy (jei nori online serverio)

### Variantas A: Be terminalo (tik Railway UI)

1. Ikelk projektą į GitHub.
2. Railway: `New Project` -> `Deploy from GitHub repo` -> pasirink šį repo.
3. `Variables` skiltyje nieko papildomai nereikia.
4. Railway automatiškai naudos `railway.json` ir paleis `node server/index.js`.
5. Nukopijuok Railway URL, pvz. `https://chatx-production.up.railway.app`.
6. Electron programoje į `Server URL` įrašyk tą adresą ir spausk `Prisijungti`.

### Variantas B: Su Railway CLI (jei turi terminalą)

```bash
npm i -g @railway/cli
railway login
railway init
railway up
```

Po deploy gausi viešą URL, jį įrašyk į ChatX `Server URL` lauką.

## 3) Ką rašyti, jei Railway prašo Start Command

```bash
node server/index.js
```

## Programos struktūra

- `server/index.js` - realtime serveris
- `client/electron/main.js` - Electron langas
- `client/electron/preload.js` - saugus bridge į renderer
- `client/ui/*` - modernus ChatX UI
