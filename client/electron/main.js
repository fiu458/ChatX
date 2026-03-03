const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage } = require("electron");
const path = require("path");

const DEFAULT_SERVER =
  process.env.CHATX_SERVER_URL || "https://chatx-production-cc2e.up.railway.app";

let mainWindow = null;
let tray = null;
let isQuitting = false;

function showMainWindow() {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
}

function hideMainWindow() {
  if (!mainWindow) {
    return;
  }

  mainWindow.hide();
}

function getTrayIconPath() {
  const iconFile = process.platform === "win32" ? "icon.ico" : "icon.png";
  return path.join(__dirname, "../../build", iconFile);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
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

  mainWindow.loadFile(path.join(__dirname, "../ui/index.html"));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("close", (event) => {
    if (isQuitting) {
      return;
    }

    // Keep app running in background and hide to tray.
    event.preventDefault();
    hideMainWindow();
  });

  mainWindow.on("minimize", (event) => {
    // Minimize to tray for cleaner background behavior.
    event.preventDefault();
    hideMainWindow();
  });
}

function createTray() {
  const trayIcon = nativeImage.createFromPath(getTrayIconPath());
  tray = new Tray(trayIcon);
  tray.setToolTip("ChatX");

  const menu = Menu.buildFromTemplate([
    {
      label: "Open ChatX",
      click: () => showMainWindow(),
    },
    {
      type: "separator",
    },
    {
      label: "Quit",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(menu);
  tray.on("double-click", () => {
    showMainWindow();
  });
}

app.whenReady().then(() => {
  app.setAppUserModelId("com.chatx.desktop");

  ipcMain.handle("chatx:get-config", () => ({
    defaultServerUrl: DEFAULT_SERVER,
    appVersion: app.getVersion(),
  }));

  createMainWindow();
  createTray();

  app.on("activate", () => {
    showMainWindow();
  });
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("window-all-closed", () => {
  // Keep process alive for tray/background mode.
});
