import { MdScreenRotation } from 'react-icons/md'

export default function RotateOverlay() {
  return (
    <div className="rotate-overlay">
      <MdScreenRotation className="rotate-icon" />
      <p>Please rotate your phone</p>
      <p className="faint small">This part of the escape needs your phone sideways.</p>
    </div>
  )
}
