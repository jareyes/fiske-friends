const config = require("config");
const {Router} = require("express");
const Stripe = require("stripe");

const APP = config.get("app");
const MOUNTS = config.get("app.mounts");
const STRIPE_PUBLISHABLE_KEY = config.get("stripe.publishable_key");

const ADOPT_A_ZOMBIE_PATH = `/${MOUNTS.events}/adopt-a-zombie`;
const SITE_URL = `${APP.protocol}://${APP.domain}`;

// Tag every payment so the treasurer can filter and export them in Stripe
const CAMPAIGN = "2026-ttw-adopt-a-zombie";
const HORDE = "The Whole Horde";
const MAX_NAME_LENGTH = 80;
const MAX_AMOUNT_USD = 10000;

const CURRENCY_FORMATTER = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
});

const ZOMBIES = ["Jennifer", "Jill", "Kim", "Laura", "Livingston", "Liza", "Mallory", "Mary", "Mike", "Renee"];
const SUGGESTED_USD = [10, 25, 50, 100];
const MIN_SUGGESTED_USD = 5;

let stripe;
function get_stripe() {
    // Created lazily so this module can be loaded (e.g. by tests) without keys
    stripe ??= Stripe(config.get("stripe.secret_key"));
    return stripe;
}

function clean(value, max_length = 200) {
    return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max_length);
}

// Turns a submitted form into a sponsorship, or a list of problems
function parse_sponsorship(body, zombies = ZOMBIES) {
    const errors = [];

    // Which zombie?
    const choice = clean(body.zombie);
    let zombie;
    let zombie_source;
    if(choice === "__horde") {
        zombie = HORDE;
        zombie_source = "horde";
    }
    else if(choice === "__write_in") {
        zombie = clean(body.zombie_write_in, MAX_NAME_LENGTH);
        zombie_source = "write-in";
        if(zombie === "") {
            errors.push("Please tell us the name of the zombie you're adopting.");
        }
    }
    else if(zombies.includes(choice)) {
        zombie = choice;
        zombie_source = "list";
    }
    else {
        errors.push("Please choose a zombie to adopt.");
    }

    // How much?
    const amount_choice = clean(body.amount);
    const amount_raw = amount_choice === "other"
        ? clean(body.amount_other).replace(/[$,]/g, "")
        : amount_choice;
    const amount_usd = Math.round(Number.parseFloat(amount_raw) * 100) / 100;
    if(!Number.isFinite(amount_usd) || amount_usd < MIN_SUGGESTED_USD) {
        errors.push(`The minimum adoption is $${MIN_SUGGESTED_USD}.`);
    }
    else if(amount_usd > MAX_AMOUNT_USD) {
        errors.push("For gifts over $10,000, please contact the Friends directly.");
    }

    // Who's paying?
    const first_name = clean(body.first_name, 100);
    const last_name = clean(body.last_name, 100);
    const email = clean(body.email, 200);
    if(first_name === "" || last_name === "") {
        errors.push("Please enter your first and last name.");
    }
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push("Please enter a valid email address for your receipt.");
    }

    const payment_method_id = clean(body.payment_method_id);
    if(errors.length === 0 && payment_method_id === "") {
        errors.push("We couldn't read your card details. Please try again.");
    }

    return {
        errors,
        sponsorship: {
            zombie,
            zombie_source,
            amount_usd,
            first_name,
            last_name,
            email,
            payment_method_id,
        },
    };
}

function page_locals(overrides = {}) {
    return {
        title: "Adopt a Zombie",
        body_class: "theme-zombie",
        zombies: ZOMBIES,
        suggested_amounts: SUGGESTED_USD,
        minimum_usd: MIN_SUGGESTED_USD,
        stripe_publishable_key: STRIPE_PUBLISHABLE_KEY,
        og: {
            title: "Adopt a Zombie for the Fiske Free Library",
            description: "Sponsor a Thrill the World dancer and help the Fiske Free Library. "
                + "Zombies dance Saturday, October 24, 2026 at 6 PM in Claremont, NH.",
            url: `${SITE_URL}${ADOPT_A_ZOMBIE_PATH}`,
            image: `${SITE_URL}/img/adopt-a-zombie/og.jpg`,
            image_width: 1200,
            image_height: 630,
            image_alt: "Three cartoon zombies shuffling in front of a full moon, "
                + "with the words Adopt a Zombie.",
        },
        ...overrides,
    };
}

