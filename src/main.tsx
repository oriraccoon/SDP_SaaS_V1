import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import Landing from './Landing.tsx';
import AuthGate from './AuthGate.tsx';
import './index.css';

// 경로 기준 분기: "/" 는 랜딩, "/app" 은 로그인 후 기존 앱 (앱 내부 코드는 변경 없음)
const isLanding = window.location.pathname === '/' || window.location.pathname === '';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isLanding ? <Landing /> : <AuthGate><App /></AuthGate>}
  </StrictMode>,
);
