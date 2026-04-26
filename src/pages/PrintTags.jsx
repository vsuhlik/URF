import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { QRCodeSVG as QRCode } from 'qrcode.react'

export default function PrintTags() {
  const [event, setEvent] = useState(null)
  const [booths, setBooths] = useState([])
  const [items, setItems] = useState([])
  const [selectedBooth, setSelectedBooth] = useState(null)
  const [tagSize, setTagSize] = useState('large')
  const [loading, setLoading] = useState(true)
  const [printing, setPrinting] = useState(false)
  const navigate = useNavigate()
  const printRef = useRef()

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
    }
    setLoading(false)
  }

  const fetchItems = async (boothId) => {
    const { data } = await supabase
      .from('items')
      .select('*')
      .eq('booth_id', boothId)
      .order('item_code')
    setItems(data || [])
  }

  const handleBoothSelect = (booth) => {
    setSelectedBooth(booth)
    fetchItems(booth.id)
  }

  const handlePrint = () => {
    setPrinting(true)
    setTimeout(() => {
      window.print()
      setPrinting(false)
    }, 300)
  }

  const boothItems = items.filter(i => i.booth_id === selectedBooth?.id)

  return (
    <>
      {/* Print Styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #print-area, #print-area * { visibility: visible; }
          #print-area { position: absolute; left: 0; top: 0; width: 100%; }
          @page { margin: 0.5in; size: letter portrait; }
        }
      `}</style>

      <div className="min-h-screen bg-[#1a1a2e] text-white">
        <header className="bg-[#16213e] px-6 py-4 flex items-center gap-4 shadow-md no-print">
          <button onClick={() => navigate('/dashboard')} className="text-gray-400 hover:text-white transition-colors">
            ← Back
          </button>
          <h1 className="text-xl font-bold">Print Tags</h1>
        </header>

        <main className="p-6 max-w-lg mx-auto no-print">
          {loading ? (
            <p className="text-gray-400 text-center mt-8">Loading...</p>
          ) : (
            <>
              {/* Tag Size Toggle */}
              <div className="bg-[#16213e] rounded-2xl p-4 mb-4">
                <p className="text-gray-400 text-xs mb-3">Tag Size</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setTagSize('large')}
                    className={`py-3 rounded-xl font-semibold text-sm transition-colors ${
                      tagSize === 'large'
                        ? 'bg-purple-600 text-white'
                        : 'bg-[#0f3460] text-gray-400'
                    }`}
                  >
                    Large Tag
                    <p className="text-xs font-normal opacity-70">3" x 6" — 2 per page</p>
                  </button>
                  <button
                    onClick={() => setTagSize('small')}
                    className={`py-3 rounded-xl font-semibold text-sm transition-colors ${
                      tagSize === 'small'
                        ? 'bg-purple-600 text-white'
                        : 'bg-[#0f3460] text-gray-400'
                    }`}
                  >
                    Small Tag
                    <p className="text-xs font-normal opacity-70">1" x 2" — 10 per page</p>
                  </button>
                </div>
              </div>

              {/* Booth Selector */}
              <div className="bg-[#16213e] rounded-2xl p-4 mb-4">
                <p className="text-gray-400 text-xs mb-3">Select Booth</p>
                <div className="grid grid-cols-3 gap-2">
                  {booths.map(booth => (
                    <button
                      key={booth.id}
                      onClick={() => handleBoothSelect(booth)}
                      className={`py-2 px-3 rounded-xl text-xs font-medium transition-colors ${
                        selectedBooth?.id === booth.id
                          ? 'bg-purple-600 text-white'
                          : 'bg-[#0f3460] text-gray-400 hover:bg-[#0f3460]/80'
                      }`}
                    >
                      <p className="font-bold">Booth {booth.booth_number}</p>
                      <p className="truncate opacity-70">{booth.designer_name}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Item Count + Print Button */}
              {selectedBooth && (
                <div className="bg-[#16213e] rounded-2xl p-4 mb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white font-semibold">Booth {selectedBooth.booth_number}</p>
                      <p className="text-gray-400 text-xs">{boothItems.length} item{boothItems.length !== 1 ? 's' : ''} — {tagSize} tags</p>
                    </div>
                    <button
                      onClick={handlePrint}
                      disabled={boothItems.length === 0 || printing}
                      className="bg-purple-600 hover:bg-purple-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors disabled:opacity-50"
                    >
                      {printing ? 'Preparing...' : '🖨️ Print Tags'}
                    </button>
                  </div>
                  {boothItems.length === 0 && (
                    <p className="text-yellow-400 text-xs mt-2">No items found for this booth.</p>
                  )}
                </div>
              )}

              {!selectedBooth && (
                <p className="text-center text-gray-500 text-sm mt-6">Select a booth above to preview and print its tags.</p>
              )}
            </>
          )}
        </main>

        {/* PRINT AREA — hidden on screen, visible when printing */}
        <div id="print-area" ref={printRef} style={{ display: 'none' }}>
          {selectedBooth && boothItems.length > 0 && (
            tagSize === 'large'
              ? <LargeTags items={boothItems} booth={selectedBooth} />
              : <SmallTags items={boothItems} booth={selectedBooth} />
          )}
        </div>
      </div>
    </>
  )
}

