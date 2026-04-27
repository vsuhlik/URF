// src/pages/EndOfEvent.jsx
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useEvent } from '../hooks/useEvent'

export default function EndOfEvent() {
  const { event } = useEvent()
  const eventId = event.id

  const [orders, setOrders] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState('pickup') // pickup|delivery|search
  const [loading, setLoading] = useState(true)

  // Fetch all sold orders that are not yet picked up or delivered
  useEffect(() => {
    const fetchOrders = async () => {
      setLoading(true)
      const { data } = await supabase
        .from('orders')
        .select('*, customer:customers( id, name, phone, email, delivery_fee_paid, address )')
        .eq('event_id', eventId)
        .in('status', ['sold', 'partially_picked_up'])  // adjust if you have custom statuses
        .order('created_at', { ascending: false })

      setOrders(data || [])
      setLoading(false)
    }
    fetchOrders()
  }, [eventId])

  // Group orders by customer (using customer_id if available, else name+phone)
  const customerGroups = useMemo(() => {
    const map = new Map()
    orders.forEach(order => {
      const custId = order.customer?.id || order.customer_id
      const key = custId || `${order.customerName}__${order.customerPhone}`
      if (!map.has(key)) {
        map.set(key, {
          customerId: custId,
          customerName: order.customer?.name || order.customerName,
          customerPhone: order.customer?.phone || order.customerPhone,
          email: order.customer?.email || order.customerEmail,
          deliveryFeePaid: order.customer?.delivery_fee_paid || false,
          address: order.customer?.address || null,
          orders: []
        })
      }
      map.get(key).orders.push(order)
    })
    return Array.from(map.values())
  }, [orders])

  // Compute pending pickup/delivery groups for tabs
  const pickupGroups = customerGroups.filter(group =>
    group.orders.some(order => order.items.some(item => item.fulfillmentType === 'pickup' && order.status !== 'pickedup'))
  )
  const deliveryGroups = customerGroups.filter(group =>
    group.orders.some(order => order.items.some(item => item.fulfillmentType === 'delivery' && order.status !== 'delivered'))
  )

  // Search results (by name, confirmation, or phone)
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return []
    const q = searchQuery.toLowerCase()
    return customerGroups.filter(group =>
      group.customerName.toLowerCase().includes(q) ||
      group.customerPhone.includes(searchQuery.replace(/\D/g, '')) ||
      group.orders.some(o => o.confirmationNumber?.toLowerCase().includes(q))
    )
  }, [customerGroups, searchQuery])

  // Mark item as picked up / delivered
  const markItemStatus = async (orderId, itemCode, newFulfillmentStatus, isDelivery) => {
    // newFulfillmentStatus: 'pickedup' or 'delivered'
    const order = orders.find(o => o.id === orderId)
    if (!order) return

    const updatedItems = order.items.map(item => {
      if (item.itemCode === itemCode && item.fulfillmentType === (isDelivery ? 'delivery' : 'pickup')) {
        return { ...item, status: newFulfillmentStatus }
      }
      return item
    })

    // Check if all items of that fulfillment type are now handled, and maybe update order status
    const allPickupDone = updatedItems.every(item => item.fulfillmentType !== 'pickup' || item.status === 'pickedup')
    const allDeliveryDone = updatedItems.every(item => item.fulfillmentType !== 'delivery' || item.status === 'delivered')
    let newOrderStatus = order.status
    if (allPickupDone && allDeliveryDone) newOrderStatus = 'completed'
    else if (allPickupDone) newOrderStatus = 'pickedup'
    else if (allDeliveryDone) newOrderStatus = 'delivered'

    const { error } = await supabase
      .from('orders')
      .update({ items: updatedItems, status: newOrderStatus })
      .eq('id', orderId)

    if (!error) {
      // Refresh orders
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, items: updatedItems, status: newOrderStatus } : o))
    }
  }

  // Move a single item from pickup to delivery (when customer already paid fee)
  const moveItemToDelivery = async (orderId, itemCode) => {
    const order = orders.find(o => o.id === orderId)
    if (!order) return
    const customer = customerGroups.find(g => g.orders.some(o => o.id === orderId))
    if (!customer.deliveryFeePaid) {
      alert('Customer has not paid the delivery fee. Cannot add to delivery.')
      return
    }

    const updatedItems = order.items.map(item =>
      item.itemCode === itemCode && item.fulfillmentType === 'pickup'
        ? { ...item, fulfillmentType: 'delivery', status: 'sold' }
        : item
    )

    // Ensure order has delivery address
    let orderUpdate = { items: updatedItems }
    if (!order.deliveryAddress && customer.address) {
      orderUpdate.deliveryAddress = customer.address
    }

    const { error } = await supabase
      .from('orders')
      .update(orderUpdate)
      .eq('id', orderId)

    if (!error) {
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, items: updatedItems, ...orderUpdate } : o))
    }
  }

  // Render a group (customer card)
  const CustomerCard = ({ group }) => {
    const pickupItems = group.orders.flatMap(o =>
      o.items
        .filter(item => item.fulfillmentType === 'pickup' && item.status !== 'pickedup')
        .map(item => ({ ...item, orderId: o.id, confirmationNumber: o.confirmationNumber }))
    )
    const deliveryItems = group.orders.flatMap(o =>
      o.items
        .filter(item => item.fulfillmentType === 'delivery' && item.status !== 'delivered')
        .map(item => ({ ...item, orderId: o.id, confirmationNumber: o.confirmationNumber }))
    )

    if (pickupItems.length === 0 && deliveryItems.length === 0) return null

    return (
      <div className="border rounded-lg p-4 mb-4 bg-white shadow">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="font-bold text-lg">{group.customerName}</h3>
            <p className="text-gray-600">{group.customerPhone}</p>
          </div>
          {group.deliveryFeePaid && (
            <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-bold">
              ✓ Delivery Paid
            </span>
          )}
        </div>

        {/* Pickup section */}
        {pickupItems.length > 0 && (
          <div className="mt-4">
            <h4 className="font-semibold text-sm text-gray-700 mb-2">📍 Pickup Items</h4>
            {pickupItems.map(item => (
              <div key={`${item.orderId}-${item.itemCode}`} className="flex items-center justify-between border-b py-1">
                <span>{item.itemCode} – {item.description} <span className="text-sm text-gray-500">(Conf #{item.confirmationNumber})</span></span>
                <div className="flex gap-2">
                  {group.deliveryFeePaid && (
                    <button
                      onClick={() => moveItemToDelivery(item.orderId, item.itemCode)}
                      className="text-xs text-purple-600 underline"
                      title="Move to delivery"
                    >
                      Add to Delivery
                    </button>
                  )}
                  <button
                    onClick={() => markItemStatus(item.orderId, item.itemCode, 'pickedup', false)}
                    className="bg-green-500 text-white px-2 py-1 rounded text-xs"
                  >
                    Picked Up
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Delivery section */}
        {deliveryItems.length > 0 && (
          <div className="mt-4">
            <h4 className="font-semibold text-sm text-purple-700 mb-2">🚚 Delivery Items</h4>
            {group.address && (
              <p className="text-xs text-gray-500 mb-1">
                Address: {group.address.street}, {group.address.city} {group.address.zip}
              </p>
            )}
            {deliveryItems.map(item => (
              <div key={`${item.orderId}-${item.itemCode}`} className="flex items-center justify-between border-b py-1">
                <span>{item.itemCode} – {item.description} <span className="text-sm text-gray-500">(Conf #{item.confirmationNumber})</span></span>
                <button
                  onClick={() => markItemStatus(item.orderId, item.itemCode, 'delivered', true)}
                  className="bg-purple-500 text-white px-2 py-1 rounded text-xs"
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

  if (loading) return <div className="p-4">Loading orders...</div>

  return (
    <div className="max-w-5xl mx-auto p-4">
      <h2 className="text-2xl font-bold mb-4">End of Event – Pickup & Delivery</h2>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveTab('pickup')}
          className={`px-4 py-2 rounded-t-lg font-medium ${activeTab === 'pickup' ? 'bg-yellow-100 border-b-2 border-yellow-500' : 'bg-gray-100'}`}
        >
          📍 Pickup ({pickupGroups.reduce((acc, g) => acc + g.orders.flatMap(o => o.items.filter(i => i.fulfillmentType === 'pickup' && i.status !== 'pickedup')).length, 0)})
        </button>
        <button
          onClick={() => setActiveTab('delivery')}
          className={`px-4 py-2 rounded-t-lg font-medium ${activeTab === 'delivery' ? 'bg-purple-100 border-b-2 border-purple-500' : 'bg-gray-100'}`}
        >
          🚚 Delivery ({deliveryGroups.reduce((acc, g) => acc + g.orders.flatMap(o => o.items.filter(i => i.fulfillmentType === 'delivery' && i.status !== 'delivered')).length, 0)})
        </button>
        <button
          onClick={() => setActiveTab('search')}
          className={`px-4 py-2 rounded-t-lg font-medium ${activeTab === 'search' ? 'bg-blue-100 border-b-2 border-blue-500' : 'bg-gray-100'}`}
        >
          🔍 Search
        </button>
      </div>

      {/* Search bar (visible only in search tab, but we can keep it there) */}
      {activeTab === 'search' && (
        <div className="mb-4">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by name, confirmation #, or phone"
            className="w-full border rounded px-3 py-2"
            autoFocus
          />
        </div>
      )}

      {/* Lists */}
      <div>
        {activeTab === 'pickup' && pickupGroups.map(group => <CustomerCard key={group.customerId || group.customerPhone} group={group} />)}
        {activeTab === 'delivery' && deliveryGroups.map(group => <CustomerCard key={group.customerId || group.customerPhone} group={group} />)}
        {activeTab === 'search' && searchResults.map(group => <CustomerCard key={group.customerId || group.customerPhone} group={group} />)}
        {activeTab === 'search' && searchQuery && searchResults.length === 0 && (
          <p className="text-gray-500 text-center py-8">No customers match your search.</p>
        )}
      </div>
    </div>
  )
}