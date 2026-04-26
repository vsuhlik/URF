import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Inventory() {
  const [event, setEvent] = useState(null)
  const [booths, setBooths] = useState([])
  const [items, setItems] = useState([])
  const [selectedBooth, setSelectedBooth] = useState('all')
  const [loading, setLoading] = useState(true)
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

      const { data: boothData } = await supabase
        .from('booths')
        .select('*')
        .eq('event_id', eventData.id)
        .order('booth_number')
      setBooths(boothData || [])

      const { data: itemData } = await supabase
        .from('items')
        .select('*')
        .eq('event_id', eventData.id)
        .order('item_code')
      setItems(itemData || [])
    }
    setLoading(false)
  }

  const filteredItems = selectedBooth === 'all'
    ? items
    : items.filter(item => item.booth_id === selectedBooth)

  const availableCount = filteredItems.filter(i => i.status === 'available').length
  const soldCount = filteredItems.filter(i => i.status === 'sold' || i.status === 'pickedup').length

  const getStatusBadge = (status) => {
    if (status === 'sold') return 'bg-yellow-500/20 text-yellow-400'
    if (status === 'pickedup') return 'bg-green-500/20 text-green-400'
    return 'bg-blue-500/20 text-blue-400'
  }

  return (
    <div className="min-h-screen bg-[#1a1a2e] text-white">
      <header className="bg-[#16213e] px-6 py-4 flex items-center gap-4 shadow-md">
        <button onClick={() => navigate('/dashboard')} className="text-gray-400 hover:text-white transition-colors">
          ← Back
        </button>
        <h1 className="text-xl font-bold">Inventory</h1>
      </header>

      <main className="p-6 max-w-lg mx-auto">
        {loading ? (
          <p className="text-gray-400 text-center mt-8">Loading...</p>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-[#16213e] rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-blue-400">{availableCount}</p>
                <p className="text-gray-400 text-xs">Available</p>
              </div>
              <div className="bg-[#16213e] rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-yellow-400">{soldCount}</p>
                <p className="text-gray-400 text-xs">Sold</p>
              </div>
            </div>

            {/* Booth Filter */}
            <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
              <button
                onClick={() => setSelectedBooth('all')}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  selectedBooth === 'all' ? 'bg-purple-600 text-white' : 'bg-[#16213e] text-gray-400'
                }`}
              >
                All
              </button>
              {booths.map(booth => (
                <button
                  key={booth.id}
                  onClick={() => setSelectedBooth(booth.id)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    selectedBooth === booth.id ? 'bg-purple-600 text-white' : 'bg-[#16213e] text-gray-400'
                  }`}
                >
                  Booth {booth.booth_number}
                </button>
              ))}
            </div>

            {/* Items */}
            <div className="space-y-2">
              {filteredItems.map(item => (
                <div key={item.id} className="bg-[#16213e] rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-purple-400 text-xs font-mono">{item.item_code}</p>
                    <p className="text-white text-sm font-medium">{item.description}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-green-400 font-bold text-sm">${parseFloat(item.price).toFixed(2)}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusBadge(item.status)}`}>
                      {item.status}
                    </span>
                  </div>
                </div>
              ))}

              {filteredItems.length === 0 && (
                <p className="text-center text-gray-500 mt-8 text-sm">No items found.</p>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}