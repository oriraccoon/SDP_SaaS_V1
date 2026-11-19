import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import Landing from './Landing.tsx';
import AuthGate from './AuthGate.tsx';
import AccountGate from './AccountGate.tsx';
import AdminPage from './AdminPage.tsx';
import './index.css';

// 경로 기준 분기: "/" 랜딩, "/app" 로그인 후 앱(회원 확인 포함), "/admin" 관리자 화면
const path = window.location.pathname.replace(/\/+$/, '');
const isLanding = path === '';
const isAdmin = path === '/admin';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isLanding ? (
      <Landing />
    ) : isAdmin ? (
      <AuthGate><AdminPage /></AuthGate>
    ) : (
      <AuthGate><AccountGate><App /></AccountGate></AuthGate>
    )}
  </StrictMode>,
);
