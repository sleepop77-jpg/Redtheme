// PyBridge Logic - STEP 1: Login Only
(function() {
  if (window.__pyBridgeAuth) return;
  window.__pyBridgeAuth = true;

  const form = document.getElementById('auth-form');
  const input = document.getElementById('pat-input');
  const btn = document.getElementById('connect-btn');
  const statusEl = document.getElementById('status-msg');

  function showStatus(msg, type) {
    statusEl.textContent = msg;
    statusEl.className = `status ${type}`;
    statusEl.classList.remove('hidden');
  }

  async function handleConnect(e) {
    e.preventDefault();
    const token = input.value.trim();
    
    if (!token) {
      showStatus("Please enter a token.", "error");
      return;
    }

    // UI Loading State
    btn.disabled = true;
    btn.innerHTML = "Verifying...";
    statusEl.classList.add('hidden');

    try {
      // 1. Validate Token with GitHub
      const res = await fetch("https://api.github.com/user", {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": "application/vnd.github+json"
        }
      });

      if (!res.ok) {
        throw new Error(`Invalid Token (HTTP ${res.status})`);
      }

      const user = await res.json();

      // 2. Save to LocalStorage
      localStorage.setItem('pb_auth', JSON.stringify({
        pat: token,
        user: user,
        timestamp: Date.now()
      }));

      // 3. Success Feedback
      showStatus(`Connected as ${user.login}! Redirecting...`, "success");
      
      // 4. Redirect to Dashboard (Phase 2 will build this page)
      // For now, we just reload or go to a placeholder
      setTimeout(() => {
        // In Phase 2, this will be: window.location.href = 'dashboard.html';
        // For Step 1, we alert success so you know it worked.
        alert("Login Successful! User: " + user.login + "\n\nNext step: We will build the Dashboard.");
        btn.disabled = false;
        btn.innerHTML = "Connect Account";
      }, 1000);

    } catch (err) {
      showStatus("Connection Failed: " + err.message, "error");
      btn.disabled = false;
      btn.innerHTML = "Connect Account";
    }
  }

  if (form) {
    form.addEventListener('submit', handleConnect);
  }

  // Auto-focus input
  if (input) input.focus();

})();