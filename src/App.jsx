import AspiceAppV2 from './pages/AspiceAppV2.jsx';
import AspiceApp from './pages/AspiceApp.jsx';
import AdminApp from './pages/Admin.jsx';

export default function App() {
  const path = window.location.pathname;
  if (path.startsWith('/admin')) return <AdminApp />;
  if (path.startsWith('/legacy')) return <AspiceApp />;
  // 기본: 새 v2 화면
  return <AspiceAppV2 />;
}
