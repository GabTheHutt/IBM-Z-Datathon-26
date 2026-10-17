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

const categoryDetails = {
    meal: ["Calories", "kcal", "e.g. 520"],
    workout: ["Duration", "minutes", "e.g. 45"],
    steps: ["Steps", "steps", "e.g. 6800"],
    sleep: ["Sleep duration", "hours", "e.g. 7.5"],
    water: ["Amount", "ml", "e.g. 500"],
    weight: ["Weight", "kg", "e.g. 72.5"],
};

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
    dialog.close();
    form.reset();
    updateCategoryFields();
});

menuToggle.addEventListener("click", () => {
    const isOpen = navigation.classList.toggle("is-open");
    menuToggle.setAttribute("aria-expanded", String(isOpen));
    menuToggle.setAttribute("aria-label", isOpen ? "Close navigation menu" : "Open navigation menu");
});
