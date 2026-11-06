import { Link, NavLink, Outlet } from 'react-router-dom'
import { LANGS, type Lang } from '../i18n.ts'
import { useArcade } from '../useArcade.ts'
import { logout, setLang } from '../store.ts'

export function Layout() {
  const { t, user, db } = useArcade()

  return (
    <>
      <header className="topbar">
        <Link to="/" className="logo">
          <span className="logo-mark" aria-hidden="true" />
          <span className="logo-type">
            NEXUS
            <small>ARCADE</small>
          </span>
        </Link>
        <nav className="nav">
          <NavLink to="/" end>
            {t('nav.home')}
          </NavLink>
          <NavLink to="/stats">{t('nav.stats')}</NavLink>
          {db.who === 'owner' ? <a href="manage.html">{t('nav.manage')}</a> : null}
        </nav>
        <div className="top-tools">
          <div className="langs" role="group" aria-label="Language">
            {LANGS.map((lang) => (
              <button
                key={lang.id}
                type="button"
                aria-pressed={db.lang === lang.id}
                onClick={() => setLang(lang.id as Lang)}
              >
                {lang.label}
              </button>
            ))}
          </div>
          {user ? (
            <div className="session">
              <span className="player">
                <em>{t('nav.player')}</em>
                {user.name}
              </span>
              <button type="button" className="ghost" onClick={logout}>
                {t('nav.logout')}
              </button>
            </div>
          ) : (
            <Link className="coin" to="/login">
              {t('nav.login')}
            </Link>
          )}
        </div>
      </header>
      <main className="wrap">
        <Outlet />
      </main>
      <footer className="foot">{t('footer')}</footer>
    </>
  )
}
