import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { hottestGames, latestGames } from '../catalog.ts'
import { GameCard } from '../components/GameCard.tsx'
import { LANGS, translate, type CopyKey } from '../i18n.ts'
import { useArcade } from '../useArcade.ts'

export function HomePage() {
  const { t, text, counts, db } = useArcade()
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()

  const results = useMemo(() => {
    if (!q) return []
    return db.games.filter((game) => {
      const tags = LANGS.flatMap((lang) => game.tags.map((tag) => translate(lang.id, `tag.${tag}` as CopyKey) ?? tag))
      const words = Object.values(game.text).flatMap((value) => [value?.title ?? '', value?.blurb ?? ''])
      const blob = [game.id, game.kind, game.engine, ...game.tags, ...tags, ...words].join(' ').toLowerCase()
      return blob.includes(q)
    })
  }, [q, db.games])

  const latest = latestGames(db.games)
  const hottest = hottestGames(db.games, counts)

  return (
    <div className="home">
      <section className="hero">
        <p className="kicker">{t('hero.kicker')}</p>
        <h1>{t('hero.title')}</h1>
        <p className="lede">{t('hero.sub')}</p>
        <label className="search">
          <span>{t('search.label')}</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('search.placeholder')}
            type="search"
            enterKeyHint="search"
          />
        </label>
      </section>

      {q ? (
        <section>
          <header className="section-head">
            <h2>{t('search.results')}</h2>
          </header>
          {results.length === 0 ? (
            <p className="empty">{t('search.empty')}</p>
          ) : (
            <div className="cards">
              {results.map((game) => (
                <GameCard key={game.id} game={game} count={counts[game.id] ?? 0} />
              ))}
            </div>
          )}
        </section>
      ) : (
        <>
          <section>
            <header className="section-head">
              <div>
                <h2>{t('section.latest')}</h2>
                <p>{t('section.latestSub')}</p>
              </div>
            </header>
            <div className="cards">
              {latest.map((game) => (
                <GameCard key={game.id} game={game} count={counts[game.id] ?? 0} />
              ))}
            </div>
          </section>

          <section>
            <header className="section-head">
              <div>
                <h2>{t('section.hottest')}</h2>
                <p>{t('section.hottestSub')}</p>
              </div>
              <p className="note">{t('section.deviceNote')}</p>
            </header>
            <ol className="ranks">
              {hottest.map((game, index) => {
                const count = counts[game.id] ?? 0
                return (
                  <li key={game.id}>
                    <span className="rank">{String(index + 1).padStart(2, '0')}</span>
                    <div>
                      <h3>{text(game, 'title')}</h3>
                      <p>{text(game, 'blurb')}</p>
                    </div>
                    <span className="plays">
                      <strong>{new Intl.NumberFormat(db.lang).format(count)}</strong>
                      {t('card.plays')}
                    </span>
                    <Link className="play" to={`/play/${game.id}`}>
                      {t('card.play')}
                    </Link>
                  </li>
                )
              })}
            </ol>
          </section>
        </>
      )}
    </div>
  )
}
