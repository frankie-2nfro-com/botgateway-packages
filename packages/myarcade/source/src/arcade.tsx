import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { translate, type CopyKey, type Lang } from './i18n.ts'
import { getState, refresh, subscribe, type Game } from './store.ts'
import { ArcadeContext, type ArcadeApi } from './useArcade.ts'

export function ArcadeProvider({ children }: { children: ReactNode }) {
  const db = useSyncExternalStore(subscribe, getState)
  useEffect(() => {
    document.documentElement.lang = db.lang
  }, [db.lang])
  useEffect(() => {
    void refresh()
  }, [])

  const api = useMemo<ArcadeApi>(() => {
    const t = (key: CopyKey, vars?: Record<string, string | number>) => translate(db.lang, key, vars)
    const word = (map: Partial<Record<Lang, string>> | undefined) => map?.[db.lang] ?? map?.en ?? ''
    return {
      db,
      t,
      word,
      text: (game: Game | undefined, key: 'title' | 'blurb' | 'howto') => word(game?.text.en ? Object.fromEntries(Object.entries(game.text).map(([lang, value]) => [lang, value?.[key]])) : undefined),
      user: db.user,
      counts: db.counts,
    }
  }, [db])

  return <ArcadeContext.Provider value={api}>{children}</ArcadeContext.Provider>
}
