import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import CustomerLookup from '../components/CustomerLookup'

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
      customerName: customer.name,
      customerEmail: customer.email || null,
      customerPhone: customer.phone,
      items: allItemsArray,
      totalAmount: total,
      deliveryAddress: finalAddress,
      status: 'sold',
      confirmationNumber
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
    return <CustomerLookup onCustomerIdentified={handleCustomerIdentified} />
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
            <p className="text-3xl font-mono text-purple-400 mb-6">{confirmation.confirmationNumber}</p>
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
                    onChange={(e) => setEditPhone(e.target.value)}
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