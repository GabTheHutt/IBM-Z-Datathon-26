const API_BASE_URL = "http://148.100.109.227:8000/api";
const AUTH_STORAGE_KEY = "ibm-authenticated-user";
const ACCOUNT_STORAGE_KEY = "ibm-account";

function requireAuthentication() {
    if (window.location.pathname.endsWith("index.html") || window.location.pathname.endsWith("/")) {
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

async function getApiError(response, fallbackMessage) {
    try {
        const data = await response.json();
        return data.detail || fallbackMessage;
    } catch {
        return fallbackMessage;
    }
}

function showFormMessage(element, message, type = "error") {
    element.textContent = message;
    element.className = `form-message ${type}`;
}

document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.querySelector("#login-form");
    const signupForm = document.querySelector("#signup-form");
    const forgotForm = document.querySelector("#forgot-form");
    const resetForm = document.querySelector("#reset-form");
    const logoutLink = document.querySelector("#logout-link");

    if (logoutLink) {
        logoutLink.addEventListener("click", () => {
            localStorage.removeItem(AUTH_STORAGE_KEY);
        });
    }

    const welcomeName = document.querySelector("#welcome-name");
    const account = getStoredAccount();
    if (welcomeName && account?.firstName) {
        welcomeName.textContent = account.firstName;
    }

    if (loginForm) {
        loginForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const message = loginForm.querySelector(".form-message");
            const email = loginForm.elements.email.value.trim().toLowerCase();
            const password = loginForm.elements.password.value;

            try {
                const response = await fetch(`${API_BASE_URL}/auth/login`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, password }),
                });

                if (!response.ok) {
                    showFormMessage(
                        message,
                        await getApiError(response, "The email or password is incorrect."),
                    );
                    return;
                }

                const data = await response.json();
                if (!data.access_token || !data.firstName) {
                    showFormMessage(message, "The login response was invalid. Please try again.");
                    return;
                }

                localStorage.setItem(AUTH_STORAGE_KEY, data.access_token);
                localStorage.setItem(
                    ACCOUNT_STORAGE_KEY,
                    JSON.stringify({ email, firstName: data.firstName }),
                );
                window.location.replace("index.html");
            } catch {
                showFormMessage(message, "Unable to connect to the login service. Please try again.");
            }
        });
    }

    if (signupForm) {
        signupForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const message = signupForm.querySelector(".form-message");
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

            const account = {
                firstName: signupForm.elements.firstName.value.trim(),
                lastName: signupForm.elements.lastName.value.trim(),
                email: signupForm.elements.email.value.trim().toLowerCase(),
                password,
            };

            try {
                const response = await fetch(`${API_BASE_URL}/auth/signup`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(account),
                });

                if (!response.ok) {
                    showFormMessage(
                        message,
                        await getApiError(response, "Unable to create your account."),
                    );
                    return;
                }

                showFormMessage(message, "Account created. You can now log in.", "success");
                window.setTimeout(() => window.location.replace("login.html"), 700);
            } catch {
                showFormMessage(message, "Unable to connect to the signup service. Please try again.");
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
            const password = resetForm.elements.password.value;
            const confirmation = resetForm.elements.passwordConfirmation.value;
            const account = getStoredAccount();

            if (password.length < 8 || password.length > 15) {
                showFormMessage(message, "Password must be between 8 and 15 characters.");
                return;
            }
            if (password !== confirmation) {
                showFormMessage(message, "The passwords do not match.");
                return;
            }
            if (!account) {
                showFormMessage(message, "No account is available to reset.");
                return;
            }

            account.password = password;
            localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(account));
            showFormMessage(message, "Password updated. You can now log in.", "success");
            window.setTimeout(() => window.location.replace("login.html"), 700);
        });
    }
});
