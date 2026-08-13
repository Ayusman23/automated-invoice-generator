import { Routes, Route, Navigate } from 'react-router-dom';
import AdminPage from './pages/AdminPage';
import PayPage   from './pages/PayPage';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Settings from './pages/Settings';
import OAuthCallback from './pages/OAuthCallback';
import LandingPage from './pages/LandingPage';
import PrivateRoute from './components/PrivateRoute';

export default function App() {
  return (
    <Routes>
      {/* Landing page */}
      <Route path="/" element={<LandingPage />} />

      {/* Public Routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/oauth-callback" element={<OAuthCallback />} />
      <Route path="/pay/:invoiceId" element={<PayPage />} />

      {/* Protected Routes */}
      <Route element={<PrivateRoute />}>
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}