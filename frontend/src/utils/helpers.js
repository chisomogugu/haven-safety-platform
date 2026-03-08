export const generateClientId = () => crypto.randomUUID()

export const formatDate = (iso) => {
  if (!iso) return ''
  const date = new Date(iso)
  const now = new Date()
  const diff = now - date
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 1)   return 'Just now'
  if (mins < 60)  return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7)   return `${days}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export const getSeverityColor = (s) => ({
  critical: 'text-red-400',
  high:     'text-orange-400',
  medium:   'text-yellow-400',
  low:      'text-green-400',
}[s] || 'text-haven-sub')

export const getSeverityBg = (s) => ({
  critical: 'bg-red-500/15 text-red-400 border border-red-500/30',
  high:     'bg-orange-500/15 text-orange-400 border border-orange-500/30',
  medium:   'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
  low:      'bg-green-500/15 text-green-400 border border-green-500/30',
}[s] || 'bg-haven-muted/30 text-haven-sub')

export const getStatusStyle = (s) => ({
  active:     'bg-haven-primary/20 text-haven-bright border border-haven-primary/30',
  resolved:   'bg-green-500/15 text-green-400 border border-green-500/30',
  monitoring: 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30',
}[s] || 'bg-haven-muted/30 text-haven-sub')

export const getCategoryLabel = (type) => ({
  physical_hazard: 'Physical Hazard',
  digital_scam:    'Digital Scam',
  cyber_threat:    'Cyber Threat',
  weather:         'Weather',
  crime_alert:     'Crime Alert',
}[type] || type)

export const getCategoryIcon = (type) => ({
  physical_hazard: '⚠️',
  digital_scam:    '🎣',
  cyber_threat:    '🛡️',
  weather:         '🌧️',
  crime_alert:     '🔒',
}[type] || '📋')

export const getVerdictStyle = (verdict) => ({
  scam:       { bg: 'bg-red-500/15 border-red-500/40',       text: 'text-red-400',   label: 'SCAM DETECTED' },
  legitimate: { bg: 'bg-green-500/15 border-green-500/40',   text: 'text-green-400', label: 'LOOKS LEGITIMATE' },
  unclear:    { bg: 'bg-orange-500/15 border-orange-500/40', text: 'text-orange-400',label: 'UNCLEAR — USE CAUTION' },
}[verdict] || { bg: 'bg-haven-muted/20 border-haven-border', text: 'text-haven-sub', label: 'UNKNOWN' })

export const getScoreColor = (score) =>
  score >= 80 ? 'text-green-400' : score >= 50 ? 'text-yellow-400' : 'text-red-400'

export const getScoreRingColor = (score) =>
  score >= 80 ? '#22c55e' : score >= 50 ? '#eab308' : '#ef4444'

export const truncate = (str, n = 120) =>
  str && str.length > n ? str.slice(0, n).trimEnd() + '…' : str

export const readFileAsBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
