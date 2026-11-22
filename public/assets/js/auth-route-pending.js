// Runs before first paint: hide the homepage while an auth route decides where to go.
if (['/club-login', '/club-dashboard'].includes(location.pathname) || location.pathname === '/' && new URLSearchParams(location.search).get('myForms') === '1') document.documentElement.classList.add('auth-route-pending');
