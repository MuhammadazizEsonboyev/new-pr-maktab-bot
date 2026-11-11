import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { DraftProvider } from './context/DraftContext'
import { initTelegram } from './lib/telegram'
import './index.css'

initTelegram()

class Boundary extends React.Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error(error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
          <span className="text-4xl">⚠️</span>
          <h1 className="mt-3 text-lg font-extrabold">Ilovada xatolik yuz berdi</h1>
          <p className="mt-1 text-sm text-ink-mute">{String(this.state.error.message || this.state.error)}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 h-11 rounded-xl2 bg-brand px-5 font-bold text-white"
          >
            Qayta yuklash
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Boundary>
      <HashRouter>
        <AuthProvider>
          <DraftProvider>
            <App />
          </DraftProvider>
        </AuthProvider>
      </HashRouter>
    </Boundary>
  </React.StrictMode>
)
