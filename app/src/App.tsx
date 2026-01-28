import { Routes, Route, Navigate } from 'react-router-dom'
import './App.css'
import { Layout } from './components/layout/Layout'
import { AdminLayout } from './components/layout/AdminLayout'
import { LandingPage } from './routes/LandingPage'
import { ServicesPage } from './routes/ServicesPage'
import { PortfolioPage } from './routes/PortfolioPage'
import { ProcessPage } from './routes/ProcessPage'
import { AboutPage } from './routes/AboutPage'
import { FaqPage } from './routes/FaqPage'
import { ContactPage } from './routes/ContactPage'
import { LoginPage } from './routes/LoginPage'
import { RegisterPage } from './routes/RegisterPage'
import { OnboardingPage } from './routes/OnboardingPage'
import { PortalPage } from './routes/PortalPage'
import { ProjectDetailPage } from './routes/ProjectDetailPage'
import { InvoicesPage } from './routes/InvoicesPage'
import { ProtectedRoute } from './components/auth/ProtectedRoute'
import { AdminRoute } from './components/auth/AdminRoute'
import { AdminDashboardPage } from './routes/admin/AdminDashboardPage'
import { AdminProjectPage } from './routes/admin/AdminProjectPage'
import { AdminCustomersPage } from './routes/admin/AdminCustomersPage'
import { AdminAIQueuePage } from './routes/admin/AdminAIQueuePage'
import { AdminPipelineMonitorPage } from './routes/admin/AdminPipelineMonitorPage'
import { AdminCostAnalyticsPage } from './routes/admin/AdminCostAnalyticsPage'

function App() {
  return (
    <Routes>
      {/* Admin Routes - Must be before Layout routes */}
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <AdminLayout>
              <AdminDashboardPage />
            </AdminLayout>
          </AdminRoute>
        }
      />
      <Route
        path="/admin/projekt/:id"
        element={
          <AdminRoute>
            <AdminLayout>
              <AdminProjectPage />
            </AdminLayout>
          </AdminRoute>
        }
      />
      <Route
        path="/admin/projects/:id"
        element={
          <AdminRoute>
            <AdminLayout>
              <AdminProjectPage />
            </AdminLayout>
          </AdminRoute>
        }
      />
      <Route
        path="/admin/kunden"
        element={
          <AdminRoute>
            <AdminLayout>
              <AdminCustomersPage />
            </AdminLayout>
          </AdminRoute>
        }
      />
      <Route
        path="/admin/ai-queue"
        element={
          <AdminRoute>
            <AdminLayout>
              <AdminAIQueuePage />
            </AdminLayout>
          </AdminRoute>
        }
      />
      <Route
        path="/admin/pipeline/:pipelineId"
        element={
          <AdminRoute>
            <AdminLayout>
              <AdminPipelineMonitorPage />
            </AdminLayout>
          </AdminRoute>
        }
      />
      <Route
        path="/admin/kosten"
        element={
          <AdminRoute>
            <AdminLayout>
              <AdminCostAnalyticsPage />
            </AdminLayout>
          </AdminRoute>
        }
      />

      {/* Public & Protected Routes with Layout */}
      <Route element={<Layout />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/leistungen" element={<ServicesPage />} />
        <Route path="/portfolio" element={<PortfolioPage />} />
        <Route path="/prozess" element={<ProcessPage />} />
        <Route path="/ueber-uns" element={<AboutPage />} />
        <Route path="/faq" element={<FaqPage />} />
        <Route path="/kontakt" element={<Navigate to="/register" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/onboarding"
          element={
            <ProtectedRoute>
              <OnboardingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal"
          element={
            <ProtectedRoute>
              <PortalPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/projekt/:id"
          element={
            <ProtectedRoute>
              <ProjectDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/rechnungen"
          element={
            <ProtectedRoute>
              <InvoicesPage />
            </ProtectedRoute>
          }
        />
        <Route path="/kontakt-alt" element={<ContactPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
