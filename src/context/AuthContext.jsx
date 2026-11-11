import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { db } from '../lib/db'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, me: null, error: null, status: null })

  const reload = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const me = await db.me()
      setState({ loading: false, me, error: null, status: 200 })
    } catch (e) {
      setState({ loading: false, me: null, error: e.message || 'Xatolik yuz berdi', status: e.status ?? 0 })
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const value = useMemo(
    () => ({ ...state, isCreator: Boolean(state.me?.isCreator), reload }),
    [state, reload]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth faqat AuthProvider ichida ishlaydi')
  return ctx
}
