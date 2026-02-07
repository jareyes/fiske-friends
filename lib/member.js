
function create(
    sqlite,
    {
        first_name,
        last_name,
        email,
        address_line1,
        address_line2,
        city,
        state,
        zipcode,
        telephone,
        joined_date,
        now_ms=Date.now()
    },
) {
    const statement = sqlite.prepare(
        `INSERT INTO members (
           first_name,
           last_name,
           email,
           address_line1,
           address_line2,
           city,
           state,
           zipcode,
           telephone,
           joined_ms,
           updated_ms
        ) VALUES (
           :first_name,
           :last_name,
           :email,
           :address_line1,
           :address_line2,
           :city,
           :state,
           :zipcode,
           :telephone,
           :joined_ms,
           :now_ms
       )`,
    );
    const joined_ms = joined_date.getTime();
    statement.run({
        first_name,
        last_name,
        email,
        address_line1,
        address_line2,
        city,
        state,
        zipcode,
        telephone,
        joined_ms, 
        now_ms,
    });
}

function get_page(sqlite, page_length, page_number) {
    const offset = page_length * (page_number - 1);
    const select_statement = sqlite.prepare(
        `SELECT * FROM members
         ORDER BY
            last_name ASC,
            first_name ASC
         LIMIT :limit OFFSET :offset`
    );

    const members = select_statement.all({
        limit: page_length,
        offset,
    });

    const count_statement = sqlite.prepare("SELECT COUNT(*) AS total FROM members");
    const {total: total_members} = count_statement.get();
    const total_pages = Math.ceil(total / page_length);
    return {
        members,
        current_page: page_number,
        total_pages,
        page_length,
        total_members,
    };        
}

exports.get_page = get_page;
exports.save = save;
