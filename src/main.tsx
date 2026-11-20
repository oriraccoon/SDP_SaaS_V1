// 경로 기준 분기: "/" 랜딩, "/app" 로그인 후 앱(회원 확인 포함), "/admin" 관리자 화면
const path = window.location.pathname.replace(/\/(index\.html)?$/, '').replace(/\/+$/, '');
const isLanding = path === '';
const isAdmin = path === '/admin';

if (isLanding) {
  // 랜딩은 taste 디자인 시스템(public/assets)으로 그리고, React와 앱 스타일은 불러오지 않습니다
  import('./landing/mount').then((m) => m.mountLanding());
} else {
  Promise.all([
    import('react'),
    import('react-dom/client'),
    import('./App.tsx'),
    import('./AuthGate.tsx'),
    import('./AccountGate.tsx'),
    import('./AdminPage.tsx'),
    import('./index.css'),
  ]).then(([React, { createRoot }, { default: App }, { default: AuthGate }, { default: AccountGate }, { default: AdminPage }]) => {
    const h = React.createElement;
    createRoot(document.getElementById('root')!).render(
      h(
        React.StrictMode,
        null,
        isAdmin
          ? h(AuthGate, null, h(AdminPage))
          : h(AuthGate, null, h(AccountGate, null, h(App))),
      ),
    );
  });
}
