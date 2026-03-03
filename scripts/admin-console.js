const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const state = {
  baseUrl: (process.env.CHATX_ADMIN_SERVER || "https://chatx-production-cc2e.up.railway.app").replace(/\/+$/, ""),
  adminKey: process.env.CHATX_ADMIN_KEY || "",
};

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(String(answer || "").trim()));
  });
}

function toLimit(input, fallback = 50, max = 1000) {
  const num = Number(input || fallback);
  if (!Number.isFinite(num)) {
    return fallback;
  }

  return Math.min(Math.max(Math.floor(num), 1), max);
}

function shortId(value) {
  const str = String(value || "");
  if (str.length <= 10) {
    return str;
  }

  return `${str.slice(0, 8)}...`;
}

async function ensureConfig() {
  if (!state.baseUrl) {
    state.baseUrl = (await ask("Server URL: ")).replace(/\/+$/, "");
  }

  if (!state.adminKey) {
    state.adminKey = await ask("Admin key (CHATX_ADMIN_KEY): ");
  }

  if (!state.baseUrl || !state.adminKey) {
    throw new Error("Reikalingas Server URL ir Admin key");
  }
}

async function api(path, options = {}) {
  const headers = {
    "x-admin-key": state.adminKey,
    ...(options.body ? { "content-type": "application/json" } : {}),
  };

  const response = await fetch(`${state.baseUrl}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  let payload;
  try {
    payload = await response.json();
  } catch (_error) {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(payload?.error || `HTTP ${response.status}`);
  }

  return payload;
}

function printHeader() {
  console.clear();
  console.log("ChatX Admin Console");
  console.log(`Server: ${state.baseUrl}`);
  console.log("-".repeat(64));
}

function printMenu() {
  console.log("1) Summary");
  console.log("2) Users / logins");
  console.log("3) Audit logs");
  console.log("4) Messages");
  console.log("5) Reset user password");
  console.log("6) Change server/admin key");
  console.log("0) Exit");
}

async function showSummary() {
  const summary = await api("/api/admin/summary");

  console.log("\nSummary:");
  console.table([
    {
      users: summary.users,
      groups: summary.groups,
      channels: summary.channels,
      messages: summary.messages,
      onlineUsers: summary.onlineUsers,
    },
  ]);

  const recent = (summary.recentEvents || []).slice(0, 10).map((event) => ({
    at: event.createdAt,
    event: event.eventType,
    userId: shortId(event.userId || ""),
    email: event.email || "",
    groupId: shortId(event.groupId || ""),
    channelId: shortId(event.channelId || ""),
  }));

  console.log("Recent events:");
  if (recent.length === 0) {
    console.log("No events yet.");
  } else {
    console.table(recent);
  }
}

async function showUsers() {
  const query = await ask("Search (email/name, Enter to skip): ");
  const suffix = query ? `?q=${encodeURIComponent(query)}` : "";
  const data = await api(`/api/admin/users${suffix}`);

  const rows = (data.users || []).map((user) => ({
    id: shortId(user.id),
    displayName: user.displayName,
    email: user.email,
    loginCount: user.loginCount,
    lastLoginAt: user.lastLoginAt || "-",
    lastLoginIp: user.lastLoginIp || "-",
  }));

  if (rows.length === 0) {
    console.log("No users found.");
    return;
  }

  console.table(rows);
}

async function showAudit() {
  const limit = toLimit(await ask("Limit (default 100): "), 100);
  const eventType = await ask("Event type filter (Enter to skip): ");

  const query = new URLSearchParams({ limit: String(limit) });
  if (eventType) {
    query.set("eventType", eventType);
  }

  const data = await api(`/api/admin/audit?${query.toString()}`);
  const rows = (data.events || []).map((event) => ({
    at: event.createdAt,
    event: event.eventType,
    userId: shortId(event.userId || ""),
    email: event.email || "",
    ip: event.ip || "",
  }));

  if (rows.length === 0) {
    console.log("No audit events.");
    return;
  }

  console.table(rows);
}

async function showMessages() {
  const kindInput = (await ask("Kind (all/group/dm) [all]: ")).toLowerCase();
  const kind = ["all", "group", "dm"].includes(kindInput) ? kindInput : "all";
  const limit = toLimit(await ask("Limit (default 100): "), 100);

  const data = await api(`/api/admin/messages?kind=${kind}&limit=${limit}`);
  const rows = (data.messages || []).map((message) => ({
    at: message.createdAt,
    kind: message.kind,
    from: message.author?.displayName || "unknown",
    to: message.receiver?.displayName || "",
    group: shortId(message.groupId || ""),
    channel: shortId(message.channelId || ""),
    text: String(message.text || "").slice(0, 90),
  }));

  if (rows.length === 0) {
    console.log("No messages.");
    return;
  }

  console.table(rows);
}

async function resetPassword() {
  const userId = await ask("User ID: ");
  if (!userId) {
    console.log("User ID required.");
    return;
  }

  const newPassword = await ask("New password (Enter = auto generate): ");
  const body = newPassword ? { newPassword } : {};

  const result = await api(`/api/admin/users/${encodeURIComponent(userId)}/reset-password`, {
    method: "POST",
    body,
  });

  console.log("Password reset done:");
  console.table([
    {
      userId: shortId(result.user?.id),
      email: result.user?.email,
      temporaryPassword: result.temporaryPassword,
    },
  ]);
}

async function reconfigure() {
  const nextServer = await ask(`Server URL [${state.baseUrl}]: `);
  if (nextServer) {
    state.baseUrl = nextServer.replace(/\/+$/, "");
  }

  const nextKey = await ask("Admin key (Enter = keep current): ");
  if (nextKey) {
    state.adminKey = nextKey;
  }
}

async function waitForEnter() {
  await ask("\nEnter to continue...");
}

async function run() {
  try {
    await ensureConfig();
  } catch (error) {
    console.error(`Config error: ${error.message}`);
    rl.close();
    process.exit(1);
  }

  while (true) {
    printHeader();
    printMenu();

    const choice = await ask("\nChoose option: ");

    try {
      if (choice === "0") {
        break;
      }

      if (choice === "1") {
        await showSummary();
      } else if (choice === "2") {
        await showUsers();
      } else if (choice === "3") {
        await showAudit();
      } else if (choice === "4") {
        await showMessages();
      } else if (choice === "5") {
        await resetPassword();
      } else if (choice === "6") {
        await reconfigure();
      } else {
        console.log("Unknown option. Use 0-6.");
      }
    } catch (error) {
      console.log(`Error: ${error.message}`);
    }

    await waitForEnter();
  }

  rl.close();
}

run();
