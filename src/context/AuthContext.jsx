import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { db, NOT_SUBSCRIBED_EVENT } from '../lib/db'

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

  // Ilova ochiq turganda obuna bekor qilinsa — obuna ekraniga qaytaramiz
  useEffect(() => {
    const onLost = (e) =>
      setState((s) => (s.me ? { ...s, me: { ...s.me, subscribed: false, channels: e.detail || [] } } : s))
    window.addEventListener(NOT_SUBSCRIBED_EVENT, onLost)
    return () => window.removeEventListener(NOT_SUBSCRIBED_EVENT, onLost)
  }, [])

  const value = useMemo(
    () => ({
      ...state,
      isCreator: Boolean(state.me?.isCreator),
      isSuperAdmin: Boolean(state.me?.isSuperAdmin),
      // Eski server javobida maydon bo'lmasa — obuna bor deb hisoblaymiz
      subscribed: state.me?.subscribed !== false,
      channels: state.me?.channels || [],
      reload,
    }),
    [state, reload]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth faqat AuthProvider ichida ishlaydi')
  return ctx
}
