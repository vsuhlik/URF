import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function DesignerSubmit() {
  const { token } = useParams()
  const [booth, setBooth] = useState(null)
  const [event, setEvent] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [adding, setAdding] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [saving, setSaving] = useState(false)

  // Form state
  const [itemNumber, setItemNumber] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [quantity, setQuantity] = useState('1')

  useEffect(() => {
    fetchBoothByToken()
  }, [token])

  const fetchBoothByToken = async () => {
    const { data: boothData } = await supabase
      .from('booths')
      .select('*')
      .eq('submission_token', token)
      .single()

    if (!boothData) {
      setNotFound(true)
      setLoading(false)
      return
    }

    const { data: eventData } = await supabase
      .from('events')
      .select('*')
      .eq('id', boothData.event_id)
      .single()

    setBooth(boothData)
    setEvent(eventData)
    fetchItems(boothData.id)
  }

  const fetchItems = async (boothId) => {
    const { data } = await supabase
      .from('items')
      .select('*')
      .eq('booth_id', boothId)
      .order('item_code')
    setItems(data || [])
    setLoading(false)
  }

  const resetForm = () => {
    setItemNumber('')
    setDescription('')
    setPrice('')
    setQuantity('1')
    setEditingItem(null)
    setAdding(false)
  }

  const handleSaveItem = async (e) => {
    e.preventDefault()
    setSaving(true)

    const itemCode = `${booth.booth_number}-${itemNumber}`

    // Block duplicate item codes
    const duplicate = items.find(i => i.item_code === itemCode && (!editingItem || i.id !== editingItem.id))
    if (duplicate) {
      alert(`Item ${itemCode} already exists. Use a different item number.`)
      setSaving(false)
      return
    }

    if (editingItem) {
      await supabase
        .from('items')
        .update({ item_code: itemCode, description, price: parseFloat(price), quantity: parseInt(quantity) })
        .eq('id', editingItem.id)
    } else {
      await supabase
        .from('items')
        .insert({
          event_id: booth.event_id,
          booth_id: booth.id,
          item_code: itemCode,
          description,
          price: parseFloat(price),
          quantity: parseInt(quantity)
        })

      // Mark booth as in_progress after first item
      if (booth.submission_status === 'pending') {
        await supabase
          .from('booths')
          .update({ submission_status: 'in_progress' })
          .eq('id', booth.id)
        setBooth(prev => ({ ...prev, submission_status: 'in_progress' }))
      }
    }

    resetForm()
    fetchItems(booth.id)
    setSaving(false)
  }

  const handleEdit = (item) => {
    const itemNum = item.item_code.split('-')[1]
    setItemNumber(itemNum)
    setDescription(item.description)
    setPrice(item.price.toString())
    setQuantity(item.quantity.toString())
    setEditingItem(item)
    setAdding(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSubmitInventory = async () => {
    if (!confirm(`Submit all ${items.length} items for Booth ${booth.booth_number}? You can still edit after submitting.`)) return
    await supabase
      .from('booths')
      .update({ submission_status: 'submitted' })
      .eq('id', booth.id)
    setBooth(prev => ({ ...prev, submission_status: 'submitted' }))
  }

const handleUnsubmit = async () => {
    if (!confirm('Reopen your submission? This lets the organizers know you are still making changes.')) return
    await supabase
      .from('booths')
      .update({ submission_status: 'in_progress' })
      .eq('id', booth.id)
    setBooth(prev => ({ ...prev, submission_status: 'in_progress' }))
  }

  const handleDelete = async (itemId) => {
    if (!confirm('Delete this item?')) return
    await supabase.from('items').delete().eq('id', itemId)
    fetchItems(booth.id)
  }

  if (loading) return (
    <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center">
      <p className="text-white text-xl">Loading...</p>
    </div>
  )

  if (notFound) return (
    <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center px-4">
      <div className="text-center">
        <p className="text-4xl mb-4">🔍</p>
        <p className="text-white text-xl font-bold mb-2">Link Not Found</p>
        <p className="text-gray-400 text-sm">This submission link is invalid or expired.</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#1a1a2e] text-white">
      <header className="bg-[#16213e] px-6 py-4 shadow-md">
        <h1 className="text-xl font-bold text-white">UpScale Resale Flow</h1>
        <p className="text-purple-400 text-xs">Designer Inventory Submission</p>
      </header>

      <main className="p-6 max-w-lg mx-auto">

        {/* Booth Info */}
        <div className="bg-[#16213e] rounded-2xl p-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400 mb-1">{event?.name}</p>
              <p className="text-white font-bold text-lg">Booth {booth.booth_number}</p>
              <p className="text-purple-400 text-sm">{booth.designer_name}</p>
            </div>
            <div className="text-right">
              <span className={`text-xs px-3 py-1 rounded-full ${
                booth.submission_status === 'submitted' || booth.submission_status === 'approved'
                  ? 'bg-green-500/20 text-green-400'
                  : booth.submission_status === 'in_progress'
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'bg-yellow-500/20 text-yellow-400'
              }`}>
                {booth.submission_status === 'submitted' || booth.submission_status === 'approved'
                  ? 'Submitted'
                  : booth.submission_status === 'in_progress'
                  ? 'In Progress'
                  : 'Pending'}
              </span>
              <p className="text-gray-500 text-xs mt-1">{items.length} item{items.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </div>

        {/* Add / Edit Form */}
        {adding ? (
          <div className="bg-[#16213e] rounded-2xl p-4 mb-4">
            <h2 className="text-white font-semibold mb-3">
              {editingItem ? 'Edit Item' : 'Add Item'}
            </h2>
            <form onSubmit={handleSaveItem} className="space-y-3">
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Item Number</label>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 text-sm bg-[#0f3460] px-3 py-2 rounded-lg">{booth.booth_number}-</span>
                  <input
                    type="number"
                    min="1"
                    value={itemNumber}
                    onChange={(e) => setItemNumber(e.target.value)}
                    required
                    placeholder="1"
                    className="w-20 bg-[#0f3460] text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="text-gray-400 text-xs mb-1 block">Description</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                  placeholder="e.g. Vintage wooden chair"
                  className="w-full bg-[#0f3460] text-white rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                />
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-gray-400 text-xs mb-1 block">Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    required
                    placeholder="25.00"
                    className="w-full bg-[#0f3460] text-white rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                  />
                </div>
                <div className="w-24">
                  <label className="text-gray-400 text-xs mb-1 block">Qty</label>
                  <input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    required
                    className="w-full bg-[#0f3460] text-white rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 bg-[#0f3460] hover:bg-[#0f3460]/80 text-gray-300 font-semibold py-2 rounded-lg transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 rounded-lg transition-colors disabled:opacity-50 text-sm"
                >
                  {saving ? 'Saving...' : editingItem ? 'Update Item' : 'Add Item'}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="flex gap-3 mb-4">
            <button
              onClick={() => setAdding(true)}
              className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 rounded-lg transition-colors"
            >
              + Add Item
            </button>
            {items.length > 0 && booth.submission_status !== 'submitted' && booth.submission_status !== 'approved' && (
              <button
                onClick={handleSubmitInventory}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-lg transition-colors"
              >
                ✓ Submit All
              </button>
            )}
            {(booth.submission_status === 'submitted') && (
              <button
                onClick={handleUnsubmit}
                className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white font-semibold py-3 rounded-lg transition-colors"
              >
                ↩ Reopen
              </button>
            )}
          </div>
        )}

        {/* Items List */}
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.id} className="bg-[#16213e] rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-purple-400 text-xs font-mono mb-1">{item.item_code}</p>
                  <p className="text-white text-sm font-medium">{item.description}</p>
                  <p className="text-gray-400 text-xs mt-1">Qty: {item.quantity}</p>
                </div>
                <p className="text-green-400 font-bold">${parseFloat(item.price).toFixed(2)}</p>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => handleEdit(item)}
                  className="flex-1 bg-[#0f3460] hover:bg-purple-600/30 text-gray-300 text-xs py-1.5 rounded-lg transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(item.id)}
                  className="bg-red-500/20 hover:bg-red-500/40 text-red-400 text-xs px-3 py-1.5 rounded-lg transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}

          {items.length === 0 && !adding && (
            <p className="text-center text-gray-500 mt-6 text-sm">No items yet. Add your first item above.</p>
          )}
        </div>
      </main>
    </div>
  )
}