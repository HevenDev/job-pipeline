import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom'
import SearchPage from './pages/SearchPage'
import HistoryPage from './pages/HistoryPage'
import './App.css'

function Layout() {
  const location = useLocation()
  
  return (
    <div className="app-wrapper">
      {/* Proper Modern Navbar */}
      <nav className="global-nav">
        <div className="nav-container">
          <Link to="/" className="nav-logo">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
            Job Pipeline <span className="brand-author">by Hevendev</span>
          </Link>
          
          <div className="nav-links">
            <Link to="/" className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}>Search</Link>
            <Link to="/history" className={`nav-link ${location.pathname.startsWith('/history') ? 'active' : ''}`}>Previous Search</Link>
          </div>
        </div>
      </nav>

      <div className="container mt-20">
        <Routes>
          <Route path="/" element={<SearchPage />} />
          <Route path="/history" element={<HistoryPage />} />
        </Routes>
        
        <footer className="app-footer">
          <p>Job Pipeline · Phase 2</p>
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