function show_form(req, res) {
    // Allow /events/adopt-a-zombie?zombie=Name to preselect a dancer
    const preselect = clean(req.query.zombie, MAX_NAME_LENGTH);
    const form = {};
    if(ZOMBIES.includes(preselect)) {
        form.zombie = preselect;
    }
    else if(preselect !== "") {
        form.zombie = "__write_in";
        form.zombie_write_in = preselect;
    }
    else if(ZOMBIES.length === 0) {
        form.zombie = "__write_in";
    }
    // Start with the second suggested amount picked
    const suggested_usd = SUGGESTED_USD;
    form.amount = String(suggested_usd[1] ?? suggested_usd[0] ?? "other");
    res.render("events/adopt-a-zombie", page_locals({form}));
}

function render_form_error(res, body, errors) {
    // Keep what they typed (never card details) so they don't start over
    const form = {
        zombie: clean(body.zombie),
        zombie_write_in: clean(body.zombie_write_in, MAX_NAME_LENGTH),
        amount: clean(body.amount),
        amount_other: clean(body.amount_other),
        first_name: clean(body.first_name, 100),
        last_name: clean(body.last_name, 100),
        email: clean(body.email, 200),
    };
    res.status(400).render(
        "events/adopt-a-zombie",
        page_locals({form, errors}),
    );
}

async function process_adoption(req, res) {
    const {errors, sponsorship} = parse_sponsorship(req.body);
    if(errors.length > 0) {
        return render_form_error(res, req.body, errors);
    }
    const {
        zombie,
        zombie_source,
        amount_usd,
        first_name,
        last_name,
        email,
        payment_method_id,
    } = sponsorship;

    try {
        const payment_intent = await get_stripe().paymentIntents.create({
            amount: Math.round(amount_usd * 100),
            currency: "usd",
            payment_method: payment_method_id,
            confirm: true,
            // Shows up in the Stripe dashboard payment list
            description: `Adopt a Zombie: ${zombie}`,
            receipt_email: email,
            automatic_payment_methods: {
                enabled: true,
                allow_redirects: "never",
            },
            // Searchable in Stripe and included in CSV exports
            metadata: {
                campaign: CAMPAIGN,
                zombie,
                zombie_source,
                first_name,
                last_name,
                email,
            },
        });

        if(payment_intent.status === "succeeded") {
            req.session.zombie_adoption = {
                zombie,
                amount_usd: CURRENCY_FORMATTER.format(amount_usd),
                confirmation_code: payment_intent.id,
            };
            return res.redirect(`${ADOPT_A_ZOMBIE_PATH}/thank-you`);
        }

        console.log({
            event: "AdoptAZombie.PAYMENT_NOT_SUCCEEDED",
            payment_intent_id: payment_intent.id,
            status: payment_intent.status,
        });
        return render_form_error(res, req.body, [
            "Your payment could not be completed. You have not been charged. "
                + "Please try again or use a different card.",
        ]);
    }
    catch(err) {
        console.log({
            event: "AdoptAZombie.PAYMENT_ERROR",
            type: err.type,
            message: err.message,
        });
        let message = "Something went wrong while processing your payment. "
            + "You have not been charged. Please try again.";
        if(err.type === "StripeCardError") {
            message = `Your card was declined: ${err.message}`;
        }
        else if(err.type === "StripeAPIError" || err.type === "StripeConnectionError") {
            message = "We're having trouble reaching our payment processor. "
                + "Please try again in a few moments.";
        }
        return render_form_error(res, req.body, [message]);
    }
}

function thank_you(req, res) {
    const adoption = req.session.zombie_adoption;
    if(adoption === undefined) {
        return res.redirect(ADOPT_A_ZOMBIE_PATH);
    }
    res.render("events/adopt-a-zombie-thank-you", page_locals({
        ...adoption,
        is_horde: adoption.zombie === HORDE,
        time: new Date(),
        title: "Thank you for adopting a zombie",
    }));
}

function create() {
    const router = Router();
    router.get("/adopt-a-zombie", show_form);
    router.post("/adopt-a-zombie", process_adoption);
    router.get("/adopt-a-zombie/thank-you", thank_you);
    return router;
}

exports.create = create;
exports.parse_sponsorship = parse_sponsorship;
