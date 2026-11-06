import { Link } from 'react-router-dom'
import { useArcade } from '../useArcade.ts'

export function StatsPage() {
  const { t, text, word, user, db } = useArcade()
  const mine = user ? db.plays.filter((play) => play.userId === user.id) : []
  const best = mine.reduce((top, play) => Math.max(top, play.score), 0)
  const cabinets = new Set(mine.map((play) => play.gameId)).size
  const recent = [...mine].sort((a, b) => b.startedAt - a.startedAt).slice(0, 8)
  const boards = db.games.map((game) => ({ game, rows: db.boards[game.id] ?? [] })).filter((item) => item.rows.length > 0)
  const played = (id: string) => word(Object.fromEntries(Object.entries(db.titles[id] ?? {}).map(([lang, value]) => [lang, value?.title]))) || id
  const number = new Intl.NumberFormat(db.lang)
  const when = new Intl.DateTimeFormat(db.lang, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <section className="stats">
      <p className="kicker">NEXUS</p>
      <h1>{t('stats.title')}</h1>
      {user ? (
        <>
          <p className="lede">
            {t('nav.player')} {user.name}
          </p>
          <div className="meters">
            <article>
              <span>{t('stats.plays')}</span>
              <strong>{number.format(mine.length)}</strong>
            </article>
            <article>
              <span>{t('stats.best')}</span>
              <strong>{number.format(best)}</strong>
            </article>
            <article>
              <span>{t('stats.lines')}</span>
              <strong>{number.format(cabinets)}</strong>
            </article>
          </div>
          <h2>{t('stats.recent')}</h2>
          {recent.length === 0 ? (
            <p className="empty">
              {t('stats.none')} <Link to="/">{t('card.play')}</Link>
            </p>
          ) : (
            <ul className="runs">
              {recent.map((play) => (
                <li key={play.id}>
                  <span>{played(play.gameId)}</span>
                  <span>{number.format(play.score)}</span>
                  <span>
                    {t('game.level')} {number.format(play.level)}
                  </span>
                  <time dateTime={new Date(play.startedAt).toISOString()}>{when.format(play.startedAt)}</time>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <div className="guest">
          <p>{t('stats.guest')}</p>
          <Link className="play" to="/login?next=/stats">
            {t('stats.loginCta')}
          </Link>
        </div>
      )}

      <h2>{t('stats.board')}</h2>
      {boards.length === 0 ? <p className="empty">{t('stats.none')}</p> : null}
      {boards.map(({ game, rows }) => {
        return (
          <div key={game.id}>
            <h3 className="board-game">{text(game, 'title')}</h3>
            <ol className="ranks board">
              {rows.map((row, index) => (
                <li key={row.userId}>
                  <span className="rank">{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <h3>
                      {row.name}
                      {user?.id === row.userId ? <em> {t('stats.you')}</em> : null}
                    </h3>
                    <p>{text(game, 'title')}</p>
                  </div>
                  <span className="plays">
                    <strong>{number.format(row.score)}</strong>
                    {t('game.score')}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )
      })}
    </section>
  )
}
