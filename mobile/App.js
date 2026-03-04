import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { io } from "socket.io-client";

const SERVER_URL = "https://chatx-production-cc2e.up.railway.app";
const TOKEN_KEY = "chatx_mobile_token";
const EMAIL_KEY = "chatx_mobile_email";

function useApiBase() {
  return useMemo(() => SERVER_URL.replace(/\/+$/, ""), []);
}

async function apiRequest(baseUrl, token, path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${baseUrl}${path}`, {
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
    const error = new Error(payload?.error || `HTTP ${response.status}`);
    error.code = payload?.code || null;
    throw error;
  }

  return payload;
}

export default function App() {
  const baseUrl = useApiBase();
  const socketRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState("login");
  const [token, setToken] = useState("");

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");

  const [me, setMe] = useState(null);
  const [groups, setGroups] = useState([]);
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [activeChannelId, setActiveChannelId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  const [statusText, setStatusText] = useState("Ready");

  const activeGroup = groups.find((group) => group.id === activeGroupId) || null;
  const activeChannel =
    activeGroup?.channels.find((channel) => channel.id === activeChannelId) || null;

  useEffect(() => {
    (async () => {
      const savedToken = (await AsyncStorage.getItem(TOKEN_KEY)) || "";
      const savedEmail = (await AsyncStorage.getItem(EMAIL_KEY)) || "";
      setLoginEmail(savedEmail);

      if (!savedToken) {
        setLoading(false);
        return;
      }

      try {
        await bootstrap(savedToken, false);
        connectSocket(savedToken);
      } catch (_error) {
        await AsyncStorage.removeItem(TOKEN_KEY);
        setToken("");
      }

      setLoading(false);
    })();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  function setAuthenticated(nextToken) {
    setToken(nextToken);
    if (nextToken) {
      AsyncStorage.setItem(TOKEN_KEY, nextToken);
    } else {
      AsyncStorage.removeItem(TOKEN_KEY);
    }
  }

  async function bootstrap(authToken, keepSelection = true) {
    const oldGroup = activeGroupId;
    const oldChannel = activeChannelId;

    const data = await apiRequest(baseUrl, authToken, "/api/bootstrap");
    setMe(data.me || null);
    setGroups(data.groups || []);

    let nextGroup = null;
    let nextChannel = null;

    if (keepSelection) {
      nextGroup = (data.groups || []).find((group) => group.id === oldGroup) || null;
      nextChannel = nextGroup?.channels.find((channel) => channel.id === oldChannel) || null;
    }

    if (!nextGroup) {
      nextGroup = (data.groups || [])[0] || null;
      nextChannel = nextGroup?.channels?.[0] || null;
    }

    const groupId = nextGroup?.id || null;
    const channelId = nextChannel?.id || null;

    setActiveGroupId(groupId);
    setActiveChannelId(channelId);

    if (groupId && channelId) {
      await loadMessages(authToken, groupId, channelId);
    } else {
      setMessages([]);
    }
  }

  function connectSocket(authToken) {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    const socket = io(baseUrl, {
      auth: { token: authToken },
      transports: ["websocket", "polling"],
      timeout: 8000,
    });

    socket.on("connect", () => {
      setStatusText("Online");
      if (activeGroupId && activeChannelId) {
        socket.emit("join_group_channel", {
          groupId: activeGroupId,
          channelId: activeChannelId,
        });
      }
    });

    socket.on("disconnect", () => {
      setStatusText("Offline");
    });

    socket.on("group_message", (msg) => {
      if (msg.groupId === activeGroupId && msg.channelId === activeChannelId) {
        setMessages((prev) => [...prev, msg]);
      }
    });

    socket.on("groups_update", async () => {
      try {
        await bootstrap(authToken, true);
      } catch (_error) {
        // ignore transient reload issue
      }
    });

    socketRef.current = socket;
  }

  async function loadMessages(authToken, groupId, channelId) {
    const response = await apiRequest(
      baseUrl,
      authToken,
      `/api/groups/${groupId}/channels/${channelId}/messages?limit=120`
    );

    setMessages(response.messages || []);

    if (socketRef.current?.connected) {
      socketRef.current.emit("join_group_channel", { groupId, channelId });
    }
  }

  async function onLogin() {
    try {
      const email = loginEmail.trim();
      const data = await apiRequest(baseUrl, "", "/api/auth/login", {
        method: "POST",
        body: { email, password: loginPassword },
      });

      await AsyncStorage.setItem(EMAIL_KEY, email);
      setAuthenticated(data.token);
      await bootstrap(data.token, false);
      connectSocket(data.token);
      setStatusText("Prisijungta");
      setLoginPassword("");
    } catch (error) {
      if (error.code === "EMAIL_NOT_VERIFIED") {
        setStatusText("Email nepatvirtintas. Spausk resend verification.");
        return;
      }

      setStatusText(error.message);
    }
  }

  async function onRegister() {
    try {
      const email = registerEmail.trim();
      const data = await apiRequest(baseUrl, "", "/api/auth/register", {
        method: "POST",
        body: {
          displayName: registerName,
          email,
          password: registerPassword,
        },
      });

      await AsyncStorage.setItem(EMAIL_KEY, email);
      setLoginEmail(email);
      setAuthMode("login");
      setRegisterPassword("");
      setStatusText(data.message || "Paskyra sukurta. Patvirtink email.");

      if (data.verificationPreviewUrl) {
        setStatusText(`SMTP nera. Atidaryk ranka: ${data.verificationPreviewUrl}`);
      }
    } catch (error) {
      setStatusText(error.message);
    }
  }

  async function onResendVerification() {
    try {
      const email = loginEmail.trim();
      const data = await apiRequest(baseUrl, "", "/api/auth/resend-verification", {
        method: "POST",
        body: { email },
      });

      setStatusText(data.message || "Patvirtinimo email issiustas");
      if (data.verificationPreviewUrl) {
        setStatusText(`SMTP nera. Atidaryk ranka: ${data.verificationPreviewUrl}`);
      }
    } catch (error) {
      setStatusText(error.message);
    }
  }

  async function onSelectChannel(groupId, channelId) {
    setActiveGroupId(groupId);
    setActiveChannelId(channelId);

    try {
      await loadMessages(token, groupId, channelId);
    } catch (error) {
      setStatusText(error.message);
    }
  }

  function onLogout() {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    setAuthenticated("");
    setMe(null);
    setGroups([]);
    setActiveGroupId(null);
    setActiveChannelId(null);
    setMessages([]);
    setStatusText("Atsijungta");
  }

  function onSendMessage() {
    const text = messageInput.trim();
    if (!text || !socketRef.current?.connected || !activeGroupId || !activeChannelId) {
      return;
    }

    socketRef.current.emit("send_group_message", {
      groupId: activeGroupId,
      channelId: activeChannelId,
      text,
    });

    setMessageInput("");
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color="#7c8bff" />
      </SafeAreaView>
    );
  }

  if (!token) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.authCard}>
          <Text style={styles.title}>ChatX Mobile</Text>
          <Text style={styles.small}>Server: {baseUrl}</Text>

          <View style={styles.row}>
            <Pressable
              style={[styles.tab, authMode === "login" && styles.tabActive]}
              onPress={() => setAuthMode("login")}
            >
              <Text style={styles.tabText}>Login</Text>
            </Pressable>
            <Pressable
              style={[styles.tab, authMode === "register" && styles.tabActive]}
              onPress={() => setAuthMode("register")}
            >
              <Text style={styles.tabText}>Register</Text>
            </Pressable>
          </View>

          {authMode === "login" ? (
            <>
              <TextInput
                value={loginEmail}
                onChangeText={setLoginEmail}
                placeholder="Email"
                placeholderTextColor="#8c99b4"
                style={styles.input}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <TextInput
                value={loginPassword}
                onChangeText={setLoginPassword}
                placeholder="Password"
                placeholderTextColor="#8c99b4"
                style={styles.input}
                secureTextEntry
              />
              <Pressable style={styles.primaryBtn} onPress={onLogin}>
                <Text style={styles.primaryBtnText}>Login</Text>
              </Pressable>
              <Pressable style={styles.secondaryBtn} onPress={onResendVerification}>
                <Text style={styles.secondaryBtnText}>Resend verification</Text>
              </Pressable>
            </>
          ) : (
            <>
              <TextInput
                value={registerName}
                onChangeText={setRegisterName}
                placeholder="Display name"
                placeholderTextColor="#8c99b4"
                style={styles.input}
              />
              <TextInput
                value={registerEmail}
                onChangeText={setRegisterEmail}
                placeholder="Email"
                placeholderTextColor="#8c99b4"
                style={styles.input}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <TextInput
                value={registerPassword}
                onChangeText={setRegisterPassword}
                placeholder="Password (min 6)"
                placeholderTextColor="#8c99b4"
                style={styles.input}
                secureTextEntry
              />
              <Pressable style={styles.primaryBtn} onPress={onRegister}>
                <Text style={styles.primaryBtnText}>Create account</Text>
              </Pressable>
            </>
          )}

          <Text style={styles.statusText}>{statusText}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.topBar}>
        <Text style={styles.title}>ChatX</Text>
        <Text style={styles.small}>{me?.displayName || "User"}</Text>
        <Text style={styles.small}>{statusText}</Text>
        <Pressable style={styles.logoutBtn} onPress={onLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </Pressable>
      </View>

      <ScrollView horizontal style={styles.groupRow} showsHorizontalScrollIndicator={false}>
        {groups.map((group) => (
          <Pressable
            key={group.id}
            style={[styles.groupChip, group.id === activeGroupId && styles.groupChipActive]}
            onPress={() =>
              onSelectChannel(group.id, group.channels[0]?.id || null)
            }
          >
            <Text style={styles.groupChipText}>{group.name}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView horizontal style={styles.channelRow} showsHorizontalScrollIndicator={false}>
        {(activeGroup?.channels || []).map((channel) => (
          <Pressable
            key={channel.id}
            style={[styles.channelChip, channel.id === activeChannelId && styles.channelChipActive]}
            onPress={() => onSelectChannel(activeGroup.id, channel.id)}
          >
            <Text style={styles.channelChipText}># {channel.name}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <Text style={styles.channelTitle}>
        {activeChannel ? `# ${activeChannel.name}` : "No channel"}
      </Text>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messageList}
        renderItem={({ item }) => (
          <View style={styles.messageCard}>
            <Text style={styles.messageMeta}>
              {item.author?.displayName || "Unknown"}
            </Text>
            <Text style={styles.messageBody}>{item.text}</Text>
          </View>
        )}
      />

      <View style={styles.composerRow}>
        <TextInput
          value={messageInput}
          onChangeText={setMessageInput}
          placeholder="Write message..."
          placeholderTextColor="#8c99b4"
          style={[styles.input, styles.messageInput]}
        />
        <Pressable style={styles.sendBtn} onPress={onSendMessage}>
          <Text style={styles.sendText}>Send</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f1420",
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  centered: {
    flex: 1,
    backgroundColor: "#0f1420",
    alignItems: "center",
    justifyContent: "center",
  },
  authCard: {
    marginTop: 40,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#27324a",
    backgroundColor: "#161e2e",
    padding: 14,
    gap: 10,
  },
  title: {
    color: "#edf2ff",
    fontSize: 22,
    fontWeight: "700",
  },
  small: {
    color: "#9eabc5",
    fontSize: 12,
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  tab: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2d3955",
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#1a2439",
  },
  tabActive: {
    borderColor: "#6f87ff",
    backgroundColor: "#243255",
  },
  tabText: {
    color: "#dee5ff",
    fontWeight: "600",
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2e3a56",
    backgroundColor: "#111a2c",
    color: "#f1f5ff",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  primaryBtn: {
    borderRadius: 10,
    backgroundColor: "#6f87ff",
    paddingVertical: 11,
    alignItems: "center",
  },
  primaryBtnText: {
    color: "#09101f",
    fontWeight: "700",
  },
  secondaryBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#334265",
    paddingVertical: 10,
    alignItems: "center",
  },
  secondaryBtnText: {
    color: "#d3dcf5",
    fontWeight: "600",
  },
  statusText: {
    color: "#9eabc5",
    fontSize: 12,
    lineHeight: 18,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  logoutBtn: {
    marginLeft: "auto",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#67364a",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  logoutText: {
    color: "#ffc2d2",
    fontWeight: "600",
  },
  groupRow: {
    maxHeight: 44,
    marginBottom: 8,
  },
  groupChip: {
    marginRight: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2f3a55",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#1a2337",
  },
  groupChipActive: {
    backgroundColor: "#2a3e71",
    borderColor: "#6f87ff",
  },
  groupChipText: {
    color: "#e4ebff",
    fontSize: 12,
    fontWeight: "600",
  },
  channelRow: {
    maxHeight: 40,
    marginBottom: 8,
  },
  channelChip: {
    marginRight: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2d3954",
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "#182236",
  },
  channelChipActive: {
    backgroundColor: "#2a3e71",
    borderColor: "#6f87ff",
  },
  channelChipText: {
    color: "#d8e0f7",
    fontSize: 12,
  },
  channelTitle: {
    color: "#eef3ff",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 8,
  },
  messageList: {
    paddingBottom: 10,
    gap: 8,
  },
  messageCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#283551",
    backgroundColor: "#172236",
    padding: 10,
  },
  messageMeta: {
    color: "#b8c7e8",
    fontWeight: "700",
    marginBottom: 4,
  },
  messageBody: {
    color: "#edf2ff",
    lineHeight: 19,
  },
  composerRow: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 10,
  },
  messageInput: {
    flex: 1,
  },
  sendBtn: {
    borderRadius: 10,
    backgroundColor: "#4fd8c9",
    paddingHorizontal: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  sendText: {
    color: "#07141d",
    fontWeight: "700",
  },
});
