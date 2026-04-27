// src/components/CustomerLookup.jsx
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useEvent } from '../hooks/useEvent'   // adjust path as needed

export default function CustomerLookup({ onCustomerIdentified }) {
  const { event } = useEvent()
  const eventId = event.id

  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // New customer fields
  const [newCustomer, setNewCustomer] = useState(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')

  const strip = (p) => p.replace(/\D/g, '')

  const handleLookup = async (e) => {
    e.preventDefault()
    setError('')
    const digits = strip(phone)
    if (!digits) return setError('Please enter a phone number')

    setLoading(true)
    // Search for customer by exact phone
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
      // Found existing customer – pass back full customer object
      setLoading(false)
      onCustomerIdentified({ ...data, phone: data.phone }) // keep digits
    } else {
      // No customer yet – show inline creation form
      setNewCustomer({ phone: digits })
      setLoading(false)
    }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!name.trim()) return setError('Name is required')

    setLoading(true)
    const customerData = {
      event_id: eventId,
      phone: newCustomer.phone,
      name: name.trim(),
      email: email.trim() || null,
      delivery_fee_paid: false,
      address: null,
    }

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

  // If we need to create a new customer
  if (newCustomer) {
    return (
      <div className="max-w-md mx-auto p-4">
        <h2 className="text-xl font-bold mb-4">New Customer</h2>
        <p className="mb-2 text-gray-600">Phone: {newCustomer.phone}</p>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Email (optional)</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700"
          >
            {loading ? 'Saving...' : 'Save & Continue'}
          </button>
        </form>
      </div>
    )
  }

  // Main lookup screen
  return (
    <div className="max-w-md mx-auto p-4">
      <h2 className="text-xl font-bold mb-4">Customer Lookup</h2>
      <form onSubmit={handleLookup} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Phone Number</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onFocus={(e) => e.target.select()}
            className="w-full border rounded px-3 py-2 text-lg"
            placeholder="Last 7 digits or full number"
            autoFocus
          />
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
        >
          {loading ? 'Looking up...' : 'Find Customer'}
        </button>
      </form>
    </div>
  )
}