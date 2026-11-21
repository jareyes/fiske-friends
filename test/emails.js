const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const nodemailer = require("nodemailer");
const Emails = require("../lib/readathon-emails");
const Mailer = require("../lib/mailer");
const Readathon = require("../lib/readathon");
const Token = require("../lib/token");
const {DatabaseSync} = require("node:sqlite");
const {seed_events} = require("../bin/seed-readathon-events");
const {after, suite, test} = require("node:test");

function database() {
    const sqlite = new DatabaseSync(":memory:");
    const dirpath = path.join(__dirname, "..", "migrations");
    for(const file of fs.readdirSync(dirpath).filter(f => f.endsWith(".sql")).sort()) {
        sqlite.exec(fs.readFileSync(path.join(dirpath, file), "utf8"));
    }
    // The read-a-thon's sample events aren't a migration; the demo loads them the same way
    seed_events(sqlite);
    return sqlite;
}

after(() => Mailer.set_transport(undefined));

suite("lib/readathon-emails.js", () => {
    test("names read naturally", () => {
        assert.strictEqual(Emails.names([]), "");
        assert.strictEqual(Emails.names(["Katie"]), "Katie");
        assert.strictEqual(Emails.names(["Katie", "Sam"]), "Katie and Sam");
        assert.strictEqual(Emails.names(["Katie", "Sam", "Rose"]), "Katie, Sam and Rose");
    });

    test("the sign-in email has the link in both versions, and escapes names only in HTML", async () => {
        const link = "https://example.org/readathon/sign-in/abc";
        const message = await Emails.sign_in({link, reader_names: ["Tom & Jerry", "<b>Bo</b>"]});
        assert.strictEqual(message.subject, "Your Resolve to Read sign-in link");
        assert.match(message.html, /href="https:\/\/example.org\/readathon\/sign-in\/abc"/);
        assert.match(message.html, /Tom &amp; Jerry and &lt;b&gt;Bo&lt;\/b&gt;/);
        assert.match(message.text, /log reading for Tom & Jerry and <b>Bo<\/b>:\n\nhttps:\/\/example.org\/readathon\/sign-in\/abc\n/);
        assert.doesNotMatch(message.text, /\n\n\n/);
    });

    test("the welcome email changes before and during January, and mentions updates only if asked", async () => {
        const details = {link: "https://x/l", readers: [{name: "Katie", goal_minutes: 600}], wants_updates: false};
        const before = await Emails.welcome({...details, phase: "before"});
        const during = await Emails.welcome({...details, phase: "during", wants_updates: true});
        assert.match(before.text, /- Katie: 10 hours/);
        assert.match(before.text, /Reading starts Friday, January 1/);
        assert.match(before.text, /Get ready: https:\/\/x\/l/);
        assert.doesNotMatch(before.text, /each week/);
        assert.match(during.text, /Open my reading: https:\/\/x\/l/);
        assert.match(during.text, /each week in January/);
        assert.match(before.html, /with a goal for January:/);
        assert.match(before.html, />10 hours<\/td>/);
    });

    test("every preview renders", async () => {
        for(const item of Emails.preview_list()) {
            for(const variant of item.variants) {
                const {message} = await Emails.preview(item.id, variant.id);
                assert.ok(message.subject && message.html.includes("</html>") && message.text.length > 100, `${item.id}/${variant.id}`);
            }
        }
        assert.strictEqual(await Emails.preview("nope"), null);
    });

    test("emails for a real household go to its address with a working sign-in link", async () => {
        const sqlite = database();
        const id = Readathon.create_household(sqlite, {
            email: "family@example.org", city: "Claremont", state: "NH", wants_updates: 1, source: "online",
            readers: [{name: "Katie", age_group: "kid", birth_year: 2017, goal_minutes: 600}],
        });
        const household = Readathon.get_household(sqlite, id);
        const signin = await Emails.sign_in_for(sqlite, household);
        assert.deepStrictEqual([signin.to, signin.kind, signin.household_id], ["family@example.org", "sign-in", id]);
        const token = signin.text.match(/\/sign-in\/(\S+)/)[1];
        assert.deepStrictEqual(Token.validate(token)[0], `readathon:${id}`);
        const welcome = await Emails.welcome_for(sqlite, household, "2026-12-01");
        assert.strictEqual(welcome.kind, "welcome");
        assert.match(welcome.text, /Kickoff open house/);
    });
});

