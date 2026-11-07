// Resolve to Read: small enhancements. Every page also works without JavaScript.
(() => {
    "use strict";

    function storage() {
        try {
            const key = "__ra";
            window.localStorage.setItem(key, "1");
            window.localStorage.removeItem(key);
            return window.localStorage;
        }
        catch(err) {
            return null;
        }
    }

    // ---------- join: add another reader without reloading ----------
    function setup_join(form) {
        const button = form.querySelector("[data-add-reader]");
        const list = form.querySelector("[data-readers]");
        const template = document.getElementById("ra-reader-template");
        if(!button || !list || !template) {
            return;
        }
        const MAX = 6;
        button.addEventListener("click", event => {
            event.preventDefault();
            const count = list.querySelectorAll("[data-reader-row]").length;
            if(count >= MAX) {
                return;
            }
            const html = template.innerHTML
                .replaceAll("__I__", String(count))
                .replaceAll("__N__", String(count + 1));
            list.insertAdjacentHTML("beforeend", html);
            const rows = list.querySelectorAll("[data-reader-row]");
            rows[rows.length - 1].querySelector("input[type=text]").focus();
            if(count + 1 >= MAX) {
                button.hidden = true;
            }
        });
    }

    // ---------- log: only show the "other" box when it's picked ----------
    function setup_other_minutes(form) {
        const field = form.querySelector("[data-other-field]");
        if(!field) {
            return;
        }
        const update = () => {
            const other = form.querySelector("[data-other-toggle]");
            field.hidden = !other.checked;
            if(other.checked) {
                field.querySelector("input").focus();
            }
        };
        form.querySelectorAll("input[name=minutes]").forEach(input => input.addEventListener("change", update));
        const other = form.querySelector("[data-other-toggle]");
        field.hidden = !other.checked;
    }

    // ---------- timer ----------
    // Saves the start time rather than counting ticks, so it survives a sleeping
    // phone or a closed tab. Stops counting at 4 hours.
    function setup_timer(root) {
        const store = storage();
        const reader = root.dataset.reader;
        const day = root.dataset.day;
        const key = `ra-timer-${reader}`;
        const face = root.querySelector("[data-face]");
        const note = root.querySelector("[data-note]");
        const toggle = root.querySelector("[data-toggle]");
        const save = root.querySelector("[data-save]");
        const minutes_input = root.querySelector("[data-minutes]");
        const controls = root.querySelector("[data-controls]");
        const tip = root.querySelector("[data-tip]");
        if(!face || !toggle) {
            return;
        }
        const LIMIT_MS = 4 * 60 * 60 * 1000;
        const NUDGE_MS = 2 * 60 * 60 * 1000;

        let state = {running: false, started_at: 0, banked: 0, day};
        try {
            const saved = JSON.parse(store?.getItem(key) ?? "null");
            if(saved && saved.day === day) {
                state = saved;
            }
        }
        catch(err) {
            // Start fresh
        }

        const elapsed = () => Math.min(LIMIT_MS, state.banked + (state.running ? Date.now() - state.started_at : 0));
        const persist = () => {
            try {
                store?.setItem(key, JSON.stringify(state));
            }
            catch(err) {
                // Private browsing: the timer still works while the page is open
            }
        };
        const pad = n => String(n).padStart(2, "0");

        function render() {
            const ms = elapsed();
            const total_seconds = Math.floor(ms / 1000);
            const h = Math.floor(total_seconds / 3600);
            const m = Math.floor(total_seconds / 60) % 60;
            const s = total_seconds % 60;
            face.textContent = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
            root.classList.toggle("is-running", state.running);
            toggle.textContent = state.running ? "Pause" : (ms > 0 ? "Keep reading" : "Start");
            save.hidden = ms < 1000;
            if(ms >= LIMIT_MS && state.running) {
                pause();
                note.textContent = "We stopped at 4 hours. Tap I'm done to save it!";
            }
            else if(state.running && ms >= NUDGE_MS) {
                note.textContent = "Still reading? Wow! Tap I'm done whenever you finish.";
            }
            else if(state.running) {
                note.textContent = "Happy reading! Tap pause for a break.";
            }
            else if(ms > 0) {
                note.textContent = "Paused. Keep reading, or tap I'm done to save.";
            }
        }
        function start() {
            state.running = true;
            state.started_at = Date.now();
            persist();
            render();
        }
        function pause() {
            state.banked = elapsed();
            state.running = false;
            persist();
            render();
        }

        controls.hidden = false;
        tip.hidden = false;
        toggle.addEventListener("click", () => (state.running ? pause() : start()));
        save.addEventListener("submit", () => {
            const minutes = Math.max(1, Math.min(240, Math.round(elapsed() / 60000)));
            minutes_input.value = String(minutes);
            try {
                store?.removeItem(key);
            }
            catch(err) {
                // Nothing to clear
            }
        });
        // Demo helper for the planning meeting: add ?demo to the URL to skip ahead
        if(new URLSearchParams(window.location.search).has("demo")) {
            const skip = document.createElement("button");
            skip.type = "button";
            skip.className = "ra-btn ra-btn-snow";
            skip.textContent = "Demo: skip 15 min";
            skip.addEventListener("click", () => {
                state.banked += 15 * 60 * 1000;
                persist();
                render();
            });
            controls.appendChild(skip);
        }
        render();
        window.setInterval(render, 1000);
        document.addEventListener("visibilitychange", render);
    }

    // ---------- gifts: card field, live button label, friendly checks ----------
    function setup_gift(form) {
        const submit = form.querySelector("[data-gift-submit]");
        const errors = form.querySelector("[data-card-errors]");
        const other_field = form.querySelector("[data-amount-other-field]");
        const other_input = other_field.querySelector("input");
        const who = form.dataset.who;
        const fake = form.dataset.fake === "1";
        const checked = name => form.querySelector(`input[name='${name}']:checked`);

        function amount_usd() {
            const choice = checked("amount");
            if(choice === null) {
                return null;
            }
            const value = Number.parseFloat(choice.value === "other" ? other_input.value : choice.value);
            return Number.isFinite(value) ? value : null;
        }
        function format_usd(amount) {
            return amount.toLocaleString("en-US", {
                style: "currency",
                currency: "USD",
                minimumFractionDigits: Math.round(amount * 100) % 100 === 0 ? 0 : 2,
            });
        }
        function update() {
            const other = checked("amount")?.value === "other";
            other_field.hidden = !other;
            const amount = amount_usd();
            const how_much = amount !== null && amount > 0 ? ` with ${format_usd(amount)}` : "";
            submit.textContent = who ? `Cheer on ${who}${how_much}` : `Give${how_much ? ` ${format_usd(amount)}` : ""}`;
        }
        form.addEventListener("change", event => {
            update();
            if(event.target.name === "amount" && event.target.value === "other") {
                other_input.focus();
            }
        });
        form.addEventListener("input", update);
        update();
        form.querySelector(".ra-errors")?.focus();

        let stripe = null;
        let card = null;
        if(!fake) {
            try {
                stripe = window.Stripe(form.dataset.stripeKey);
                card = stripe.elements().create("card", {
                    style: {
                        base: {
                            color: "#1c1f3f",
                            fontSize: "17px",
                            fontFamily: "Nunito, system-ui, sans-serif",
                            "::placeholder": {color: "#8a8fae"},
                        },
                        invalid: {color: "#b9332c"},
                    },
                });
                card.mount(form.querySelector("[data-card]"));
                card.on("change", event => {
                    errors.textContent = event.error?.message ?? "";
                });
            }
            catch(err) {
                errors.textContent = "Card payments aren't working right now. Please try again later.";
                submit.disabled = true;
                return;
            }
        }

        function problems() {
            const list = [];
            const amount = amount_usd();
            const minimum = Number.parseFloat(other_input.min);
            if(amount === null || amount < minimum) {
                list.push(`The smallest gift is $${minimum}.`);
            }
            for(const name of ["first_name", "last_name"]) {
                if(form.elements[name].value.trim() === "") {
                    list.push("Please enter your first and last name for the receipt.");
                }
            }
            if(!form.elements.email.checkValidity() || form.elements.email.value.trim() === "") {
                list.push("Please enter a valid email for your receipt.");
            }
            return [...new Set(list)];
        }

        window.addEventListener("pageshow", () => {
            submit.disabled = false;
            update();
        });

        form.addEventListener("submit", async event => {
            event.preventDefault();
            const found = problems();
            if(found.length > 0) {
                errors.textContent = found.join(" ");
                return;
            }
            submit.disabled = true;
            const label = submit.textContent;
            submit.textContent = "Sending your cheer...";
            errors.textContent = "";
            let hidden = form.querySelector("input[name='payment_method_id']");
            if(hidden === null) {
                hidden = document.createElement("input");
                hidden.type = "hidden";
                hidden.name = "payment_method_id";
                form.appendChild(hidden);
            }
            if(fake) {
                hidden.value = "";
                form.submit();
                return;
            }
            try {
                const {paymentMethod: payment_method, error} = await stripe.createPaymentMethod({
                    type: "card",
                    card,
                    billing_details: {
                        name: `${form.elements.first_name.value.trim()} ${form.elements.last_name.value.trim()}`,
                        email: form.elements.email.value.trim(),
                    },
                });
                if(error !== undefined) {
                    throw error;
                }
                hidden.value = payment_method.id;
                form.submit();
            }
            catch(err) {
                errors.textContent = err.message ?? "Something went wrong. Please try again.";
                submit.disabled = false;
                submit.textContent = label;
            }
        });
    }

    // ---------- copy the cheer link ----------
    function setup_copy(button) {
        const input = document.querySelector("[data-share-url]");
        const status = document.querySelector("[data-copy-status]");
        button.addEventListener("click", async () => {
            try {
                await navigator.clipboard.writeText(input.value);
                status.textContent = "Copied! Paste it into a text or email.";
            }
            catch(err) {
                input.select();
                status.textContent = "Select the link and copy it.";
            }
        });
    }

    document.addEventListener("DOMContentLoaded", () => {
        document.querySelectorAll("form[data-gift]").forEach(setup_gift);
        document.querySelectorAll("[data-copy]").forEach(setup_copy);
        document.querySelectorAll("form[data-join]").forEach(setup_join);
        document.querySelectorAll("form").forEach(setup_other_minutes);
        document.querySelectorAll("[data-timer]").forEach(setup_timer);
    });
})();
