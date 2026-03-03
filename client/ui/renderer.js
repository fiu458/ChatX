const state = {
  socket: null,
  username: "",
  room: "general",
};

const els = {
  serverUrl: document.getElementById("serverUrl"),
  serverStatus: document.getElementById("serverStatus"),
  username: document.getElementById("username"),
  room: document.getElementById("room"),
  joinBtn: document.getElementById("joinBtn"),
  roomTitle: document.getElementById("roomTitle"),
  chatHint: document.getElementById("chatHint"),
  messages: document.getElementById("messages"),
  users: document.getElementById("users"),
  messageForm: document.getElementById("messageForm"),
  messageInput: document.getElementById("messageInput"),
  sendBtn: document.getElementById("sendBtn"),
};

const persisted = {
  serverUrl: localStorage.getItem("chatx_server_url") || "",
  username: localStorage.getItem("chatx_username") || "",
  room: localStorage.getItem("chatx_room") || "general",
};

function updateStatus(text, isConnected = false) {
  els.serverStatus.textContent = text;
  els.serverStatus.style.color = isConnected ? "#0f8b74" : "#61756f";
}

function enableComposer(enabled) {
  els.messageInput.disabled = !enabled;
  els.sendBtn.disabled = !enabled;
}

function timeLabel(ts) {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function addMessage({ text, username, ts, self = false, system = false }) {
  const node = document.createElement("div");
  node.className = `message${self ? " self" : ""}${system ? " system" : ""}`;

  if (!system) {
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${username} • ${timeLabel(ts)}`;
    node.appendChild(meta);
  }

  const body = document.createElement("div");
  body.textContent = text;
  node.appendChild(body);

  els.messages.appendChild(node);
  els.messages.scrollTop = els.messages.scrollHeight;
}

function clearMessages() {
  els.messages.innerHTML = "";
}

function disconnectSocket() {
  if (state.socket) {
    state.socket.disconnect();
    state.socket = null;
  }
}

function connectAndJoin() {
  const url = els.serverUrl.value.trim();
  const username = els.username.value.trim();
  const room = els.room.value.trim().toLowerCase();

  if (!url || !username || !room) {
    updateStatus("Užpildyk serverį, vardą ir kambarį");
    return;
  }

  localStorage.setItem("chatx_server_url", url);
  localStorage.setItem("chatx_username", username);
  localStorage.setItem("chatx_room", room);

  disconnectSocket();
  clearMessages();
  els.users.innerHTML = "";

  const socket = io(url, {
    transports: ["websocket", "polling"],
    reconnection: true,
    timeout: 8000,
  });

  state.socket = socket;
  state.username = username;
  state.room = room;

  socket.on("connect", () => {
    updateStatus(`Prisijungta (${socket.id})`, true);
    enableComposer(true);
    els.roomTitle.textContent = `#${room}`;
    els.chatHint.textContent = `${username}, tu online`;

    socket.emit("join_room", { username, room });
  });

  socket.on("connect_error", () => {
    updateStatus("Klaida jungiantis prie serverio");
    enableComposer(false);
  });

  socket.on("disconnect", () => {
    updateStatus("Ryšys nutrūko");
    enableComposer(false);
  });

  socket.on("receive_message", (msg) => {
    addMessage({
      text: msg.text,
      username: msg.username,
      ts: msg.ts,
      self: msg.username === state.username,
    });
  });

  socket.on("system_message", (msg) => {
    addMessage({ text: msg.text, ts: msg.ts, system: true });
  });

  socket.on("room_users", (payload) => {
    els.users.innerHTML = "";
    payload.users.forEach((user) => {
      const li = document.createElement("li");
      li.textContent = user;
      els.users.appendChild(li);
    });
  });
}

els.joinBtn.addEventListener("click", connectAndJoin);

els.messageForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!state.socket || !state.socket.connected) {
    return;
  }

  const text = els.messageInput.value.trim();
  if (!text) {
    return;
  }

  state.socket.emit("send_message", { text });
  els.messageInput.value = "";
});

(async () => {
  const cfg = await window.chatxApi.getConfig();
  els.serverUrl.value = persisted.serverUrl || cfg.defaultServerUrl;
  els.username.value = persisted.username;
  els.room.value = persisted.room;
  updateStatus("Pasiruošta prisijungimui");
})();
