import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import type { CopyKey, Lang } from '../i18n.ts'
import { apiUrl, beginPlay, completePlay, setMuted, type Game } from '../store.ts'
import { useArcade } from '../useArcade.ts'

type Status = 'ready' | 'playing' | 'paused' | 'over'
interface Snap {
  status: Status
  score: number
  level: number
  won: boolean
  stats: Record<string, number>
}
const emptySnap: Snap = { status: 'ready', score: 0, level: 1, won: false, stats: {} }
const WORDS: Record<string, CopyKey> = { left: 'game.left', right: 'game.right', up: 'game.up', down: 'game.down', jump: 'game.jump' }
const ASSET_TYPES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', mp3: 'audio/mpeg',
  ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', woff2: 'font/woff2', json: 'application/json', bin: 'application/octet-stream',
}

function HoldButton({ label, onDown, onUp }: { label: string; onDown: () => void; onUp: () => void }) {
  return (
    <button
      type="button"
      onPointerDown={(event) => {
        event.preventDefault()
        onDown()
      }}
      onPointerUp={onUp}
      onPointerLeave={onUp}
      onPointerCancel={onUp}
    >
      {label}
    </button>
  )
}

/** The room: the shell's look, with the game in a sandboxed frame (no origin, no network, no API). */
export function Room({ game, record, back }: { game: Game; record: boolean; back: string }) {
  const { t, text, word, db } = useArcade()
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [snap, setSnap] = useState<Snap>(emptySnap)
  const [mounted, setMounted] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const playId = useRef<Promise<number | null> | null>(null)
  const latest = useRef<Snap>(emptySnap)
  const status = useRef<Status | null>(null)
  const number = new Intl.NumberFormat(db.lang)
  const muted = db.muted
  const startMuted = useRef(muted)
  const lang = useRef<Lang>(db.lang)

  const post = useCallback((message: object) => frameRef.current?.contentWindow?.postMessage(message, '*'), [])
  const focusFrame = useCallback(() => {
    frameRef.current?.contentWindow?.focus()
    post({ type: 'focus' })
  }, [post])

  useEffect(() => {
    post({ type: 'mute', muted })
  }, [muted, post])

  useEffect(() => {
    const finish = () => {
      const play = playId.current
      if (!play) return
      playId.current = null
      const result = latest.current
      void play.then((id) => {
        if (id) void completePlay(id, { score: result.score, level: result.level, stats: result.stats })
      })
    }
    const onState = (state: Partial<Snap> & { status?: Status }) => {
      const next = state.status
      if (!next || !['ready', 'playing', 'paused', 'over'].includes(next)) return
      const score = Number.isSafeInteger(state.score) && (state.score ?? 0) >= 0 ? (state.score as number) : 0
      const level = Number.isSafeInteger(state.level) ? (state.level as number) : 1
      const stats: Record<string, number> = {}
      for (const [key, value] of Object.entries(state.stats ?? {})) if (Number.isFinite(value)) stats[key] = value
      const clean: Snap = { status: next, score, level, won: Boolean(state.won), stats }
      const before = status.current
      status.current = next
      // A new run: from ready or over to playing. Its end: over, or leaving.
      if (record && next === 'playing' && (before === 'ready' || before === 'over')) {
        finish()
        playId.current = beginPlay(game.id)
      }
      latest.current = clean
      if (next === 'over') finish()
      setSnap(clean)
    }

    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || !event.data?.arcade) return
      const message = event.data as { type: string; state?: Snap; message?: string }
      if (message.type === 'ready') void boot()
      else if (message.type === 'mounted') setMounted(true)
      else if (message.type === 'state' && message.state) onState(message.state)
      else if (message.type === 'error') setFailure(String(message.message ?? '').slice(0, 300))
    }
    const boot = async () => {
      try {
        const file = (name: string) => apiUrl(`games/${game.id}/${game.version}/${name}`)
        const response = await fetch(file('game.js'))
        if (!response.ok) throw new Error(`game.js: ${response.status}`)
        const code = await response.text()
        const assets = []
        for (const name of game.files) {
          const type = ASSET_TYPES[name.split('.').pop()?.toLowerCase() ?? '']
          if (!type || name === 'game.json') continue
          const asset = await fetch(file(name))
          if (asset.ok) assets.push({ name, type, data: await asset.arrayBuffer() })
        }
        post({ type: 'boot', code, assets, fonts: await gameFonts(), lang: lang.current, muted: startMuted.current })
      } catch (error) {
        setFailure(String(error))
      }
    }
    const forwardKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select')) return
      if (event.key.startsWith('Arrow') || event.key === ' ') event.preventDefault()
      post({ type: 'key', event: event.type, key: event.key, code: event.code })
    }
    window.addEventListener('message', onMessage)
    window.addEventListener('keydown', forwardKey)
    window.addEventListener('keyup', forwardKey)
    window.addEventListener('pagehide', finish)
    return () => {
      finish()
      window.removeEventListener('message', onMessage)
      window.removeEventListener('keydown', forwardKey)
      window.removeEventListener('keyup', forwardKey)
      window.removeEventListener('pagehide', finish)
    }
  }, [game, post, record])

  const start = () => {
    post({ type: 'start' })
    focusFrame()
  }
  const resume = () => {
    post({ type: 'resume' })
    focusFrame()
  }

  return (
    <section className="room">
      <div className="room-bar">
        <Link to={back}>{t('game.back')}</Link>
        <h1>{text(game, 'title')}</h1>
        <button type="button" className="ghost" onClick={() => setMuted(!db.muted)}>
          {db.muted ? t('game.unmute') : t('game.mute')}
        </button>
      </div>

      <div className="stage-layout">
        <div className={game.stage === 'wide' ? 'bezel wide' : 'bezel'}>
          {/* "autoplay *": a frame with no origin matches no default list, and its sound would stay off. */}
          <iframe ref={frameRef} src="frame.html" title={text(game, 'title')} allow="autoplay *; fullscreen *; gamepad *" />
          {snap.status !== 'playing' ? (
            <div className="overlay">
              <p>
                {failure ??
                  (snap.status === 'over'
                    ? snap.won
                      ? t('game.clear')
                      : t('game.over')
                    : snap.status === 'paused'
                      ? t('game.paused')
                      : mounted
                        ? t('game.ready')
                        : t('game.loading'))}
              </p>
              {snap.status === 'over' ? <strong>{number.format(snap.score)}</strong> : null}
              {snap.status === 'paused' ? (
                <button type="button" className="play" onClick={resume}>
                  {t('game.resume')}
                </button>
              ) : (
                <button type="button" className="play" disabled={!mounted} onClick={start}>
                  {snap.status === 'over' ? t('game.restart') : t('game.start')}
                </button>
              )}
            </div>
          ) : null}
        </div>
        <aside className="panel">
          <dl>
            {game.panel.map((row) => {
              const key = typeof row === 'string' ? row : row.key
              const label = typeof row === 'string' ? t(row === 'level' ? 'game.level' : 'game.score') : word(row.label)
              const value = key === 'score' ? snap.score : key === 'level' ? snap.level : snap.stats[key] ?? 0
              return (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>{number.format(value)}</dd>
                </div>
              )
            })}
          </dl>
        </aside>
      </div>

      <p className="howto">{text(game, 'howto')}</p>
      <div className="pad">
        {game.pad.map((button) => (
          <HoldButton
            key={button.action}
            label={typeof button.label === 'string' ? t(WORDS[button.label] ?? 'game.up') : word(button.label)}
            onDown={() => post({ type: 'input', action: button.action, down: true })}
            onUp={() => post({ type: 'input', action: button.action, down: false })}
          />
        ))}
      </div>
    </section>
  )
}

