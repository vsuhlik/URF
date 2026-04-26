import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
// import QRScanner from '../components/QRScanner'

const DELIVERY_FEE = 25.00

function generateConfirmationNumber() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const letter = letters[Math.floor(Math.random() * letters.length)]
  const number = Math.floor(10 + Math.random() * 90)
  const number2 = Math.floor(10 + Math.random() * 90)
  return `${letter}${number}${number2}`
}

export default function Checkout() {
  const [event, setEvent] = useState(null)
  const [cart, setCart] = useState([])
  const [itemCodeInput, setItemCodeInput] = useState('')
  const [scanning, setScanning] = useState(false)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(null)

  // Checkout form
  const [stage, setStage] = useState('cart') // cart | details | confirm
  const [fulfillment, setFulfillment] = useState('pickup')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
const [confirming, setConfirming] = useState(false)
const [confirmation, setConfirmation] = useState(null)
const [deliveryAlreadyPaid, setDeliveryAlreadyPaid] = useState(false)
const [existingDeliveryAddress, setExistingDeliveryAddress] = useState('')

  const navigate = useNavigate()

  useEffect(() => {
    fetchEvent()
  }, [])

  const fetchEvent = async () => {
    const { data } = await supabase
      .from('events')
      .select('*')
      .eq('status', 'active')
      .single()
    setEvent(data)
  }

  const checkExistingDelivery = async (phone) => {
    if (!phone || phone.trim().length < 7 || !event) {
      setDeliveryAlreadyPaid(false)
      setExistingDeliveryAddress('')
      return
    }
    const digits = phone.replace(/\D/g, '')
    const { data } = await supabase
      .from('orders')
      .select('delivery_address')
      .eq('event_id', event.id)
      .eq('fulfillment_type', 'delivery')
    
    const match = (data || []).find(o => {
      const oDigits = (o.delivery_address || '')
      // match by phone stored in orders
      return false // placeholder — see below
    })

    // Actually query by phone directly
    const { data: phoneMatch } = await supabase
      .from('orders')
      .select('delivery_address')
      .eq('event_id', event.id)
      .eq('fulfillment_type', 'delivery')
      .ilike('customer_phone', `%${digits.slice(-7)}%`)
      .limit(1)
      .single()

    if (phoneMatch) {
      setDeliveryAlreadyPaid(true)
      setExistingDeliveryAddress(phoneMatch.delivery_address || '')
      if (!deliveryAddress) setDeliveryAddress(phoneMatch.delivery_address || '')
    } else {
      setDeliveryAlreadyPaid(false)
      setExistingDeliveryAddress('')
    }
  }

  const handleAddByCode = async (code) => {
    const cleanCode = code.trim().toUpperCase()
    if (!cleanCode) return

    setSearching(true)
    setSearchError(null)

    // Check not already in cart
    if (cart.find(i => i.item_code.toUpperCase() === cleanCode)) {
      setSearchError('Item already in cart.')
      setSearching(false)
      return
    }

    const { data, error } = await supabase
      .from('items')
      .select('*')
      .eq('event_id', event.id)
      .ilike('item_code', cleanCode)
      .eq('status', 'available')
      .single()

    if (error || !data) {
      setSearchError('Item not found or already sold.')
    } else {
      setCart(prev => [...prev, data])
      setItemCodeInput('')
    }

    setSearching(false)
  }

  const handleQRScan = (text) => {
    setScanning(false)
    handleAddByCode(text)
  }

  const handleRemoveFromCart = (itemId) => {
    setCart(prev => prev.filter(i => i.id !== itemId))
  }

  const itemsTotal = cart.reduce((sum, item) => sum + parseFloat(item.price), 0)
  const deliveryFee = fulfillment === 'delivery' && !deliveryAlreadyPaid ? DELIVERY_FEE : 0
  const grandTotal = itemsTotal + deliveryFee

  const handleConfirmSale = async () => {
    if (!customerName.trim()) return
    if (fulfillment === 'delivery' && !deliveryAddress.trim()) return

    setConfirming(true)

    // Hard gate: re-check delivery fee against DB right before order creation
    let finalDeliveryFee = deliveryFee
    if (fulfillment === 'delivery') {
      const digits = customerPhone.replace(/\D/g, '').slice(-7)
      const { data: existingOrders } = await supabase
        .from('orders')
        .select('id, customer_phone')
        .eq('event_id', event.id)
        .eq('fulfillment_type', 'delivery')

      const alreadyPaid = (existingOrders || []).some(o =>
        o.customer_phone &&
        o.customer_phone.replace(/\D/g, '').slice(-7) === digits
      )

      if (alreadyPaid) {
        finalDeliveryFee = 0
        setDeliveryAlreadyPaid(true)
      }
    }

    const confirmedTotal = itemsTotal + finalDeliveryFee
    const confirmationNumber = generateConfirmationNumber()

    // Create order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        event_id: event.id,
        confirmation_number: confirmationNumber,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim() || null,
        fulfillment_type: fulfillment,
        delivery_address: fulfillment === 'delivery' ? deliveryAddress.trim() : null,
        total_amount: confirmedTotal,
        status: 'sold'
      })
      .select()
      .single()

    if (orderError) {
      alert('Error creating order. Try again.')
      setConfirming(false)
      return
    }

    // Mark all items as sold and link to order
    const itemIds = cart.map(i => i.id)
    await supabase
      .from('items')
      .update({ status: 'sold', order_id: order.id })
      .in('id', itemIds)

    setConfirmation({
      number: confirmationNumber,
      name: customerName.trim(),
      itemCount: cart.length,
      fulfillment,
      total: confirmedTotal
    })

    setStage('confirm')
    setConfirming(false)
  }

  const handleNewSale = () => {
    setCart([])
    setItemCodeInput('')
    setCustomerName('')
    setCustomerPhone('')
    setDeliveryAddress('')
    setFulfillment('pickup')
    setConfirmation(null)
    setStage('cart')
    setSearchError(null)
  }

  // CONFIRMATION SCREEN
  if (stage === 'confirm' && confirmation) {
    return (
      <div className="min-h-screen bg-[#1a1a2e] flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm bg-[#16213e] rounded-3xl p-8 text-center shadow-2xl border border-purple-500/30">
          <div className="text-5xl mb-4">✅</div>
          <p className="text-green-400 font-semibold text-sm mb-2">PURCHASE CONFIRMED</p>

          <div className="bg-[#0f3460] rounded-2xl py-6 px-4 my-6">
            <p className="text-gray-400 text-xs mb-2">Confirmation Number</p>
            <p className="text-white text-5xl font-black tracking-widest">
              {confirmation.number}
            </p>
          </div>

          <p className="text-white text-xl font-bold mb-1">{confirmation.name}</p>
          <p className="text-gray-400 text-sm mb-1">
            {confirmation.itemCount} item{confirmation.itemCount !== 1 ? 's' : ''}
          </p>
          <p className="text-green-400 font-bold text-lg mb-2">
            ${confirmation.total.toFixed(2)}
          </p>
          <span className={`inline-block text-xs px-3 py-1 rounded-full mb-6 ${
            confirmation.fulfillment === 'delivery'
              ? 'bg-blue-500/20 text-blue-400'
              : 'bg-purple-500/20 text-purple-400'
          }`}>
            {confirmation.fulfillment === 'delivery' ? '🚚 Delivery' : '📍 Pickup Saturday'}
          </span>

          <p className="text-yellow-400 text-sm font-semibold mb-6">
            📸 Ask customer to screenshot this screen
          </p>

          <button
            onClick={handleNewSale}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-4 rounded-xl transition-colors text-lg"
          >
            New Sale
          </button>
        </div>
      </div>
    )
  }

  // DETAILS SCREEN
  if (stage === 'details') {
    return (
      <div className="min-h-screen bg-[#1a1a2e] text-white">
        <header className="bg-[#16213e] px-6 py-4 flex items-center gap-4 shadow-md">
          <button onClick={() => setStage('cart')} className="text-gray-400 hover:text-white transition-colors">
            ← Back
          </button>
          <h1 className="text-xl font-bold">Customer Details</h1>
        </header>

        <main className="p-6 max-w-lg mx-auto space-y-4">

          {/* Fulfillment Toggle */}
          <div className="bg-[#16213e] rounded-2xl p-4">
            <p className="text-gray-400 text-xs mb-3">Fulfillment Method</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => { setFulfillment('pickup'); setDeliveryAlreadyPaid(false) }}
                className={`py-3 rounded-xl font-semibold text-sm transition-colors ${
                  fulfillment === 'pickup'
                    ? 'bg-purple-600 text-white'
                    : 'bg-[#0f3460] text-gray-400'
                }`}
              >
                📍 Pickup
                <p className="text-xs font-normal opacity-70">Saturday 2pm</p>
              </button>
              <button
                onClick={() => { setFulfillment('delivery'); checkExistingDelivery(customerPhone) }}
                className={`py-3 rounded-xl font-semibold text-sm transition-colors ${
                  fulfillment === 'delivery'
                    ? 'bg-blue-600 text-white'
                    : 'bg-[#0f3460] text-gray-400'
                }`}
              >
                🚚 Delivery
                <p className="text-xs font-normal opacity-70">+$25.00 fee</p>
              </button>
            </div>
          </div>

          {/* Customer Info */}
          <div className="bg-[#16213e] rounded-2xl p-4 space-y-3">
            <p className="text-gray-400 text-xs">Customer Information</p>
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Full Name *</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Jane Smith"
                className="w-full bg-[#0f3460] text-white rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500 text-sm"
              />
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1 block">
  Phone Number {fulfillment === 'delivery' ? <span className="text-red-400">*</span> : '(optional)'}
</label>
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => {
                  setCustomerPhone(e.target.value)
                  if (fulfillment === 'delivery') checkExistingDelivery(e.target.value)
                }}
                placeholder="910-555-0100"
                className="w-full bg-[#0f3460] text-white rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500 text-sm"
              />
            </div>
            {fulfillment === 'delivery' && deliveryAlreadyPaid && (
              <div className="bg-blue-500/20 border border-blue-500/40 rounded-lg px-3 py-2">
                <p className="text-blue-300 text-xs font-semibold">✓ Delivery already paid — no additional fee</p>
                {existingDeliveryAddress && (
                  <p className="text-blue-400 text-xs mt-0.5">Using address on file: {existingDeliveryAddress}</p>
                )}
              </div>
            )}
            {fulfillment === 'delivery' && (
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Delivery Address *</label>
                <textarea
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="123 Main St, Wilmington, NC 28401"
                  rows={2}
                  className="w-full bg-[#0f3460] text-white rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500 text-sm resize-none"
                />
              </div>
            )}
          </div>

          {/* Order Summary */}
          <div className="bg-[#16213e] rounded-2xl p-4">
            <p className="text-gray-400 text-xs mb-3">Order Summary</p>
            <div className="space-y-1 mb-3">
              {cart.map(item => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span className="text-gray-300">{item.item_code} — {item.description}</span>
                  <span className="text-white">${parseFloat(item.price).toFixed(2)}</span>
                </div>
              ))}
              {fulfillment === 'delivery' && (
                <div className="flex justify-between text-sm">
                  <span className="text-blue-400">Delivery Fee</span>
                  <span className="text-blue-400">$25.00</span>
                </div>
              )}
            </div>
            <div className="border-t border-white/10 pt-3 flex justify-between">
              <span className="text-white font-bold">Total</span>
              <span className="text-green-400 font-bold text-lg">${grandTotal.toFixed(2)}</span>
            </div>
            <p className="text-yellow-400 text-xs mt-3 text-center">
              ⚠️ Ring up ${grandTotal.toFixed(2)} in Zettle before confirming
            </p>
          </div>

          <button
            onClick={handleConfirmSale}
            disabled={confirming || !customerName.trim() || (fulfillment === 'delivery' && !deliveryAddress.trim()) || (fulfillment === 'delivery' && !customerPhone.trim())}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-xl transition-colors disabled:opacity-50 text-lg"
          >
            {confirming ? 'Processing...' : '✓ Confirm Sale'}
          </button>
        </main>
      </div>
    )
  }

  // CART SCREEN (default)
  return (
    <div className="min-h-screen bg-[#1a1a2e] text-white">
      {/*scanning && (
        <QRScanner
          onScan={handleQRScan}
          onClose={() => setScanning(false)}
        />
      )*/}

      <header className="bg-[#16213e] px-6 py-4 flex items-center gap-4 shadow-md">
        <button onClick={() => navigate('/dashboard')} className="text-gray-400 hover:text-white transition-colors">
          ← Back
        </button>
        <h1 className="text-xl font-bold">Checkout</h1>
        {cart.length > 0 && (
          <span className="ml-auto bg-purple-600 text-white text-xs font-bold px-2 py-1 rounded-full">
            {cart.length} item{cart.length !== 1 ? 's' : ''}
          </span>
        )}
      </header>

      <main className="p-6 max-w-lg mx-auto">

        {/* Item Search */}
        <div className="bg-[#16213e] rounded-2xl p-4 mb-4">
          <p className="text-gray-400 text-xs mb-3">Add Item to Cart</p>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={itemCodeInput}
              onChange={(e) => setItemCodeInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleAddByCode(itemCodeInput)}
              placeholder="e.g. 6-2"
              className="flex-1 bg-[#0f3460] text-white rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500 text-sm font-mono"
            />
            <button
              onClick={() => handleAddByCode(itemCodeInput)}
              disabled={searching || !itemCodeInput}
              className="bg-purple-600 hover:bg-purple-700 text-white font-semibold px-4 py-3 rounded-lg transition-colors disabled:opacity-50 text-sm"
            >
              {searching ? '...' : 'Add'}
            </button>
            <button
              onClick={() => setScanning(true)}
              className="bg-[#0f3460] hover:bg-purple-600/30 text-white px-4 py-3 rounded-lg transition-colors text-lg"
            >
              📷
            </button>
          </div>
          {searchError && (
            <p className="text-red-400 text-xs mt-1">{searchError}</p>
          )}
        </div>

        {/* Cart Items */}
        {cart.length > 0 ? (
          <>
            <div className="space-y-2 mb-4">
              {cart.map(item => (
                <div key={item.id} className="bg-[#16213e] rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-purple-400 text-xs font-mono">{item.item_code}</p>
                    <p className="text-white text-sm font-medium">{item.description}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-green-400 font-bold">${parseFloat(item.price).toFixed(2)}</p>
                    <button
                      onClick={() => handleRemoveFromCart(item.id)}
                      className="text-red-400 hover:text-red-300 text-lg leading-none"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Total Bar */}
            <div className="bg-[#16213e] rounded-2xl p-4 mb-4 flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-xs">Items Total</p>
                <p className="text-white font-bold text-lg">${itemsTotal.toFixed(2)}</p>
              </div>
              <button
                onClick={() => setStage('details')}
                className="bg-green-600 hover:bg-green-700 text-white font-bold px-6 py-3 rounded-xl transition-colors"
              >
                Checkout →
              </button>
            </div>
          </>
        ) : (
          <div className="text-center mt-12">
            <p className="text-4xl mb-3">🛒</p>
            <p className="text-gray-400 text-sm">Cart is empty.</p>
            <p className="text-gray-600 text-xs mt-1">Scan a QR code or type an item code above.</p>
          </div>
        )}
      </main>
    </div>
  )
}