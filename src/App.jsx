import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import EventSetup from './pages/EventSetup'
import BoothManagement from './pages/BoothManagement'
import DesignerSubmit from './pages/DesignerSubmit'
import Inventory from './pages/Inventory'
import Checkout from './pages/Checkout'
import EndOfEvent from './pages/EndOfEvent'
import PrintTags from './pages/PrintTags'

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) return (
    <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center">
      <p className="text-white text-xl">Loading...</p>
    </div>
  )

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={!session ? <Login /> : <Navigate to="/dashboard" />} />
        <Route path="/dashboard" element={session ? <Dashboard session={session} /> : <Navigate to="/login" />} />
        <Route path="/event-setup" element={session ? <EventSetup /> : <Navigate to="/login" />} />
        <Route path="/booths" element={session ? <BoothManagement /> : <Navigate to="/login" />} />
        <Route path="/inventory" element={session ? <Inventory /> : <Navigate to="/login" />} />
        <Route path="/checkout" element={session ? <Checkout /> : <Navigate to="/login" />} />
        <Route path="/end-of-event" element={session ? <EndOfEvent /> : <Navigate to="/login" />} />
        <Route path="/print-tags" element={session ? <PrintTags /> : <Navigate to="/login" />} />
        <Route path="/submit/:token" element={<DesignerSubmit />} />
        <Route path="*" element={<Navigate to={session ? "/dashboard" : "/login"} />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App