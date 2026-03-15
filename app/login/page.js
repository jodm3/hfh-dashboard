'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.ok) {
        router.push('/')
        router.refresh()
      } else {
        setError('Incorrect password')
        setPassword('')
      }
    } catch {
      setError('Something went wrong')
    }
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      padding: 20,
    }}>
      <form onSubmit={handleSubmit} style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 32,
        width: 360,
        maxWidth: '100%',
      }}>
        <h1 style={{
          fontSize: 18,
          fontWeight: 700,
          marginBottom: 4,
          letterSpacing: '-0.02em',
        }}>
          HFH South Campus
        </h1>
        <p style={{
          fontSize: 12,
          color: 'var(--dim)',
          marginBottom: 24,
        }}>
          Pipefitters 636 Dashboard
        </p>

        <label style={{
          display: 'block',
          fontSize: 10,
          color: 'var(--dim)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: 6,
        }}>
          Password
        </label>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Enter password"
          autoFocus
          style={{
            width: '100%',
            padding: '10px 12px',
            fontSize: 14,
            marginBottom: 16,
          }}
        />

        {error && (
          <p style={{
            color: 'var(--red)',
            fontSize: 12,
            marginBottom: 12,
          }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !password}
          className="btn"
          style={{
            width: '100%',
            background: 'var(--accent)',
            padding: '10px 16px',
            fontSize: 13,
            opacity: loading || !password ? 0.5 : 1,
          }}
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>
  )
}
