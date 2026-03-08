import { useState, useEffect } from 'react'
import { BookOpen, RefreshCw, MapPin, Calendar, Loader2, Sparkles } from 'lucide-react'
import { getDigest } from '../api'
import Spinner from '../components/ui/Spinner'
import EmptyState from '../components/ui/EmptyState'
import { useToast } from '../components/ui/Toast'
import { formatDate } from '../utils/helpers'

export default function DigestPage({ clientId, profile }) {
  const toast = useToast()

  const [digest, setDigest] = useState(null)
  const [loading, setLoading] = useState(false)
  const [generated, setGenerated] = useState(null)  // timestamp

  const load = async () => {
    setLoading(true)
    try {
      const interestsParam =
        profile?.digest_interests ||
        (typeof profile?.interests === 'string' ? profile.interests : 'both')
      const res = await getDigest(clientId, profile?.location, interestsParam)
      setDigest(res)
      setGenerated(res?.generated_at ? new Date(res.generated_at) : new Date())
    } catch (err) {
      toast(err.message || 'Failed to generate digest', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])
  const interests = Array.isArray(profile?.interests)
    ? profile.interests
    : (typeof profile?.interests === 'string' ? [profile.interests] : [])

  return (
    <div className="max-w-2xl mx-auto space-y-6 pt-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-haven-cyan/10 border border-haven-cyan/20 flex items-center justify-center">
            <BookOpen size={18} className="text-haven-cyan" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-haven-text">Safety Digest</h1>
            <p className="text-haven-sub text-sm">AI-curated weekly brief, personalized for you</p>
          </div>
        </div>

        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 bg-haven-surface border border-haven-border hover:border-haven-muted text-haven-sub hover:text-haven-text text-sm rounded-xl transition-all disabled:opacity-50 flex-shrink-0"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          Refresh
        </button>
      </div>

      {/* Context pills */}
      <div className="flex flex-wrap gap-2">
        {profile?.location && (
          <div className="flex items-center gap-1.5 text-xs text-haven-sub bg-haven-surface border border-haven-border px-3 py-1 rounded-full">
            <MapPin size={11} />
            {profile.location}
          </div>
        )}
        {interests.map(i => (
          <div key={i} className="flex items-center gap-1.5 text-xs text-haven-sub bg-haven-surface border border-haven-border px-3 py-1 rounded-full">
            {i}
          </div>
        ))}
        {generated && (
          <div className="flex items-center gap-1.5 text-xs text-haven-dim ml-auto">
            <Calendar size={11} />
            {formatDate(generated)}
          </div>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex flex-col items-center gap-4 py-16">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-haven-cyan/10 border border-haven-cyan/20 flex items-center justify-center">
              <Sparkles size={28} className="text-haven-cyan animate-pulse" />
            </div>
            <div className="absolute -bottom-1 -right-1">
              <Spinner size="sm" className="text-haven-cyan" />
            </div>
          </div>
          <div className="text-center">
            <p className="text-haven-text font-medium">Generating your digest</p>
            <p className="text-haven-dim text-sm mt-1">AI is scanning local threats and recent reports...</p>
          </div>
        </div>
      )}

      {/* Digest content */}
      {!loading && digest && (
        <div className="animate-fade-in space-y-4">
          <div className="bg-haven-card border border-haven-border rounded-2xl overflow-hidden">
            {/* Decorative header bar */}
            <div className="h-1 bg-gradient-to-r from-haven-primary via-haven-cyan to-haven-bright" />

            <div className="px-6 py-5">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles size={15} className="text-haven-primary" />
                <span className="text-xs font-semibold text-haven-dim uppercase tracking-wider">
                  Weekly Safety Brief · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </span>
              </div>

              {digest.source_note && (
                <p className="text-xs text-haven-dim bg-haven-surface border border-haven-border rounded-lg px-3 py-2 mb-4">
                  {digest.source_note}
                </p>
              )}

              {digest.headline && <h2 className="text-lg font-semibold text-haven-text mb-2">{digest.headline}</h2>}
              {digest.summary && <p className="text-sm text-haven-sub leading-relaxed mb-4">{digest.summary}</p>}

              {digest.top_priority && (
                <div className="bg-haven-surface border border-haven-border rounded-xl p-3 mb-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-haven-dim mb-1">Top Priority</p>
                  <p className="text-sm text-haven-text font-medium">{digest.top_priority.title}</p>
                  <p className="text-sm text-haven-sub mt-1">{digest.top_priority.action}</p>
                </div>
              )}

              {digest.categories && (
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs text-haven-sub bg-haven-surface border border-haven-border px-2.5 py-1 rounded-full">
                    Digital: {digest.categories.digital ?? 0}
                  </span>
                  <span className="text-xs text-haven-sub bg-haven-surface border border-haven-border px-2.5 py-1 rounded-full">
                    Physical: {digest.categories.physical ?? 0}
                  </span>
                  <span className="text-xs text-haven-sub bg-haven-surface border border-haven-border px-2.5 py-1 rounded-full">
                    Resolved: {digest.categories.resolved ?? 0}
                  </span>
                </div>
              )}

              {digest.positive_note && (
                <p className="text-sm text-haven-sub mt-4">{digest.positive_note}</p>
              )}

              {/* Backward compatibility for any string-style digest field */}
              {!digest.summary && digest.digest && (
                <div className="prose-sm text-haven-sub leading-relaxed whitespace-pre-wrap text-sm space-y-3 mt-3">
                  {digest.digest}
                </div>
              )}
            </div>
          </div>

          {/* Disclaimer */}
          <p className="text-xs text-haven-dim text-center">
            This digest is AI-generated from community reports. Always verify critical information from official sources.
          </p>
        </div>
      )}

      {/* Empty */}
      {!loading && !digest && (
        <EmptyState
          icon={BookOpen}
          title="No digest yet"
          description="Click refresh to generate your personalized safety brief."
          action={
            <button
              onClick={load}
              className="flex items-center gap-2 px-4 py-2 bg-haven-primary hover:bg-haven-glow text-white text-sm font-semibold rounded-xl transition-all"
            >
              <Sparkles size={14} /> Generate Digest
            </button>
          }
        />
      )}
    </div>
  )
}
