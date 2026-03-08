import { getScoreRingColor, getScoreColor } from '../utils/helpers'

const SIZE = 140
const STROKE = 10
const R = (SIZE - STROKE) / 2
const CIRC = 2 * Math.PI * R

export default function ScoreRing({ score, label = 'Safety Score', size = 140 }) {
  const pct    = Math.min(100, Math.max(0, score ?? 0)) / 100
  const dash   = pct * CIRC
  const gap    = CIRC - dash
  const color  = getScoreRingColor(score)

  // Scale factor for different sizes
  const scale = size / SIZE

  return (
    <div className="flex flex-col items-center gap-2">
      <div style={{ width: size, height: size }} className="relative">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="-rotate-90"
        >
          {/* Track */}
          <circle
            cx={SIZE / 2} cy={SIZE / 2} r={R}
            fill="none"
            stroke="rgba(58,49,102,0.5)"
            strokeWidth={STROKE}
          />
          {/* Progress */}
          <circle
            cx={SIZE / 2} cy={SIZE / 2} r={R}
            fill="none"
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${gap}`}
            style={{ filter: `drop-shadow(0 0 6px ${color}80)`, transition: 'stroke-dasharray 0.8s ease' }}
          />
        </svg>

        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`font-bold leading-none ${getScoreColor(score)}`} style={{ fontSize: size * 0.23 }}>
            {score ?? '--'}
          </span>
          <span className="text-haven-dim" style={{ fontSize: size * 0.09 }}>/ 100</span>
        </div>
      </div>
      <span className="text-haven-sub text-xs font-medium">{label}</span>
    </div>
  )
}
