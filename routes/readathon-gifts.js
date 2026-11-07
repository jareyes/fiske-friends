// Read-a-thon pledges and donations. Mounted inside routes/readathon.js.
//
//   /readathon/give              give to the whole read-a-thon
//   /readathon/cheer/:code       cheer on one reader (the link families share)
//   /readathon/give/thanks       receipt
//   /readathon/r/:id/cheers      a reader's own list of cheers and their share link
//
// Payments work like Adopt a Zombie: Stripe Elements makes a payment method in the
// browser, then the server confirms a PaymentIntent tagged with the campaign.
const config = require("config");
const content = require("../lib/readathon-content");
const crypto = require("node:crypto");
const Gifts = require("../lib/readathon-gifts");
const Readathon = require("../lib/readathon");
const {Router} = require("express");
const Stripe = require("stripe");

const MOUNTS = config.get("app.mounts");
const SETTINGS = config.get("readathon");
const BASE = `/${MOUNTS.readathon}`;
const CAMPAIGN = "2027-01-readathon";

let stripe;
function get_stripe() {
    // Created lazily so tests and the demo can load this file without keys
    stripe ??= Stripe(config.get("stripe.secret_key"));
    return stripe;
}

function fake_payments() {
    return !!SETTINGS.fake_payments;
}

function site_origin(req) {
    return `${req.protocol}://${req.get("host")}`;
}

function reader_summary(sqlite, reader) {
    const stats = Readathon.stats(Readathon.list_entries(sqlite, reader.reader_id), Readathon.today());
    return {
        name: reader.name,
        color: reader.color,
        initial: reader.name.charAt(0).toUpperCase(),
        minutes: stats.total,
        books: stats.books,
        books_plural: stats.books !== 1,
        days: stats.days_read,
    };
}

