import type { Game } from './store.ts'

export function latestGames(games: Game[]): Game[] {
  return [...games].sort((a, b) => b.released.localeCompare(a.released))
}

export function hottestGames(games: Game[], counts: Record<string, number>): Game[] {
  return [...games].sort((a, b) => {
    const diff = (counts[b.id] ?? 0) - (counts[a.id] ?? 0)
    if (diff !== 0) return diff
    return b.released.localeCompare(a.released)
  })
}
