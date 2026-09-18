import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom'
import SearchPage from './pages/SearchPage'
import HistoryPage from './pages/HistoryPage'
import { Layers } from 'lucide-react'
import './App.css'

function Layout() {
  const location = useLocation()
  const isSearch = location.pathname === '/'
  const isHistory = location.pathname.startsWith('/history')

  return (
    <div className="app-wrapper">
      {/* Aurora blob 2 — handled by ::after for blob 1 in CSS */}
      <div className="aurora-2" aria-hidden="true" />

      {/* ── Navbar ── */}
      <header className="fixed inset-x-0 top-0 z-50 h-16 border-b border-violet-500/10 bg-[#0b0f1a]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-6">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600/20 border border-violet-500/30 group-hover:bg-violet-600/30 transition-colors">
              <Layers className="h-4 w-4 text-violet-400" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-sm font-bold tracking-tight text-white">Job Pipeline</span>
              <span className="text-[10px] text-slate-500 font-medium">by Hevendev</span>
            </div>
          </Link>

          {/* Nav Links */}
          <nav className="flex items-center gap-1">
            <Link
              to="/"
              className={`relative px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                isSearch
                  ? 'text-violet-300 bg-violet-500/10'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              Search
              {isSearch && (
                <span className="absolute bottom-0 left-4 right-4 h-[2px] rounded-full bg-gradient-to-r from-violet-500 to-violet-300" />
              )}
            </Link>
            <Link
              to="/history"
              className={`relative px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                isHistory
                  ? 'text-violet-300 bg-violet-500/10'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              Previous Search
              {isHistory && (
                <span className="absolute bottom-0 left-4 right-4 h-[2px] rounded-full bg-gradient-to-r from-violet-500 to-violet-300" />
              )}
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Page Content ── */}
      <div className="relative z-10 mx-auto max-w-7xl px-6 pt-24 pb-16">
        <Routes>
          <Route path="/" element={<SearchPage />} />
          <Route path="/history" element={<HistoryPage />} />
        </Routes>
        <footer className="mt-16 border-t border-violet-500/10 pt-8 text-center text-xs text-slate-600">
          Job Pipeline · Phase 2 · Built by Hevendev
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
