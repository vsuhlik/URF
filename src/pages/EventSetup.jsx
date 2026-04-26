import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function EventSetup() {
  const [name, setName] = useState('UpScale Resale 2026')
  const [date, setDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  const handleCreate = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Close any existing active events first
    await supabase
      .from('events')
      .update({ status: 'closed' })
      .eq('status', 'active')

    const { error } = await supabase
      .from('events')
      .insert({ name, date, status: 'active' })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      navigate('/dashboard')
    }
  }

  return (
    <div className="min-h-screen bg-[#1a1a2e] text-white">
      <header className="bg-[#16213e] px-6 py-4 flex items-center gap-4 shadow-md">
        <button onClick={() => navigate('/dashboard')} className="text-gray-400 hover:text-white transition-colors">
          ← Back
        </button>
        <h1 className="text-xl font-bold">Create Event</h1>
      </header>

      <main className="p-6 max-w-lg mx-auto">
        <div className="bg-[#16213e] rounded-2xl p-6">
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="text-gray-400 text-sm mb-1 block">Event Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full bg-[#0f3460] text-white rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="text-gray-400 text-sm mb-1 block">Event Date (Friday VIP Night)</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full bg-[#0f3460] text-white rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Event'}
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}