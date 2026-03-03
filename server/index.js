const express = require("express");
const http = require("http");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, "data.json");
const JWT_SECRET = process.env.CHATX_JWT_SECRET || "chatx-dev-secret-change-me";
const ADMIN_KEY = process.env.CHATX_ADMIN_KEY || "";
const MAX_AUDIT_LOGS = 20000;
const AVATAR_COLORS = [
  "#7c8bff",
  "#6fd3ff",
  "#7dffb3",
  "#ffd47d",
  "#ff9b7d",
  "#ff7db8",
  "#cb8bff",
  "#95a6ff",
];

const runtime = {
  socketsByUser: new Map(),
};

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "1mb" }));

function nowIso() {
  return new Date().toISOString();
}

function createEmptyDb() {
  return {
    users: [],
    friendRequests: [],
    friendships: [],
    groups: [],
    groupMembers: [],
    channels: [],
    messages: [],
    auditLogs: [],
  };
}

function saveDb() {
  fs.writeFileSync(DB_PATH, `${JSON.stringify(db, null, 2)}\n`, "utf8");
}

function loadDb() {
  if (!fs.existsSync(DB_PATH)) {
    const fresh = createEmptyDb();
    fs.writeFileSync(DB_PATH, `${JSON.stringify(fresh, null, 2)}\n`, "utf8");
    return fresh;
  }

  try {
    const raw = fs.readFileSync(DB_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return {
      ...createEmptyDb(),
      ...parsed,
    };
  } catch (_error) {
    const backupPath = `${DB_PATH}.broken-${Date.now()}`;
    fs.copyFileSync(DB_PATH, backupPath);
    const fresh = createEmptyDb();
    fs.writeFileSync(DB_PATH, `${JSON.stringify(fresh, null, 2)}\n`, "utf8");
    return fresh;
  }
}

function ensureDbShape(rawDb) {
  const seeded = {
    ...createEmptyDb(),
    ...rawDb,
  };

  seeded.users = seeded.users.map((user) => ({
    ...user,
    loginCount: Number(user.loginCount || 0),
    lastLoginAt: user.lastLoginAt || null,
    lastLoginIp: user.lastLoginIp || null,
    lastUserAgent: user.lastUserAgent || null,
  }));

  if (!Array.isArray(seeded.auditLogs)) {
    seeded.auditLogs = [];
  }

  if (seeded.auditLogs.length > MAX_AUDIT_LOGS) {
    seeded.auditLogs = seeded.auditLogs.slice(-MAX_AUDIT_LOGS);
  }

  return seeded;
}

let db = ensureDbShape(loadDb());

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function sanitizeDisplayName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 32);
}

function sanitizeGroupOrChannelName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 32);
}

function sanitizeText(value) {
  return String(value || "").trim().slice(0, 2000);
}

function parseLimit(value, fallback = 100, max = 500) {
  return Math.min(Math.max(Number(value || fallback), 1), max);
}

function pickUser(user, includeEmail = false) {
  return {
    id: user.id,
    displayName: user.displayName,
    avatarColor: user.avatarColor,
    createdAt: user.createdAt,
    ...(includeEmail ? { email: user.email } : {}),
  };
}

function pickUserAdmin(user) {
  return {
    id: user.id,
    email: user.email,
    emailMasked: maskEmail(user.email),
    displayName: user.displayName,
    avatarColor: user.avatarColor,
    createdAt: user.createdAt,
    loginCount: Number(user.loginCount || 0),
    lastLoginAt: user.lastLoginAt || null,
    lastLoginIp: user.lastLoginIp || null,
    lastUserAgent: user.lastUserAgent || null,
  };
}

function getUserById(userId) {
  return db.users.find((user) => user.id === userId) || null;
}

function getUserByEmail(email) {
  const safeEmail = normalizeEmail(email);
  return db.users.find((user) => user.email === safeEmail) || null;
}

function issueToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: "14d" });
}

function parseBearerToken(req) {
  const header = req.header("authorization") || "";
  const parts = header.split(" ");
  if (parts.length === 2 && parts[0].toLowerCase() === "bearer") {
    return parts[1];
  }

  return null;
}

