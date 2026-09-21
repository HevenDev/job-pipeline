import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom'
import SearchPage from './pages/SearchPage'
import HistoryPage from './pages/HistoryPage'
import { Layers, Home, Database } from 'lucide-react'
import './App.css'

function Layout() {
  const location = useLocation()
  const isHome = location.pathname === '/'
  const isAllJobs = location.pathname.startsWith('/history')

  return (
    <div className="app-wrapper">
      <div className="aurora-2" aria-hidden="true" />

      {/* Navbar */}
      <header className="fixed inset-x-0 top-0 z-50 h-16 border-b border-white/10 bg-[#0e1424]/85 backdrop-blur-xl shadow-lg shadow-black/20">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-6">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600/25 border border-violet-500/35 group-hover:bg-violet-600/40 group-hover:border-violet-400/50 shadow-[0_0_16px_rgba(139,92,246,0.25)] transition-all">
              <Layers className="h-4 w-4 text-violet-300" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-bold tracking-tight text-white group-hover:text-violet-200 transition-colors">Job Pipeline</span>
              <span className="text-[10px] text-slate-400 font-medium">by Hevendev</span>
            </div>
          </Link>

          {/* Nav Links */}
          <nav className="flex items-center gap-1.5" aria-label="Main Navigation">
            <Link
              to="/"
              className={`relative flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl transition-all ${
                isHome
                  ? 'text-violet-200 bg-violet-500/20 border border-violet-500/30 shadow-[0_0_12px_rgba(139,92,246,0.2)]'
                  : 'text-slate-300 hover:text-white hover:bg-white/[0.08] border border-transparent'
              }`}
            >
              <Home className="h-3.5 w-3.5" />
              <span>Home</span>
              {isHome && (
                <span className="absolute bottom-0 left-4 right-4 h-[2px] rounded-full bg-gradient-to-r from-violet-500 to-violet-300" />
              )}
            </Link>
            <Link
              to="/history"
              className={`relative flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl transition-all ${
                isAllJobs
                  ? 'text-violet-200 bg-violet-500/20 border border-violet-500/30 shadow-[0_0_12px_rgba(139,92,246,0.2)]'
                  : 'text-slate-300 hover:text-white hover:bg-white/[0.08] border border-transparent'
              }`}
            >
              <Database className="h-3.5 w-3.5" />
              <span>All Jobs</span>
              {isAllJobs && (
                <span className="absolute bottom-0 left-4 right-4 h-[2px] rounded-full bg-gradient-to-r from-violet-500 to-violet-300" />
              )}
            </Link>
          </nav>
        </div>
      </header>

      {/* Page Content */}
      <div className="relative z-10 mx-auto max-w-7xl px-6 pt-24 pb-16">
        <Routes>
          <Route path="/" element={<SearchPage />} />
          <Route path="/history" element={<HistoryPage />} />
        </Routes>
        <footer className="mt-16 border-t border-white/10 pt-8 text-center text-xs text-slate-400">
          Job Pipeline • Built by Hevendev
        </footer>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Router>
      <Layout />
    </Router>
  )
}