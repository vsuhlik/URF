import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function EndOfEvent() {
  const [event, setEvent] = useState(null)
  const [orders, setOrders] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [markingId, setMarkingId] = useState(null)
const [activeTab, setActiveTab] = useState('pickup')
  const navigate = useNavigate()

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    const { data: eventData } = await supabase
      .from('events')
      .select('*')
      .eq('status', 'active')
      .single()

    if (eventData) {
      setEvent(eventData)

      const { data: orderData } = await supabase
        .from('orders')
        .select('*')
        .eq('event_id', eventData.id)
        .order('created_at', { ascending: false })

      const { data: itemData } = await supabase
        .from('items')
        .select('*')
        .eq('event_id', eventData.id)
        .in('status', ['sold', 'pickedup'])

      setOrders(orderData || [])
      setItems(itemData || [])
    }
    setLoading(false)
  }

  const getOrderItems = (orderId) => items.filter(i => i.order_id === orderId)

  // Group a list of orders by customer (name + phone as key)
  const groupByCustomer = (orderList) => {
    const groups = {}
    orderList.forEach(order => {
      const key = `${order.customer_name}__${order.customer_phone || ''}`
      if (!groups[key]) {
        groups[key] = { name: order.customer_name, phone: order.customer_phone, orders: [] }
      }
      groups[key].orders.push(order)
    })
    return Object.values(groups)
  }

  const matchingOrders = (() => {
    const s = search.toLowerCase().trim()
    if (!s) return []
    const sDigits = s.replace(/\D/g, '')
    return orders.filter(o =>
      o.customer_name.toLowerCase().includes(s) ||
      o.confirmation_number.toLowerCase().includes(s) ||
      (sDigits.length > 0 && o.customer_phone && o.customer_phone.replace(/\D/g, '').includes(sDigits))
    )
  })()

  const customerGroups = groupByCustomer(matchingOrders)

  const handleMarkPickedUp = async (orderId) => {
    setMarkingId(orderId)
    await supabase.from('orders').update({ status: 'pickedup' }).eq('id', orderId)
    await supabase.from('items').update({ status: 'pickedup' }).eq('order_id', orderId)
    await fetchData()
    setMarkingId(null)
  }

  const handleMarkDelivered = async (orderId) => {
    setMarkingId(orderId)
    await supabase.from('orders').update({ status: 'delivered' }).eq('id', orderId)
    await supabase.from('items').update({ status: 'pickedup' }).eq('order_id', orderId)
    await fetchData()
    setMarkingId(null)
  }

  // Move a pickup order to delivery at no extra charge — uses existing delivery address
  const handleMoveToDelivery = async (orderId, deliveryAddress) => {
    if (!confirm('Move this order to delivery? No additional fee will be charged.')) return
    setMarkingId(orderId)
    await supabase
      .from('orders')
      .update({ fulfillment_type: 'delivery', delivery_address: deliveryAddress })
      .eq('id', orderId)
    await fetchData()
    setMarkingId(null)
  }

const pendingPickupOrders = orders.filter(o => o.fulfillment_type === 'pickup' && o.status === 'sold')
const pendingDeliveryOrders = orders.filter(o => o.fulfillment_type === 'delivery' && o.status === 'sold')
const pendingPickup = pendingPickupOrders.length
const pendingDelivery = pendingDeliveryOrders.length
const pickupGroups = groupByCustomer(pendingPickupOrders)
const deliveryGroups = groupByCustomer(pendingDeliveryOrders)

