import AspiceApp from './pages/AspiceApp.jsx';
import AdminApp from './pages/Admin.jsx';

export default function App() {
  const isAdmin = window.location.pathname.startsWith('/admin');
  return isAdmin ? <AdminApp /> : <AspiceApp />;
}
