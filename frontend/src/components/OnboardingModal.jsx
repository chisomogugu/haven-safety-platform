import { useState } from 'react'
import { Hexagon, Shield, MapPin, User, ChevronRight, Loader2 } from 'lucide-react'
import { saveProfile } from '../api'

const INTERESTS = ['Scams', 'Phishing', 'Physical Safety', 'Cyber Threats', 'Fraud', 'Community Alerts']

export default function OnboardingModal({ clientId, onDone }) {
  const [step, setStep]     = useState(0)
  const [name, setName]     = useState('')
  const [location, setLoc]  = useState('')
  const [selected, setSel]  = useState([])
  const [loading, setLoading] = useState(false)

  const toggleInterest = (i) =>
    setSel(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])

  const finish = async () => {
    setLoading(true)
    try {
      const profile = { client_id: clientId, name: name.trim(), location: location.trim(), interests: selected }
      await saveProfile(profile)
      onDone(profile)
    } catch {
      onDone({ name: name.trim(), location: location.trim(), interests: selected })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-haven-card border border-haven-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-fade-in">

        {/* Header */}
        <div className="px-6 pt-8 pb-4 text-center border-b border-haven-border/50">
          <div className="flex justify-center mb-4">
            <div className="relative">
              <div className="w-14 h-14 rounded-2xl bg-haven-primary/15 border border-haven-primary/30 flex items-center justify-center">
                <Shield size={28} className="text-haven-primary" strokeWidth={1.5} />
              </div>
              <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-haven-primary flex items-center justify-center">
                <span className="text-white text-xs font-bold">{step + 1}</span>
              </div>
            </div>
          </div>
          <h2 className="text-xl font-bold text-haven-text mb-1">
            {step === 0 ? 'Welcome to Haven' : step === 1 ? 'Where are you?' : 'What matters to you?'}
          </h2>
          <p className="text-haven-sub text-sm">
            {step === 0 ? 'Your AI-powered community safety platform' :
             step === 1 ? 'We\'ll surface threats relevant to your area' :
             'Personalize your safety feed'}
          </p>
        </div>

        {/* Step content */}
        <div className="px-6 py-6">
          {step === 0 && (
            <div>
              <label className="block text-xs font-medium text-haven-dim uppercase tracking-wider mb-2">
                Your name (optional)
              </label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-haven-dim" />
                <input
                  autoFocus
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && setStep(1)}
                  placeholder="What should we call you?"
                  className="w-full pl-9 pr-4 py-2.5 bg-haven-surface border border-haven-border rounded-xl text-haven-text placeholder-haven-dim text-sm outline-none focus:border-haven-primary transition-colors"
                />
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <label className="block text-xs font-medium text-haven-dim uppercase tracking-wider mb-2">
                Your location
              </label>
              <div className="relative">
                <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-haven-dim" />
                <input
                  autoFocus
                  value={location}
                  onChange={e => setLoc(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && location.trim() && setStep(2)}
                  placeholder="City, neighborhood, or zip code"
                  className="w-full pl-9 pr-4 py-2.5 bg-haven-surface border border-haven-border rounded-xl text-haven-text placeholder-haven-dim text-sm outline-none focus:border-haven-primary transition-colors"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <div className="flex flex-wrap gap-2">
                {INTERESTS.map(i => (
                  <button
                    key={i}
                    onClick={() => toggleInterest(i)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
                      selected.includes(i)
                        ? 'bg-haven-primary border-haven-primary text-white'
                        : 'border-haven-border text-haven-sub hover:border-haven-muted hover:text-haven-text bg-haven-surface'
                    }`}
                  >
                    {i}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex items-center justify-between">
          {step > 0 ? (
            <button onClick={() => setStep(s => s - 1)} className="text-sm text-haven-dim hover:text-haven-sub transition-colors">
              Back
            </button>
          ) : (
            <span />
          )}

          <button
            onClick={step < 2 ? () => setStep(s => s + 1) : finish}
            disabled={loading || (step === 1 && !location.trim())}
            className="flex items-center gap-2 px-5 py-2.5 bg-haven-primary hover:bg-haven-glow disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-all"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : null}
            {step < 2 ? 'Continue' : 'Get started'}
            {!loading && <ChevronRight size={15} />}
          </button>
        </div>

        {/* Progress dots */}
        <div className="pb-5 flex justify-center gap-1.5">
          {[0, 1, 2].map(i => (
            <div key={i} className={`h-1 rounded-full transition-all ${i === step ? 'w-6 bg-haven-primary' : 'w-2 bg-haven-muted'}`} />
          ))}
        </div>
      </div>
    </div>
  )
}
