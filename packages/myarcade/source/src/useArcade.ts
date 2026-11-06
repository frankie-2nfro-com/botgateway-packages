import { createContext, useContext } from 'react'
import type { CopyKey, Lang } from './i18n.ts'
import type { Game, Player, State } from './store.ts'

export interface ArcadeApi {
  db: State
  t: (key: CopyKey, vars?: Record<string, string | number>) => string
  /** A game's own word, from game.json: this language, else English. */
  word: (map: Partial<Record<Lang, string>> | undefined) => string
  text: (game: Game | undefined, key: 'title' | 'blurb' | 'howto') => string
  user: Player | null
  counts: Record<string, number>
}

export const ArcadeContext = createContext<ArcadeApi | null>(null)

export function useArcade() {
  const api = useContext(ArcadeContext)
  if (!api) throw new Error('ArcadeProvider missing')
  return api
}