function authMiddleware(req, res, next) {
  const token = parseBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: "Auth required" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = getUserById(payload.sub);
    if (!user) {
      return res.status(401).json({ error: "Invalid token" });
    }

    req.user = user;
    return next();
  } catch (_error) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

function adminMiddleware(req, res, next) {
  if (!ADMIN_KEY) {
    return res.status(503).json({ error: "Admin API is disabled (CHATX_ADMIN_KEY missing)" });
  }

  const key = String(req.header("x-admin-key") || "").trim();
  if (!key || key !== ADMIN_KEY) {
    return res.status(403).json({ error: "Invalid admin key" });
  }

  return next();
}

function requestIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "");
  const fromForwarded = forwarded.split(",")[0].trim();
  return fromForwarded || req.socket?.remoteAddress || null;
}

function requestAgent(req) {
  return String(req.headers["user-agent"] || "").slice(0, 300);
}

function pushAudit(eventType, payload = {}) {
  db.auditLogs.push({
    id: randomUUID(),
    eventType,
    createdAt: nowIso(),
    ...payload,
  });

  if (db.auditLogs.length > MAX_AUDIT_LOGS) {
    db.auditLogs = db.auditLogs.slice(-MAX_AUDIT_LOGS);
  }
}

function maskEmail(email) {
  const value = String(email || "");
  const [local, domain] = value.split("@");
  if (!local || !domain) {
    return value;
  }

  if (local.length <= 2) {
    return `${local[0] || "*"}*@${domain}`;
  }

  return `${local[0]}${"*".repeat(Math.max(local.length - 2, 1))}${local.slice(-1)}@${domain}`;
}

function getGroupMembership(userId, groupId) {
  return db.groupMembers.find(
    (member) => member.userId === userId && member.groupId === groupId
  );
}

function isGroupMember(userId, groupId) {
  return Boolean(getGroupMembership(userId, groupId));
}

