import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function Checkout() {
  const [eventId, setEventId] = useState(null)

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

  const [allCustomers, setAllCustomers] = useState([])

  useEffect(() => {
    if (!eventId) return
    const fetchCustomers = async () => {
      const { data } = await supabase
        .from('customers')
        .select('*')
        .eq('event_id', eventId)
        .order('name')
      setAllCustomers(data || [])
    }
    fetchCustomers()
  }, [eventId])

  // Lookup screen states (top‑level so hooks are always consistent)
  const [lookupPhone, setLookupPhone] = useState('')
  const [lookupError, setLookupError] = useState('')
  const [lookupLoading, setLookupLoading] = useState(false)
  const [newCustomerForm, setNewCustomerForm] = useState(null)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newError, setNewError] = useState('')
  const [newLoading, setNewLoading] = useState(false)

  const [screen, setScreen] = useState('lookup')
  const [customer, setCustomer] = useState(null)
  const [cart, setCart] = useState([])
  const [scanInput, setScanInput] = useState('')
  const [scanError, setScanError] = useState('')

  const [address, setAddress] = useState({ street: '', city: '', zip: '' })
  const [addressError, setAddressError] = useState('')

  const [confirmation, setConfirmation] = useState(null)

  const deliveryPaid = customer?.delivery_fee_paid === true
  const hasDeliveryItems = cart.some(item => item.fulfillmentType === 'delivery')
  const needsDeliveryFee = hasDeliveryItems && !deliveryPaid
  const subtotal = cart.reduce((sum, item) => sum + Number(item.price), 0)
  const total = needsDeliveryFee ? subtotal + 25 : subtotal

  const formatPhone = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 10)
    if (digits.length <= 3) return digits
    if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  }

  const startNewCustomer = () => {
    setScreen('lookup')
    setCustomer(null)
    setCart([])
    setScanInput('')
    setScanError('')
    setConfirmation(null)
  }

  const handleCustomerIdentified = (customerData) => {
    setCustomer(customerData)
    setScreen('cart')
    setCart([])
  }

  const addItemToCart = async (code) => {
    if (!code || !eventId) return
    setScanError('')
    console.log('🔍 Looking up item:', code.toUpperCase(), 'Event ID:', eventId)

    const { data: item, error } = await supabase
      .from('items')
      .select('id, item_code, description, price, status')
      .eq('event_id', eventId)
      .eq('item_code', code.toUpperCase())
      .maybeSingle()

    console.log('📦 Supabase response:', { item, error })

    if (error || !item) {
      setScanError('Item not found: ' + code)
      return
    }
    if (item.status === 'sold') {
      setScanError('Item already sold')
      return
    }
    if (cart.find(i => i.itemCode === item.item_code)) {
      setScanError('Already in cart')
      return
    }
    setCart(prev => [...prev, {
      itemCode: item.item_code,
      description: item.description,
      price: item.price,
      itemId: item.id,
      fulfillmentType: 'pickup'
    }])
  }

  const handleScanSubmit = (e) => {
    e.preventDefault()
    const code = scanInput.trim()
    if (code) addItemToCart(code)
    setScanInput('')
  }

  const toggleFulfillment = (itemCode) => {
    setCart(prev => prev.map(item =>
      item.itemCode === itemCode
        ? { ...item, fulfillmentType: item.fulfillmentType === 'delivery' ? 'pickup' : 'delivery' }
        : item
    ))
  }

  const handleProceedToCheckout = () => {
    if (hasDeliveryItems && !deliveryPaid) {
      setScreen('address')
      if (customer.address) {
        setAddress(customer.address)
      }
    } else {
      confirmSale(null)
    }
  }

  const confirmSale = async (newAddress) => {
    if (!eventId) return

    const deliveryItems = cart.filter(i => i.fulfillmentType === 'delivery')
    const allItemsArray = cart.map(i => ({
      itemCode: i.itemCode,
      description: i.description,
      price: i.price,
      fulfillmentType: i.fulfillmentType
    }))

    let finalAddress = null
    if (deliveryItems.length > 0) {
      if (deliveryPaid) {
        finalAddress = customer.address
      } else {
        if (!newAddress || !newAddress.street || !newAddress.city || !newAddress.zip) {
          setAddressError('Full address is required for delivery.')
          return
        }
        finalAddress = newAddress
      }
    }

    // Race condition guard
    if (deliveryItems.length > 0 && !deliveryPaid) {
      const { data: freshCust } = await supabase
        .from('customers')
        .select('delivery_fee_paid, address')
        .eq('id', customer.id)
        .single()
      if (freshCust?.delivery_fee_paid) {
        alert('Delivery fee was just paid by another cashier. Fee waived.')
        finalAddress = freshCust.address || finalAddress
        setCustomer({ ...customer, delivery_fee_paid: true, address: finalAddress })
      }
    }

    const confirmationNumber = Math.random().toString(36).substring(2, 6).toUpperCase()

const orderData = {
  event_id: eventId,
  customer_id: customer.id,
  customer_name: customer.name,
  customer_phone: customer.phone,
  items: allItemsArray,
  total_amount: total,
  delivery_address: finalAddress,
  fulfillment_type: deliveryItems.length > 0 ? 'delivery' : 'pickup',
  status: 'sold',
  confirmation_number: confirmationNumber
}

    const { data: order, error } = await supabase
      .from('orders')
      .insert(orderData)
      .select()
      .single()

    if (error) {
      alert('Failed to save order: ' + error.message)
      return
    }

    // Mark items sold
    const itemIds = cart.map(i => i.itemId)
    await supabase
      .from('items')
      .update({ status: 'sold', order_id: order.id })
      .in('id', itemIds)

    // Update customer if first delivery
    if (deliveryItems.length > 0 && !deliveryPaid) {
      await supabase
        .from('customers')
        .update({ delivery_fee_paid: true, address: finalAddress })
        .eq('id', customer.id)
    }

    setConfirmation(order)
    setScreen('confirmation')
  }

  const handleAddressSubmit = (e) => {
    e.preventDefault()
    if (!address.street || !address.city || !address.zip) {
      setAddressError('All address fields are required.')
      return
    }
    setAddressError('')
    confirmSale(address)
  }

  const [showEditCustomer, setShowEditCustomer] = useState(false)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editEmail, setEditEmail] = useState('')

  const openEditCustomer = () => {
    setEditName(customer.name)
    setEditPhone(customer.phone)
    setEditEmail(customer.email || '')
    setShowEditCustomer(true)
  }

  const saveEditCustomer = async () => {
    if (!editName.trim()) return
    const updates = {
      name: editName.trim(),
      phone: editPhone.replace(/\D/g, ''),
      email: editEmail.trim() || null
    }
    const { error } = await supabase
      .from('customers')
      .update(updates)
      .eq('id', customer.id)

    if (error) {
      alert('Failed to update: ' + error.message)
    } else {
      setCustomer({ ...customer, ...updates })
      setShowEditCustomer(false)
    }
  }

  if (!eventId) {
    return (
      <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center text-white">
        <p>No active event found. Please create one first.</p>
      </div>
    )
  }

  if (screen === 'lookup') {
    const strip = (p) => p.replace(/\D/g, '')

    const handleLookup = async (e) => {
      e.preventDefault()
      setLookupError('')
      const digits = strip(lookupPhone)
      if (!digits) return setLookupError('Please enter a phone number')
      setLookupLoading(true)
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('event_id', eventId)
        .eq('phone', digits)
        .maybeSingle()
      if (error) {
        setLookupError('Database error: ' + error.message)
        setLookupLoading(false)
        return
      }
      if (data) {
        setLookupLoading(false)
        handleCustomerIdentified(data)
      } else {
        setNewCustomerForm({ phone: digits })
        setLookupLoading(false)
      }
    }

    const handleCreate = async (e) => {
      e.preventDefault()
      if (!newName.trim()) return setNewError('Name is required')
      setNewLoading(true)
      const customerData = {
        event_id: eventId,
        phone: newCustomerForm.phone,
        name: newName.trim(),
        email: newEmail.trim() || null,
        delivery_fee_paid: false,
        address: null
      }
      const { data, error: insertErr } = await supabase
        .from('customers')
        .insert(customerData)
        .select()
        .single()
      if (insertErr) {
        setNewError('Could not create customer: ' + insertErr.message)
        setNewLoading(false)
        return
      }
      setNewLoading(false)
      handleCustomerIdentified(data)
    }

    return (
      <div className="min-h-screen bg-[#1a1a2e] text-white">
        <header className="bg-[#16213e] px-6 py-4 shadow-md">
          <h1 className="text-xl font-bold">Checkout</h1>
        </header>
        <main className="p-6 max-w-2xl mx-auto">
          {!newCustomerForm ? (
            <>
              <div className="bg-[#16213e] rounded-2xl p-6 mb-6">
                <h2 className="text-lg font-semibold mb-4">Checkout Customer</h2>
                <form onSubmit={handleLookup} className="space-y-4">
                  <div>
                    <label htmlFor="phoneLookup" className="text-gray-400 text-sm mb-1 block">Phone Number</label>
                    <input
                      id="phoneLookup"
                      name="phoneLookup"
                      type="tel"
                      value={lookupPhone}
                      onChange={(e) => setLookupPhone(formatPhone(e.target.value))}
                      onFocus={(e) => e.target.select()}
                      maxLength={12}
                      className="w-full bg-[#0f3460] text-white rounded-lg px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="000-000-0000"
                      autoFocus
                    />
                  </div>
                  {lookupError && <p className="text-red-400 text-sm">{lookupError}</p>}
                  <button
                    type="submit"
                    disabled={lookupLoading}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {lookupLoading ? 'Looking up...' : 'Checkout'}
                  </button>
                </form>
              </div>

              {allCustomers.length > 0 && (
                <div className="bg-[#16213e] rounded-2xl p-4">
                  <h3 className="text-white font-semibold mb-3">All Customers</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="text-gray-400 border-b border-gray-700">
                          <th className="py-2 pr-3">Name</th>
                          <th className="py-2 pr-3">Phone</th>
                          <th className="py-2 pr-3">Status</th>
                          <th className="py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {allCustomers.map(cust => (
                          <tr key={cust.id} className="border-b border-gray-700 hover:bg-[#0f3460]/30">
                            <td className="py-2 pr-3 text-white font-medium">{cust.name}</td>
                            <td className="py-2 pr-3 text-gray-300">{cust.phone}</td>
                            <td className="py-2 pr-3">
                              {cust.delivery_fee_paid && (
                                <span className="bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full text-xs font-bold">
                                  Delivery Paid
                                </span>
                              )}
                            </td>
                            <td className="py-2 text-right">
                              <button
                                onClick={() => handleCustomerIdentified(cust)}
                                className="bg-purple-600 hover:bg-purple-700 text-white font-medium text-xs px-3 py-1.5 rounded-lg transition-colors"
                              >
                                Select
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {allCustomers.length === 0 && (
                <p className="text-gray-500 text-center mt-4">No customers yet.</p>
              )}
            </>
          ) : (
            <div className="bg-[#16213e] rounded-2xl p-6">
              <h2 className="text-lg font-semibold mb-4">New Customer</h2>
              <p className="text-purple-400 text-sm mb-4">Phone: {newCustomerForm.phone}</p>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label htmlFor="newName" className="text-gray-400 text-sm mb-1 block">Name *</label>
                  <input
                    id="newName"
                    name="newName"
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full bg-[#0f3460] text-white rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-purple-500"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="newEmail" className="text-gray-400 text-sm mb-1 block">Email (optional)</label>
                  <input
                    id="newEmail"
                    name="newEmail"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full bg-[#0f3460] text-white rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                {newError && <p className="text-red-400 text-sm">{newError}</p>}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setNewCustomerForm(null)}
                    className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-semibold py-3 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={newLoading}
                    className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {newLoading ? 'Saving...' : 'Save & Continue'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </main>
      </div>
    )
  }

  if (screen === 'confirmation') {
    return (
      <div className="min-h-screen bg-[#1a1a2e] text-white">
        <header className="bg-[#16213e] px-6 py-4 flex items-center gap-4 shadow-md">
          <h1 className="text-xl font-bold">Order Confirmed</h1>
        </header>
        <main className="p-6 max-w-md mx-auto text-center">
          <div className="bg-[#16213e] rounded-2xl p-8">
            <p className="text-4xl mb-4">🎉</p>
            <p className="text-2xl font-bold mb-2">Confirmation #</p>
            <p className="text-3xl font-mono text-purple-400 mb-6">{confirmation.confirmation_number}</p>
            <p className="text-gray-400 text-sm mb-8">You can now help the next customer.</p>
            <button
              onClick={startNewCustomer}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 rounded-lg transition-colors"
            >
              Start New Customer
            </button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#1a1a2e] text-white">
      <header className="bg-[#16213e] px-6 py-4 flex items-center justify-between shadow-md">
        <h1 className="text-xl font-bold">Checkout</h1>
        <button
          onClick={startNewCustomer}
          className="text-gray-400 hover:text-white text-sm transition-colors"
        >
          Change Customer
        </button>
      </header>

      <main className="p-6 max-w-2xl mx-auto">
        <div className="bg-[#16213e] rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-bold">{customer.name}</p>
              <p className="text-gray-400 text-sm">{customer.phone}</p>
            </div>
            <button onClick={openEditCustomer} className="text-purple-400 text-sm underline hover:text-purple-300">
              Edit Info
            </button>
          </div>
        </div>

        {deliveryPaid && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 mb-4">
            <p className="text-yellow-400 font-semibold">✅ DELIVERY FEE ALREADY PAID</p>
            {customer.address && (
              <p className="text-gray-400 text-sm mt-1">
                📍 {customer.address.street}, {customer.address.city}, {customer.address.zip}
              </p>
            )}
          </div>
        )}

        <form onSubmit={handleScanSubmit} className="flex gap-2 mb-4">
          <input
            type="text"
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value.toUpperCase())}
            placeholder="Scan QR or type item code (e.g. 6-2)"
            className="flex-1 bg-[#0f3460] text-white rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500"
            autoFocus
          />
          <button
            type="submit"
            className="bg-purple-600 hover:bg-purple-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
          >
            Add
          </button>
        </form>
        {scanError && <p className="text-red-400 text-sm mb-2">{scanError}</p>}

        {cart.length === 0 ? (
          <p className="text-gray-500 italic text-center py-8">Cart is empty. Scan an item to begin.</p>
        ) : (
          <div className="space-y-3">
            {cart.map(item => (
              <div key={item.itemCode} className="bg-[#16213e] rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-purple-400 text-xs font-mono">{item.itemCode}</p>
                  <p className="text-white text-sm font-medium">{item.description}</p>
                  <p className="text-green-400 text-sm font-bold mt-1">${Number(item.price).toFixed(2)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleFulfillment(item.itemCode)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      item.fulfillmentType === 'delivery'
                        ? 'bg-purple-600/30 text-purple-300'
                        : 'bg-gray-600/30 text-gray-300'
                    }`}
                  >
                    {item.fulfillmentType === 'delivery' ? '🚚 Delivery' : '📍 Pickup'}
                  </button>
                  <button
                    onClick={() => setCart(prev => prev.filter(i => i.itemCode !== item.itemCode))}
                    className="text-red-400 hover:text-red-300 text-lg"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}

            <div className="bg-[#16213e] rounded-xl p-4 mt-4">
              <div className="flex justify-between text-gray-300 text-sm">
                <span>Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              {needsDeliveryFee && (
                <div className="flex justify-between text-purple-400 text-sm mt-1">
                  <span>Delivery Fee</span>
                  <span>+ $25.00</span>
                </div>
              )}
              <div className="flex justify-between text-white font-bold text-xl mt-2 pt-2 border-t border-gray-700">
                <span>Total</span>
                <span>${total.toFixed(2)}</span>
              </div>
            </div>

            <button
              onClick={handleProceedToCheckout}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 rounded-lg transition-colors mt-4"
            >
              Checkout
            </button>
          </div>
        )}

        {screen === 'address' && (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
            <div className="bg-[#16213e] rounded-2xl p-6 w-full max-w-md text-white">
              <h3 className="text-xl font-bold mb-4">Delivery Address</h3>
              <form onSubmit={handleAddressSubmit} className="space-y-4">
                <div>
                  <label className="text-gray-400 text-sm mb-1 block">Street *</label>
                  <input
                    type="text"
                    value={address.street}
                    onChange={(e) => setAddress(prev => ({ ...prev, street: e.target.value }))}
                    className="w-full bg-[#0f3460] text-white rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-purple-500"
                    required
                  />
                </div>
                <div>
                  <label className="text-gray-400 text-sm mb-1 block">City *</label>
                  <input
                    type="text"
                    value={address.city}
                    onChange={(e) => setAddress(prev => ({ ...prev, city: e.target.value }))}
                    className="w-full bg-[#0f3460] text-white rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-purple-500"
                    required
                  />
                </div>
                <div>
                  <label className="text-gray-400 text-sm mb-1 block">Zip *</label>
                  <input
                    type="text"
                    value={address.zip}
                    onChange={(e) => setAddress(prev => ({ ...prev, zip: e.target.value }))}
                    className="w-full bg-[#0f3460] text-white rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-purple-500"
                    required
                  />
                </div>
                {addressError && <p className="text-red-400 text-sm">{addressError}</p>}
                <div className="flex gap-3">
                  <button
                    type="submit"
                    className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 rounded-lg transition-colors"
                  >
                    Confirm & Pay ${total.toFixed(2)}
                  </button>
                  <button
                    type="button"
                    onClick={() => setScreen('cart')}
                    className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-semibold py-3 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showEditCustomer && (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
            <div className="bg-[#16213e] rounded-2xl p-6 w-full max-w-md text-white">
              <h3 className="text-xl font-bold mb-4">Edit Customer</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-gray-400 text-sm mb-1 block">Name</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full bg-[#0f3460] text-white rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="text-gray-400 text-sm mb-1 block">Phone</label>
                  <input
                    type="tel"
                    value={editPhone}
                    onChange={(e) => setEditPhone(formatPhone(e.target.value))}
                    maxLength={12}
                    className="w-full bg-[#0f3460] text-white rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="text-gray-400 text-sm mb-1 block">Email (optional)</label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full bg-[#0f3460] text-white rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={saveEditCustomer}
                    className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 rounded-lg transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setShowEditCustomer(false)}
                    className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-semibold py-3 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}