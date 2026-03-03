const state = {
  serverUrl: "",
  appVersion: "",
  token: localStorage.getItem("chatx_token") || "",
  me: null,
  socket: null,
  groups: [],
  friends: [],
  friendRequests: [],
  onlineUserIds: new Set(),
  sidebarMode: "channels",
  mode: null,
  activeGroupId: null,
  activeChannelId: null,
  activeDmUserId: null,
  messages: [],
  refreshTimer: null,
};

const els = {
  statusToast: document.getElementById("statusToast"),
  authView: document.getElementById("authView"),
  appView: document.getElementById("appView"),
  showLoginBtn: document.getElementById("showLoginBtn"),
  showRegisterBtn: document.getElementById("showRegisterBtn"),
  loginForm: document.getElementById("loginForm"),
  registerForm: document.getElementById("registerForm"),
  loginEmail: document.getElementById("loginEmail"),
  loginPassword: document.getElementById("loginPassword"),
  registerName: document.getElementById("registerName"),
  registerEmail: document.getElementById("registerEmail"),
  registerPassword: document.getElementById("registerPassword"),
  serverBadge: document.getElementById("serverBadge"),
  homeButton: document.getElementById("homeButton"),
  serverList: document.getElementById("serverList"),
  createGroupBtn: document.getElementById("createGroupBtn"),
  railTitle: document.getElementById("railTitle"),
  railSubtitle: document.getElementById("railSubtitle"),
  toggleFriendsBtn: document.getElementById("toggleFriendsBtn"),
  addChannelBtn: document.getElementById("addChannelBtn"),
  leftSectionTitle: document.getElementById("leftSectionTitle"),
  addFriendBtn: document.getElementById("addFriendBtn"),
  leftList: document.getElementById("leftList"),
  requestList: document.getElementById("requestList"),
  profileCard: document.getElementById("profileCard"),
  logoutBtn: document.getElementById("logoutBtn"),
  chatTitle: document.getElementById("chatTitle"),
  chatSubtitle: document.getElementById("chatSubtitle"),
  connectionBadge: document.getElementById("connectionBadge"),
  messageList: document.getElementById("messageList"),
  composerForm: document.getElementById("composerForm"),
  messageInput: document.getElementById("messageInput"),
  sendBtn: document.getElementById("sendBtn"),
  memberCount: document.getElementById("memberCount"),
  memberList: document.getElementById("memberList"),
  appVersion: document.getElementById("appVersion"),
};

let toastTimer = null;

