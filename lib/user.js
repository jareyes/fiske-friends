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
    return rows[0] ?? null;
}

exports.get = get;
exports.save = save;
