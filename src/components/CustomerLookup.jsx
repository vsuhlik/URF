import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function CustomerLookup({ onCustomerIdentified }) {
  const [eventId, setEventId] = useState(null)
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // New customer fields
  const [newCustomer, setNewCustomer] = useState(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')

  useEffect(() => {
    const getEvent = async () => {
      const { data } = await supabase
        .from('events')
        .select('id')
        .eq('status', 'active')
        .single()
      if (data) setEventId(data.id)
    }
    getEvent()
  }, [])

  const strip = (p) => p.replace(/\D/g, '')

  const handleLookup = async (e) => {
    e.preventDefault()
    if (!eventId) return setError('No active event')
    setError('')
    const digits = strip(phone)
    if (!digits) return setError('Please enter a phone number')

    setLoading(true)
    const { data, error: dbErr } = await supabase
      .from('customers')
      .select('*')
      .eq('event_id', eventId)
      .eq('phone', digits)
      .maybeSingle()

    if (dbErr) {
      setError('Database error: ' + dbErr.message)
      setLoading(false)
      return
    }

    if (data) {
      setLoading(false)
      onCustomerIdentified({ ...data, phone: data.phone })
    } else {
      setNewCustomer({ phone: digits })
      setLoading(false)
    }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!name.trim()) return setError('Name is required')

    const customerData = {
      event_id: eventId,
      phone: newCustomer.phone,
      name: name.trim(),
      email: email.trim() || null,
      delivery_fee_paid: false,
      address: null,
    }

    setLoading(true)
    const { data, error: insertErr } = await supabase
      .from('customers')
      .insert(customerData)
      .select()
      .single()

    if (insertErr) {
      setError('Could not create customer: ' + insertErr.message)
      setLoading(false)
      return
    }

    setLoading(false)
    onCustomerIdentified(data)
  }

  if (!eventId) {
    return (
      <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center text-white">
        <div className="text-center">
          <p className="text-red-400">No active event found. Please create one first.</p>
        </div>
      </div>
    )
  }

  // New customer form
  if (newCustomer) {
    return (
      <div className="min-h-screen bg-[#1a1a2e] text-white">
        <header className="bg-[#16213e] px-6 py-4 shadow-md">
          <h1 className="text-xl font-bold">New Customer</h1>
        </header>
        <main className="p-6 max-w-md mx-auto">
          <div className="bg-[#16213e] rounded-2xl p-6 mb-4">
            <p className="text-purple-400 text-sm mb-4">Phone: {newCustomer.phone}</p>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="text-gray-400 text-sm mb-1 block">Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[#0f3460] text-white rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-purple-500"
                  required
                />
              </div>
              <div>
                <label className="text-gray-400 text-sm mb-1 block">Email (optional)</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[#0f3460] text-white rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Save & Continue'}
              </button>
            </form>
          </div>
        </main>
      </div>
    )
  }

  // Lookup screen
  return (
    <div className="min-h-screen bg-[#1a1a2e] text-white">
      <header className="bg-[#16213e] px-6 py-4 shadow-md">
        <h1 className="text-xl font-bold">Customer Lookup</h1>
      </header>
      <main className="p-6 max-w-md mx-auto">
        <div className="bg-[#16213e] rounded-2xl p-6">
          <form onSubmit={handleLookup} className="space-y-4">
            <div>
              <label className="text-gray-400 text-sm mb-1 block">Phone Number</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onFocus={(e) => e.target.select()}
                className="w-full bg-[#0f3460] text-white rounded-lg px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="Last 7 digits or full number"
                autoFocus
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Looking up...' : 'Find Customer'}
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}