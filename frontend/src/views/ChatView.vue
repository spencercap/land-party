<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { supabase } from '../utils/supabase'

interface Message {
  id: number
  text: string
  username: string
  user_id: string
  created_at: string
}

interface PresenceUser {
  user_id: string
  username: string
  last_seen_at: string
}

// Local identity stored in localStorage
const ME_KEY = 'chat_user'
const storedUser = localStorage.getItem(ME_KEY)
const me = ref<{ id: string; username: string } | null>(
  storedUser ? JSON.parse(storedUser) : null
)
const usernameInput = ref('')
const joiningError = ref('')

const messages = ref<Message[]>([])
const input = ref('')
const listEl = ref<HTMLElement | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const onlineUsers = ref<PresenceUser[]>([])

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// ── Join ──────────────────────────────────────────────────────────────────────

async function join() {
  const username = usernameInput.value.trim()
  if (!username) return
  joiningError.value = ''

  // Upsert into users table
  const { data, error: err } = await supabase
    .from('users')
    .upsert({ username }, { onConflict: 'username' })
    .select('id, username')
    .single()

  if (err) { joiningError.value = err.message; return }

  me.value = { id: data.id, username: data.username }
  localStorage.setItem(ME_KEY, JSON.stringify(me.value))
  await initChat()
}

// ── Messages ──────────────────────────────────────────────────────────────────

async function fetchMessages() {
  const { data, error: err } = await supabase
    .from('messages')
    .select('*')
    .order('created_at', { ascending: true })
  if (err) { error.value = err.message }
  else {
    messages.value = data ?? []
    await nextTick()
    listEl.value?.scrollTo({ top: listEl.value.scrollHeight })
  }
  loading.value = false
}

async function send() {
  const text = input.value.trim()
  if (!text || !me.value) return
  input.value = ''
  await heartbeat() // refresh presence on activity
  const { error: err } = await supabase.from('messages').insert({
    text,
    username: me.value.username,
    user_id: me.value.id,
  })
  if (err) error.value = err.message
}

// ── Presence ──────────────────────────────────────────────────────────────────

// const PRESENCE_TIMEOUT = 30_000 // 30s
const PRESENCE_TIMEOUT = 5_000 // 5s
let heartbeatTimer: ReturnType<typeof setInterval>

async function heartbeat() {
  if (!me.value) return
  await supabase.from('presence').upsert(
    { user_id: me.value.id, username: me.value.username, last_seen_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  )
}

async function fetchOnlineUsers() {
  const cutoff = new Date(Date.now() - PRESENCE_TIMEOUT).toISOString()
  const { data } = await supabase
    .from('presence')
    .select('user_id, username, last_seen_at')
    .gte('last_seen_at', cutoff)
    .order('username')
  onlineUsers.value = data ?? []
}

// ── Realtime channels ─────────────────────────────────────────────────────────

let msgChannel: ReturnType<typeof supabase.channel>
let presenceChannel: ReturnType<typeof supabase.channel>

function subscribeMessages() {
  msgChannel = supabase
    .channel('public:messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
      async (payload) => {
        messages.value.push(payload.new as Message)
        await nextTick()
        listEl.value?.scrollTo({ top: listEl.value.scrollHeight, behavior: 'smooth' })
      }
    )
    .subscribe()
}

function subscribePresence() {
  presenceChannel = supabase
    .channel('public:presence')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'presence' },
      () => fetchOnlineUsers()
    )
    .subscribe()
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

async function initChat() {
  await Promise.all([fetchMessages(), fetchOnlineUsers(), heartbeat()])
  subscribeMessages()
  subscribePresence()
  heartbeatTimer = setInterval(async () => {
    await heartbeat()
    await fetchOnlineUsers()
  }, 15_000)
}

onMounted(async () => {
  if (me.value) await initChat()
})

onUnmounted(() => {
  msgChannel?.unsubscribe()
  presenceChannel?.unsubscribe()
  clearInterval(heartbeatTimer)
})
</script>

