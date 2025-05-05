document.addEventListener("DOMContentLoaded", () => {
    const stripe = Stripe(stripe_publishable_key);
    const elements = stripe.elements();

    const card_element = elements.create("card");
    card_element = ("#card-element");

    const form = document.getElementById("payment-form");
    const card_errors = document.getElementById("card-errors");
    const submit_button = document.querySelector("button[type='submit']");

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        submit_button.disabled = true;
    });

    const first_name = document.getElementById("first-name").value;
    const last_name = document.getElementById("last-name").value;
    const email = document.getElementById("email").value;
    const address_line1 = document.getElementById("address-line1").value;
    const address_line2 = document.getElementById("address-line2").value;
    const city = document.getElementById("city").value;
    const state = document.getElementById("state").value;
    const zipcode = document.getElementById("zipcode").value;

    try {
        const {paymentMethod: payment_method, error} = await stripe.createPaymentMethod({
            type: "card",
            card: card_element,
            billing_details: {
                name: `${first_name} ${last_name}`,
                email,
                address: {
                    line1: address_line1,
                    line2: address_line2,
                    city,
                    state,
                    postal_code: zipcode,
                    country: "US",
                },
            },
        });

        if(error !== undefined) {
            card_errors.textContent = error.message;
            submit_button.disabled = false;
        }
        else {
            const payment_method_input = document.createElement("input");
            payment_method_input.setAttribute("type", "hidden");
            payment_method_input.setAttribute("name", "payment_method_id");
            payment_method_input.setAttribute("value", payment_method.id);
            form.appendChild(payment_method_input);

            // We have all the information we need
            // Submit the form
            form.submit();
        }
    }
    catch(err) {
        card_errors.textContent = "An unexpected error occurred. Please try again";
        submit_button.disabled = false;
    }

    const custom_amount_radio = document.getElementById("custom-amount");
    const donation_amount_field = document.querySelector("input[name='donation-amount']");

    const update_custom_amount_field = () => {
        donation_amount_field.disabled != custom_amount_radio.checked;
    };

    const radios = document.querySelectorAll("input[name='donation-amount']");
    for(const radio of radios) {
        radio.addEventListener("change", update_custom_amount_field);
    }
});
