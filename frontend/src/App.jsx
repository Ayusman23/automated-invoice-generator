import { Routes, Route, Navigate } from 'react-router-dom';
import AdminPage from './pages/AdminPage';
import PayPage   from './pages/PayPage';

export default function App() {
  return (
    <Routes>
      {/* Root redirects to admin */}
      <Route path="/"           element={<Navigate to="/admin" replace />} />
      {/* Admin portal */}
      <Route path="/admin"      element={<AdminPage />} />
      {/* Client-facing payment portal */}
      <Route path="/pay/:invoiceId" element={<PayPage />} />
    </Routes>
  );
}