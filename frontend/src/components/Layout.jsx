import Navbar from './Navbar'

export default function Layout({ children, clientId, profile, score }) {
  return (
    <div className="min-h-screen bg-haven-bg relative overflow-x-hidden">
      {/* Ambient background glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-haven-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-haven-cyan/3 rounded-full blur-3xl" />
      </div>

      <Navbar clientId={clientId} profile={profile} score={score} />

      <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-24">
        {children}
      </main>
    </div>
  )
}
