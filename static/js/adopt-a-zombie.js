document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("adopt");
    const submit_button = form.querySelector("button[type='submit']");
    const submit_label = document.getElementById("submit-label");
    const card_errors = document.getElementById("card-errors");

    const write_in_field = document.getElementById("zombie-write-in-field");
    const write_in_input = document.getElementById("zombie-write-in");
    const other_field = document.getElementById("amount-other-field");
    const other_input = document.getElementById("amount-other");

    const checked = (name) => form.querySelector(`input[name='${name}']:checked`);

    function zombie_name() {
        const choice = checked("zombie");
        if(choice === null) {
            return null;
        }
        if(choice.value === "__horde") {
            return "the whole horde";
        }
        if(choice.value === "__write_in") {
            return write_in_input.value.trim() || null;
        }
        return choice.value;
    }

    function amount_usd() {
        const choice = checked("amount");
        if(choice === null) {
            return null;
        }
        const raw = choice.value === "other" ? other_input.value : choice.value;
        const amount = Number.parseFloat(raw);
        return Number.isFinite(amount) ? amount : null;
    }

    function format_usd(amount) {
        const has_cents = Math.round(amount * 100) % 100 !== 0;
        return amount.toLocaleString("en-US", {
            style: "currency",
            currency: "USD",
            minimumFractionDigits: has_cents ? 2 : 0,
        });
    }

    // Show the write-in and other-amount boxes only when they apply
    function update() {
        const writing_in = checked("zombie")?.value === "__write_in";
        write_in_field.hidden = !writing_in;
        write_in_input.required = writing_in;

        const other = checked("amount")?.value === "other";
        other_field.hidden = !other;
        other_input.required = other;

        const name = zombie_name();
        const amount = amount_usd();
        const who = name ?? "a zombie";
        const how_much = amount !== null && amount > 0 ? ` for ${format_usd(amount)}` : "";
        submit_label.textContent = `Adopt ${who}${how_much}`;
    }

    form.addEventListener("change", (event) => {
        update();
        const {target} = event;
        if(target.name === "zombie" && target.value === "__write_in") {
            write_in_input.focus();
        }
        if(target.name === "amount" && target.value === "other") {
            other_input.focus();
        }
    });
    form.addEventListener("input", update);
    update();

    // Bring server-side errors into view
    const server_errors = form.querySelector(".zombie-errors");
    server_errors?.focus();

    // Stripe card field
    let stripe;
    let card_element;
    try {
        stripe = Stripe(stripe_publishable_key);
        card_element = stripe.elements().create("card", {
            style: {
                base: {
                    color: "#ffffff",
                    iconColor: "#fff0a7",
                    fontSize: "16px",
                    fontFamily: "'Open Sans', system-ui, sans-serif",
                    "::placeholder": {color: "#9c978a"},
                },
                invalid: {
                    color: "#ff9d8a",
                    iconColor: "#ff9d8a",
                },
            },
        });
        card_element.mount("#card-element");
        card_element.on("change", (event) => {
            card_errors.textContent = event.error?.message ?? "";
        });
    }
    catch(err) {
        console.error(err);
        card_errors.textContent = "Card payments are unavailable right now. Please try again later.";
        submit_button.disabled = true;
        return;
    }

    function validate() {
        const problems = [];
        if(checked("zombie") === null) {
            problems.push("Pick a zombie to adopt.");
        }
        else if(zombie_name() === null) {
            problems.push("Enter your zombie's name.");
            write_in_input.setAttribute("aria-invalid", "true");
        }
        const amount = amount_usd();
        const minimum = Number.parseFloat(other_input.min);
        if(amount === null || amount < minimum) {
            problems.push(`The minimum adoption is $${minimum}.`);
            other_input.setAttribute("aria-invalid", "true");
        }
        for(const input of form.querySelectorAll("#first-name, #last-name, #email")) {
            const ok = input.checkValidity() && input.value.trim() !== "";
            input.setAttribute("aria-invalid", ok ? "false" : "true");
            if(!ok) {
                problems.push(input.id === "email"
                    ? "Enter a valid email for your receipt."
                    : "Enter your first and last name.");
            }
        }
        return [...new Set(problems)];
    }

    // Re-enable the button if someone comes back with the browser's back button
    window.addEventListener("pageshow", () => {
        submit_button.disabled = false;
        update();
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        for(const input of form.querySelectorAll("[aria-invalid]")) {
            input.removeAttribute("aria-invalid");
        }
        const problems = validate();
        if(problems.length > 0) {
            card_errors.textContent = problems.join(" ");
            form.querySelector("[aria-invalid='true']")?.focus();
            return;
        }

        submit_button.disabled = true;
        const label = submit_label.textContent;
        submit_label.textContent = "Summoning…";
        card_errors.textContent = "";

        const first_name = document.getElementById("first-name").value.trim();
        const last_name = document.getElementById("last-name").value.trim();
        const email = document.getElementById("email").value.trim();
        try {
            const {paymentMethod: payment_method, error} = await stripe.createPaymentMethod({
                type: "card",
                card: card_element,
                billing_details: {
                    name: `${first_name} ${last_name}`,
                    email,
                },
            });
            if(error !== undefined) {
                throw error;
            }
            let hidden = form.querySelector("input[name='payment_method_id']");
            if(hidden === null) {
                hidden = document.createElement("input");
                hidden.type = "hidden";
                hidden.name = "payment_method_id";
                form.appendChild(hidden);
            }
            hidden.value = payment_method.id;
            form.submit();
        }
        catch(err) {
            card_errors.textContent = err.message ?? "Something went wrong. Please try again.";
            submit_button.disabled = false;
            submit_label.textContent = label;
        }
    });
});