function showToast(text, isError = false) {
  clearTimeout(toastTimer);
  els.statusToast.textContent = text;
  els.statusToast.classList.remove("hidden");
  els.statusToast.classList.toggle("error", isError);

  toastTimer = setTimeout(() => {
    els.statusToast.classList.add("hidden");
    els.statusToast.classList.remove("error");
  }, 2800);
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function setAuthMode(mode) {
  const isLogin = mode === "login";
  els.showLoginBtn.classList.toggle("active", isLogin);
  els.showRegisterBtn.classList.toggle("active", !isLogin);
  els.loginForm.classList.toggle("hidden", !isLogin);
  els.registerForm.classList.toggle("hidden", isLogin);
}

function setViewAuthenticated(isAuthenticated) {
  els.authView.classList.toggle("hidden", isAuthenticated);
  els.appView.classList.toggle("hidden", !isAuthenticated);
}

function setConnectionState(connected) {
  els.connectionBadge.classList.toggle("online", connected);
  els.connectionBadge.classList.toggle("offline", !connected);
  els.connectionBadge.textContent = connected ? "Prisijungta" : "Atsijungta";
  updateComposerState();
}

function initialFromName(name) {
  return (name || "?").charAt(0).toUpperCase();
}

function getActiveGroup() {
  return state.groups.find((group) => group.id === state.activeGroupId) || null;
}

function getActiveChannel() {
  const group = getActiveGroup();
  if (!group) {
    return null;
  }

  return group.channels.find((channel) => channel.id === state.activeChannelId) || null;
}

function getFriendById(friendId) {
  return state.friends.find((friend) => friend.id === friendId) || null;
}

function isOnline(userId) {
  return state.onlineUserIds.has(userId);
}

async function api(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(`${state.serverUrl}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (_error) {
    payload = null;
  }

  if (!response.ok) {
    const message = payload?.error || `HTTP ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

function renderProfileCard() {
  if (!state.me) {
    els.profileCard.innerHTML = "";
    return;
  }

  els.profileCard.innerHTML = "";

  const name = document.createElement("p");
  name.className = "profile-name";
  name.textContent = state.me.displayName;

  const email = document.createElement("p");
  email.className = "profile-email";
  email.textContent = state.me.email;

  els.profileCard.appendChild(name);
  els.profileCard.appendChild(email);
}

function renderServers() {
  els.serverList.innerHTML = "";

  state.groups.forEach((group) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "server-pill";
    button.textContent = initialFromName(group.name);
    button.title = group.name;

    const isActive =
      state.mode === "group" && state.activeGroupId === group.id && state.sidebarMode === "channels";
    button.classList.toggle("active", isActive);

    button.addEventListener("click", () => {
      state.sidebarMode = "channels";
      const firstChannel = group.channels[0] || null;
      openGroup(group.id, firstChannel ? firstChannel.id : null);
    });

    els.serverList.appendChild(button);
  });

  const homeActive = state.sidebarMode === "friends";
  els.homeButton.classList.toggle("active", homeActive);
}

function renderLeftPane() {
  els.leftList.innerHTML = "";

  if (state.sidebarMode === "channels") {
    const group = getActiveGroup();
    els.railTitle.textContent = group ? group.name : "Kanalai";
    els.railSubtitle.textContent = group
      ? `${group.channels.length} kanalai`
      : "Sukurk grupę ir pradėk";
    els.leftSectionTitle.textContent = "Kanalai";
    els.toggleFriendsBtn.textContent = "Draugai";
    els.addChannelBtn.disabled = !group;

    if (!group || group.channels.length === 0) {
      const empty = document.createElement("li");
      empty.textContent = "Nėra kanalų";
      empty.className = "entity-item";
      els.leftList.appendChild(empty);
      return;
    }

    group.channels.forEach((channel) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "entity-item";
      button.textContent = `# ${channel.name}`;
      button.classList.toggle(
        "active",
        state.mode === "group" && state.activeChannelId === channel.id
      );

      button.addEventListener("click", () => {
        openGroup(group.id, channel.id);
      });

      item.appendChild(button);
      els.leftList.appendChild(item);
    });

    return;
  }

  els.railTitle.textContent = "Draugai";
  els.railSubtitle.textContent = `${state.friends.length} draugai`;
  els.leftSectionTitle.textContent = "Friend list";
  els.toggleFriendsBtn.textContent = "Kanalai";
  els.addChannelBtn.disabled = true;

  if (state.friends.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "Dar neturi draugų";
    empty.className = "entity-item";
    els.leftList.appendChild(empty);
    return;
  }

  state.friends.forEach((friend) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "entity-item";
    button.classList.toggle("active", state.mode === "dm" && state.activeDmUserId === friend.id);

    const row = document.createElement("div");
    row.className = "entity-row";

    const name = document.createElement("span");
    name.textContent = friend.displayName;

    const status = document.createElement("span");
    status.className = `dot ${isOnline(friend.id) ? "online" : ""}`;

    row.appendChild(name);
    row.appendChild(status);
    button.appendChild(row);

    button.addEventListener("click", () => {
      openDm(friend.id);
    });

    item.appendChild(button);
    els.leftList.appendChild(item);
  });
}

function renderFriendRequests() {
  els.requestList.innerHTML = "";

  if (state.friendRequests.length === 0) {
    const empty = document.createElement("li");
    empty.className = "entity-item";
    empty.textContent = "Naujų užklausų nėra";
    els.requestList.appendChild(empty);
    return;
  }

  state.friendRequests.forEach((request) => {
    const item = document.createElement("li");
    const row = document.createElement("div");
    row.className = "entity-row";

    const text = document.createElement("span");
    text.textContent = request.from.displayName;

    const accept = document.createElement("button");
    accept.type = "button";
    accept.className = "accept-btn";
    accept.textContent = "Accept";
    accept.addEventListener("click", async () => {
      try {
        await api(`/api/friends/requests/${request.id}/accept`, { method: "POST" });
        showToast("Draugas pridėtas");
        await refreshBootstrap({ keepSelection: true });
      } catch (error) {
        showToast(error.message, true);
      }
    });

    row.appendChild(text);
    row.appendChild(accept);
    item.appendChild(row);
    els.requestList.appendChild(item);
  });
}

