<script setup lang="ts">
import type { PresenceUser } from '../composables/usePresence'

defineProps<{
  users: PresenceUser[]
  currentUserId: string
  room?: string
}>()
</script>

<template>
  <aside class="presence-sidebar">
    <div class="presence-header">
      <span class="presence-title">Online · {{ users.length }}</span>
      <span v-if="room" class="presence-room">#{{ room }}</span>
    </div>
    <ul class="presence-list">
      <li
        v-for="u in users"
        :key="u.user_id"
        class="presence-item"
        :class="{ 'presence-item--me': u.user_id === currentUserId }"
      >
        <span class="presence-dot" />
        <span class="presence-name">{{ u.username }}</span>
        <span v-if="u.user_id === currentUserId" class="presence-you">you</span>
      </li>
    </ul>
  </aside>
</template>

<style scoped>
.presence-sidebar {
  width: 200px;
  flex-shrink: 0;
  border-right: 1px solid #e5e7eb;
  background: #fafafa;
  display: flex;
  flex-direction: column;
  padding: 1rem;
  gap: 0.75rem;
  overflow-y: auto;
}

.presence-header {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.presence-title {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #9ca3af;
}

.presence-room {
  font-size: 0.82rem;
  font-weight: 600;
  color: #6366f1;
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

.presence-item--me .presence-name {
  font-weight: 600;
}

.presence-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #22c55e;
  flex-shrink: 0;
}

.presence-you {
  font-size: 0.7rem;
  color: #9ca3af;
}
</style>
