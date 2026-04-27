import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function EndOfEvent() {
  const navigate = useNavigate()
  const [eventId, setEventId] = useState(null)
  const [orders, setOrders] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState('pickup')
  const [loading, setLoading] = useState(true)

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
    const fetchOrders = async () => {
      setLoading(true)
      const { data } = await supabase
        .from('orders')
        .select('*, customer:customers( id, name, phone, email, delivery_fee_paid, address )')
        .eq('event_id', eventId)
        .in('status', ['sold', 'pickedup', 'delivered'])
        .order('created_at', { ascending: false })

      setOrders(data || [])
      setLoading(false)
    }
    fetchOrders()
  }, [eventId])

  // Helper: ensure items is always an array
  const ensureItems = (order) => Array.isArray(order.items) ? order.items : []

  const customerGroups = useMemo(() => {
    const map = new Map()
    orders.forEach(order => {
      const custId = order.customer?.id || order.customer_id
      const phone = order.customer?.phone || order.customer_phone
      const key = custId || `${order.customer_name}__${phone}`
      if (!map.has(key)) {
        map.set(key, {
          customerId: custId,
          customerName: order.customer?.name || order.customer_name,
          customerPhone: phone,
          email: order.customer?.email || null,
          deliveryFeePaid: order.customer?.delivery_fee_paid || false,
          address: order.customer?.address || null,
          orders: []
        })
      }
      map.get(key).orders.push(order)
    })
    return Array.from(map.values())
  }, [orders])

  const pickupGroups = customerGroups.filter(group =>
    group.orders.some(order => ensureItems(order).some(item => item.fulfillmentType === 'pickup' && item.status !== 'pickedup'))
  )
  const deliveryGroups = customerGroups.filter(group =>
    group.orders.some(order => ensureItems(order).some(item => item.fulfillmentType === 'delivery' && item.status !== 'delivered'))
  )

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return []
    const q = searchQuery.toLowerCase()
    return customerGroups.filter(group => {
      if (group.customerName.toLowerCase().includes(q)) return true
      if (group.orders.some(o => o.confirmation_number?.toLowerCase().includes(q))) return true
      // Only try phone match if the search query contains digits
      const digits = searchQuery.replace(/\D/g, '')
      if (digits && group.customerPhone && group.customerPhone.includes(digits)) return true
      return false
    })
  }, [customerGroups, searchQuery])

  const markItemStatus = async (orderId, itemCode, newFulfillmentStatus, isDelivery) => {
    const order = orders.find(o => o.id === orderId)
    if (!order) return
    const items = ensureItems(order)

    // Guard: do nothing if the item is already in the target status
    const targetItem = items.find(item => item.itemCode === itemCode && item.fulfillmentType === (isDelivery ? 'delivery' : 'pickup'))
    if (!targetItem || targetItem.status === newFulfillmentStatus) return

    const updatedItems = items.map(item => {
      if (item.itemCode === itemCode && item.fulfillmentType === (isDelivery ? 'delivery' : 'pickup')) {
        return { ...item, status: newFulfillmentStatus }
      }
      return item
    })

    // Determine new order status based on remaining items
    const allPickupDone = updatedItems.every(item => item.fulfillmentType !== 'pickup' || item.status === 'pickedup')
    const allDeliveryDone = updatedItems.every(item => item.fulfillmentType !== 'delivery' || item.status === 'delivered')

    let newOrderStatus = order.status // keep current by default
    if (allPickupDone && allDeliveryDone) {
      newOrderStatus = 'delivered'          // fully done, use allowed 'delivered'
    } else if (allPickupDone) {
      newOrderStatus = 'pickedup'           // only pickup completed
    } else if (allDeliveryDone) {
      newOrderStatus = 'delivered'          // delivery completed (pickup may remain)
    }

    const { data, error } = await supabase
      .from('orders')
      .update({ items: updatedItems, status: newOrderStatus })
      .eq('id', orderId)
      .select()

    if (!error) {
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, items: updatedItems, status: newOrderStatus } : o))
    } else {
      console.error('❌ Order update failed:', error)
      console.log('Attempted status:', newOrderStatus, 'allowed: sold, pickup, delivered')
    }
  }

  const moveItemToDelivery = async (orderId, itemCode) => {
    const order = orders.find(o => o.id === orderId)
    if (!order) return
    const userGroup = customerGroups.find(g => g.orders.some(o => o.id === orderId))
    if (!userGroup?.deliveryFeePaid) {
      alert('Customer has not paid the delivery fee.')
      return
    }

    const items = ensureItems(order)
    const updatedItems = items.map(item =>
      item.itemCode === itemCode && item.fulfillmentType === 'pickup'
        ? { ...item, fulfillmentType: 'delivery', status: 'sold' }
        : item
    )

    let orderUpdate = { items: updatedItems }
    if (!order.delivery_address && userGroup.address) {
      orderUpdate.delivery_address = userGroup.address
    }

    const { data, error } = await supabase
      .from('orders')
      .update(orderUpdate)
      .eq('id', orderId)
      .select()

    if (!error) {
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, items: updatedItems, ...orderUpdate } : o))
    } else {
      console.error('❌ Move to delivery failed:', error)
    }
  }

  const CustomerCard = ({ group }) => {
    const pickupItems = group.orders.flatMap(o =>
      ensureItems(o)
        .filter(item => item.fulfillmentType === 'pickup' && item.status !== 'pickedup')
        .map(item => ({ ...item, orderId: o.id, confirmationNumber: o.confirmation_number }))
    )
    const deliveryItems = group.orders.flatMap(o =>
      ensureItems(o)
        .filter(item => item.fulfillmentType === 'delivery' && item.status !== 'delivered')
        .map(item => ({ ...item, orderId: o.id, confirmationNumber: o.confirmation_number }))
    )

    if (pickupItems.length === 0 && deliveryItems.length === 0) return null

    return (
      <div className="bg-[#16213e] rounded-2xl p-4 mb-4">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="font-bold text-white text-lg">{group.customerName}</h3>
            <p className="text-gray-400 text-sm">{group.customerPhone}</p>
          </div>
          {group.deliveryFeePaid && (
            <span className="bg-green-500/20 text-green-400 px-2 py-1 rounded-full text-xs font-bold">
              ✓ Delivery Paid
            </span>
          )}
        </div>

        {pickupItems.length > 0 && (
          <div className="mt-4">
            <h4 className="font-semibold text-sm text-yellow-400 mb-2">📍 Pickup Items</h4>
            {pickupItems.map(item => (
              <div key={`${item.orderId}-${item.itemCode}`} className="flex items-center justify-between border-b border-gray-700 py-1">
                <span className="text-white text-sm">{item.itemCode} – {item.description} <span className="text-gray-400 text-xs">(Conf #{item.confirmationNumber})</span></span>
                <div className="flex gap-2">
                  {group.deliveryFeePaid && (
                    <button
                      onClick={() => moveItemToDelivery(item.orderId, item.itemCode)}
                      className="text-xs text-purple-400 underline hover:text-purple-300"
                    >
                      Add to Delivery
                    </button>
                  )}
                  <button
                    onClick={() => markItemStatus(item.orderId, item.itemCode, 'pickedup', false)}
                    className="bg-green-600 text-white px-2 py-1 rounded text-xs hover:bg-green-700"
                  >
                    Picked Up
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {deliveryItems.length > 0 && (
          <div className="mt-4">
            <h4 className="font-semibold text-sm text-purple-400 mb-2">🚚 Delivery Items</h4>
            {group.address && (
              <p className="text-xs text-gray-400 mb-1">
                Address: {group.address.street}, {group.address.city} {group.address.zip}
              </p>
            )}
            {deliveryItems.map(item => (
              <div key={`${item.orderId}-${item.itemCode}`} className="flex items-center justify-between border-b border-gray-700 py-1">
                <span className="text-white text-sm">{item.itemCode} – {item.description} <span className="text-gray-400 text-xs">(Conf #{item.confirmationNumber})</span></span>
                <button
                  onClick={() => markItemStatus(item.orderId, item.itemCode, 'delivered', true)}
                  className="bg-purple-600 text-white px-2 py-1 rounded text-xs hover:bg-purple-700"
                >
                  Delivered
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (!eventId) {
    return (
      <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center text-white">
        <p>No active event found.</p>
      </div>
    )
  }

  if (loading) return (
    <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center text-white">
      <p>Loading orders...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#1a1a2e] text-white">
        <header className="bg-[#16213e] px-6 py-4 flex items-center gap-4 shadow-md">
          <button onClick={() => navigate('/dashboard')} className="text-gray-400 hover:text-white transition-colors">
            ← Back
          </button>
          <h1 className="text-xl font-bold">End of Event</h1>
        </header>

      <main className="p-6 max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold mb-4">Pickup & Delivery</h2>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setActiveTab('pickup')}
            className={`px-4 py-2 rounded-t-lg font-medium text-sm transition-colors ${
              activeTab === 'pickup'
                ? 'bg-yellow-500/20 text-yellow-300 border-b-2 border-yellow-500'
                : 'bg-[#16213e] text-gray-400'
            }`}
          >
            📍 Pickup ({pickupGroups.reduce((acc, g) => acc + g.orders.flatMap(o => ensureItems(o).filter(i => i.fulfillmentType === 'pickup' && i.status !== 'pickedup')).length, 0)})
          </button>
          <button
            onClick={() => setActiveTab('delivery')}
            className={`px-4 py-2 rounded-t-lg font-medium text-sm transition-colors ${
              activeTab === 'delivery'
                ? 'bg-purple-500/20 text-purple-300 border-b-2 border-purple-500'
                : 'bg-[#16213e] text-gray-400'
            }`}
          >
            🚚 Delivery ({deliveryGroups.reduce((acc, g) => acc + g.orders.flatMap(o => ensureItems(o).filter(i => i.fulfillmentType === 'delivery' && i.status !== 'delivered')).length, 0)})
          </button>
          <button
            onClick={() => setActiveTab('search')}
            className={`px-4 py-2 rounded-t-lg font-medium text-sm transition-colors ${
              activeTab === 'search'
                ? 'bg-blue-500/20 text-blue-300 border-b-2 border-blue-500'
                : 'bg-[#16213e] text-gray-400'
            }`}
          >
            🔍 Search
          </button>
        </div>

        {activeTab === 'search' && (
          <div className="mb-4">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by name, confirmation #, or phone"
              className="w-full bg-[#0f3460] text-white rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500"
              autoFocus
            />
          </div>
        )}

        <div>
          {activeTab === 'pickup' && pickupGroups.map((group, idx) => (
            <CustomerCard key={`pickup-${group.customerId || group.customerPhone}-${idx}`} group={group} />
          ))}
          {activeTab === 'delivery' && deliveryGroups.map((group, idx) => (
            <CustomerCard key={`delivery-${group.customerId || group.customerPhone}-${idx}`} group={group} />
          ))}
          {activeTab === 'search' && searchResults.map((group, idx) => (
            <CustomerCard key={`search-${group.customerId || group.customerPhone}-${idx}`} group={group} />
          ))}
          {activeTab === 'search' && searchQuery && searchResults.length === 0 && (
            <p className="text-gray-500 text-center py-8">No customers match your search.</p>
          )}
        </div>
      </main>
    </div>
  )
}