import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import RequireAdmin from './components/RequireAdmin';
import Dashboard from './pages/Dashboard';
import Destinations from './pages/Destinations';
import Reports from './pages/Reports';
import Changes from './pages/Changes';
import DestinationDetail from './pages/DestinationDetail';
import Login from './pages/Login';
import Settings from './pages/Settings';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="/destinations" element={<RequireAdmin><Destinations /></RequireAdmin>} />
          <Route path="/destination/:id" element={<DestinationDetail />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/changes" element={<Changes />} />
          <Route path="/settings" element={<RequireAdmin><Settings /></RequireAdmin>} />
          <Route path="/login" element={<Login />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
