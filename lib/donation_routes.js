const config = require("config");
const {Router} = require("express");
const Stripe = require("stripe");
const stripe = Stripe(config.get("stripe.secret_key"));
      
const STRIPE_PUBLISHABLE_KEY = config.get("stripe.publishable_key");

function checkout(req, res) {
    console.log("checkout", "req.body", req.body);
    const donation_amount_usd = req.body["donation-amount"];
    const locals = {
        donation_amount_usd,
        stripe_publishable_key: STRIPE_PUBLISHABLE_KEY,
        title: "Complete Your Donation",
    };
    res.render("donate/checkout", locals);
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
        donation_amount_usd,
        payment_method_id,
    } = req.body;
    
    // Stripe uses amounts in cents
    const amount_cents = Math.trunc(donation_amount_usd * 100);
    
    // Create a payment intent
    try {
        const payment_intent = await stripe.paymentIntents.create({
            amount: amount_cents,
            currency: "usd",
            payment_method: payment_method_id,
            confirmation_method: "manual",
            confirm: true,
            description: "Donation to Friends of the Fiske Free Library",
            receipt_email: email,
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
            req.session.donation_details = {
                amount_usd: donation_amount_usd,
                time_ms: Date.now(),
                confirmation_code: payment_intent.id,
            };
            return res.redirect("/donate/thank-you");
        }

        res.status(400);
        res.send({error: "Payment processing failed"});
    }
    catch(err) {
        res.status(500);
        res.send("Your card was not charged.");
    }
 }

function confirm_payment(req, res) {
    const donation_details = req.session?.donation_details ?? {};
    const locals = {
        title: "Thank you for your donation",
        ...donation_details,
    };
    res.render("donate/confirm", locals);
}

const router = Router();
router.post("/checkout", checkout);
router.post("/pay", process_payment);
router.get("/thank-you", confirm_payment); 
module.exports = router;
