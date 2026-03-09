import { NavLink } from 'react-router-dom'
import { Shield, BookOpen, Hexagon } from 'lucide-react'
import { getScoreColor } from '../utils/helpers'

const links = [
  { to: '/',        label: 'Feed',    icon: Shield },
  { to: '/digest',  label: 'Digest',  icon: BookOpen },
]

export default function Navbar({ profile, score }) {
  const scoreVal = score?.score ?? null

  return (
    <header className="sticky top-0 z-40 border-b border-haven-border/50 backdrop-blur-xl bg-haven-bg/80">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">

        {/* Logo */}
        <NavLink to="/" className="flex items-center gap-2 group">
          <div className="relative">
            <Hexagon size={28} className="text-haven-primary fill-haven-primary/20 group-hover:fill-haven-primary/30 transition-colors" strokeWidth={1.5} />
            <Shield size={12} className="text-haven-bright absolute inset-0 m-auto" />
          </div>
          <span className="font-bold text-haven-text tracking-tight text-lg">Haven</span>
        </NavLink>

        {/* Nav links */}
        <nav className="hidden sm:flex items-center gap-1">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-haven-primary/15 text-haven-bright'
                    : 'text-haven-sub hover:text-haven-text hover:bg-haven-surface'
                }`
              }
            >
              <Icon size={15} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Right: score badge + user */}
        <div className="flex items-center gap-3">
          {scoreVal !== null && (
            <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${getScoreColor(scoreVal)}`}
              style={{ borderColor: 'currentColor', opacity: 0.9 }}
            >
              <span className="text-xs opacity-70">Score</span>
              <span>{scoreVal}</span>
            </div>
          )}
          {profile?.name && (
            <div className="w-7 h-7 rounded-full bg-haven-primary/20 border border-haven-primary/40 flex items-center justify-center text-haven-bright text-xs font-semibold">
              {profile.name[0].toUpperCase()}
            </div>
          )}
        </div>

      </div>

      {/* Mobile nav */}
      <nav className="sm:hidden flex border-t border-haven-border/30">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
                isActive ? 'text-haven-bright' : 'text-haven-dim'
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>
    </header>
  )
}
