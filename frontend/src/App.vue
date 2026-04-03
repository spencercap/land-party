<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <nav class="app-nav">
    <RouterLink to="/">Home</RouterLink>
    <RouterLink to="/chat">Chat</RouterLink>
  </nav>
  <RouterView />
</template>

<style scoped>
.app-nav {
  display: flex;
  gap: 1rem;
  padding: 0.75rem 1.5rem;
  border-bottom: 1px solid #e5e7eb;
  background: #fff;
}

.app-nav a {
  text-decoration: none;
  color: #6b7280;
  font-weight: 500;
  font-size: 0.9rem;
  transition: color 0.15s;
}

.app-nav a:hover,
.app-nav a.router-link-active {
  color: #6366f1;
}
</style>
