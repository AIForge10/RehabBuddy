// Live sessions over the network (backend/api/data/live.py): the patient's
// session screen streams angles, reps and form cues, and the therapist's
// dashboard watches. Never video.
//
//   openLivePublisher  patient: a WebSocket to /live/{id}/publish. Browsers
//                      can't put headers on a WebSocket, so the token is its
//                      first message (never the URL).
//   watchLive          therapist: Server-Sent Events from /live/watch, read with
//                      fetch() because EventSource can't send the
//                      Authorization header either.
//
// Mock mode (VITE_USE_MOCKS=true) has no backend: a BroadcastChannel carries the
// same events between a patient tab and a therapist tab in this browser.
//
// Both sides are best effort. Nothing here throws or makes the caller wait: if
// the backend is unreachable the session carries on and the dashboard simply
// shows no one live, while both keep retrying quietly in the background.

import type { LiveEnd, LiveEvent, LiveUpdate } from '../types/live'
import type { UUID } from '../types/session'
import { API_URL, USE_MOCKS, getAuthToken } from './client'

const CHANNEL = 'rehabbuddy.live.v1'
const RETRY_MS = [1000, 2000, 5000, 10_000]
/** The backend comments every 10 s on a quiet stream; this long without a byte means it's dead. */
const SILENT_MS = 25_000
/** Don't queue batches behind a slow connection: drop them, the next one is 250 ms away. */
const MAX_BUFFERED = 64 * 1024

const retryDelay = (attempt: number) => RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)]

function openChannel(): BroadcastChannel | null {
  try {
    return new BroadcastChannel(CHANNEL)
  } catch {
    return null
  }
}

// --- Patient side ----------------------------------------------------------------

export type PublishedEvent = LiveUpdate | (LiveEnd & { reason: 'finished' | 'exited' })

export interface LivePublisher {
  /** Sends now if connected; otherwise drops it. */
  send: (event: PublishedEvent) => void
  close: () => void
}

/** `onConnected` reports whether events are reaching the backend (always true in mock mode). */
export function openLivePublisher(patientId: UUID, onConnected: (connected: boolean) => void): LivePublisher {
  if (USE_MOCKS) {
    const channel = openChannel()
    onConnected(channel != null)
    return {
      send: (event) => {
        try {
          channel?.postMessage(event)
        } catch {
          /* closed: nothing to do */
        }
      },
      close: () => channel?.close(),
    }
  }

  const url = `${API_URL.replace(/^http/, 'ws')}/live/${encodeURIComponent(patientId)}/publish`
  let ws: WebSocket | null = null
  let ready = false
  let closed = false
  let attempt = 0
  let retry: ReturnType<typeof setTimeout> | undefined

  const connect = () => {
    const token = getAuthToken()
    if (closed || !token) return
    try {
      ws = new WebSocket(url)
    } catch {
      retry = setTimeout(connect, retryDelay(attempt++))
      return
    }
    const socket = ws
    socket.onopen = () => socket.send(JSON.stringify({ token }))
    // The only thing the backend ever sends is {"ok": true}, once the token checks out.
    socket.onmessage = () => {
      ready = true
      attempt = 0
      onConnected(true)
    }
    socket.onclose = (e) => {
      ready = false
      ws = null
      onConnected(false)
      // 4401/4403: this login can't publish this session, and retrying won't change that.
      if (!closed && e.code !== 4401 && e.code !== 4403) retry = setTimeout(connect, retryDelay(attempt++))
    }
  }
  connect()

  return {
    send: (event) => {
      if (!ready || ws?.readyState !== WebSocket.OPEN || ws.bufferedAmount > MAX_BUFFERED) return
      try {
        ws.send(JSON.stringify(event))
      } catch {
        /* closing: onclose reconnects */
      }
    },
    close: () => {
      closed = true
      clearTimeout(retry)
      // Anything already sent (the end event) goes out before the close.
      ws?.close(1000)
    },
  }
}

// --- Therapist side --------------------------------------------------------------

/** Calls `onEvent` for every event about these patients; returns a function that stops watching. */
export function watchLive(patientIds: UUID[], onEvent: (event: LiveEvent) => void): () => void {
  if (USE_MOCKS) {
    const channel = openChannel()
    if (!channel) return () => {}
    const ids = new Set(patientIds)
    channel.onmessage = (e: MessageEvent<LiveEvent>) => {
      if (ids.has(e.data?.patient_id)) onEvent(e.data)
    }
    return () => channel.close()
  }

  const url = `${API_URL}/live/watch?${patientIds.map((id) => `patient_id=${encodeURIComponent(id)}`).join('&')}`
  let stopped = false
  let controller: AbortController | null = null
  let attempt = 0
  let retry: ReturnType<typeof setTimeout> | undefined
  let silence: ReturnType<typeof setTimeout> | undefined

  const listen = async () => {
    const token = getAuthToken()
    const abort = (controller = new AbortController())
    const alive = () => {
      clearTimeout(silence)
      silence = setTimeout(() => abort.abort(), SILENT_MS)
    }
    try {
      alive()
      const res = await fetch(url, {
        headers: { Accept: 'text/event-stream', ...(token && { Authorization: `Bearer ${token}` }) },
        cache: 'no-store',
        signal: abort.signal,
      })
      if (!res.ok || !res.body) throw new Error(`live stream: HTTP ${res.status}`)
      attempt = 0
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
      let buffer = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        alive()
        // Events are separated by a blank line; lines starting with ':' are keep-alive comments.
        const frames = (buffer + value).split(/\r?\n\r?\n/)
        buffer = frames.pop() ?? ''
        for (const frame of frames) {
          const data = frame
            .split(/\r?\n/)
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trimStart())
            .join('\n')
          if (!data) continue
          let event: LiveEvent
          try {
            event = JSON.parse(data) as LiveEvent
          } catch {
            continue
          }
          onEvent(event)
        }
      }
    } catch {
      /* offline, backend down, logged out or stopped: retried below unless stopped */
    }
    clearTimeout(silence)
    if (!stopped) retry = setTimeout(listen, retryDelay(attempt++))
  }
  listen()

  return () => {
    stopped = true
    clearTimeout(retry)
    clearTimeout(silence)
    controller?.abort()
  }
}