const activeGroups = activeTab === 'search' ? customerGroups : activeTab === 'pickup' ? pickupGroups : deliveryGroups

  return (
    <div className="min-h-screen bg-[#1a1a2e] text-white">
      <header className="bg-[#16213e] px-6 py-4 flex items-center gap-4 shadow-md">
        <button onClick={() => navigate('/dashboard')} className="text-gray-400 hover:text-white transition-colors">
          ← Back
        </button>
        <h1 className="text-xl font-bold">End of Event</h1>
      </header>

      {loading ? (
        <p className="text-gray-400 text-center mt-12">Loading...</p>
      ) : !event ? (
        <p className="text-gray-400 text-center mt-12">No active event found.</p>
      ) : (
        <main className="p-6 max-w-lg mx-auto">

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="bg-[#16213e] rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-yellow-400">{pendingPickup}</p>
              <p className="text-gray-400 text-xs">Awaiting Pickup</p>
            </div>
            <div className="bg-[#16213e] rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-blue-400">{pendingDelivery}</p>
              <p className="text-gray-400 text-xs">Awaiting Delivery</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-5">
            <button
              onClick={() => setActiveTab('pickup')}
              className={`flex-1 py-3 rounded-xl text-sm font-bold transition-colors ${
                activeTab === 'pickup' ? 'bg-yellow-500/30 text-yellow-400 border border-yellow-500/50' : 'bg-[#16213e] text-gray-400'
              }`}
            >
              📍 Pickup
              <span className={`ml-1.5 text-xs px-2 py-0.5 rounded-full ${pendingPickup > 0 ? 'bg-yellow-500/30 text-yellow-300' : 'bg-white/10 text-gray-500'}`}>
                {pendingPickup}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('delivery')}
              className={`flex-1 py-3 rounded-xl text-sm font-bold transition-colors ${
                activeTab === 'delivery' ? 'bg-blue-500/30 text-blue-400 border border-blue-500/50' : 'bg-[#16213e] text-gray-400'
              }`}
            >
              🚚 Delivery
              <span className={`ml-1.5 text-xs px-2 py-0.5 rounded-full ${pendingDelivery > 0 ? 'bg-blue-500/30 text-blue-300' : 'bg-white/10 text-gray-500'}`}>
                {pendingDelivery}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('search')}
              className={`px-4 py-3 rounded-xl text-sm font-bold transition-colors ${
                activeTab === 'search' ? 'bg-purple-600 text-white' : 'bg-[#16213e] text-gray-400'
              }`}
            >
              🔍
            </button>
          </div>

          {/* Search input — only visible on search tab */}
          {activeTab === 'search' && (
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, confirmation #, or phone"
              className="w-full bg-[#16213e] text-white rounded-xl px-4 py-4 outline-none focus:ring-2 focus:ring-purple-500 text-sm mb-5"
              autoFocus
            />
          )}

          {/* Empty states */}
          {activeTab === 'pickup' && pickupGroups.length === 0 && (
            <div className="text-center mt-16">
              <p className="text-5xl mb-4">✅</p>
              <p className="text-gray-400 text-sm">All pickups complete!</p>
            </div>
          )}
          {activeTab === 'delivery' && deliveryGroups.length === 0 && (
            <div className="text-center mt-16">
              <p className="text-5xl mb-4">✅</p>
              <p className="text-gray-400 text-sm">All deliveries complete!</p>
            </div>
          )}
          {activeTab === 'search' && !search.trim() && (
            <div className="text-center mt-16">
              <p className="text-gray-400 text-sm">Type to search all orders</p>
              <p className="text-gray-600 text-xs mt-1">Name, confirmation number, or phone</p>
            </div>
          )}
          {activeTab === 'search' && search.trim() && customerGroups.length === 0 && (
            <p className="text-center text-gray-500 mt-8 text-sm">No customers found.</p>
          )}

          {/* Customer results */}
          <div className="space-y-5">
            {activeGroups.map((group, idx) => {
              const deliveryOrders = group.orders.filter(o => o.fulfillment_type === 'delivery')
              const pickupOrders = group.orders.filter(o => o.fulfillment_type === 'pickup')
              const hasPaidDelivery = deliveryOrders.length > 0
              const deliveryAddress = hasPaidDelivery ? deliveryOrders[0].delivery_address : null

              return (
                <div key={idx} className="bg-[#16213e] rounded-2xl overflow-hidden border border-white/5">

                  {/* Customer header */}
                  <div className="px-4 pt-4 pb-3 border-b border-white/10 flex items-start justify-between">
                    <div>
                      <p className="text-white font-bold text-lg leading-tight">{group.name}</p>
                      {group.phone && <p className="text-gray-400 text-xs mt-0.5">{group.phone}</p>}
                    </div>
                    {hasPaidDelivery && (
                      <span className="shrink-0 ml-3 bg-blue-500/20 text-blue-400 text-xs font-semibold px-2 py-1 rounded-full">
                        ✓ Delivery Paid
                      </span>
                    )}
                  </div>

                  {/* Delivery section */}
                  {deliveryOrders.length > 0 && (
                    <div className="p-4 border-b border-white/5">
                      <p className="text-blue-400 text-xs font-bold uppercase tracking-widest mb-3">🚚 Delivery</p>
                      {deliveryAddress && (
                        <div className="bg-[#0f3460] rounded-lg px-3 py-2 mb-3">
                          <p className="text-gray-400 text-xs mb-0.5">Deliver to:</p>
                          <p className="text-white text-sm">{deliveryAddress}</p>
                        </div>
                      )}
                      {deliveryOrders.map(order => (
                        <div key={order.id} className="mb-4 last:mb-0">
                          <p className="text-purple-400 text-xs font-mono mb-1.5">#{order.confirmation_number}</p>
                          <div className="space-y-1 mb-2">
                            {getOrderItems(order.id).map(item => (
                              <div key={item.id} className="flex items-center justify-between bg-[#0f3460] rounded-lg px-3 py-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-purple-400 text-xs font-mono shrink-0">{item.item_code}</span>
                                  <span className="text-gray-300 text-xs truncate">{item.description}</span>
                                </div>
                                <span className="text-green-400 text-xs font-bold shrink-0 ml-2">${parseFloat(item.price).toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center justify-between">
                            <p className="text-gray-500 text-xs">Total: <span className="text-white font-semibold">${parseFloat(order.total_amount).toFixed(2)}</span></p>
                            {order.status === 'delivered' ? (
                              <span className="text-green-400 text-xs font-semibold">✓ Delivered</span>
                            ) : (
                              <button
                                onClick={() => handleMarkDelivered(order.id)}
                                disabled={markingId === order.id}
                                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                              >
                                {markingId === order.id ? '...' : '✓ Mark Delivered'}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Pickup section */}
                  {pickupOrders.length > 0 && (
                    <div className="p-4">
                      <p className="text-yellow-400 text-xs font-bold uppercase tracking-widest mb-3">📍 Pickup</p>
                      {pickupOrders.map(order => (
                        <div key={order.id} className="mb-4 last:mb-0">
                          <p className="text-purple-400 text-xs font-mono mb-1.5">#{order.confirmation_number}</p>
                          <div className="space-y-1 mb-2">
                            {getOrderItems(order.id).map(item => (
                              <div key={item.id} className="flex items-center justify-between bg-[#0f3460] rounded-lg px-3 py-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-purple-400 text-xs font-mono shrink-0">{item.item_code}</span>
                                  <span className="text-gray-300 text-xs truncate">{item.description}</span>
                                </div>
                                <span className="text-green-400 text-xs font-bold shrink-0 ml-2">${parseFloat(item.price).toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <p className="text-gray-500 text-xs">Total: <span className="text-white font-semibold">${parseFloat(order.total_amount).toFixed(2)}</span></p>
                            {order.status === 'pickedup' ? (
                              <span className="text-green-400 text-xs font-semibold">✓ Picked Up</span>
                            ) : (
                              <div className="flex gap-2">
                                {hasPaidDelivery && (
                                  <button
                                    onClick={() => handleMoveToDelivery(order.id, deliveryAddress)}
                                    disabled={markingId === order.id}
                                    className="bg-blue-500/20 hover:bg-blue-500/40 text-blue-400 text-xs font-bold px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
                                  >
                                    🚚 Add to Delivery
                                  </button>
                                )}
                                <button
                                  onClick={() => handleMarkPickedUp(order.id)}
                                  disabled={markingId === order.id}
                                  className="bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
                                >
                                  {markingId === order.id ? '...' : '✓ Picked Up'}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                </div>
              )
            })}
          </div>

        </main>
      )}
    </div>
  )
}