function create(sqlite, {page, own}) {
    const router = Router();

    function fundraising() {
        return Gifts.totals(sqlite, Readathon.community(sqlite).minutes);
    }

    function show_form(req, res, reader, form = {}, errors = []) {
        const amount = String(form.amount ?? Gifts.SUGGESTED_USD[1]);
        const cheers = reader ? Gifts.reader_cheers(sqlite, reader.reader_id) : null;
        page(res, "gift", {
            title: reader ? `Cheer on ${reader.name}` : "Give to the read-a-thon",
            errors,
            form,
            reader: reader ? reader_summary(sqlite, reader) : null,
            action: reader ? `${BASE}/cheer/${reader.cheer_code}` : `${BASE}/give`,
            cheers: cheers ? {...cheers, recent: cheers.cheers.slice(0, 4)} : null,
            fundraising: fundraising(),
            purpose: content.FUNDRAISING_PURPOSE,
            amounts: Gifts.SUGGESTED_USD.map(n => ({n, checked: String(n) === amount})),
            other_checked: amount === "other",
            minimum_usd: Gifts.MIN_USD,
            fake_payments: fake_payments(),
            stripe_publishable_key: config.get("stripe.publishable_key"),
            og: {
                title: reader ? `Cheer on ${reader.name} in the Fiske Free Library Read-a-thon` : "Give to the Fiske Free Library Read-a-thon",
                description: `Every gift supports ${content.FUNDRAISING_PURPOSE}.`,
                url: `${site_origin(req)}${req.originalUrl}`,
            },
        });
    }

    // Keep what they typed (never card details) so they don't start over
    function form_from(body) {
        return {
            amount: Readathon.clean(body.amount),
            amount_other: Readathon.clean(body.amount_other),
            display_name: Readathon.clean(body.display_name, 60),
            message: Readathon.clean(body.message, 200),
            anonymous: !!body.anonymous,
            hide_amount: !!body.hide_amount,
            first_name: Readathon.clean(body.first_name, 100),
            last_name: Readathon.clean(body.last_name, 100),
            email: Readathon.clean(body.email, 200),
        };
    }

    async function process_gift(req, res, reader) {
        const {errors, gift} = Gifts.parse_gift(req.body, !fake_payments());
        if(errors.length > 0) {
            res.status(400);
            return show_form(req, res, reader, form_from(req.body), errors);
        }

        let payment_intent_id;
        if(fake_payments()) {
            payment_intent_id = `demo_${crypto.randomBytes(8).toString("hex")}`;
        }
        else {
            try {
                const payment_intent = await get_stripe().paymentIntents.create({
                    amount: gift.amount_cents,
                    currency: "usd",
                    payment_method: gift.payment_method_id,
                    confirm: true,
                    description: reader
                        ? `Read-a-thon: cheer for ${reader.name}`
                        : "Read-a-thon: community gift",
                    receipt_email: gift.email,
                    automatic_payment_methods: {enabled: true, allow_redirects: "never"},
                    metadata: {
                        campaign: CAMPAIGN,
                        kind: reader ? "cheer" : "community",
                        reader_id: reader ? String(reader.reader_id) : "",
                        reader_name: reader ? reader.name : "",
                        first_name: gift.first_name,
                        last_name: gift.last_name,
                        email: gift.email,
                    },
                });
                if(payment_intent.status !== "succeeded") {
                    console.log({event: "Readathon.PAYMENT_NOT_SUCCEEDED", payment_intent_id: payment_intent.id, status: payment_intent.status});
                    res.status(400);
                    return show_form(req, res, reader, form_from(req.body), [
                        "Your payment could not be completed. You have not been charged. Please try again or use a different card.",
                    ]);
                }
                payment_intent_id = payment_intent.id;
            }
            catch(err) {
                console.log({event: "Readathon.PAYMENT_ERROR", type: err.type, message: err.message});
                let message = "Something went wrong while processing your payment. You have not been charged. Please try again.";
                if(err.type === "StripeCardError") {
                    message = `Your card was declined: ${err.message}`;
                }
                else if(err.type === "StripeAPIError" || err.type === "StripeConnectionError") {
                    message = "We're having trouble reaching our payment processor. Please try again in a few moments.";
                }
                res.status(400);
                return show_form(req, res, reader, form_from(req.body), [message]);
            }
        }

        Gifts.record_gift(sqlite, reader?.reader_id, gift, payment_intent_id, fake_payments());
        console.log({event: "Readathon.GIFT", reader_id: reader?.reader_id ?? null, amount_cents: gift.amount_cents, demo: fake_payments()});
        req.session.readathon_gift = {
            to: reader ? reader.name : null,
            amount: Gifts.format_cents(gift.amount_cents),
            confirmation: payment_intent_id,
            is_demo: fake_payments(),
            again: reader ? `${BASE}/cheer/${reader.cheer_code}` : `${BASE}/give`,
            time: Date.now(),
        };
        res.redirect(`${BASE}/give/thanks`);
    }

    function by_code(req, res, next) {
        const reader = Gifts.reader_by_cheer_code(sqlite, req.params.code);
        if(reader === null) {
            return res.redirect(`${BASE}/give`);
        }
        res.locals.cheer_reader = reader;
        next();
    }

    const safely = handler => async (req, res, next) => {
        try {
            await handler(req, res);
        }
        catch(err) {
            next(err);
        }
    };

    router.get("/give", safely((req, res) => show_form(req, res, null)));
    router.post("/give", safely((req, res) => process_gift(req, res, null)));
    router.get("/cheer/:code", by_code, safely((req, res) => show_form(req, res, res.locals.cheer_reader)));
    router.post("/cheer/:code", by_code, safely((req, res) => process_gift(req, res, res.locals.cheer_reader)));

    router.get("/give/thanks", (req, res) => {
        const gift = req.session.readathon_gift;
        if(!gift) {
            return res.redirect(`${BASE}/give`);
        }
        page(res, "gift-thanks", {
            title: "Thank you!",
            gift: {...gift, time: new Date(gift.time)},
            purpose: content.FUNDRAISING_PURPOSE,
        });
    });

    router.get("/r/:reader_id/cheers", own, safely((req, res) => {
        const {reader} = res.locals;
        const code = Gifts.cheer_code(sqlite, reader);
        page(res, "cheers", {
            title: "My cheers",
            nav: "me",
            share_url: `${site_origin(req)}${BASE}/cheer/${code}`,
            cheer_path: `${BASE}/cheer/${code}`,
            cheers: Gifts.reader_cheers(sqlite, reader.reader_id),
            purpose: content.FUNDRAISING_PURPOSE,
        });
    }));

    return router;
}

exports.create = create;
