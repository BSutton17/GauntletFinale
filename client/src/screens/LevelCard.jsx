// "Level N", then after 2.5 seconds "Difficulty:" and 1-3 flames, appearing one after another.
import { GiFlame } from 'react-icons/gi'
import { LEVELS } from '@shared/levels.js'

export default function LevelCard({ level }) {
  const difficulty = LEVELS[level]?.difficulty
  return (
    <div className="center-screen">
      <div className="level-card-wrap">
        <h1 className="level-card">Level {level}</h1>
        {difficulty && (
          <div className="difficulty">
            <span className="difficulty-label">Difficulty:</span>
            {Array.from({ length: difficulty }, (_, i) => (
              <span key={i} className="flame-slot" style={{ animationDelay: `${2.9 + i * 0.5}s` }}>
                <GiFlame className="flame" style={{ animationDelay: `${3.6 + i * 0.5}s, ${2.9 + i * 0.5}s` }} />
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
