// src/pages/Checkout.jsx   (adjust path if needed)
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useEvent } from '../hooks/useEvent'
import CustomerLookup from '../components/CustomerLookup'
import { sendReceiptEmail } from '../lib/email'   // your existing email function

export default function Checkout() {
  const { event } = useEvent()
  const eventId = event.id

  // Screen state: 'lookup' | 'cart' | 'address' | 'confirmation'
  const [screen, setScreen] = useState('lookup')
  const [customer, setCustomer] = useState(null)

  // Cart items: array of { itemCode, description, price, ...itemData, fulfillmentType: 'pickup'|'delivery' }
  const [cart, setCart] = useState([])
  const [scanInput, setScanInput] = useState('')
  const [scanError, setScanError] = useState('')

  // Address form
  const [address, setAddress] = useState({ street: '', city: '', zip: '' })
  const [addressError, setAddressError] = useState('')

  // Confirmation state
  const [confirmation, setConfirmation] = useState(null)

  // Delivery fee paid banner
  const deliveryPaid = customer?.delivery_fee_paid === true
  const hasDeliveryItems = cart.some(item => item.fulfillmentType === 'delivery')
  const needsDeliveryFee = hasDeliveryItems && !deliveryPaid
  const subtotal = cart.reduce((sum, item) => sum + Number(item.price), 0)
  const total = needsDeliveryFee ? subtotal + 25 : subtotal

  // Reset everything when starting new customer
  const startNewCustomer = () => {
    setScreen('lookup')
    setCustomer(null)
    setCart([])
    setScanInput('')
    setScanError('')
    setConfirmation(null)
  }

  // Handle customer identification from lookup component
  const handleCustomerIdentified = (customerData) => {
    setCustomer(customerData)
    setScreen('cart')
    setCart([])
  }

  // Add item to cart by scanning or typing item code
  const addItemToCart = async (code) => {
    if (!code) return
    setScanError('')
    // Fetch item from database
    const { data: item, error } = await supabase
      .from('items')
      .select('id, item_code, booth_number, description, price, status')
      .eq('event_id', eventId)
      .eq('item_code', code.toUpperCase())
      .maybeSingle()

    if (error || !item) {
      setScanError('Item not found: ' + code)
      return
    }
    if (item.status === 'sold') {
      setScanError('Item already sold')
      return
    }
    // Check if already in cart
    if (cart.find(i => i.itemCode === item.item_code)) {
      setScanError('Already in cart')
      return
    }
    setCart(prev => [...prev, {
      itemCode: item.item_code,
      description: item.description,
      price: item.price,
      boothNumber: item.booth_number,
      itemId: item.id,
      fulfillmentType: 'pickup'   // default
    }])
  }

  const handleScanSubmit = (e) => {
    e.preventDefault()
    const code = scanInput.trim()
    if (code) addItemToCart(code)
    setScanInput('')
  }

  // Toggle fulfillment type for a cart item
  const toggleFulfillment = (itemCode) => {
    setCart(prev => prev.map(item =>
      item.itemCode === itemCode
        ? { ...item, fulfillmentType: item.fulfillmentType === 'delivery' ? 'pickup' : 'delivery' }
        : item
    ))
  }

  // Proceed from cart to address collection (if needed) or directly to sale
  const handleProceedToCheckout = () => {
    if (hasDeliveryItems && !deliveryPaid) {
      // Need address
      setScreen('address')
      // Pre-fill if customer previously had address
      if (customer.address) {
        setAddress(customer.address)
      }
    } else {
      // No address needed or delivery fee already paid
      confirmSale(null)  // no new address needed
    }
  }

  // Final sale confirmation
  const confirmSale = async (newAddress) => {
    const deliveryItems = cart.filter(i => i.fulfillmentType === 'delivery')
    const pickupItems = cart.filter(i => i.fulfillmentType === 'pickup')
    const allItemsArray = cart.map(i => ({
      itemCode: i.itemCode,
      description: i.description,
      price: i.price,
      boothNumber: i.boothNumber,
      fulfillmentType: i.fulfillmentType
    }))

    let finalAddress = null
    if (deliveryItems.length > 0) {
      if (deliveryPaid) {
        finalAddress = customer.address   // reuse stored address
      } else {
        if (!newAddress || !newAddress.street || !newAddress.city || !newAddress.zip) {
          setAddressError('Full address is required for delivery.')
          return
        }
        finalAddress = newAddress
      }
    }

    // Hard gate: double-check delivery fee not already paid (race condition safety)
    if (deliveryItems.length > 0 && !deliveryPaid) {
      const { data: freshCust } = await supabase
        .from('customers')
        .select('delivery_fee_paid')
        .eq('id', customer.id)
        .single()
      if (freshCust?.delivery_fee_paid) {
        // Race condition – fee was paid between screens
        alert('Delivery fee was just paid by another cashier. Fee waived.')
        // proceed without fee but with address already stored
        finalAddress = freshCust.address || finalAddress
        // update local state
        setCustomer({ ...customer, delivery_fee_paid: true, address: finalAddress })
        // continue as if fee already paid
      }
    }

    // Insert order
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
      confirmationNumber: generateConfirmation(), // you have a function for this
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

    // Mark all items as sold
    const itemIds = cart.map(i => i.itemId)
    await supabase
      .from('items')
      .update({ status: 'sold', order_id: order.id })
      .in('id', itemIds)

    // If delivery and fee not yet paid, update customer
    if (deliveryItems.length > 0 && !deliveryPaid) {
      await supabase
        .from('customers')
        .update({
          delivery_fee_paid: true,
          address: finalAddress
        })
        .eq('id', customer.id)
    }

    // Send email receipt if customer has email
    if (customer.email) {
      sendReceiptEmail(order, customer.email)
    }

    setConfirmation(order)
    setScreen('confirmation')
  }

  // Address form submission
  const handleAddressSubmit = (e) => {
    e.preventDefault()
    if (!address.street || !address.city || !address.zip) {
      setAddressError('All address fields are required.')
      return
    }
    setAddressError('')
    confirmSale(address)
  }

  // Helper: generate a short confirmation number (you may already have one)
  const generateConfirmation = () => {
    return Math.random().toString(36).substring(2, 6).toUpperCase()
  }

  // Edit customer info (name, phone, email) – inline modal or simple form
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

  // ---------------- RENDER -----------------
  if (screen === 'lookup') {
    return <CustomerLookup onCustomerIdentified={handleCustomerIdentified} />
  }

  if (screen === 'confirmation') {
    return (
      <div className="max-w-md mx-auto p-4 text-center">
        <h2 className="text-2xl font-bold mb-2">Order Confirmed!</h2>
        <p className="text-lg">Confirmation #: <strong>{confirmation.confirmationNumber}</strong></p>
        <p className="text-sm text-gray-500 mt-4">You can now help the next customer.</p>
        <button
          onClick={startNewCustomer}
          className="mt-6 w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
        >
          Start New Customer
        </button>
      </div>
    )
  }

  // Cart Screen
  return (
    <div className="max-w-4xl mx-auto p-4">
      {/* Customer info header */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-xl font-bold">{customer.name}</h2>
          <p className="text-gray-600">{customer.phone}</p>
        </div>
        <button onClick={openEditCustomer} className="text-blue-600 underline text-sm">
          Edit Info
        </button>
      </div>

      {deliveryPaid && (
        <div className="bg-yellow-100 border-l-4 border-yellow-500 p-4 mb-4">
          <p className="font-bold">✅ DELIVERY FEE ALREADY PAID</p>
          {customer.address && (
            <p className="text-sm mt-1">
              📍 {customer.address.street}, {customer.address.city}, {customer.address.zip}
            </p>
          )}
        </div>
      )}

      {/* Scan / add item */}
      <form onSubmit={handleScanSubmit} className="flex gap-2 mb-4">
        <input
          type="text"
          value={scanInput}
          onChange={(e) => setScanInput(e.target.value.toUpperCase())}
          placeholder="Scan QR or type item code"
          className="flex-1 border rounded px-3 py-2"
          autoFocus
        />
        <button
          type="submit"
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
        >
          Add
        </button>
      </form>
      {scanError && <p className="text-red-600 text-sm mb-2">{scanError}</p>}

      {/* Cart items */}
      {cart.length === 0 ? (
        <p className="text-gray-500 italic text-center py-8">Cart is empty. Scan an item to begin.</p>
      ) : (
        <div className="space-y-2">
          {cart.map(item => (
            <div key={item.itemCode} className="flex items-center justify-between border p-2 rounded">
              <div className="flex-1">
                <p className="font-medium">{item.itemCode} – {item.description}</p>
                <p className="text-sm text-gray-500">${Number(item.price).toFixed(2)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleFulfillment(item.itemCode)}
                  className={`flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                    item.fulfillmentType === 'delivery'
                      ? 'bg-purple-100 text-purple-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                  title="Toggle pickup/delivery"
                >
                  {item.fulfillmentType === 'delivery' ? '🚚 Delivery' : '📍 Pickup'}
                </button>
                <button
                  onClick={() => setCart(prev => prev.filter(i => i.itemCode !== item.itemCode))}
                  className="text-red-500 hover:text-red-700 ml-2"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}

          <div className="border-t pt-3 mt-4 text-right">
            <p className="text-lg">
              Subtotal: <strong>${subtotal.toFixed(2)}</strong>
            </p>
            {needsDeliveryFee && (
              <p className="text-sm text-purple-700">+ $25.00 delivery fee</p>
            )}
            <p className="text-2xl font-bold mt-1">Total: ${total.toFixed(2)}</p>
          </div>

          <button
            onClick={handleProceedToCheckout}
            className="w-full bg-blue-600 text-white py-3 rounded text-lg mt-4 hover:bg-blue-700"
          >
            Checkout
          </button>
        </div>
      )}

      {/* Address modal (shown when screen === 'address') */}
      {screen === 'address' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">Delivery Address</h3>
            <form onSubmit={handleAddressSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Street *</label>
                <input
                  type="text"
                  value={address.street}
                  onChange={(e) => setAddress(prev => ({ ...prev, street: e.target.value }))}
                  className="w-full border rounded px-3 py-2"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">City *</label>
                <input
                  type="text"
                  value={address.city}
                  onChange={(e) => setAddress(prev => ({ ...prev, city: e.target.value }))}
                  className="w-full border rounded px-3 py-2"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Zip *</label>
                <input
                  type="text"
                  value={address.zip}
                  onChange={(e) => setAddress(prev => ({ ...prev, zip: e.target.value }))}
                  className="w-full border rounded px-3 py-2"
                  required
                />
              </div>
              {addressError && <p className="text-red-600 text-sm">{addressError}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 bg-green-600 text-white py-2 rounded hover:bg-green-700"
                >
                  Confirm & Pay ${total.toFixed(2)}
                </button>
                <button
                  type="button"
                  onClick={() => setScreen('cart')}
                  className="flex-1 bg-gray-300 py-2 rounded hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Customer modal */}
      {showEditCustomer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">Edit Customer</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Phone</label>
                <input
                  type="tel"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email (optional)</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={saveEditCustomer}
                  className="flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
                >
                  Save
                </button>
                <button
                  onClick={() => setShowEditCustomer(false)}
                  className="flex-1 bg-gray-300 py-2 rounded hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}