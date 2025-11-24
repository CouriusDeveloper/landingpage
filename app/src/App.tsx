import { Routes, Route, Navigate } from 'react-router-dom'
import './App.css'
import { Layout } from './components/layout/Layout'
import { LandingPage } from './routes/LandingPage'
import { ServicesPage } from './routes/ServicesPage'
import { PortfolioPage } from './routes/PortfolioPage'
import { ProcessPage } from './routes/ProcessPage'
import { AboutPage } from './routes/AboutPage'
import { FaqPage } from './routes/FaqPage'
import { ContactPage } from './routes/ContactPage'

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/leistungen" element={<ServicesPage />} />
        <Route path="/portfolio" element={<PortfolioPage />} />
        <Route path="/prozess" element={<ProcessPage />} />
        <Route path="/ueber-uns" element={<AboutPage />} />
        <Route path="/faq" element={<FaqPage />} />
        <Route path="/kontakt" element={<ContactPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
