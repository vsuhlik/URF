import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useActiveEvent() {
  const [event, setEvent] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('events')
        .select('*')
        .eq('status', 'active')
        .single()
      setEvent(data || null)
      setLoading(false)
    }
    fetch()
  }, [])

  return { event, loading }
}