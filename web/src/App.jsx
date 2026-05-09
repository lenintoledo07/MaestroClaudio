import { useEffect, useState } from 'react'

export default function App() {
  const [health, setHealth] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setHealth)
      .catch((e) => setError(e.message))
  }, [])

  return (
    <main className="app">
      <header className="app-header">
        <h1>Maestro Claudio</h1>
        <p className="subtitle">
          Agente de estudio personal · Maestría en Ciberseguridad
        </p>
      </header>

      <section className="card">
        <h2>Estado del backend</h2>
        {health && (
          <pre className="code">{JSON.stringify(health, null, 2)}</pre>
        )}
        {error && <p className="error">No se pudo conectar: {error}</p>}
        {!health && !error && <p className="muted">Consultando…</p>}
      </section>
    </main>
  )
}
