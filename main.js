const dialog = document.querySelector("#data-dialog");
const openButton = document.querySelector("#open-data-dialog");
const closeButton = document.querySelector("#close-data-dialog");
const form = document.querySelector("#data-form");
const category = document.querySelector("#data-category");
const valueLabel = document.querySelector("#value-label");
const valueUnit = document.querySelector("#value-unit");
const valueInput = document.querySelector("#data-value");
const menuToggle = document.querySelector("#menu-toggle");
const navigation = document.querySelector("#site-navigation");
const pageLayout = document.querySelector(".page-layout");
const accountStorageKey = "ibm-account";

const categoryDetails = {
    steps: ["Step count", "steps", "e.g. 6800"],
    distance: ["Distance", "km", "e.g. 2.5"],
    veryActive: ["Very active minutes", "minutes", "e.g. 30"],
    lightActive: ["Light active minutes", "minutes", "e.g. 45"],
    sedentary: ["Sedentary minutes", "minutes", "e.g. 120"],
    calories: ["Calories consumed", "kcal", "e.g. 520"],
    protein: ["Protein", "g", "e.g. 30"],
    carbs: ["Carbohydrates", "g", "e.g. 45"],
    fat: ["Fat", "g", "e.g. 15"],
};

const initialMetrics = {
    steps: 6842,
    distance: 4.8,
    veryActive: 34,
    lightActive: 86,
    sedentary: 312,
    calories: 1486,
    protein: 84,
    carbs: 156,
    fat: 42,
};

const metricGoals = {
    steps: 10000,
    distance: 6,
    veryActive: 45,
    lightActive: 135,
    sedentary: 600,
    calories: 2200,
    protein: 140,
    carbs: 220,
    fat: 60,
};

function getMetricsStorageKey() {
    try {
        const account = JSON.parse(localStorage.getItem(accountStorageKey) || "null");
        return `ibm-dashboard-metrics:${account?.email || "guest"}`;
    } catch {
        return "ibm-dashboard-metrics:guest";
    }
}

function getMetrics() {
    try {
        return { ...initialMetrics, ...JSON.parse(localStorage.getItem(getMetricsStorageKey()) || "{}") };
    } catch {
        return { ...initialMetrics };
    }
}

function formatMetric(value) {
    return Number.isInteger(value) ? value.toLocaleString("en-GB") : value.toFixed(1);
}

function updateProgress(id, value, goal) {
    const progress = document.querySelector(`#${id}`);
    if (progress) progress.style.width = `${Math.min((value / goal) * 100, 100)}%`;
}

function renderMetrics(metrics) {
    const values = {
        "steps-value": metrics.steps,
        "distance-value": metrics.distance,
        "very-active-value": metrics.veryActive,
        "light-active-value": metrics.lightActive,
        "sedentary-value": metrics.sedentary,
        "calories-value": metrics.calories,
    };
    Object.entries(values).forEach(([id, value]) => {
        document.querySelector(`#${id}`).textContent = formatMetric(value);
    });

    ["protein", "carbs", "fat"].forEach((metric) => {
        document.querySelector(`#${metric}-value`).textContent =
            `${formatMetric(metrics[metric])} / ${metricGoals[metric]}g`;
    });

    Object.keys(metricGoals).forEach((metric) => {
        const progressId = metric === "veryActive" ? "active-progress" : `${metric}-progress`;
        if (metric === "steps") updateProgress("activity-progress", metrics[metric], metricGoals[metric]);
        if (metric === "distance") updateProgress("distance-progress", metrics[metric], metricGoals[metric]);
        if (metric === "veryActive") updateProgress("active-progress", metrics[metric], metricGoals[metric]);
        if (metric === "lightActive") updateProgress("light-progress", metrics[metric], metricGoals[metric]);
        if (metric === "sedentary") updateProgress("sedentary-progress", metrics[metric], metricGoals[metric]);
        if (metric === "calories") updateProgress("calorie-progress", metrics[metric], metricGoals[metric]);
        if (["protein", "carbs", "fat"].includes(metric)) updateProgress(progressId, metrics[metric], metricGoals[metric]);
    });
}

function updateCategoryFields() {
    const details = categoryDetails[category.value];
    valueLabel.textContent = details[0];
    valueUnit.textContent = details[1];
    valueInput.placeholder = details[2];
}

openButton.addEventListener("click", () => dialog.showModal());
closeButton.addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
});
category.addEventListener("change", updateCategoryFields);
form.addEventListener("submit", (event) => {
    event.preventDefault();
    const metric = category.value;
    const value = Number(valueInput.value);
    if (!Number.isFinite(value) || value < 0) return;

    const metrics = getMetrics();
    metrics[metric] += value;
    localStorage.setItem(getMetricsStorageKey(), JSON.stringify(metrics));
    renderMetrics(metrics);
    dialog.close();
    form.reset();
    updateCategoryFields();
});

renderMetrics(getMetrics());

menuToggle.addEventListener("click", () => {
    const isOpen = navigation.classList.toggle("is-open");
    pageLayout.classList.toggle("sidebar-open", isOpen);
    menuToggle.setAttribute("aria-expanded", String(isOpen));
    menuToggle.setAttribute("aria-label", isOpen ? "Close navigation menu" : "Open navigation menu");
});

const API_URL = `http://${window.location.hostname || "localhost"}:5000/predict`;
const checkButton = document.querySelector("#check-day-button");
const checkResult = document.querySelector("#check-day-result");

// Map your dashboard metrics to the model's feature names
function getTodayData() {
    const m = getMetrics();
    return {
        Steps: m.steps,
        Total_Distance: m.distance,
        Very_Active_Minutes: m.veryActive,
        Lightly_Active_Minutes: m.lightActive,
        Sedentary_Minutes: m.sedentary,
        // Fairly_Active_Minutes isn't tracked on the dashboard yet,
        // so the API fills in the median for it
    };
}

async function checkDay() {
    checkResult.className = "check-result";
    checkResult.textContent = "Checking...";
    try {
        const res = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(getTodayData()),
        });
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const result = await res.json();
        const isNormal = result.verdict === "Normal";
        checkResult.className = `check-result ${isNormal ? "is-normal" : "is-unusual"}`;
        checkResult.textContent = isNormal
            ? `Today looks normal (score ${result.score})`
            : `Today looks unusual (score ${result.score})`;
    } catch (err) {
        checkResult.className = "check-result is-error";
        checkResult.textContent = "Couldn't reach the model. Is the API running and the tunnel open?";
        console.error(err);
    }
}

checkButton.addEventListener("click", checkDay);