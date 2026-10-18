const dialog = document.querySelector("#data-dialog");
const API_BASE_URL = `${window.location.origin}/api`;
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
const dataMessage = document.querySelector("#data-message");

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

let currentMetrics = null;

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

function getMetrics() {
    return currentMetrics || {
        steps: 0,
        distance: 0,
        veryActive: 0,
        lightActive: 0,
        sedentary: 0,
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
    };
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

function getAuthHeaders() {
    const token = localStorage.getItem("ibm-authenticated-user");
    return token
        ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
        : { "Content-Type": "application/json" };
}

async function loadMetrics() {
    try {
        const response = await fetch(`${API_BASE_URL}/dashboard/metrics`, {
            headers: getAuthHeaders(),
        });
        if (!response.ok) throw new Error("Unable to load dashboard data.");
        currentMetrics = await response.json();
        renderMetrics(currentMetrics);
    } catch {
        if (dataMessage) {
            dataMessage.textContent = "Unable to load your dashboard data. Please log in again.";
            dataMessage.className = "form-message error";
        }
    }
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
form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const metric = category.value;
    const value = Number(valueInput.value);
    if (!Number.isFinite(value) || value <= 0) {
        if (dataMessage) {
            dataMessage.textContent = "Enter an amount greater than zero.";
            dataMessage.className = "form-message error";
        }
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/dashboard/metrics`, {
            method: "PATCH",
            headers: getAuthHeaders(),
            body: JSON.stringify({ metric, amount: value }),
        });
        if (!response.ok) throw new Error("Unable to save dashboard data.");
        currentMetrics = await response.json();
        renderMetrics(currentMetrics);
        dialog.close();
        form.reset();
        updateCategoryFields();
    } catch {
        if (dataMessage) {
            dataMessage.textContent = "Unable to save your data. Please try again.";
            dataMessage.className = "form-message error";
        }
    }
});

loadMetrics();

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

const checkExplain = document.querySelector("#check-day-explain");

const featureNames = {
    Steps: "steps",
    Total_Distance: "distance",
    Very_Active_Minutes: "very active minutes",
    Fairly_Active_Minutes: "fairly active minutes",
    Lightly_Active_Minutes: "light active minutes",
    Sedentary_Minutes: "sedentary minutes",
};

function explainResult(result) {
    const score = result.score;
    const paragraphs = [];

    if (score > 0.1) {
        paragraphs.push(["Very typical day. ", "Your numbers closely match the pattern of the days the model learned from."]);
    } else if (score > 0) {
        paragraphs.push(["Within your normal range, but near the edge. ", "Your day fits the usual pattern, though it is a little different from the most typical days."]);
    } else if (score > -0.05) {
        paragraphs.push(["Slightly unusual. ", "Your day sits just outside the usual pattern. That isn't necessarily a problem, just different from most days the model has seen."]);
    } else {
        paragraphs.push(["Very unusual. ", "Your numbers differ a lot from the days the model learned from, for example a very high or very low value in one or more areas."]);
    }

    paragraphs.push(["What the score means. ", `Above 0 is normal and below 0 is unusual. The further from 0, the stronger the result. Yours is ${score}.`]);
    paragraphs.push(["What it doesn't mean. ", "This isn't a health score. It only compares today with typical days in the training data, so it can't say whether a day is good or bad for you."]);

    const filled = (result.filled_with_median || []).map((f) => featureNames[f] || f);
    if (filled.length) {
        paragraphs.push(["Missing data. ", `The dashboard doesn't track ${filled.join(", ")}, so a typical value was used instead.`]);
    }

    checkExplain.replaceChildren(...paragraphs.map(([title, body]) => {
        const p = document.createElement("p");
        const strong = document.createElement("strong");
        strong.textContent = title;
        p.append(strong, body);
        return p;
    }));
}

async function checkDay() {
    checkResult.className = "check-result";
    checkResult.textContent = "Checking...";
    checkExplain.replaceChildren();
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
        checkResult.textContent = `Today looks ${isNormal ? "normal" : "unusual"} (score ${result.score})`;
        explainResult(result);
    } catch (err) {
        checkResult.className = "check-result is-error";
        checkResult.textContent = "Couldn't reach the model. Is the API running and the tunnel open?";
        console.error(err);
    }
}

checkButton.addEventListener("click", checkDay);