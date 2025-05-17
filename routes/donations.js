const config = require("config");
const {Router} = require("express");
const Stripe = require("stripe");
const stripe = Stripe(config.get("stripe.secret_key"));

const CURRENCY_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD'
});
const STRIPE_PUBLISHABLE_KEY = config.get("stripe.publishable_key");

function format_usd(amount) {
    return CURRENCY_FORMATTER.format(amount); 
}

function checkout(req, res) {
    const donation_amount = +req.body["donation-amount"];
    const donation_amount_usd = donation_amount.toFixed(2);
    const locals = {
        donation_amount_usd,
        stripe_publishable_key: STRIPE_PUBLISHABLE_KEY,
        title: "Complete Your Donation",
    };
    res.render("donations/checkout", locals);
}

async function process_payment(req, res) {
    const {
        first_name,
        last_name,
        email,
        address_line1,
        address_line2,
        city,
        state,
        zipcode,
        donation_amount,
        payment_method_id,
    } = req.body;

    // Stripe uses amounts in cents
    const amount_cents = Math.trunc(donation_amount * 100);
    
    // Create a payment intent
    try {
        const payment_intent = await stripe.paymentIntents.create({
            amount: amount_cents,
            currency: "usd",
            payment_method: payment_method_id,
            confirm: true,
            description: "Donation to Friends of the Fiske Free Library",
            receipt_email: email,
            // Disable redirect-based payment methods
            automatic_payment_methods: {
                enabled: true,
                allow_redirects: "never",
            },
            metadata: {
                first_name,
                last_name,
                email,
                address_line1,
                address_line2,
                city,
                state,
                zipcode,
            },
        });

        if(payment_intent.status === "succeeded") {
            if(req.session === undefined) {
                req.session = {};
            }
            req.session.donation = {
                amount_usd: format_usd(donation_amount),
                date: (new Date()).toLocaleString(),
                confirmation_code: payment_intent.id,
            };
            return res.redirect("/donate/thank-you");
        }

        // Payment intent didn't succeed but didn't throw an error
        return res.status(400).render("donations/error", {
            title: "Payment Failed",
            error_message: "Your payment could not be processed.",
            details: "Please check your payment information and try again."
        });
    }
    catch(err) {
        // Log the error
        console.log(err);

        // Determine a user-friendly error message
        let error_message = "An error occurred while processing your payment.";
        let details = "Please try again or use a different payment method.";
        
        if(err.type === "StripeCardError") {
            error_message = "Your card was declined.";
            details = err.message ?? "Please check your card details and try again.";
        }
        else if(err.type === "StripeInvalidRequestError") {
            error_message = "There was a problem with your payment request.";
        }
        else if(err.type === "StripeAPIError") {
            error_message = "We're having trouble connecting to our payment processor.";
            details = "Please try again in a few moments.";
        }

        const locals = {title: "Payment Error", error_message, details};
        res.status(400);
        return res.render("donations/error", locals);
    }
 }

function confirm_payment(req, res) {
    const donation = req.session.donation ?? {};
    const locals = {
        title: "Thank you for your donation",
        ...donation,
    };
    res.render("donations/confirm", locals);
}

const router = Router();
router.post("/checkout", checkout);
router.post("/pay", process_payment);
router.get("/thank-you", confirm_payment); 
module.exports = router;
