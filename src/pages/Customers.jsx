import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Customers() {
  const [eventId, setEventId] = useState(null)
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const navigate = useNavigate()

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

  useEffect(() => {
    if (!eventId) return
    const fetchCustomers = async () => {
      setLoading(true)
      const { data } = await supabase
        .from('customers')
        .select('*')
        .eq('event_id', eventId)
        .order('name')
      setCustomers(data || [])
      setLoading(false)
    }
    fetchCustomers()
  }, [eventId])

  const filtered = search.trim()
    ? customers.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.phone.includes(search.replace(/\D/g, ''))
      )
    : customers

  if (!eventId) {
    return (
      <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center text-white">
        <p>No active event found.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#1a1a2e] text-white">
      <header className="bg-[#16213e] px-6 py-4 flex items-center gap-4 shadow-md">
        <button onClick={() => navigate('/dashboard')} className="text-gray-400 hover:text-white transition-colors">
          ← Back
        </button>
        <h1 className="text-xl font-bold">Customers</h1>
      </header>

      <main className="p-6 max-w-2xl mx-auto">
        <div className="mb-4">
          <input
            id="customerSearch"
            name="customerSearch"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or phone"
            className="w-full bg-[#0f3460] text-white rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500"
            autoFocus
          />
        </div>

        {loading ? (
          <p className="text-gray-400 text-center mt-8">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="text-gray-500 text-center mt-8">No customers yet.</p>
        ) : (
          <div className="space-y-3">
            {filtered.map(customer => (
              <div key={customer.id} className="bg-[#16213e] rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-white font-bold">{customer.name}</p>
                  <p className="text-gray-400 text-sm">{customer.phone}</p>
                  {customer.email && (
                    <p className="text-gray-500 text-xs">{customer.email}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {customer.delivery_fee_paid && (
                    <span className="bg-green-500/20 text-green-400 px-2 py-1 rounded-full text-xs font-bold">
                      Delivery Paid
                    </span>
                  )}
                  <button
                    onClick={() => navigate(`/checkout?customerId=${customer.id}`)}
                    className="bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm px-4 py-2 rounded-lg transition-colors"
                  >
                    Checkout
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}