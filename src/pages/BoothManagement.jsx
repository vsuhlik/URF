import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function BoothManagement() {
  const [event, setEvent] = useState(null)
  const [booths, setBooths] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [boothNumber, setBoothNumber] = useState('')
  const [designerName, setDesignerName] = useState('')
  const [designerEmail, setDesignerEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [copiedId, setCopiedId] = useState(null)
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
    }
    setLoading(false)
  }

  const handleAddBooth = async (e) => {
    e.preventDefault()
    setSaving(true)

    const { error } = await supabase
      .from('booths')
      .insert({
        event_id: event.id,
        booth_number: parseInt(boothNumber),
        designer_name: designerName,
        designer_email: designerEmail || null
      })

    if (!error) {
      setBoothNumber('')
      setDesignerName('')
      setDesignerEmail('')
      setAdding(false)
      fetchData()
    }
    setSaving(false)
  }

  const handleDeleteBooth = async (boothId) => {
    if (!confirm('Delete this booth and all its items?')) return
    await supabase.from('booths').delete().eq('id', boothId)
    fetchData()
  }

  const copySubmissionLink = (token, boothId) => {
    const link = `${window.location.origin}/submit/${token}`
    const doCopy = () => {
      // Try the modern clipboard API first
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(link).then(() => {
          setCopiedId(boothId)
          setTimeout(() => setCopiedId(null), 2000)
        }).catch(() => {
          // Fallback silently
        })
      } else {
        // Fallback for older browsers / non-HTTPS
        const textarea = document.createElement('textarea')
        textarea.value = link
        textarea.style.position = 'fixed'
        textarea.style.left = '-9999px'
        document.body.appendChild(textarea)
        textarea.focus()
        textarea.select()
        try {
          document.execCommand('copy')
          setCopiedId(boothId)
          setTimeout(() => setCopiedId(null), 2000)
        } catch (err) {
          // Copy failed
        }
        document.body.removeChild(textarea)
      }
    }
    doCopy()
  }

  const getStatusColor = (status) => {
    if (status === 'approved') return 'text-green-400 bg-green-500/20'
    if (status === 'submitted') return 'text-green-400 bg-green-500/20'
    if (status === 'in_progress') return 'text-blue-400 bg-blue-500/20'
    return 'text-red-400 bg-red-500/20'
  }

  const getStatusLabel = (status) => {
    if (status === 'approved') return 'Approved'
    if (status === 'submitted') return 'Submitted'
    if (status === 'in_progress') return 'In Progress'
    return 'Pending'
  }

  return (
    <div className="min-h-screen bg-[#1a1a2e] text-white">
      <header className="bg-[#16213e] px-6 py-4 flex items-center gap-4 shadow-md">
        <button onClick={() => navigate('/dashboard')} className="text-gray-400 hover:text-white transition-colors">
          ← Back
        </button>
        <h1 className="text-xl font-bold">Booth Management</h1>
      </header>

      <main className="p-6 max-w-lg mx-auto">

        {loading ? (
          <p className="text-gray-400 text-center mt-8">Loading...</p>
        ) : !event ? (
          <div className="text-center mt-8">
            <p className="text-gray-400 mb-3">No active event. Create one first.</p>
            <button onClick={() => navigate('/event-setup')} className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold px-6 py-2 rounded-lg">
              Create Event
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <p className="text-gray-400 text-sm">{booths.length} booth{booths.length !== 1 ? 's' : ''} added</p>
              <button
                onClick={() => setAdding(!adding)}
                className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                {adding ? 'Cancel' : '+ Add Booth'}
              </button>
            </div>

            {/* Add Booth Form */}
            {adding && (
              <div className="bg-[#16213e] rounded-2xl p-4 mb-4">
                <form onSubmit={handleAddBooth} className="space-y-3">
                  <div>
                    <label className="text-gray-400 text-xs mb-1 block">Booth Number</label>
                    <input
                      type="number"
                      value={boothNumber}
                      onChange={(e) => setBoothNumber(e.target.value)}
                      required
                      placeholder="e.g. 6"
                      className="w-full bg-[#0f3460] text-white rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-gray-400 text-xs mb-1 block">Designer Name</label>
                    <input
                      type="text"
                      value={designerName}
                      onChange={(e) => setDesignerName(e.target.value)}
                      required
                      placeholder="e.g. Jane Smith"
                      className="w-full bg-[#0f3460] text-white rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-gray-400 text-xs mb-1 block">Designer Email (optional)</label>
                    <input
                      type="email"
                      value={designerEmail}
                      onChange={(e) => setDesignerEmail(e.target.value)}
                      placeholder="e.g. jane@email.com"
                      className="w-full bg-[#0f3460] text-white rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 rounded-lg transition-colors disabled:opacity-50 text-sm"
                  >
                    {saving ? 'Saving...' : 'Save Booth'}
                  </button>
                </form>
              </div>
            )}

            {/* Booth List */}
            <div className="space-y-3">
              {booths.map(booth => (
                <div key={booth.id} className="bg-[#16213e] rounded-2xl p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-bold text-white">Booth {booth.booth_number}</p>
                      <p className="text-gray-300 text-sm">{booth.designer_name}</p>
                      {booth.designer_email && (
                        <p className="text-gray-500 text-xs">{booth.designer_email}</p>
                      )}
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(booth.submission_status)}`}>
                      {getStatusLabel(booth.submission_status)}
                    </span>
                  </div>

                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => copySubmissionLink(booth.submission_token, booth.id)}
                      className="flex-1 bg-[#0f3460] hover:bg-purple-600/30 text-xs text-gray-300 py-2 rounded-lg transition-colors"
                    >
                      {copiedId === booth.id ? '✓ Copied!' : '🔗 Copy Submit Link'}
                    </button>
                    <button
                      onClick={() => handleDeleteBooth(booth.id)}
                      className="bg-red-500/20 hover:bg-red-500/40 text-red-400 text-xs px-3 py-2 rounded-lg transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}

              {booths.length === 0 && !adding && (
                <p className="text-center text-gray-500 mt-8">No booths yet. Add your first one.</p>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}