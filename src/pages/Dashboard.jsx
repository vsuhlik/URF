import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Dashboard({ session }) {
  const [event, setEvent] = useState(null)
  const [booths, setBooths] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    fetchEventData()
  }, [])

  const fetchEventData = async () => {
    const { data: eventData } = await supabase
      .from('events')
      .select('*')
      .eq('status', 'active')
      .single()

    if (eventData) {
      setEvent(eventData)
      const { data: boothData } = await supabase
        .from('booths')
        .select('*')
        .eq('event_id', eventData.id)
        .order('booth_number')
      setBooths(boothData || [])
    }
    setLoading(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  const submitted = booths.filter(b => b.submission_status !== 'pending').length
  const pending = booths.filter(b => b.submission_status === 'pending').length

  return (
    <div className="min-h-screen bg-[#1a1a2e] text-white">
      <header className="bg-[#16213e] px-6 py-4 flex items-center justify-between shadow-md">
        <div>
          <h1 className="text-xl font-bold text-white">UpScale Resale Flow</h1>
          <p className="text-purple-400 text-xs">Staff Dashboard</p>
        </div>
        <button onClick={handleLogout} className="text-gray-400 hover:text-white text-sm transition-colors">
          Sign Out
        </button>
      </header>

      <main className="p-6 max-w-lg mx-auto">

        {/* Event Status */}
        {loading ? (
          <p className="text-gray-400 text-center mt-8">Loading...</p>
        ) : event ? (
          <>
            <div className="bg-[#16213e] rounded-2xl p-4 mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-400 mb-1">Active Event</p>
                  <p className="text-white font-bold text-lg">{event.name}</p>
                  <p className="text-purple-400 text-xs">{new Date(event.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                </div>
                <span className="bg-green-500/20 text-green-400 text-xs px-3 py-1 rounded-full">Active</span>
              </div>
            </div>

            {/* Submission Tracker */}
            {booths.length > 0 && (
              <div className="bg-[#16213e] rounded-2xl p-4 mb-6">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-white font-semibold">Submission Tracker</p>
                  <p className="text-xs text-gray-400">{submitted}/{booths.length} submitted</p>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-[#0f3460] rounded-full h-2 mb-4">
                  <div
                    className="bg-purple-500 h-2 rounded-full transition-all"
                    style={{ width: `${booths.length > 0 ? (submitted / booths.length) * 100 : 0}%` }}
                  />
                </div>

                {/* Booth Grid */}
                <div className="grid grid-cols-3 gap-2">
                  {booths.map(booth => (
                    <div
                      key={booth.id}
                      onClick={() => navigate('/inventory')}
                      className={`rounded-lg p-2 cursor-pointer transition-colors ${
                        booth.submission_status === 'submitted' || booth.submission_status === 'approved'
                          ? 'bg-green-500/20 border border-green-500/40'
                          : booth.submission_status === 'in_progress'
                          ? 'bg-blue-500/20 border border-blue-500/40'
                          : 'bg-red-500/20 border border-red-500/40'
                      }`}
                    >
                      <p className={`text-xs font-bold ${
                        booth.submission_status === 'submitted' || booth.submission_status === 'approved'
                          ? 'text-green-400'
                          : booth.submission_status === 'in_progress'
                          ? 'text-blue-400'
                          : 'text-red-400'
                      }`}>
                        Booth {booth.booth_number}
                      </p>
                      <p className="text-xs text-gray-400 truncate">{booth.designer_name}</p>
                    </div>
                  ))}
                </div>

                {pending > 0 && (
                  <p className="text-red-400 text-xs mt-3 text-center">
                    ⚠️ {pending} booth{pending > 1 ? 's' : ''} still pending
                  </p>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="bg-[#16213e] rounded-2xl p-6 mb-6 text-center">
            <p className="text-gray-400 mb-3">No active event found</p>
            <button
              onClick={() => navigate('/event-setup')}
              className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold px-6 py-2 rounded-lg transition-colors"
            >
              Create Event
            </button>
          </div>
        )}

{/* Nav Cards */}
        <div className="grid grid-cols-2 gap-4">
          <div onClick={() => navigate('/booths')} className="bg-[#16213e] rounded-2xl p-6 flex flex-col items-center gap-2 cursor-pointer hover:bg-[#0f3460] transition-colors">
            <span className="text-3xl">🏪</span>
            <span className="text-sm font-medium text-center">Booths</span>
          </div>

          <div onClick={() => navigate('/inventory')} className="bg-[#16213e] rounded-2xl p-6 flex flex-col items-center gap-2 cursor-pointer hover:bg-[#0f3460] transition-colors">
            <span className="text-3xl">📋</span>
            <span className="text-sm font-medium text-center">Inventory</span>
          </div>

          <div onClick={() => navigate('/print-tags')} className="bg-[#16213e] rounded-2xl p-6 flex flex-col items-center gap-2 cursor-pointer hover:bg-[#0f3460] transition-colors">
            <span className="text-3xl">🏷️</span>
            <span className="text-sm font-medium text-center">Print Tags</span>
          </div>

          <div onClick={() => navigate('/checkout')} className="bg-[#16213e] rounded-2xl p-6 flex flex-col items-center gap-2 cursor-pointer hover:bg-[#0f3460] transition-colors">
            <span className="text-3xl">🛒</span>
            <span className="text-sm font-medium text-center">Checkout</span>
          </div>

          <div onClick={() => navigate('/end-of-event')} className="bg-[#16213e] rounded-2xl p-6 flex flex-col items-center gap-2 cursor-pointer hover:bg-[#0f3460] transition-colors col-span-2">
            <span className="text-3xl">📦</span>
            <span className="text-sm font-medium text-center">End of Event</span>
          </div>
        </div>

      </main>

      <p className="text-center text-gray-600 text-xs mt-8 pb-6">{session.user.email}</p>
    </div>
  )
}