<template>
  <!-- Username prompt -->
  <div v-if="!me" class="join-screen">
    <div class="join-card">
      <h2>Join the chat</h2>
      <p>Pick a username to get started</p>
      <form @submit.prevent="join">
        <input
          v-model="usernameInput"
          class="join-input"
          placeholder="Your username"
          autocomplete="off"
          maxlength="32"
        />
        <p v-if="joiningError" class="join-error">{{ joiningError }}</p>
        <button class="join-btn" type="submit">Join →</button>
      </form>
    </div>
  </div>

  <!-- Chat UI -->
  <div v-else class="chat-layout">
    <!-- Sidebar: online users -->
    <aside class="presence-sidebar">
      <div class="presence-title">Online ({{ onlineUsers.length }})</div>
      <ul class="presence-list">
        <li
          v-for="u in onlineUsers"
          :key="u.user_id"
          class="presence-item"
          :class="{ 'presence-item--me': u.user_id === me!.id }"
        >
          <span class="presence-dot" />
          {{ u.username }}<span v-if="u.user_id === me!.id"> (you)</span>
        </li>
      </ul>
    </aside>

    <!-- Main chat -->
    <div class="chat-container">
      <div class="chat-header">
        Chat
        <span class="chat-identity">as <strong>{{ me.username }}</strong></span>
      </div>
      <div class="chat-list" ref="listEl">
        <div v-if="loading" class="chat-status">Loading…</div>
        <div v-else-if="error" class="chat-status chat-status--error">{{ error }}</div>
        <template v-else>
          <div
            v-for="msg in messages"
            :key="msg.id"
            class="chat-message"
            :class="{ 'chat-message--self': msg.user_id === me!.id }"
          >
            <div class="chat-bubble">
              <span class="chat-author">{{ msg.username ?? msg.user_id }}</span>
              <p class="chat-text">{{ msg.text }}</p>
              <span class="chat-time">{{ formatTime(msg.created_at) }}</span>
            </div>
          </div>
        </template>
      </div>
      <form class="chat-input-row" @submit.prevent="send">
        <input
          v-model="input"
          class="chat-input"
          type="text"
          placeholder="Type a message…"
          autocomplete="off"
        />
        <button class="chat-send" type="submit">Send</button>
      </form>
    </div>
  </div>
</template>

<style scoped>
/* ── Join screen ── */
.join-screen {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: #f9fafb;
}

.join-card {
  background: #fff;
  border-radius: 16px;
  padding: 2.5rem 2rem;
  width: 320px;
  box-shadow: 0 4px 24px rgba(0,0,0,.08);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.join-card h2 {
  margin: 0;
  font-size: 1.4rem;
}

.join-card p {
  margin: 0 0 0.5rem;
  color: #6b7280;
  font-size: 0.9rem;
}

.join-input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.65rem 0.9rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 1rem;
  outline: none;
  margin-bottom: 0.5rem;
  transition: border-color 0.15s;
}

.join-input:focus { border-color: #6366f1; }

.join-error {
  margin: 0 0 0.5rem;
  color: #ef4444;
  font-size: 0.82rem;
}

.join-btn {
  width: 100%;
  padding: 0.65rem;
  background: #6366f1;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.join-btn:hover { background: #4f46e5; }

/* ── Layout ── */
.chat-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

/* ── Presence sidebar ── */
.presence-sidebar {
  width: 200px;
  flex-shrink: 0;
  border-right: 1px solid #e5e7eb;
  background: #fafafa;
  display: flex;
  flex-direction: column;
  padding: 1rem;
  gap: 0.5rem;
  overflow-y: auto;
}

.presence-title {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #9ca3af;
}

.presence-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.presence-item {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.88rem;
  color: #374151;
}

.presence-item--me { font-weight: 600; }

.presence-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #22c55e;
  flex-shrink: 0;
}

/* ── Chat ── */
.chat-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.chat-header {
  padding: 1rem 1.5rem;
  font-size: 1.1rem;
  font-weight: 700;
  border-bottom: 1px solid #e5e7eb;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.chat-identity {
  font-size: 0.8rem;
  font-weight: 400;
  color: #9ca3af;
}

.chat-list {
  flex: 1;
  overflow-y: auto;
  padding: 1rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.chat-message { display: flex; }
.chat-message--self { justify-content: flex-end; }

.chat-bubble {
  max-width: 70%;
  background: #f3f4f6;
  border-radius: 12px;
  padding: 0.5rem 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.chat-message--self .chat-bubble {
  background: #6366f1;
  color: #fff;
}

.chat-author {
  font-size: 0.7rem;
  font-weight: 600;
  opacity: 0.65;
}

.chat-text {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.4;
  word-break: break-word;
}

.chat-time {
  font-size: 0.65rem;
  opacity: 0.5;
  align-self: flex-end;
}

.chat-input-row {
  display: flex;
  gap: 0.5rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid #e5e7eb;
  background: #fff;
}

.chat-input {
  flex: 1;
  padding: 0.6rem 0.9rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 0.95rem;
  outline: none;
  transition: border-color 0.15s;
}

.chat-input:focus { border-color: #6366f1; }

.chat-send {
  padding: 0.6rem 1.2rem;
  background: #6366f1;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.chat-send:hover { background: #4f46e5; }

.chat-status {
  text-align: center;
  color: #9ca3af;
  font-size: 0.85rem;
  padding: 1rem 0;
}

.chat-status--error { color: #ef4444; }
</style>
