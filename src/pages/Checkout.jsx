import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCart } from '../hooks/useCart'
// import QRScanner from '../components/QRScanner'

const DELIVERY_FEE = 25.00

export default function Checkout() {
  const [event, setEvent] = useState(null)
  const [itemCodeInput, setItemCodeInput] = useState('')
  const [scanning, setScanning] = useState(false)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(null)

  // Booth assignment
  const [allBooths, setAllBooths] = useState([])
  const [assignedBoothIds, setAssignedBoothIds] = useState([])
  const [availableItems, setAvailableItems] = useState([])

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

  // Get current user ID for the cart hook
  const [userId, setUserId] = useState(null)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data?.session?.user?.id || null)
    })
  }, [])

  const { cartItems, addToCart, removeFromCart, completeSale, clearCart } = useCart(event?.id, userId)

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
    if (data) fetchAllBooths(data.id)
  }

  const fetchAllBooths = async (eventId) => {
    const { data } = await supabase
      .from('booths')
      .select('id, designer_name, booth_number')
      .eq('event_id', eventId)
    setAllBooths(data || [])
  }

  // Fetch available items for assigned booths
  useEffect(() => {
    if (!event || assignedBoothIds.length === 0) {
      setAvailableItems([])
      return
    }
    const fetchItems = async () => {
      const { data } = await supabase
        .from('items')
        .select('*')
        .eq('event_id', event.id)
        .eq('status', 'available')
        .in('booth_id', assignedBoothIds)
      setAvailableItems(data || [])
    }
    fetchItems()
  }, [assignedBoothIds, event])

  const toggleBooth = (id) => {
    setAssignedBoothIds(prev =>
      prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]
    )
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
      .select('delivery_address, customer_phone')
      .eq('event_id', event.id)
      .eq('fulfillment_type', 'delivery')
    
    const match = (data || []).find(o => {
      const oDigits = (o.customer_phone || '').replace(/\D/g, '')
      return oDigits.slice(-7) === digits.slice(-7)
    })

    if (match) {
      setDeliveryAlreadyPaid(true)
      setExistingDeliveryAddress(match.delivery_address || '')
      if (!deliveryAddress) setDeliveryAddress(match.delivery_address || '')
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

    // Use .eq with a direct match (avoids ilike content-type issues)
    const { data, error } = await supabase
      .from('items')
      .select('*')
      .eq('event_id', event.id)
      .eq('item_code', cleanCode)
      .eq('status', 'available')
      .single()

    if (error || !data) {
      setSearchError('Item not found or already sold.')
      setSearching(false)
      return
    }

    // Check if already in cart
    if (cartItems.find(i => i.id === data.id)) {
      setSearchError('Item already in cart.')
      setSearching(false)
      return
    }

    // Add to server-side cart
    const addErr = await addToCart(data.id)
    if (addErr) {
      setSearchError('Could not add item (maybe just sold).')
    } else {
      setItemCodeInput('')
    }
    setSearching(false)
  }

  const handleQRScan = (text) => {
    setScanning(false)
    handleAddByCode(text)
  }

  const itemsTotal = cartItems.reduce((sum, item) => sum + parseFloat(item.price), 0)
  const deliveryFee = fulfillment === 'delivery' && !deliveryAlreadyPaid ? DELIVERY_FEE : 0
  const grandTotal = itemsTotal + deliveryFee

  const handleConfirmSale = async () => {
    if (!customerName.trim()) return
    if (fulfillment === 'delivery' && !deliveryAddress.trim()) return

    setConfirming(true)

    // Re-check delivery fee to avoid double charges
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

    try {
      const result = await completeSale(
        customerName.trim(),
        customerPhone.trim() || '',
        fulfillment,
        confirmedTotal
      )

      if (!result.success) {
        alert(result.error + ': ' + (result.failed_items || []).join(', '))
        setConfirming(false)
        return
      }

      setConfirmation({
        number: result.confirmation_number,
        name: customerName.trim(),
        itemCount: cartItems.length,
        fulfillment,
        total: confirmedTotal
      })

      setStage('confirm')
    } catch (err) {
      alert('An error occurred. Please try again.')
      console.error(err)
    }
    setConfirming(false)
  }

  const startNewSale = async () => {
    await clearCart()
    setItemCodeInput('')
    setCustomerName('')
    setCustomerPhone('')
    setDeliveryAddress('')
    setFulfillment('pickup')
    setConfirmation(null)
    setStage('cart')
    setSearchError(null)
  }

  // Real-time: remove sold items from available list
  useEffect(() => {
    if (!event) return
    const subscription = supabase
      .channel('items-sold')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'items', filter: `event_id=eq.${event.id}` },
        (payload) => {
          if (payload.new.status === 'sold') {
            setAvailableItems(prev => prev.filter(i => i.id !== payload.new.id))
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(subscription) }
  }, [event])

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
            onClick={startNewSale}
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
              {cartItems.map(item => (
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
      {/* scanning && (
        <QRScanner
          onScan={handleQRScan}
          onClose={() => setScanning(false)}
        />
      ) */}

      <header className="bg-[#16213e] px-6 py-4 flex items-center gap-4 shadow-md">
        <button onClick={() => navigate('/dashboard')} className="text-gray-400 hover:text-white transition-colors">
          ← Back
        </button>
        <h1 className="text-xl font-bold">Checkout</h1>
        {cartItems.length > 0 && (
          <span className="ml-auto bg-purple-600 text-white text-xs font-bold px-2 py-1 rounded-full">
            {cartItems.length} item{cartItems.length !== 1 ? 's' : ''}
          </span>
        )}
      </header>

      <main className="p-6 max-w-lg mx-auto">

        {/* Booth Selection */}
        {allBooths.length > 0 && (
          <div className="mb-4">
            <p className="text-gray-400 text-xs mb-2">My Booths</p>
            <div className="flex flex-wrap gap-2">
              {allBooths.map(booth => (
                <button
                  key={booth.id}
                  onClick={() => toggleBooth(booth.id)}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    assignedBoothIds.includes(booth.id)
                      ? 'bg-purple-600 text-white'
                      : 'bg-[#16213e] text-gray-400'
                  }`}
                >
                  {booth.designer_name || `Booth ${booth.booth_number}`}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Available Items Grid (if booths selected) */}
        {assignedBoothIds.length > 0 && availableItems.length > 0 && (
          <div className="mb-4">
            <p className="text-gray-400 text-xs mb-2">Quick Add</p>
            <div className="grid grid-cols-2 gap-2">
              {availableItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => addToCart(item.id)}
                  className="bg-[#16213e] p-2 rounded-lg text-left hover:bg-purple-600/20 transition-colors"
                >
                  <p className="text-purple-400 text-xs font-mono">{item.item_code}</p>
                  <p className="text-white text-xs truncate">{item.description}</p>
                  <p className="text-green-400 text-xs font-bold">${parseFloat(item.price).toFixed(2)}</p>
                </button>
              ))}
            </div>
          </div>
        )}

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
        {cartItems.length > 0 ? (
          <>
            <div className="space-y-2 mb-4">
              {cartItems.map(item => (
                <div key={item.id} className="bg-[#16213e] rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-purple-400 text-xs font-mono">{item.item_code}</p>
                    <p className="text-white text-sm font-medium">{item.description}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-green-400 font-bold">${parseFloat(item.price).toFixed(2)}</p>
                    <button
                      onClick={() => removeFromCart(item.id)}
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