      // Same wording as the header: "Sign In" the first time, "Login" once this browser has signed in before.
      try {
        if (localStorage.getItem('miu:signed-in-before') === '1') {
          document.getElementById('loginTitle').textContent = 'Login';
          document.getElementById('loginSubmitBtn').textContent = 'Login';
          document.title = 'Login · MIU Activities';
        }
      } catch (_) {}

      document.getElementById('studentLoginForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const feedback = document.getElementById('loginFeedback');
        feedback.textContent = '';
        try {
          const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: document.getElementById('uniId').value.trim(),
              password: document.getElementById('uniPassword').value,
            }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.message || 'Login failed.');
          window.location.replace(studentReturnTarget());
        } catch (error) {
          feedback.textContent = error.message;
          feedback.classList.add('is-error');
        }
      });
      const studentReturnTarget = () => {
        const target = new URLSearchParams(window.location.search).get('redirect') || '/';
        try {
          const parsed = new URL(target, window.location.origin);
          return target.startsWith('/') && parsed.origin === window.location.origin
            ? `${parsed.pathname}${parsed.search}${parsed.hash}`
            : '/';
        } catch { return '/'; }
      };
      async function configureGoogleSignIn() {
        const area = document.getElementById('googleLoginArea');
        const fallbackButton = document.getElementById('googleUnavailableButton');
        const hint = document.getElementById('googleLoginHint');
        // Start loading Google's script and both checks at the same time instead of one after another.
        const googleScript = new Promise((resolve, reject) => {
          if (window.google?.accounts?.id) { resolve(); return; }
          const script = document.createElement('script');
          script.src = 'https://accounts.google.com/gsi/client'; script.async = true;
          script.onload = resolve; script.onerror = reject;
          document.head.append(script);
        });
        googleScript.catch(() => {});
        try {
          const [configResponse, sessionResponse] = await Promise.all([
            fetch('/api/student-auth/google-config', { cache: 'no-store' }),
            fetch('/api/student-auth/session?optional=1', { cache: 'no-store' })
          ]);
          const config = await configResponse.json();
          if (!configResponse.ok || !config.enabled) {
            fallbackButton.hidden = false;
            return;
          }
          const linkExistingAccount = sessionResponse.status === 200;
          if (linkExistingAccount) hint.hidden = true;
          const studentSession = linkExistingAccount ? await sessionResponse.json() : null;
          const onGoogleReady = () => {
            if (!window.google?.accounts?.id) {
              fallbackButton.hidden = false;
              return;
            }
            const buttonHost = document.getElementById('googleLoginButton');
            let renderedWidth = 0;
            let resizeFrame = 0;
            const renderGoogleButton = () => {
              const availableWidth = buttonHost.getBoundingClientRect().width;
              if (availableWidth < 120) return;
              // A few px narrower than the box so Google's frame margin never gets clipped.
              const width = Math.min(400, Math.floor(availableWidth) - 4);
              // Redraw only for a real size change (small changes made the Google frame flicker and reload).
              if (renderedWidth && Math.abs(width - renderedWidth) < 12) return;
              renderedWidth = width;
              buttonHost.replaceChildren();
              // English text on every phone, the same width as the Sign In button above it.
              window.google.accounts.id.renderButton(buttonHost, { theme: 'outline', size: 'large', text: linkExistingAccount ? 'continue_with' : 'signin_with', shape: 'pill', logo_alignment: 'center', locale: 'en', width });
            };
            const scheduleRender = () => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(renderGoogleButton); };
            const initializeGoogle = (googleConfig) => {
              renderedWidth = 0;
              window.google.accounts.id.initialize({
                client_id: googleConfig.clientId,
                nonce: googleConfig.nonce,
                hd: 'miuegypt.edu.eg',
                ...(studentSession?.email ? { login_hint: studentSession.email } : {}),
                error_callback: () => {
                  const feedback = document.getElementById('googleLoginFeedback');
                  feedback.textContent = 'Google sign-in was closed or could not be opened. You can try again or use your email and password.';
                  feedback.classList.add('is-error');
                },
                callback: async (credentialResponse) => {
                  const feedback = document.getElementById('googleLoginFeedback');
                  feedback.classList.remove('is-error');
                  if (!credentialResponse?.credential) {
                    feedback.textContent = 'Google did not return a sign-in credential. Try again or use your email and password.';
                    feedback.classList.add('is-error');
                    return;
                  }
                  // Immediate feedback after choosing an account, and no double submit while the server checks it.
                  feedback.textContent = 'Signing you in…';
                  document.getElementById('googleLoginArea').classList.add('is-busy');
                  document.getElementById('googleLoginArea').setAttribute('aria-busy', 'true');
                  try {
                    const endpoint = linkExistingAccount ? '/api/student-auth/google/link' : '/api/student-auth/google';
                    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential: credentialResponse.credential }) });
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.message || 'Google sign-in failed.');
                    if (linkExistingAccount) {
                      window.location.replace(studentReturnTarget());
                      return;
                    }
                    window.location.replace(studentReturnTarget());
                  } catch (error) {
                    document.getElementById('googleLoginArea').classList.remove('is-busy');
                    document.getElementById('googleLoginArea').removeAttribute('aria-busy');
                    feedback.textContent = error.message;
                    feedback.classList.add('is-error');
                    try {
                      const refreshedResponse = await fetch('/api/student-auth/google-config', { cache: 'no-store' });
                      const refreshedConfig = await refreshedResponse.json();
                      if (!refreshedResponse.ok || !refreshedConfig.enabled) throw new Error('Google could not prepare another sign-in check. Reload this page to try again.');
                      initializeGoogle(refreshedConfig);
                    } catch (refreshError) {
                      feedback.textContent = `${error.message} ${refreshError.message}`;
                    }
                  }
                }
              });
              area.classList.remove('hidden');
              buttonHost.replaceChildren();
              renderGoogleButton();
            };
            initializeGoogle(config);
            if ('ResizeObserver' in window) new ResizeObserver(scheduleRender).observe(buttonHost);
          };
          googleScript.then(onGoogleReady, () => { fallbackButton.hidden = false; area.classList.remove('hidden'); });
        } catch {
          fallbackButton.hidden = false;
        }
      }
      configureGoogleSignIn();
      document.getElementById('googleUnavailableButton').addEventListener('click', () => {
        const feedback = document.getElementById('googleLoginFeedback');
        feedback.textContent = 'Google sign-in is not configured yet. Ask the site administrator to enable it.';
        feedback.classList.add('is-error');
      });
