const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000/api'
    : 'https://your-render-app.onrender.com/api'; // Replace with your Render URL

// =======================
// SEARCH FUNCTIONALITY
// =======================
function search() {
  const searchInput = document.getElementById("Search");
  if(!searchInput) return;
  const textIn = searchInput.value.toLowerCase();
  
  const cards = document.querySelectorAll('.card');
  cards.forEach(card => {
    const title = card.querySelector('.text_m').textContent.toLowerCase();
    const desc = card.querySelector('.text_s').textContent.toLowerCase();
    if (title.includes(textIn) || desc.includes(textIn)) {
      card.style.display = 'block';
    } else {
      card.style.display = 'none';
    }
  });
}

// =======================
// AUTHENTICATION
// =======================
function showLogin() {
  document.getElementById("authModal").classList.remove("hidden");
  document.getElementById("loginForm").classList.remove("hidden");
  document.getElementById("signupForm").classList.add("hidden");
}

function showSignup() {
  document.getElementById("authModal").classList.remove("hidden");
  document.getElementById("signupForm").classList.remove("hidden");
  document.getElementById("loginForm").classList.add("hidden");
}

function closeModal() {
  document.getElementById("authModal").classList.add("hidden");
  const loginForm = document.getElementById("loginForm");
  const signupForm = document.getElementById("signupForm");
  if(loginForm) loginForm.classList.add("hidden");
  if(signupForm) signupForm.classList.add("hidden");
}

async function saveCredentials(event) {
  event.preventDefault();
  const name = document.getElementById("signupName").value;
  const email = document.getElementById("signupEmail").value;
  const password = document.getElementById("signupPassword").value;

  try {
    const response = await fetch(`${API_BASE}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    
    const data = await response.json();
    
    if (response.ok) {
        alert("Signup successful! Please login.");
        showLogin();
    } else {
        alert(data.error || "Signup failed");
    }
  } catch (err) {
    alert("Connection error to server");
  }
}

async function login() {
  const email = document.getElementById("loginEmail").value;
  const password = document.getElementById("loginPassword").value;

  try {
    const response = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    const data = await response.json();
    
    if (response.ok) {
        localStorage.setItem("loggedInUser", JSON.stringify(data.user));
        sessionStorage.setItem("activeSession", "true");
        alert("Login successful. Welcome, " + data.user.name + "!");
        closeModal();
        
        // Redirect to appropriate dashboard based on role
        if (data.user.role === 'admin') {
            window.location.href = 'admin_dashboard.html';
        } else {
            window.location.href = 'user_dashboard.html';
        }
    } else {
        alert(data.error || "Incorrect credentials");
    }
  } catch (err) {
    console.log(err);
    alert("Connection error to server");
  }
}

function logout() {
  localStorage.removeItem("loggedInUser");
  sessionStorage.removeItem("activeSession");
  alert("You have been logged out.");
  window.location.href = 'index.html';
}

// =======================
// INITIAL LOAD HANDLER
// =======================
window.onload = function () {
  const activeSession = sessionStorage.getItem("activeSession");
  const userStr = localStorage.getItem("loggedInUser");
  
  if (activeSession && userStr) {
    const user = JSON.parse(userStr);
    const loginBtn = document.getElementById("loginBtn");
    const signupBtn = document.getElementById("signupBtn");
    const logoutBtn = document.getElementById("logoutBtn");
    
    if(loginBtn) loginBtn.classList.add("hidden");
    if(signupBtn) signupBtn.classList.add("hidden");
    if(logoutBtn) logoutBtn.classList.remove("hidden");
    
    // Convert Login button to Dashboard link
    const authWrapper = document.querySelector('.auth-buttons');
    if (authWrapper && !document.getElementById("dashboardBtn")) {
        const dashboardBtn = document.createElement("button");
        dashboardBtn.className = "btn-secondary";
        dashboardBtn.id = "dashboardBtn";
        dashboardBtn.textContent = user.role === 'admin' ? "Admin Dashboard" : "Dashboard";
        dashboardBtn.onclick = () => window.location.href = user.role === 'admin' ? 'admin_dashboard.html' : 'user_dashboard.html';
        authWrapper.prepend(dashboardBtn);
    }
  } else {
    // Clear any stale session data
    sessionStorage.removeItem("activeSession");
    localStorage.removeItem("loggedInUser");
  }
};
