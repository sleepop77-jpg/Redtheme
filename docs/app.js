// PyBridge Core Logic - Phase 1: Auth & Routing Skeleton
(function(){
  if(window.__pyBridge)return;
  window.__pyBridge=true;

  // --- STATE ---
  const state = {
    authenticated: false,
    user: null,
    pat: '',
    currentView: 'auth'
  };

  // --- DOM REFS ---
  const els = {
    app: document.getElementById('app'),
    sidebar: document.getElementById('sidebar'),
    views: {
      auth: document.getElementById('view-auth'),
      dashboard: document.getElementById('view-dashboard')
    },
    loginForm: document.getElementById('login-form'),
    patInput: document.getElementById('pat-input'),
    navItems: document.querySelectorAll('.nav-item')
  };

  // --- INIT ---
  function init() {
    checkStoredAuth();
    bindEvents();
    renderRoute(state.currentView);
  }

  // --- AUTH LOGIC ---
  async function checkStoredAuth() {
    try {
      const stored = localStorage.getItem('pb_auth');
      if(stored) {
        const data = JSON.parse(stored);
        if(data.pat && data.user) {
          state.pat = data.pat;
          state.user = data.user;
          state.authenticated = true;
          state.currentView = 'dashboard';
        }
      }
    } catch(e) { console.warn("Auth restore failed", e); }
  }

  async function handleLogin(e) {
    e.preventDefault();
    const pat = els.patInput.value.trim();
    if(!pat) return alert("Please enter a valid token.");

    const btn = els.loginForm.querySelector('button');
    btn.disabled = true;
    btn.textContent = "Verifying...";

    try {
      // Validate against GitHub API
      const res = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${pat}` }
      });
      
      if(!res.ok) throw new Error(`Invalid Token (${res.status})`);
      
      const user = await res.json();
      
      // Save State
      state.pat = pat;
      state.user = user;
      state.authenticated = true;
      localStorage.setItem('pb_auth', JSON.stringify({ pat, user }));
      
      // Transition
      state.currentView = 'dashboard';
      renderRoute('dashboard');
      
    } catch(err) {
      alert("Connection Failed: " + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "Connect Account →";
    }
  }

  function logout() {
    localStorage.removeItem('pb_auth');
    location.reload();
  }

  // --- ROUTING ---
  function renderRoute(viewName) {
    // Hide all views
    Object.values(els.views).forEach(el => el.classList.add('hidden'));
    
    // Show target view
    if(els.views[viewName]) {
      els.views[viewName].classList.remove('hidden');
    } else {
      // Fallback to dashboard if unknown route but authenticated
      if(state.authenticated && els.views.dashboard) {
         els.views.dashboard.classList.remove('hidden');
      }
    }

    // Toggle Sidebar Visibility
    if(state.authenticated) {
      els.app.classList.remove('auth-view');
      els.sidebar.classList.remove('hidden');
    } else {
      els.app.classList.add('auth-view');
      els.sidebar.classList.add('hidden');
    }

    // Update Nav Active State
    els.navItems.forEach(item => {
      item.classList.toggle('active', item.dataset.route === viewName);
    });
  }

  // --- EVENTS ---
  function bindEvents() {
    els.loginForm.addEventListener('submit', handleLogin);
    
    els.navItems.forEach(item => {
      item.addEventListener('click', () => {
        const route = item.dataset.route;
        state.currentView = route;
        renderRoute(route);
      });
    });

    // Global Logout Hook (for future settings page)
    window.pbLogout = logout;
  }

  // Boot
  init();
})();