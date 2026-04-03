import { ref, watch, onMounted, onUnmounted } from 'vue'
import type { Ref } from 'vue'
import { supabase } from '../utils/supabase'

export interface PresenceUser {
  user_id: string
  username: string
}

const STALE_AFTER_MS = 25_000

export function usePresence(
  me: Ref<{ id: string; username: string } | null>,
  room: Ref<string>,
) {
  const onlineUsers = ref<PresenceUser[]>([])
  let channel: ReturnType<typeof supabase.channel> | null = null

  function uniqueFromState(): PresenceUser[] {
    if (!channel) return []
    const state = channel.presenceState()
    const seen = new Map<string, PresenceUser>()
    for (const entries of Object.values(state)) {
      for (const e of entries as unknown as PresenceUser[]) {
        if (!seen.has(e.user_id)) seen.set(e.user_id, e)
      }
    }
    return [...seen.values()].sort((a, b) => a.username.localeCompare(b.username))
  }

  async function reconcileDb(current: PresenceUser[]) {
    const r = room.value
    const now = new Date().toISOString()
    if (current.length === 0) {
      await supabase.from('presence').delete().eq('room', r)
      return
    }
    await supabase.from('presence').upsert(
      current.map(u => ({ user_id: u.user_id, username: u.username, room: r, last_seen_at: now })),
      { onConflict: 'user_id,room' },
    )
    await supabase
      .from('presence')
      .delete()
      .eq('room', r)
      .not('user_id', 'in', `(${current.map(u => u.user_id).join(',')})`)
  }

  async function connect(r: string) {
    if (!me.value) return

    // Seed sidebar from DB while WebSocket connects
    const { data } = await supabase
      .from('presence')
      .select('user_id, username')
      .eq('room', r)
    onlineUsers.value = data ?? []

    // Clean up any stale rows left by crashed sessions
    const cutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString()
    await supabase.from('presence').delete().eq('room', r).lt('last_seen_at', cutoff)

    channel = supabase.channel(`room:${r}`, {
      config: { presence: { key: me.value.id } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const current = uniqueFromState()
        onlineUsers.value = current
        reconcileDb(current)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel!.track({ user_id: me.value!.id, username: me.value!.username })
        }
      })
  }

  async function disconnect() {
    if (!channel) return
    await channel.untrack()
    channel.unsubscribe()
    channel = null
    // Explicitly delete own row so cleanup never depends on a peer receiving
    // the sync event (critical when we're the last/only user in the room).
    if (me.value) {
      await supabase
        .from('presence')
        .delete()
        .eq('user_id', me.value.id)
        .eq('room', room.value)
    }
  }

  // On hard tab close we can't await async ops, but untrack() signals peers
  // so their next sync event will reconcile the DB.
  // Any row we leave behind gets swept by deleteStaleRows() on the next connect.
  function onBeforeUnload() {
    channel?.untrack()
  }

  // Reconnect when navigating between rooms
  watch(room, async (newRoom) => {
    await disconnect()
    onlineUsers.value = []
    if (me.value) await connect(newRoom)
  })

  // Connect once the user logs in
  watch(me, async (newMe, oldMe) => {
    if (newMe && !oldMe) {
      window.addEventListener('beforeunload', onBeforeUnload)
      await connect(room.value)
    } else if (!newMe && oldMe) {
      window.removeEventListener('beforeunload', onBeforeUnload)
      await disconnect()
    }
  })

  onMounted(async () => {
    if (me.value) {
      window.addEventListener('beforeunload', onBeforeUnload)
      await connect(room.value)
    }
  })

  onUnmounted(async () => {
    window.removeEventListener('beforeunload', onBeforeUnload)
    await disconnect()
  })

  return { onlineUsers }
}
