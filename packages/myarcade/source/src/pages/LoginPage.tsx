import { useState, type FormEvent } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useArcade } from '../useArcade.ts'
import { login, register, type AuthError } from '../store.ts'

function safeNext(value: string | null) {
  if (value && value.startsWith('/') && !value.startsWith('//')) return value
  return '/'
}

export function LoginPage() {
  const { t, user } = useArcade()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<AuthError | null>(null)
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to={next} replace />

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const result = mode === 'login' ? await login(name, password) : await register(name, password, confirm)
    setBusy(false)
    setError(result)
  }

  return (
    <section className="auth">
      <p className="kicker">{t('auth.loginToPlay')}</p>
      <h1>{mode === 'login' ? t('auth.loginTitle') : t('auth.registerTitle')}</h1>
      <form onSubmit={submit}>
        <label>
          {t('auth.username')}
          <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="username" required />
        </label>
        <label>
          {t('auth.password')}
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
          />
        </label>
        {mode === 'register' ? (
          <label>
            {t('auth.confirm')}
            <input
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              type="password"
              autoComplete="new-password"
              required
            />
          </label>
        ) : null}
        {error ? <p className="form-error">{t(`auth.err.${error}`)}</p> : null}
        <button className="play" type="submit" disabled={busy}>
          {mode === 'login' ? t('auth.submitLogin') : t('auth.submitRegister')}
        </button>
      </form>
      <button
        type="button"
        className="text-link"
        onClick={() => {
          setMode(mode === 'login' ? 'register' : 'login')
          setError(null)
        }}
      >
        {mode === 'login' ? t('auth.toRegister') : t('auth.toLogin')}
      </button>
      <Link to="/" className="text-link">
        {t('game.back')}
      </Link>
    </section>
  )
}
