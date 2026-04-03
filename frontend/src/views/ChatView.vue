<script setup lang="ts">
import { ref, nextTick } from 'vue'

interface Message {
  id: number
  text: string
  author: string
  timestamp: string
}

const messages = ref<Message[]>([
  { id: 1, text: 'Welcome to the chat!', author: 'System', timestamp: formatTime(new Date()) },
])
const input = ref('')
const listEl = ref<HTMLElement | null>(null)
let nextId = 2

function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

async function send() {
  const text = input.value.trim()
  if (!text) return
  messages.value.push({
    id: nextId++,
    text,
    author: 'You',
    timestamp: formatTime(new Date()),
  })
  input.value = ''
  await nextTick()
  listEl.value?.scrollTo({ top: listEl.value.scrollHeight, behavior: 'smooth' })
}
</script>

<template>
  <div class="chat-container">
    <div class="chat-header">Chat</div>
    <div class="chat-list" ref="listEl">
      <div
        v-for="msg in messages"
        :key="msg.id"
        class="chat-message"
        :class="{ 'chat-message--self': msg.author === 'You' }"
      >
        <div class="chat-bubble">
          <span class="chat-author">{{ msg.author }}</span>
          <p class="chat-text">{{ msg.text }}</p>
          <span class="chat-time">{{ msg.timestamp }}</span>
        </div>
      </div>
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
</template>

<style scoped>
.chat-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  max-width: 700px;
  margin: 0 auto;
  font-family: inherit;
}

.chat-header {
  padding: 1rem 1.5rem;
  font-size: 1.2rem;
  font-weight: 700;
  border-bottom: 1px solid #e5e7eb;
  background: #fff;
}

.chat-list {
  flex: 1;
  overflow-y: auto;
  padding: 1rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.chat-message {
  display: flex;
}

.chat-message--self {
  justify-content: flex-end;
}

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

.chat-input:focus {
  border-color: #6366f1;
}

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

.chat-send:hover {
  background: #4f46e5;
}
</style>