function LargeTags({ items, booth }) {
  return (
    <div style={{
      fontFamily: 'Georgia, serif',
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '0.25in',
      padding: '0',
    }}>
      {items.map(item => (
        <div key={item.id} style={{
          width: '3in',
          minHeight: '6in',
          border: '1px solid #ccc',
          borderRadius: '8px',
          padding: '0.2in',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '10px',
          pageBreakInside: 'avoid',
          backgroundColor: '#fff',
          color: '#000',
          position: 'relative',
        }}>
          {/* Hole punch */}
          <div style={{
            width: '14px',
            height: '14px',
            borderRadius: '50%',
            border: '2px solid #999',
            backgroundColor: '#f0f0f0',
            position: 'absolute',
            top: '10px',
            left: '50%',
            transform: 'translateX(-50%)',
          }} />

          {/* Header */}
          <div style={{ marginTop: '24px', textAlign: 'center' }}>
            <p style={{ fontSize: '9px', color: '#888', margin: '0', letterSpacing: '1px', textTransform: 'uppercase', fontFamily: 'Arial, sans-serif' }}>
              Cape Fear Habitat for Humanity
            </p>
            <p style={{ fontSize: '28px', fontWeight: 'bold', color: '#1a3a6b', margin: '2px 0 0', fontStyle: 'italic' }}>
              UpScale
            </p>
            <p style={{ fontSize: '18px', fontWeight: 'bold', color: '#4a7c2f', margin: '0', letterSpacing: '3px', textTransform: 'uppercase', fontFamily: 'Arial, sans-serif' }}>
              ReSale
            </p>
          </div>

          <div style={{ width: '100%', height: '1px', backgroundColor: '#ddd' }} />

          {/* Item Info */}
          <div style={{ width: '100%', textAlign: 'center' }}>
            <p style={{ fontSize: '11px', color: '#888', margin: '0 0 6px', fontFamily: 'Arial, sans-serif' }}>
              Booth {booth.booth_number} — {item.item_code}
            </p>
            <p style={{ fontSize: '16px', fontWeight: 'bold', color: '#222', margin: '0 0 12px', fontFamily: 'Arial, sans-serif' }}>
              {item.description}
            </p>
            <p style={{ fontSize: '48px', fontWeight: 'bold', color: '#1a3a6b', margin: '0', fontFamily: 'Arial, sans-serif' }}>
              ${parseFloat(item.price).toFixed(2)}
            </p>
          </div>

          <div style={{ width: '100%', height: '1px', backgroundColor: '#ddd' }} />

          {/* QR Code */}
          <QRCode value={item.item_code} size={120} level="M" />
          <p style={{ fontSize: '10px', color: '#aaa', margin: '0', fontFamily: 'Arial, sans-serif' }}>
            Scan to purchase
          </p>
        </div>
      ))}
    </div>
  )
}

function SmallTags({ items, booth }) {
  return (
    <div style={{
      fontFamily: 'Arial, sans-serif',
      display: 'grid',
      gridTemplateColumns: 'repeat(5, 1in)',
      gridTemplateRows: 'repeat(2, 2in)',
      gap: '0.15in',
      padding: '0',
    }}>
      {items.map(item => (
        <div key={item.id} style={{
          width: '1in',
          height: '2in',
          border: '1px solid #ccc',
          borderRadius: '4px',
          padding: '6px 4px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '4px',
          pageBreakInside: 'avoid',
          backgroundColor: '#fff',
          color: '#000',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Hole punch */}
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            border: '1.5px solid #999',
            backgroundColor: '#f0f0f0',
            position: 'absolute',
            top: '5px',
            left: '50%',
            transform: 'translateX(-50%)',
          }} />

          {/* Header */}
          <div style={{ marginTop: '14px', textAlign: 'center' }}>
            <p style={{ fontSize: '7px', fontStyle: 'italic', fontWeight: 'bold', color: '#1a3a6b', margin: '0' }}>
              UpScale ReSale
            </p>
          </div>

          <div style={{ width: '100%', height: '0.5px', backgroundColor: '#ddd' }} />

          {/* Item code */}
          <p style={{ fontSize: '8px', color: '#888', margin: '0' }}>{item.item_code}</p>

          {/* Price */}
          <p style={{ fontSize: '20px', fontWeight: 'bold', color: '#1a3a6b', margin: '0' }}>
            ${parseFloat(item.price).toFixed(2)}
          </p>

          {/* QR Code */}
          <QRCode value={item.item_code} size={62} level="M" />
        </div>
      ))}
    </div>
  )
}