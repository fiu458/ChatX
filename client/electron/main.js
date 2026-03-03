const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");

const DEFAULT_SERVER =
  process.env.CHATX_SERVER_URL || "https://chatx-production-cc2e.up.railway.app";

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    title: "ChatX",
    autoHideMenuBar: true,
    backgroundColor: "#0f111a",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadFile(path.join(__dirname, "../ui/index.html"));

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  ipcMain.handle("chatx:get-config", () => ({
    defaultServerUrl: DEFAULT_SERVER,
    appVersion: app.getVersion(),
  }));

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});