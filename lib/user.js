const bcrypt = require("bcrypt");
const config = require("config");

const SALT_ROUNDS = config.get("app.salt_rounds");

function save(
    sqlite,
    {
        first_name,
        last_name,
        email,
        password_hash,
    },
) {

    const statement = sqlite.prepare(
        `INSERT INTO users (first_name, last_name, email, password_hash)
         VALUES (:first_name, :last_name, :email, :password_hash)`
    );
    statement.run({
        first_name,
        last_name,
        email,
        password_hash,
    });    
}
    
function get(sqlite, email) {
    const statement = sqlite.prepare(
        `SELECT first_name, last_name, email, password_hash FROM users
         WHERE email = :email`,
    );
    const rows = statement.all({email});
    return rows[0] ?? {};
}

async function create({email, first_name, last_name, password}) {
    const password_hash = await digest_password(password);
    return {email, first_name, last_name, password_hash};
}

async function digest_password(password) {
    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    return password_hash;
}

async function validate_password(password, password_hash) {
    const equals = await bcrypt.compare(password, password_hash);
    return equals;
}

async function authenticate(sqlite, email, password) {
    const user = get(sqlite, email);
    const authenticated = await validate_password(password, user.password_hash);
    if(authenticated) {
        return user;
    }
    throw new Error("Unable to authenaticate");
}

exports.authenticate = authenticate;
exports.create = create;
exports.digest_password = digest_password;
exports.get = get;
exports.save = save;
exports.validate_password = validate_password;