function channelsForGroup(groupId) {
  return db.channels
    .filter((channel) => channel.groupId === groupId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function membersForGroup(groupId) {
  return db.groupMembers
    .filter((member) => member.groupId === groupId)
    .map((member) => getUserById(member.userId))
    .filter(Boolean)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function groupIdsForUser(userId) {
  return db.groupMembers
    .filter((member) => member.userId === userId)
    .map((member) => member.groupId);
}

function getOnlineUserIds() {
  return Array.from(runtime.socketsByUser.entries())
    .filter(([, sockets]) => sockets.size > 0)
    .map(([userId]) => userId);
}

function friendshipKey(userA, userB) {
  return [userA, userB].sort().join("::");
}

function areFriends(userA, userB) {
  const key = friendshipKey(userA, userB);
  return db.friendships.some((friendship) => friendship.key === key);
}

function createFriendship(userA, userB) {
  const key = friendshipKey(userA, userB);
  if (db.friendships.some((friendship) => friendship.key === key)) {
    return;
  }

  db.friendships.push({
    id: randomUUID(),
    key,
    userA,
    userB,
    createdAt: nowIso(),
  });
}

function friendsForUser(userId) {
  return db.friendships
    .filter((friendship) => friendship.userA === userId || friendship.userB === userId)
    .map((friendship) => (friendship.userA === userId ? friendship.userB : friendship.userA))
    .map((otherId) => getUserById(otherId))
    .filter(Boolean)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function incomingFriendRequests(userId) {
  return db.friendRequests
    .filter((request) => request.toUserId === userId && request.status === "pending")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function groupSummaryForUser(group, userId) {
  if (!isGroupMember(userId, group.id)) {
    return null;
  }

  const channels = channelsForGroup(group.id);
  const members = membersForGroup(group.id).map((member) => pickUser(member));

  return {
    id: group.id,
    name: group.name,
    ownerId: group.ownerId,
    inviteCode: group.inviteCode,
    createdAt: group.createdAt,
    channels,
    members,
  };
}

function buildBootstrap(userId) {
  const me = getUserById(userId);
  const groups = db.groups
    .map((group) => groupSummaryForUser(group, userId))
    .filter(Boolean)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const friends = friendsForUser(userId).map((friend) => pickUser(friend));
  const requests = incomingFriendRequests(userId).map((request) => ({
    id: request.id,
    createdAt: request.createdAt,
    from: pickUser(getUserById(request.fromUserId)),
  }));

  return {
    me: pickUser(me, true),
    groups,
    friends,
    friendRequests: requests,
    onlineUserIds: getOnlineUserIds(),
  };
}

function getDmRoom(userA, userB) {
  const [first, second] = [userA, userB].sort();
  return `dm:${first}:${second}`;
}

function trimMessageHistory() {
  const maxMessages = 12000;
  if (db.messages.length > maxMessages) {
    db.messages = db.messages.slice(db.messages.length - maxMessages);
  }
}

function emitToUser(userId, eventName, payload) {
  const sockets = runtime.socketsByUser.get(userId);
  if (!sockets || sockets.size === 0) {
    return;
  }

  sockets.forEach((socketId) => {
    io.to(socketId).emit(eventName, payload);
  });
}

function serializeGroupMessage(message) {
  const author = getUserById(message.fromUserId);
  return {
    id: message.id,
    kind: message.kind,
    groupId: message.groupId,
    channelId: message.channelId,
    text: message.text,
    createdAt: message.createdAt,
    author: author ? pickUser(author) : null,
  };
}

function serializeDmMessage(message) {
  const author = getUserById(message.fromUserId);
  return {
    id: message.id,
    kind: message.kind,
    toUserId: message.toUserId,
    text: message.text,
    createdAt: message.createdAt,
    author: author ? pickUser(author) : null,
  };
}

function serializeAdminMessage(message) {
  const author = getUserById(message.fromUserId);
  const receiver = message.kind === "dm" ? getUserById(message.toUserId) : null;

  return {
    id: message.id,
    kind: message.kind,
    groupId: message.groupId || null,
    channelId: message.channelId || null,
    toUserId: message.toUserId || null,
    text: message.text,
    createdAt: message.createdAt,
    author: author ? pickUserAdmin(author) : null,
    receiver: receiver ? pickUserAdmin(receiver) : null,
  };
}

app.get("/", (_req, res) => {
  res.json({
    app: "ChatX",
    status: "ok",
    timestamp: nowIso(),
  });
});

app.post("/api/auth/register", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || "");
  const displayName = sanitizeDisplayName(req.body?.displayName);
  const ip = requestIp(req);
  const userAgent = requestAgent(req);

  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "Valid email is required" });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  if (displayName.length < 2) {
    return res.status(400).json({ error: "Display name must be at least 2 characters" });
  }

  if (getUserByEmail(email)) {
    return res.status(409).json({ error: "Email already used" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = {
    id: randomUUID(),
    email,
    passwordHash,
    displayName,
    avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
    createdAt: nowIso(),
    loginCount: 0,
    lastLoginAt: null,
    lastLoginIp: null,
    lastUserAgent: null,
  };

  db.users.push(user);
  pushAudit("auth.register", {
    userId: user.id,
    email: user.email,
    ip,
    userAgent,
  });
  saveDb();

  return res.status(201).json({
    token: issueToken(user.id),
    user: pickUser(user, true),
  });
});

app.post("/api/auth/login", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || "");
  const user = getUserByEmail(email);
  const ip = requestIp(req);
  const userAgent = requestAgent(req);

  if (!user) {
    pushAudit("auth.login_failed", {
      email,
      reason: "user_not_found",
      ip,
      userAgent,
    });
    saveDb();
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    pushAudit("auth.login_failed", {
      userId: user.id,
      email: user.email,
      reason: "bad_password",
      ip,
      userAgent,
    });
    saveDb();
    return res.status(401).json({ error: "Invalid email or password" });
  }

  user.lastLoginAt = nowIso();
  user.loginCount = Number(user.loginCount || 0) + 1;
  user.lastLoginIp = ip;
  user.lastUserAgent = userAgent;
  pushAudit("auth.login_success", {
    userId: user.id,
    email: user.email,
    ip,
    userAgent,
  });
  saveDb();

  return res.json({
    token: issueToken(user.id),
    user: pickUser(user, true),
  });
});

app.get("/api/bootstrap", authMiddleware, (req, res) => {
  return res.json(buildBootstrap(req.user.id));
});

app.post("/api/groups", authMiddleware, (req, res) => {
  const name = sanitizeGroupOrChannelName(req.body?.name);
  if (name.length < 2) {
    return res.status(400).json({ error: "Group name must be at least 2 characters" });
  }

  const groupId = randomUUID();
  const group = {
    id: groupId,
    name,
    ownerId: req.user.id,
    inviteCode: randomUUID().replace(/-/g, "").slice(0, 10),
    createdAt: nowIso(),
  };

  db.groups.push(group);
  db.groupMembers.push({
    id: randomUUID(),
    groupId,
    userId: req.user.id,
    role: "owner",
    createdAt: nowIso(),
  });

  db.channels.push({
    id: randomUUID(),
    groupId,
    name: "general",
    createdAt: nowIso(),
  });

  pushAudit("group.created", {
    groupId,
    groupName: group.name,
    actorUserId: req.user.id,
  });
  saveDb();
  emitToUser(req.user.id, "groups_update", { groupId });

  return res.status(201).json({
    group: groupSummaryForUser(group, req.user.id),
  });
});

app.post("/api/groups/:groupId/channels", authMiddleware, (req, res) => {
  const groupId = req.params.groupId;
  const name = sanitizeGroupOrChannelName(req.body?.name).toLowerCase();

  if (!isGroupMember(req.user.id, groupId)) {
    return res.status(403).json({ error: "Not a group member" });
  }

  if (name.length < 2) {
    return res.status(400).json({ error: "Channel name must be at least 2 characters" });
  }

  const alreadyExists = db.channels.some(
    (channel) => channel.groupId === groupId && channel.name.toLowerCase() === name
  );

  if (alreadyExists) {
    return res.status(409).json({ error: "Channel already exists" });
  }

  const channel = {
    id: randomUUID(),
    groupId,
    name,
    createdAt: nowIso(),
  };

  db.channels.push(channel);
  pushAudit("channel.created", {
    groupId,
    channelId: channel.id,
    channelName: channel.name,
    actorUserId: req.user.id,
  });
  saveDb();

  io.to(`group:${groupId}`).emit("channel_created", {
    groupId,
    channel,
  });

  return res.status(201).json({ channel });
});

app.get("/api/groups/:groupId/members", authMiddleware, (req, res) => {
  const groupId = req.params.groupId;

  if (!isGroupMember(req.user.id, groupId)) {
    return res.status(403).json({ error: "Not a group member" });
  }

  const members = membersForGroup(groupId).map((member) => pickUser(member));
  return res.json({ members });
});

app.get("/api/groups/:groupId/channels/:channelId/messages", authMiddleware, (req, res) => {
  const groupId = req.params.groupId;
  const channelId = req.params.channelId;
  const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 150);

  if (!isGroupMember(req.user.id, groupId)) {
    return res.status(403).json({ error: "Not a group member" });
  }

  const channel = db.channels.find(
    (item) => item.groupId === groupId && item.id === channelId
  );

  if (!channel) {
    return res.status(404).json({ error: "Channel not found" });
  }

  const messages = db.messages
    .filter(
      (message) =>
        message.kind === "group" &&
        message.groupId === groupId &&
        message.channelId === channelId
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(-limit)
    .map((message) => serializeGroupMessage(message));

  return res.json({ messages });
});

app.get("/api/friends", authMiddleware, (req, res) => {
  const friends = friendsForUser(req.user.id).map((friend) => pickUser(friend));
  return res.json({ friends });
});

app.get("/api/friends/requests", authMiddleware, (req, res) => {
  const requests = incomingFriendRequests(req.user.id).map((request) => ({
    id: request.id,
    createdAt: request.createdAt,
    from: pickUser(getUserById(request.fromUserId)),
  }));

  return res.json({ requests });
});

app.post("/api/friends/request", authMiddleware, (req, res) => {
  const targetEmail = normalizeEmail(req.body?.email);
  const targetUser = getUserByEmail(targetEmail);

  if (!targetUser) {
    return res.status(404).json({ error: "User with this email was not found" });
  }

  if (targetUser.id === req.user.id) {
    return res.status(400).json({ error: "Cannot add yourself" });
  }

  if (areFriends(req.user.id, targetUser.id)) {
    return res.status(409).json({ error: "Already friends" });
  }

  const existingPending = db.friendRequests.find(
    (request) =>
      request.status === "pending" &&
      ((request.fromUserId === req.user.id && request.toUserId === targetUser.id) ||
        (request.fromUserId === targetUser.id && request.toUserId === req.user.id))
  );

  if (existingPending && existingPending.fromUserId === req.user.id) {
    return res.status(409).json({ error: "Request already sent" });
  }

  if (existingPending && existingPending.fromUserId === targetUser.id) {
    existingPending.status = "accepted";
    existingPending.updatedAt = nowIso();
    createFriendship(req.user.id, targetUser.id);
    saveDb();

    emitToUser(req.user.id, "social_update", { kind: "friend_accept" });
    emitToUser(targetUser.id, "social_update", { kind: "friend_accept" });

    return res.json({ status: "accepted" });
  }

  db.friendRequests.push({
    id: randomUUID(),
    fromUserId: req.user.id,
    toUserId: targetUser.id,
    status: "pending",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });

  saveDb();
  emitToUser(targetUser.id, "social_update", { kind: "friend_request" });

  return res.status(201).json({ status: "pending" });
});

app.post("/api/friends/requests/:requestId/accept", authMiddleware, (req, res) => {
  const request = db.friendRequests.find(
    (item) =>
      item.id === req.params.requestId &&
      item.toUserId === req.user.id &&
      item.status === "pending"
  );

  if (!request) {
    return res.status(404).json({ error: "Friend request not found" });
  }

  request.status = "accepted";
  request.updatedAt = nowIso();
  createFriendship(request.fromUserId, request.toUserId);
  saveDb();

  emitToUser(req.user.id, "social_update", { kind: "friend_accept" });
  emitToUser(request.fromUserId, "social_update", { kind: "friend_accept" });

  return res.json({ status: "accepted" });
});

app.get("/api/dm/:friendId/messages", authMiddleware, (req, res) => {
  const friendId = req.params.friendId;
  const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 150);

  if (!areFriends(req.user.id, friendId)) {
    return res.status(403).json({ error: "Not friends" });
  }

  const messages = db.messages
    .filter(
      (message) =>
        message.kind === "dm" &&
        ((message.fromUserId === req.user.id && message.toUserId === friendId) ||
          (message.fromUserId === friendId && message.toUserId === req.user.id))
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(-limit)
    .map((message) => serializeDmMessage(message));

  return res.json({ messages });
});

app.get("/api/admin/summary", adminMiddleware, (_req, res) => {
  const lastEvents = db.auditLogs.slice(-20).reverse();
  return res.json({
    users: db.users.length,
    groups: db.groups.length,
    channels: db.channels.length,
    messages: db.messages.length,
    onlineUsers: getOnlineUserIds().length,
    recentEvents: lastEvents,
  });
});

app.get("/api/admin/users", adminMiddleware, (req, res) => {
  const query = String(req.query.q || "")
    .trim()
    .toLowerCase();

  const users = db.users
    .filter((user) => {
      if (!query) {
        return true;
      }

      return (
        user.email.toLowerCase().includes(query) ||
        user.displayName.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      const aTime = a.lastLoginAt || a.createdAt;
      const bTime = b.lastLoginAt || b.createdAt;
      return bTime.localeCompare(aTime);
    })
    .map((user) => pickUserAdmin(user));

  return res.json({ users });
});

app.get("/api/admin/audit", adminMiddleware, (req, res) => {
  const limit = parseLimit(req.query.limit, 150, 1000);
  const eventType = String(req.query.eventType || "").trim();

  const events = db.auditLogs
    .filter((event) => !eventType || event.eventType === eventType)
    .slice(-limit)
    .reverse();

  return res.json({ events });
});

app.get("/api/admin/messages", adminMiddleware, (req, res) => {
  const limit = parseLimit(req.query.limit, 200, 1000);
  const kind = String(req.query.kind || "all").trim().toLowerCase();

  const messages = db.messages
    .filter((message) => (kind === "all" ? true : message.kind === kind))
    .slice(-limit)
    .reverse()
    .map((message) => serializeAdminMessage(message));

  return res.json({ messages });
});

app.post("/api/admin/users/:userId/reset-password", adminMiddleware, async (req, res) => {
  const user = getUserById(req.params.userId);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  let newPassword = String(req.body?.newPassword || "").trim();
  if (!newPassword) {
    newPassword = randomUUID().replace(/-/g, "").slice(0, 12);
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: "New password must be at least 6 characters" });
  }

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  pushAudit("auth.password_reset_by_admin", {
    userId: user.id,
    email: user.email,
  });
  saveDb();

  return res.json({
    ok: true,
    user: pickUserAdmin(user),
    temporaryPassword: newPassword,
  });
});

io.use((socket, next) => {
  const token = socket.handshake?.auth?.token;
  if (!token) {
    return next(new Error("unauthorized"));
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = getUserById(payload.sub);
    if (!user) {
      return next(new Error("unauthorized"));
    }

    socket.data.userId = user.id;
    return next();
  } catch (_error) {
    return next(new Error("unauthorized"));
  }
});

io.on("connection", (socket) => {
  const userId = socket.data.userId;
  const set = runtime.socketsByUser.get(userId) || new Set();
  const wasOffline = set.size === 0;

  set.add(socket.id);
  runtime.socketsByUser.set(userId, set);

  pushAudit("socket.connected", {
    userId,
    socketId: socket.id,
  });

  if (wasOffline) {
    io.emit("presence_update", {
      userId,
      online: true,
    });
  }

  socket.on("join_group_channel", ({ groupId, channelId }) => {
    if (!isGroupMember(userId, groupId)) {
      return;
    }

    const channel = db.channels.find(
      (item) => item.groupId === groupId && item.id === channelId
    );

    if (!channel) {
      return;
    }

    socket.join(`group:${groupId}`);
    socket.join(`group:${groupId}:channel:${channelId}`);
  });

  socket.on("send_group_message", ({ groupId, channelId, text }) => {
    if (!isGroupMember(userId, groupId)) {
      return;
    }

    const channel = db.channels.find(
      (item) => item.groupId === groupId && item.id === channelId
    );

    if (!channel) {
      return;
    }

    const safeText = sanitizeText(text);
    if (!safeText) {
      return;
    }

    const message = {
      id: randomUUID(),
      kind: "group",
      groupId,
      channelId,
      fromUserId: userId,
      text: safeText,
      createdAt: nowIso(),
    };

    db.messages.push(message);
    trimMessageHistory();
    pushAudit("message.group_sent", {
      messageId: message.id,
      groupId,
      channelId,
      fromUserId: userId,
    });
    saveDb();

    io.to(`group:${groupId}:channel:${channelId}`).emit(
      "group_message",
      serializeGroupMessage(message)
    );
  });

  socket.on("open_dm", ({ friendId }) => {
    if (!areFriends(userId, friendId)) {
      return;
    }

    socket.join(getDmRoom(userId, friendId));
  });

  socket.on("send_dm_message", ({ friendId, text }) => {
    if (!areFriends(userId, friendId)) {
      return;
    }

    const safeText = sanitizeText(text);
    if (!safeText) {
      return;
    }

    const message = {
      id: randomUUID(),
      kind: "dm",
      fromUserId: userId,
      toUserId: friendId,
      text: safeText,
      createdAt: nowIso(),
    };

    db.messages.push(message);
    trimMessageHistory();
    pushAudit("message.dm_sent", {
      messageId: message.id,
      fromUserId: userId,
      toUserId: friendId,
    });
    saveDb();

    io.to(getDmRoom(userId, friendId)).emit("dm_message", serializeDmMessage(message));
  });

  socket.on("disconnect", () => {
    const sockets = runtime.socketsByUser.get(userId);
    if (!sockets) {
      return;
    }

    sockets.delete(socket.id);
    pushAudit("socket.disconnected", {
      userId,
      socketId: socket.id,
    });
    if (sockets.size === 0) {
      runtime.socketsByUser.delete(userId);
      io.emit("presence_update", {
        userId,
        online: false,
      });
    }
  });
});

server.listen(PORT, () => {
  console.log(`ChatX server running on port ${PORT}`);
});
