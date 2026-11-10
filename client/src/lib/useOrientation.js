import { useEffect, useState } from 'react'

// True on a phone or tablet held upright. Desktops never count as "portrait" even in a narrow window.
export function usePortraitTouch() {
  const query = '(orientation: portrait) and (pointer: coarse)'
  const [match, setMatch] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatch(mq.matches)
    mq.addEventListener('change', on)
    window.addEventListener('resize', on)
    return () => { mq.removeEventListener('change', on); window.removeEventListener('resize', on) }
  }, [])
  return match
}
