// Relative URL: works on whatever host/port serves the page (no hard-coded IP, no CORS, no mixed content).
const API_BASE_URL = "/api";
const AUTH_STORAGE_KEY = "ibm-authenticated-user"; // now holds the login token
const ACCOUNT_STORAGE_KEY = "ibm-account";          // { firstName, email }

function clearSession() {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(ACCOUNT_STORAGE_KEY);
}

function requireAuthentication() {
    const path = window.location.pathname;
    if (path.endsWith("index.html") || path.endsWith("/")) {
        if (!localStorage.getItem(AUTH_STORAGE_KEY)) {
            window.location.replace("login.html");
        }
    }
}

function getStoredAccount() {
    try {
        return JSON.parse(localStorage.getItem(ACCOUNT_STORAGE_KEY) || "null");
    } catch {
        return null;
    }
}

function showFormMessage(element, message, type = "error") {
    element.textContent = message;
    element.className = `form-message ${type}`;
}

function errorText(data, fallback) {
    if (data && typeof data.detail === "string") return data.detail;
    if (data && Array.isArray(data.detail) && data.detail[0]?.msg) return data.detail[0].msg;
    return fallback;
}

async function postJson(path, body) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);
    return { ok: response.ok, data };
}

// On the dashboard: make sure the stored token is still valid with the server.
async function verifySession() {
    const token = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!token) return;
    try {
        const response = await fetch(`${API_BASE_URL}/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (response.status === 401) {
            clearSession();
            window.location.replace("login.html");
        }
    } catch {
        // server unreachable: leave the user where they are
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.querySelector("#login-form");
    const signupForm = document.querySelector("#signup-form");
    const forgotForm = document.querySelector("#forgot-form");
    const resetForm = document.querySelector("#reset-form");
    const logoutLink = document.querySelector("#logout-link");
    const welcomeName = document.querySelector("#welcome-name");

    if (logoutLink) {
        logoutLink.addEventListener("click", clearSession);
    }

    if (welcomeName) {
        const account = getStoredAccount();
        if (account?.firstName) welcomeName.textContent = account.firstName;
        verifySession();
    }

    if (loginForm) {
        loginForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const message = loginForm.querySelector(".form-message");
            const button = loginForm.querySelector("button[type=submit]");
            const email = loginForm.elements.email.value.trim().toLowerCase();
            const password = loginForm.elements.password.value;

            button.disabled = true;
            try {
                const { ok, data } = await postJson("/auth/login", { email, password });
                if (!ok) {
                    showFormMessage(message, errorText(data, "The email or password is incorrect."));
                    return;
                }
                localStorage.setItem(AUTH_STORAGE_KEY, data.access_token);
                localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify({ firstName: data.firstName, email }));
                window.location.replace("index.html");
            } catch {
                showFormMessage(message, "Could not reach the server. Please try again.");
            } finally {
                button.disabled = false;
            }
        });
    }

    if (signupForm) {
        signupForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const message = signupForm.querySelector(".form-message");
            const button = signupForm.querySelector("button[type=submit]");
            const password = signupForm.elements.password.value;
            const confirmation = signupForm.elements.passwordConfirmation.value;

            if (password.length < 8 || password.length > 15) {
                showFormMessage(message, "Password must be between 8 and 15 characters.");
                return;
            }
            if (password !== confirmation) {
                showFormMessage(message, "The passwords do not match.");
                return;
            }

            button.disabled = true;
            try {
                const { ok, data } = await postJson("/auth/signup", {
                    firstName: signupForm.elements.firstName.value.trim(),
                    lastName: signupForm.elements.lastName.value.trim(),
                    email: signupForm.elements.email.value.trim().toLowerCase(),
                    password,
                });
                if (!ok) {
                    showFormMessage(message, errorText(data, "Could not create the account."));
                    return;
                }
                showFormMessage(message, "Account created. You can now log in.", "success");
                window.setTimeout(() => window.location.replace("login.html"), 700);
            } catch {
                showFormMessage(message, "Could not reach the server. Please try again.");
            } finally {
                button.disabled = false;
            }
        });
    }

    if (forgotForm) {
        forgotForm.addEventListener("submit", (event) => {
            event.preventDefault();
            const message = forgotForm.querySelector(".form-message");
            showFormMessage(
                message,
                "If an account exists for that email, a password reset link will be sent when email delivery is connected.",
                "success",
            );
        });
    }

    if (resetForm) {
        resetForm.addEventListener("submit", (event) => {
            event.preventDefault();
            const message = resetForm.querySelector(".form-message");
            showFormMessage(message, "Password reset is not available yet because email delivery is not connected.");
        });
    }
});