function renderChatHeader() {
  if (state.mode === "group") {
    const group = getActiveGroup();
    const channel = getActiveChannel();
    if (group && channel) {
      els.chatTitle.textContent = `#${channel.name}`;
      els.chatSubtitle.textContent = `${group.name} serveris`;
      return;
    }
  }

  if (state.mode === "dm") {
    const friend = getFriendById(state.activeDmUserId);
    if (friend) {
      els.chatTitle.textContent = `@${friend.displayName}`;
      els.chatSubtitle.textContent = "Privatus pokalbis";
      return;
    }
  }

  els.chatTitle.textContent = "ChatX";
  els.chatSubtitle.textContent = "Pasirink kanalą arba draugą";
}

function renderMembers() {
  els.memberList.innerHTML = "";

  let members = [];
  if (state.mode === "group") {
    const group = getActiveGroup();
    members = group ? group.members : [];
  } else if (state.mode === "dm") {
    const friend = getFriendById(state.activeDmUserId);
    members = [state.me, friend].filter(Boolean);
  }

  let onlineCount = 0;

  members.forEach((member) => {
    const isMemberOnline = isOnline(member.id) || member.id === state.me?.id;
    if (isMemberOnline) {
      onlineCount += 1;
    }

    const item = document.createElement("li");
    item.className = "member-item";

    const dot = document.createElement("span");
    dot.className = `dot ${isMemberOnline ? "online" : ""}`;

    const name = document.createElement("span");
    name.textContent = member.displayName;

    item.appendChild(dot);
    item.appendChild(name);
    els.memberList.appendChild(item);
  });

  els.memberCount.textContent = `${onlineCount} online`;
}

function renderMessages() {
  els.messageList.innerHTML = "";

  if (state.messages.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Čia dar tylu. Parašyk pirmą žinutę.";
    els.messageList.appendChild(empty);
    return;
  }

  state.messages.forEach((message) => {
    const self = message.author?.id === state.me?.id;

    const wrapper = document.createElement("div");
    wrapper.className = `message${self ? " self" : ""}`;

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.style.background = message.author?.avatarColor || "#6f87ff";
    avatar.textContent = initialFromName(message.author?.displayName || "?");

    const bubble = document.createElement("div");
    bubble.className = "bubble";

    const meta = document.createElement("div");
    meta.className = "meta";

    const author = document.createElement("span");
    author.className = "author";
    author.textContent = message.author?.displayName || "Unknown";

    const time = document.createElement("span");
    time.className = "time";
    time.textContent = formatTime(message.createdAt);

    const text = document.createElement("div");
    text.className = "text";
    text.textContent = message.text;

    meta.appendChild(author);
    meta.appendChild(time);
    bubble.appendChild(meta);
    bubble.appendChild(text);

    wrapper.appendChild(avatar);
    wrapper.appendChild(bubble);

    els.messageList.appendChild(wrapper);
  });

  els.messageList.scrollTop = els.messageList.scrollHeight;
}

function updateComposerState() {
  const connected = Boolean(state.socket?.connected);
  const hasTarget =
    (state.mode === "group" && state.activeGroupId && state.activeChannelId) ||
    (state.mode === "dm" && state.activeDmUserId);

  const enabled = connected && Boolean(hasTarget);
  els.messageInput.disabled = !enabled;
  els.sendBtn.disabled = !enabled;

  if (!hasTarget) {
    els.messageInput.placeholder = "Pasirink kanalą arba draugą";
  } else if (!connected) {
    els.messageInput.placeholder = "Laukiama serverio ryšio...";
  } else {
    els.messageInput.placeholder = "Rašyk žinutę...";
  }
}

function applySelectionFallback() {
  const group = getActiveGroup();

  if (state.mode === "group" && group) {
    const channelExists = group.channels.some((channel) => channel.id === state.activeChannelId);
    if (!channelExists) {
      state.activeChannelId = group.channels[0]?.id || null;
    }
  }

  if (state.mode === "group" && !group) {
    state.activeGroupId = null;
    state.activeChannelId = null;
  }

  if (state.mode === "dm") {
    const friendExists = Boolean(getFriendById(state.activeDmUserId));
    if (!friendExists) {
      state.activeDmUserId = state.friends[0]?.id || null;
    }
  }

  if (!state.mode) {
    if (state.groups.length > 0) {
      state.mode = "group";
      state.sidebarMode = "channels";
      state.activeGroupId = state.groups[0].id;
      state.activeChannelId = state.groups[0].channels[0]?.id || null;
    } else if (state.friends.length > 0) {
      state.mode = "dm";
      state.sidebarMode = "friends";
      state.activeDmUserId = state.friends[0].id;
    }
  }

  if (state.mode === "group" && !state.activeGroupId && state.groups.length > 0) {
    state.activeGroupId = state.groups[0].id;
    state.activeChannelId = state.groups[0].channels[0]?.id || null;
  }

  if (!state.activeGroupId && !state.activeDmUserId && state.friends.length > 0) {
    state.mode = "dm";
    state.sidebarMode = "friends";
    state.activeDmUserId = state.friends[0].id;
  }
}

