<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { supabase } from '../utils/supabase'
import { usePresence } from '../composables/usePresence'
import OnlineList from '../components/OnlineList.vue'
import ThreeScene from '../components/ThreeScene.vue'

interface Message {
  id: number
  text: string
  username: string
  user_id: string
  created_at: string
  room: string
}

// ── Identity ──────────────────────────────────────────────────────────────────

const ME_KEY = 'chat_user'
const stored = localStorage.getItem(ME_KEY)
const me = ref<{ id: string; username: string } | null>(
  stored ? JSON.parse(stored) : null,
)
const usernameInput = ref('')
const joiningError = ref('')

async function join() {
  const username = usernameInput.value.trim()
  if (!username) return
  joiningError.value = ''
  const { data, error: err } = await supabase
    .from('users')
    .upsert({ username }, { onConflict: 'username' })
    .select('id, username')
    .single()
  if (err) { joiningError.value = err.message; return }
  me.value = { id: data.id, username: data.username }
  localStorage.setItem(ME_KEY, JSON.stringify(me.value))
}

// ── Route ─────────────────────────────────────────────────────────────────────

const route = useRoute()
const landId = computed(() => route.params.landId as string)

// ── Presence (composable handles its own lifecycle + room/me watching) ────────

const { onlineUsers } = usePresence(me, landId)

// ── Messages ──────────────────────────────────────────────────────────────────

const messages = ref<Message[]>([])
const input = ref('')
const listEl = ref<HTMLElement | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

async function fetchMessages(room: string) {
  loading.value = true
  error.value = null
  const { data, error: err } = await supabase
    .from('messages')
    .select('*')
    .eq('room', room)
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
  const { error: err } = await supabase.from('messages').insert({
    text,
    username: me.value.username,
    user_id: me.value.id,
    room: landId.value,
  })
  if (err) error.value = err.message
}

let msgChannel: ReturnType<typeof supabase.channel> | null = null

function subscribeMsgs(room: string) {
  msgChannel?.unsubscribe()
  msgChannel = supabase
    .channel(`messages:${room}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `room=eq.${room}` },
      async (payload) => {
        messages.value.push(payload.new as Message)
        await nextTick()
        listEl.value?.scrollTo({ top: listEl.value.scrollHeight, behavior: 'smooth' })
      },
    )
    .subscribe()
}

async function initMessages(room: string) {
  await fetchMessages(room)
  subscribeMsgs(room)
}

// When the user logs in, load messages for current land
watch(me, async (newMe, oldMe) => {
  if (newMe && !oldMe) await initMessages(landId.value)
})

// When navigating between lands, reload messages
watch(landId, async (newLand) => {
  if (!me.value) return
  messages.value = []
  await initMessages(newLand)
})

onMounted(async () => {
  if (me.value) await initMessages(landId.value)
})

onUnmounted(() => {
  msgChannel?.unsubscribe()
})
</script>

<template>
  <!-- Join screen -->
  <div v-if="!me" class="join-screen">
    <div class="join-card">
      <div class="join-land">#{{ landId }}</div>
      <h2>Join the land</h2>
      <p>Pick a username to enter</p>
      <form @submit.prevent="join">
        <input
          v-model="usernameInput"
          class="join-input"
          placeholder="Your username"
          autocomplete="off"
          maxlength="32"
        />
        <p v-if="joiningError" class="join-error">{{ joiningError }}</p>
        <button class="join-btn" type="submit">Enter →</button>
      </form>
    </div>
  </div>

  <!-- Land UI -->
  <div v-else class="land-layout">
    <!-- Left: 3-D scene -->
    <div class="scene-panel">
      <ThreeScene :landId="landId" />
    </div>

    <!-- Right: presence + chat -->
    <div class="side-panel">
      <OnlineList :users="onlineUsers" :currentUserId="me.id" :room="landId" />

      <div class="chat-container">
        <div class="chat-header">
          <span class="chat-land">#{{ landId }}</span>
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
              :class="{ 'chat-message--self': msg.user_id === me.id }"
            >
              <div class="chat-bubble">
                <span class="chat-author">{{ msg.username }}</span>
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
            :placeholder="`Message #${landId}…`"
            autocomplete="off"
          />
          <button class="chat-send" type="submit">Send</button>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── Join ── */
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
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.join-land {
  font-size: 0.82rem;
  font-weight: 700;
  color: #6366f1;
  letter-spacing: 0.02em;
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
.land-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

/* Left panel: Three.js scene */
.scene-panel {
  flex: 1;
  min-width: 0;
  background: #0a0a0f;
  position: relative;
}

/* Right panel: presence + chat stacked */
.side-panel {
  width: 340px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid #e5e7eb;
  overflow: hidden;
}

/* ── Chat ── */
.chat-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.chat-header {
  padding: 0.85rem 1.5rem;
  border-bottom: 1px solid #e5e7eb;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.chat-land {
  font-size: 1rem;
  font-weight: 700;
  color: #111827;
}

.chat-identity {
  font-size: 0.8rem;
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
