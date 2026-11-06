// The arcade's state: games, players, plays and boards are on the gateway (the application's own data); this browser keeps only
// the login token, the language and the mute switch. A game never runs in this page, so it can't read them.
import { detectLang, isLang, type Lang } from './i18n.ts'

const KEY = 'nexus-arcade-v2'

type Words = Partial<Record<Lang, string>>
export interface Game {
  id: string
  version: string
  kind: '2d' | '3d'
  engine: string
  stage: 'wide' | 'standard'
  tags: string[]
  text: Partial<Record<Lang, { title: string; blurb: string; howto: string }>>
  panel: Array<string | { key: string; label: Words }>
  pad: Array<{ action: string; label: string | Words }>
  cover: string
  released: string
  files: string[]
}
export interface Player {
  id: number
  name: string
}
export interface Play {
  id: number
  userId: number
  gameId: string
  startedAt: number
  endedAt: number | null
  score: number
  level: number
  stats: Record<string, number>
}
export interface BoardRow {
  userId: number
  name: string
  score: number
}
export interface State {
  loaded: boolean
  failed: boolean
  who: string
  games: Game[]
  counts: Record<string, number>
  boards: Record<string, BoardRow[]>
  titles: Record<string, Game['text'] | null>
  user: Player | null
  plays: Play[]
  lang: Lang
  muted: boolean
}
export type AuthError = 'username' | 'taken' | 'short' | 'mismatch' | 'bad' | 'limit'

function loadLocal() {
  const base = { token: null as string | null, lang: detectLang(), muted: false }
  try {
    const data = JSON.parse(localStorage.getItem(KEY) ?? '{}') as { token?: unknown; lang?: unknown; muted?: unknown }
    return { token: typeof data.token === 'string' ? data.token : null, lang: isLang(data.lang) ? data.lang : base.lang, muted: Boolean(data.muted) }
  } catch {
    return base
  }
}

const local = loadLocal()
let token = local.token
let state: State = {
  loaded: false, failed: false, who: 'visitor', games: [], counts: {}, boards: {}, titles: {}, user: null, plays: [], lang: local.lang, muted: local.muted,
}
const listeners = new Set<() => void>()

function saveLocal() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ token, lang: state.lang, muted: state.muted }))
  } catch {
    // A private window: it works until the page is closed.
  }
}

function commit(next: Partial<State>) {
  state = { ...state, ...next }
  saveLocal()
  for (const listener of listeners) listener()
}

export function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getState(): State {
  return state
}

export function apiUrl(path: string) {
  return new URL(`api/${path}`, document.baseURI).href
}

async function post<T>(path: string, body: object, keepalive = false): Promise<T> {
  const response = await fetch(apiUrl(path), {
    method: 'POST',
    keepalive,
    headers: { 'content-type': 'application/json', 'x-botgateway': '1' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(await response.text())
  return (await response.json()) as T
}

export async function refresh() {
  try {
    const next = await post<Pick<State, 'who' | 'games' | 'counts' | 'boards' | 'user' | 'plays' | 'titles'>>('state', { token })
    if (token && !next.user) token = null
    commit({ ...next, loaded: true, failed: false })
  } catch {
    commit({ loaded: true, failed: true })
  }
}

export function setLang(lang: Lang) {
  commit({ lang })
}

export function setMuted(muted: boolean) {
  commit({ muted })
}

export async function logout() {
  const old = token
  token = null
  commit({ user: null, plays: [] })
  if (old) await post('auth/logout', { token: old }).catch(() => undefined)
}

async function signIn(path: string, body: object): Promise<AuthError | null> {
  try {
    const answer = await post<{ token?: string; error?: AuthError }>(path, body)
    if (answer.error || !answer.token) return answer.error ?? 'bad'
    token = answer.token
    await refresh()
    return null
  } catch {
    return 'bad'
  }
}

export function register(name: string, password: string, confirm: string) {
  return signIn('auth/register', { name, password, confirm })
}

export function login(name: string, password: string) {
  return signIn('auth/login', { name, password })
}

export async function beginPlay(game: string): Promise<number | null> {
  try {
    return (await post<{ play: number }>('plays/begin', { token, game })).play
  } catch {
    return null
  }
}

export function completePlay(play: number, result: { score?: number; level?: number; stats?: Record<string, number> }) {
  // keepalive: also when the player is leaving the page.
  return post('plays/end', { token, play, score: result.score ?? 0, level: result.level ?? 1, stats: result.stats ?? {} }, true)
    .catch(() => undefined)
    .then(refresh)
}