async function loadGroupMessages(groupId, channelId) {
  const response = await api(`/api/groups/${groupId}/channels/${channelId}/messages?limit=120`);
  state.messages = response.messages || [];
  renderMessages();

  if (state.socket?.connected) {
    state.socket.emit("join_group_channel", { groupId, channelId });
  }
}

async function loadDmMessages(friendId) {
  const response = await api(`/api/dm/${friendId}/messages?limit=120`);
  state.messages = response.messages || [];
  renderMessages();

  if (state.socket?.connected) {
    state.socket.emit("open_dm", { friendId });
  }
}

async function openGroup(groupId, channelId) {
  const group = state.groups.find((item) => item.id === groupId);
  if (!group) {
    return;
  }

  const channel = group.channels.find((item) => item.id === channelId) || group.channels[0] || null;

  state.mode = "group";
  state.sidebarMode = "channels";
  state.activeGroupId = group.id;
  state.activeChannelId = channel ? channel.id : null;
  state.activeDmUserId = null;

  renderServers();
  renderLeftPane();
  renderMembers();
  renderChatHeader();

  if (!channel) {
    state.messages = [];
    renderMessages();
    updateComposerState();
    return;
  }

  try {
    await loadGroupMessages(group.id, channel.id);
    updateComposerState();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function openDm(friendId) {
  const friend = getFriendById(friendId);
  if (!friend) {
    return;
  }

  state.mode = "dm";
  state.sidebarMode = "friends";
  state.activeDmUserId = friend.id;

  renderServers();
  renderLeftPane();
  renderMembers();
  renderChatHeader();

  try {
    await loadDmMessages(friend.id);
    updateComposerState();
  } catch (error) {
    showToast(error.message, true);
  }
}

function scheduleBootstrapRefresh() {
  clearTimeout(state.refreshTimer);
  state.refreshTimer = setTimeout(() => {
    refreshBootstrap({ keepSelection: true }).catch((error) => {
      showToast(error.message, true);
    });
  }, 280);
}

async function refreshBootstrap({ keepSelection }) {
  const prev = {
    mode: state.mode,
    sidebarMode: state.sidebarMode,
    activeGroupId: state.activeGroupId,
    activeChannelId: state.activeChannelId,
    activeDmUserId: state.activeDmUserId,
  };

  const data = await api("/api/bootstrap");

  state.me = data.me;
  state.groups = data.groups || [];
  state.friends = data.friends || [];
  state.friendRequests = data.friendRequests || [];
  state.onlineUserIds = new Set(data.onlineUserIds || []);

  if (keepSelection) {
    state.mode = prev.mode;
    state.sidebarMode = prev.sidebarMode;
    state.activeGroupId = prev.activeGroupId;
    state.activeChannelId = prev.activeChannelId;
    state.activeDmUserId = prev.activeDmUserId;
  } else {
    state.mode = null;
    state.sidebarMode = "channels";
    state.activeGroupId = null;
    state.activeChannelId = null;
    state.activeDmUserId = null;
  }

  applySelectionFallback();

  renderProfileCard();
  renderServers();
  renderLeftPane();
  renderFriendRequests();
  renderMembers();
  renderChatHeader();

  if (state.mode === "group" && state.activeGroupId && state.activeChannelId) {
    await loadGroupMessages(state.activeGroupId, state.activeChannelId);
  } else if (state.mode === "dm" && state.activeDmUserId) {
    await loadDmMessages(state.activeDmUserId);
  } else {
    state.messages = [];
    renderMessages();
  }

  updateComposerState();
}

function connectSocket() {
  if (!state.token) {
    return;
  }

  if (state.socket) {
    state.socket.disconnect();
  }

  state.socket = io(state.serverUrl, {
    auth: { token: state.token },
    transports: ["websocket", "polling"],
    timeout: 9000,
  });

  state.socket.on("connect", () => {
    setConnectionState(true);

    if (state.mode === "group" && state.activeGroupId && state.activeChannelId) {
      state.socket.emit("join_group_channel", {
        groupId: state.activeGroupId,
        channelId: state.activeChannelId,
      });
    }

    if (state.mode === "dm" && state.activeDmUserId) {
      state.socket.emit("open_dm", { friendId: state.activeDmUserId });
    }
  });

  state.socket.on("disconnect", () => {
    setConnectionState(false);
  });

  state.socket.on("connect_error", (error) => {
    setConnectionState(false);

    const message = String(error?.message || "").toLowerCase();
    if (message.includes("unauthorized")) {
      showToast("Sesija baigėsi, prisijunk iš naujo", true);
      logout();
      return;
    }

    showToast("Nepavyko prisijungti prie realtime serverio", true);
  });

  state.socket.on("presence_update", (payload) => {
    if (!payload?.userId) {
      return;
    }

    if (payload.online) {
      state.onlineUserIds.add(payload.userId);
    } else {
      state.onlineUserIds.delete(payload.userId);
    }

    renderLeftPane();
    renderMembers();
  });

  state.socket.on("group_message", (message) => {
    const isCurrentChannel =
      state.mode === "group" &&
      state.activeGroupId === message.groupId &&
      state.activeChannelId === message.channelId;

    if (!isCurrentChannel) {
      return;
    }

    state.messages.push(message);
    renderMessages();
  });

  state.socket.on("dm_message", (message) => {
    const friendId = state.activeDmUserId;
    const isCurrentDm =
      state.mode === "dm" &&
      friendId &&
      (message.author?.id === friendId || message.toUserId === friendId);

    if (!isCurrentDm) {
      return;
    }

    state.messages.push(message);
    renderMessages();
  });

  state.socket.on("channel_created", (payload) => {
    const group = state.groups.find((item) => item.id === payload.groupId);
    if (!group) {
      return;
    }

    const exists = group.channels.some((channel) => channel.id === payload.channel.id);
    if (!exists) {
      group.channels.push(payload.channel);
      group.channels.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      renderLeftPane();
    }
  });

  state.socket.on("social_update", () => {
    scheduleBootstrapRefresh();
  });

  state.socket.on("groups_update", () => {
    scheduleBootstrapRefresh();
  });
}

function disconnectSocket() {
  if (state.socket) {
    state.socket.disconnect();
    state.socket = null;
  }
}

function setToken(token) {
  state.token = token;
  if (token) {
    localStorage.setItem("chatx_token", token);
  } else {
    localStorage.removeItem("chatx_token");
  }
}

function resetStateForLogout() {
  disconnectSocket();
  setToken("");

  state.me = null;
  state.groups = [];
  state.friends = [];
  state.friendRequests = [];
  state.onlineUserIds = new Set();
  state.sidebarMode = "channels";
  state.mode = null;
  state.activeGroupId = null;
  state.activeChannelId = null;
  state.activeDmUserId = null;
  state.messages = [];

  renderServers();
  renderLeftPane();
  renderFriendRequests();
  renderMembers();
  renderChatHeader();
  renderMessages();
  updateComposerState();
  setConnectionState(false);
}

function logout() {
  resetStateForLogout();
  setViewAuthenticated(false);
  setAuthMode("login");
}

async function handleAuthSuccess(payload) {
  setToken(payload.token);
  setViewAuthenticated(true);

  await refreshBootstrap({ keepSelection: false });
  connectSocket();
}

async function onLoginSubmit(event) {
  event.preventDefault();

  try {
    const payload = await api("/api/auth/login", {
      method: "POST",
      body: {
        email: els.loginEmail.value,
        password: els.loginPassword.value,
      },
    });

    els.loginPassword.value = "";
    await handleAuthSuccess(payload);
    showToast("Prisijungta");
  } catch (error) {
    showToast(error.message, true);
  }
}

async function onRegisterSubmit(event) {
  event.preventDefault();

  try {
    const payload = await api("/api/auth/register", {
      method: "POST",
      body: {
        displayName: els.registerName.value,
        email: els.registerEmail.value,
        password: els.registerPassword.value,
      },
    });

    els.registerPassword.value = "";
    await handleAuthSuccess(payload);
    showToast("Paskyra sukurta");
  } catch (error) {
    showToast(error.message, true);
  }
}

async function onCreateGroup() {
  const name = window.prompt("Naujos grupės pavadinimas:");
  if (!name) {
    return;
  }

  try {
    const payload = await api("/api/groups", {
      method: "POST",
      body: { name },
    });

    state.groups.push(payload.group);
    state.groups.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    await openGroup(payload.group.id, payload.group.channels[0]?.id || null);
    renderFriendRequests();
    showToast("Grupė sukurta");
  } catch (error) {
    showToast(error.message, true);
  }
}

async function onCreateChannel() {
  const group = getActiveGroup();
  if (!group) {
    showToast("Pirma pasirink grupę", true);
    return;
  }

  const name = window.prompt("Kanalo pavadinimas:");
  if (!name) {
    return;
  }

  try {
    const payload = await api(`/api/groups/${group.id}/channels`, {
      method: "POST",
      body: { name },
    });

    group.channels.push(payload.channel);
    group.channels.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    await openGroup(group.id, payload.channel.id);
    showToast("Kanalas sukurtas");
  } catch (error) {
    showToast(error.message, true);
  }
}

async function onAddFriend() {
  const email = window.prompt("Draugo el. paštas:");
  if (!email) {
    return;
  }

  try {
    const payload = await api("/api/friends/request", {
      method: "POST",
      body: { email },
    });

    if (payload.status === "accepted") {
      showToast("Draugystė patvirtinta");
    } else {
      showToast("Friend request išsiųstas");
    }

    await refreshBootstrap({ keepSelection: true });
  } catch (error) {
    showToast(error.message, true);
  }
}

async function onSendMessage(event) {
  event.preventDefault();

  const text = els.messageInput.value.trim();
  if (!text || !state.socket?.connected) {
    return;
  }

  if (state.mode === "group" && state.activeGroupId && state.activeChannelId) {
    state.socket.emit("send_group_message", {
      groupId: state.activeGroupId,
      channelId: state.activeChannelId,
      text,
    });
  } else if (state.mode === "dm" && state.activeDmUserId) {
    state.socket.emit("send_dm_message", {
      friendId: state.activeDmUserId,
      text,
    });
  }

  els.messageInput.value = "";
}

function bindEvents() {
  els.showLoginBtn.addEventListener("click", () => setAuthMode("login"));
  els.showRegisterBtn.addEventListener("click", () => setAuthMode("register"));
  els.loginForm.addEventListener("submit", onLoginSubmit);
  els.registerForm.addEventListener("submit", onRegisterSubmit);

  els.homeButton.addEventListener("click", async () => {
    state.sidebarMode = "friends";
    renderServers();
    renderLeftPane();

    if (state.friends[0]) {
      await openDm(state.friends[0].id);
    } else {
      state.mode = null;
      state.activeDmUserId = null;
      state.messages = [];
      renderChatHeader();
      renderMessages();
      renderMembers();
      updateComposerState();
    }
  });

  els.toggleFriendsBtn.addEventListener("click", () => {
    if (state.sidebarMode === "channels") {
      state.sidebarMode = "friends";
      renderServers();
      renderLeftPane();
      if (state.friends[0]) {
        openDm(state.friends[0].id);
      }
      return;
    }

    state.sidebarMode = "channels";
    renderServers();
    renderLeftPane();
    if (state.activeGroupId) {
      openGroup(state.activeGroupId, state.activeChannelId);
    }
  });

  els.createGroupBtn.addEventListener("click", onCreateGroup);
  els.addChannelBtn.addEventListener("click", onCreateChannel);
  els.addFriendBtn.addEventListener("click", onAddFriend);
  els.logoutBtn.addEventListener("click", logout);
  els.composerForm.addEventListener("submit", onSendMessage);
}

async function init() {
  bindEvents();
  setAuthMode("login");

  const config = await window.chatxApi.getConfig();
  state.serverUrl = String(config.defaultServerUrl || "").replace(/\/+$/, "");
  state.appVersion = config.appVersion ? `v${config.appVersion}` : "";

  els.serverBadge.textContent = `Serveris: ${state.serverUrl}`;
  els.appVersion.textContent = state.appVersion;

  if (!state.token) {
    setViewAuthenticated(false);
    return;
  }

  try {
    setViewAuthenticated(true);
    await refreshBootstrap({ keepSelection: false });
    connectSocket();
    showToast("Automatinis prisijungimas");
  } catch (_error) {
    logout();
  }
}

init();
