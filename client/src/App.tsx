import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom'
import SearchPage from './pages/SearchPage'
import HistoryPage from './pages/HistoryPage'
import HistoryDetailPage from './pages/HistoryDetailPage'
import './App.css'

function Layout() {
  const location = useLocation()
  
  return (
    <div className="app-wrapper">
      <div className="container">
        <header className="app-header" style={{ position: 'relative' }}>
          <div className="badge">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
              <circle cx="5" cy="5" r="5" />
            </svg>
            Live · Phase 2
          </div>
          
          <nav className="app-nav" style={{ position: 'absolute', right: 0, top: 0, display: 'flex', gap: '1rem' }}>
            <Link to="/" className={`nav-link ${location.pathname === '/' ? 'active' : ''}`} style={{ fontWeight: location.pathname === '/' ? 'bold' : 'normal', textDecoration: 'none', color: 'inherit' }}>Search</Link>
            <Link to="/history" className={`nav-link ${location.pathname.startsWith('/history') ? 'active' : ''}`} style={{ fontWeight: location.pathname.startsWith('/history') ? 'bold' : 'normal', textDecoration: 'none', color: 'inherit' }}>Previous Search</Link>
          </nav>
          
          <h1>Pipeline</h1>
          <p>Search real-time job postings from LinkedIn, Indeed, Naukri &amp; Glassdoor</p>
        </header>
        
        <Routes>
          <Route path="/" element={<SearchPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/history/:id" element={<HistoryDetailPage />} />
        </Routes>
        
        <footer className="app-footer">
          <p>Pipeline · Phase 2 · Powered by python-jobspy</p>
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
