import { useState, useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { ToastProvider } from './components/ui/Toast'
import ErrorBoundary from './components/ErrorBoundary'
import Layout from './components/Layout'
import OnboardingModal from './components/OnboardingModal'
import Home from './pages/Home'
import DigestPage from './pages/DigestPage'
import useClient from './hooks/useClient'

export default function App() {
  const { clientId, profile, setProfile, isOnboarded } = useClient()
  const [score, setScore] = useState({ score: 0, total: 0, rating: 'needs_attention' })
  const [showOnboarding, setShowOnboarding] = useState(false)

  // Show onboarding after a brief delay for new users
  useEffect(() => {
    if (!isOnboarded) {
      const t = setTimeout(() => setShowOnboarding(true), 600)
      return () => clearTimeout(t)
    }
  }, [isOnboarded])

  const handleOnboardDone = (p) => {
    setProfile(p)
    setShowOnboarding(false)
  }

  return (
    <ErrorBoundary>
      <ToastProvider>
        <Layout clientId={clientId} profile={profile} score={score}>
          <Routes>
            <Route path="/"        element={<Home clientId={clientId} profile={profile} score={score} onScoreUpdate={setScore} />} />
            <Route path="/digest"  element={<DigestPage clientId={clientId} profile={profile} />} />
          </Routes>
        </Layout>

        {showOnboarding && (
          <OnboardingModal clientId={clientId} onDone={handleOnboardDone} />
        )}
      </ToastProvider>
    </ErrorBoundary>
  )
}