/** The shell's fonts, for games that draw text with them: a frame with no origin can't load them itself. */
async function gameFonts() {
  const fonts = []
  for (const [family, file, weight] of [
    ['Chakra Petch', 'fonts/chakra-petch-latin-500-normal.woff2', '500'],
    ['Chakra Petch', 'fonts/chakra-petch-latin-600-normal.woff2', '600'],
    ['Chakra Petch', 'fonts/chakra-petch-latin-700-normal.woff2', '700'],
    ['IBM Plex Mono', 'fonts/ibm-plex-mono-latin-400-normal.woff2', '400'],
  ]) {
    try {
      const response = await fetch(new URL(file, document.baseURI))
      if (response.ok) fonts.push({ family, data: await response.arrayBuffer(), descriptors: { weight } })
    } catch {
      // Not there: the game falls back to a system font.
    }
  }
  return fonts
}

export function GamePage() {
  const { gameId = '' } = useParams()
  const { t, user, db } = useArcade()
  const game = db.games.find((item) => item.id === gameId)

  if (!db.loaded) {
    return (
      <section className="missing">
        <h1>{t('game.loading')}</h1>
      </section>
    )
  }
  if (!game) {
    return (
      <section className="missing">
        <h1>{t('game.notFound')}</h1>
        <Link to="/">{t('game.back')}</Link>
      </section>
    )
  }
  if (!user) return <Navigate to={`/login?next=/play/${game.id}`} replace />
  return <Room key={`${game.id}-${game.version}`} game={game} record back="/" />
}

/** The owner's test of any version, draft or not, on the local page: the same room, and nothing is counted. */
export function TestPage() {
  const { gameId = '', version = '' } = useParams()
  const { t } = useArcade()
  const [game, setGame] = useState<Game | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch(apiUrl('admin/state'), { method: 'POST', headers: { 'content-type': 'application/json', 'x-botgateway': '1' }, body: '{}' })
        if (!response.ok) throw new Error(String(response.status))
        const state = (await response.json()) as { games: Array<{ id: string; versions: Array<{ version: string; manifest: Game; files: string[]; created: string }> }> }
        const row = state.games.find((item) => item.id === gameId)?.versions.find((item) => item.version === version)
        if (!row) throw new Error('none')
        setGame({ ...row.manifest, version, files: row.files, released: row.created.slice(0, 10) })
      } catch {
        setFailed(true)
      }
    })()
  }, [gameId, version])

  if (failed) {
    return (
      <section className="missing">
        <h1>{t('game.notFound')}</h1>
        <Link to="/">{t('game.back')}</Link>
      </section>
    )
  }
  if (!game) {
    return (
      <section className="missing">
        <h1>{t('game.loading')}</h1>
      </section>
    )
  }
  return <Room key={`${game.id}-${version}`} game={game} record={false} back="/" />
}
