import { Link } from 'react-router-dom'
import type { CopyKey } from '../i18n.ts'
import { apiUrl, type Game } from '../store.ts'
import { useArcade } from '../useArcade.ts'

export function GameCard({ game, count }: { game: Game; count: number }) {
  const { t, text, db } = useArcade()
  const title = text(game, 'title')
  const blurb = text(game, 'blurb')
  const tagName = (tag: string) => (['puzzle', 'classic', 'solo', 'action', 'platform'].includes(tag) ? t(`tag.${tag}` as CopyKey) : tag)
  const released = new Intl.DateTimeFormat(db.lang, { month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(`${game.released}T00:00:00`),
  )

  return (
    <article className="card">
      <img className="art" src={apiUrl(`games/${game.id}/${game.version}/${game.cover}`)} alt="" />
      <div className="card-body">
        <div className="card-meta">
          <span className="badge">{game.kind === '3d' ? t('card.kind3d') : t('card.kind2d')}</span>
          <time dateTime={game.released}>{released}</time>
        </div>
        <h3>{title}</h3>
        <p>{blurb}</p>
        <div className="tags">
          {game.tags.map((tag) => (
            <span key={tag}>{tagName(tag)}</span>
          ))}
        </div>
        <div className="card-foot">
          <span className="plays">
            <strong>{new Intl.NumberFormat(db.lang).format(count)}</strong>
            {t('card.plays')}
          </span>
          <Link className="play" to={`/play/${game.id}`}>
            {t('card.play')}
          </Link>
        </div>
      </div>
    </article>
  )
}
