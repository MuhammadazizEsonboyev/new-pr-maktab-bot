import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import Home from './pages/Home'
import CreateTest from './pages/CreateTest'
import CreateAnswers from './pages/CreateAnswers'
import TestCreated from './pages/TestCreated'
import MyTests from './pages/MyTests'
import TestDetail from './pages/TestDetail'
import JoinTest from './pages/JoinTest'
import TakeTest from './pages/TakeTest'
import Result from './pages/Result'
import MyResults from './pages/MyResults'
import Gate from './pages/Gate'
import SubscribeGate from './pages/SubscribeGate'
import Admins from './pages/Admins'
import { useAuth } from './context/AuthContext'
import { getStartParam } from './lib/telegram'
import { Loading } from './components/ui'

/** Faqat admin (ustoz) kira oladigan sahifalar */
function CreatorOnly({ children }) {
  const { isCreator } = useAuth()
  return isCreator ? children : <Navigate to="/" replace />
}

export default function App() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { loading, me, subscribed } = useAuth()

  // Botdan: startapp=create | startapp=join_abcd1234ef56
  useEffect(() => {
    const p = getStartParam()
    if (!p) return
    if (p === 'create') navigate('/yaratish', { replace: true })
    else if (p === 'results') navigate('/natijalarim', { replace: true })
    else if (p.startsWith('join_')) navigate(`/qatnashish?kod=${encodeURIComponent(p.slice(5))}`, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  if (loading && !me) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loading text="Ilova ochilmoqda…" />
      </div>
    )
  }

  // Server foydalanuvchini tasdiqlamadi (Telegramdan tashqarida ochilgan yoki server xatosi)
  if (!me) return <Gate />

  // Kanalga obuna bo'lmagan (adminlar uchun server har doim subscribed: true qaytaradi)
  if (!subscribed) return <SubscribeGate />

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/yaratish" element={<CreatorOnly><CreateTest /></CreatorOnly>} />
      <Route path="/yaratish/javoblar" element={<CreatorOnly><CreateAnswers /></CreatorOnly>} />
      <Route path="/yaratildi/:token" element={<CreatorOnly><TestCreated /></CreatorOnly>} />
      <Route path="/testlarim" element={<CreatorOnly><MyTests /></CreatorOnly>} />
      <Route path="/testlarim/:id" element={<CreatorOnly><TestDetail /></CreatorOnly>} />
      <Route path="/adminlar" element={<CreatorOnly><Admins /></CreatorOnly>} />
      <Route path="/qatnashish" element={<JoinTest />} />
      <Route path="/test/:token" element={<TakeTest />} />
      <Route path="/natija/:id" element={<Result />} />
      <Route path="/natijalarim" element={<MyResults />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