suite("password reset email", () => {
    test("comes from the Friends, in the Friends' look, with a link that resets the password once", async () => {
        const User = require("../lib/user");
        const sqlite = database();
        const user = User.create(sqlite, {first_name: "Pat", last_name: "Lee", email: "pat@example.org", password_hash: await User.hash_password("bookworm1")});
        const message = await Emails.password_reset_for(user);
        assert.deepStrictEqual([message.to, message.kind, message.from_name], ["pat@example.org", "password-reset", "Friends of the Fiske Free Library"]);
        assert.match(message.html, /#004d99/);
        assert.doesNotMatch(message.html, /Resolve to Read/);
        assert.match(message.text, /^FRIENDS OF THE FISKE FREE LIBRARY\n/);
        assert.match(message.text, /Hi Pat,/);
        const token = message.text.match(/\/auth\/reset\/(\S+)/)[1];
        assert.strictEqual(User.user_from_reset_token(sqlite, token).user_id, user.user_id);
    });

    test("the sender's name can change while the address stays the same", () => {
        assert.strictEqual(Mailer.from_with_name("Friends of the Fiske Free Library", "Resolve to Read <readathon@example.org>"),
            '"Friends of the Fiske Free Library" <readathon@example.org>');
        assert.strictEqual(Mailer.from_with_name(null, "Resolve to Read <readathon@example.org>"), "Resolve to Read <readathon@example.org>");
        assert.strictEqual(Mailer.from_with_name("A \"B\"", "c@example.org"), '"A B" <c@example.org>');
    });
});

suite("lib/mailer.js", () => {
    const message = {to: "a@example.org", subject: "Hi", html: "<p>Hi</p>", text: "Hi\n", kind: "sign-in", household_id: 7};

    test("without SMTP, emails wait in the outbox with their bodies", async () => {
        const sqlite = database();
        Mailer.set_transport(null);
        const result = await Mailer.send(sqlite, message);
        assert.strictEqual(result.status, "outbox");
        const saved = Mailer.get(sqlite, result.email_id);
        assert.deepStrictEqual([saved.status, saved.html, saved.text, saved.household_id], ["outbox", "<p>Hi</p>", "Hi\n", 7]);
        assert.strictEqual(Mailer.status().live, false);
    });

    test("with SMTP, emails are sent as HTML and plain text, and bodies aren't kept", async () => {
        const sqlite = database();
        const transport = nodemailer.createTransport({jsonTransport: true});
        let built;
        const send = transport.sendMail.bind(transport);
        transport.sendMail = async options => {
            built = await send(options);
            return built;
        };
        Mailer.set_transport(transport);
        const result = await Mailer.send(sqlite, message);
        assert.strictEqual(result.status, "sent");
        const sent = JSON.parse(built.message);
        assert.deepStrictEqual([sent.to[0].address, sent.subject, sent.html, sent.text], ["a@example.org", "Hi", "<p>Hi</p>", "Hi\n"]);
        assert.match(sent.from.address, /@/);
        const saved = Mailer.get(sqlite, result.email_id);
        assert.deepStrictEqual([saved.status, saved.html, saved.has_body], ["sent", null, false]);
        assert.ok(saved.sent instanceof Date);
    });

    test("a failed send is logged with the reason, and doesn't throw", async () => {
        const sqlite = database();
        Mailer.set_transport({sendMail: async () => { throw new Error("535 Authentication failed"); }});
        const result = await Mailer.send(sqlite, message);
        assert.deepStrictEqual([result.status, result.error], ["failed", "535 Authentication failed"]);
        assert.strictEqual(Mailer.list_recent(sqlite)[0].error, "535 Authentication failed");
    });

    test("no SMTP host means no transport", () => {
        assert.strictEqual(Mailer.settings_transport({smtp: {host: null}}), null);
        assert.ok(Mailer.settings_transport({smtp: {host: "smtp.example.org", port: 465, user: "u", pass: "p"}}));
    });
});

suite("lib/mailer.js settings check", () => {
    test("says which SMTP setting is missing, without showing the password", () => {
        assert.strictEqual(Mailer.settings_problem({smtp: {host: null}}), null);
        assert.strictEqual(Mailer.settings_problem({smtp: {host: "smtp.example.org", port: 587, user: "u", pass: "secret"}}), null);
        assert.match(Mailer.settings_problem({smtp: {host: "smtp.example.org", port: 587, user: "u", pass: ""}}), /SMTP_PASS is empty or missing/);
        assert.match(Mailer.settings_problem({smtp: {host: "smtp.example.org", port: 587, user: "u"}}), /SMTP_PASS/);
        assert.match(Mailer.settings_problem({smtp: {host: "smtp.example.org", port: "587   # note", user: "u", pass: "p"}}), /SMTP_PORT should be a number/);
        assert.doesNotMatch(Mailer.settings_problem({smtp: {host: "h", port: 587, user: "u", pass: ""}}), /secret/);
    });
});
