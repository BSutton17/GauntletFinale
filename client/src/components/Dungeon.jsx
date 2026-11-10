// The stone walls and two flickering torches every screen sits inside.
export default function Dungeon({ children }) {
  return (
    <div className="dungeon">
      <div className="torch torch-left" aria-hidden />
      <div className="torch torch-right" aria-hidden />
      <div className="dungeon-content">{children}</div>
    </div>
  )
}
