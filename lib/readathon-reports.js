// "Report a problem": short notes about something that went wrong, with the page they came from.
// Volunteers see open reports on the desk and mark them done.
function clean(value, max_length) {
    return String(value ?? "").trim().replace(/[ \t]+/g, " ").slice(0, max_length);
}

// Only keep paths on this site, like /readathon/r/3/log, never a full address somewhere else
function clean_page(value) {
    const page = clean(value, 300);
    return /^\/[^/\\]/.test(page) || page === "/" ? page : null;
}

function parse_report(body) {
    const message = clean(body.message, 2000);
    return {
        errors: message === "" ? ["Tell us what happened, even just a few words."] : [],
        report: {
            message,
            page: clean_page(body.from),
            contact: clean(body.contact, 200) || null,
        },
    };
}

function create_report(sqlite, report, household_id = null, device = null, now_ms = Date.now()) {
    sqlite.prepare(
        `INSERT INTO readathon_reports (household_id, page, message, contact, device, created_ms)
         VALUES (:household_id, :page, :message, :contact, :device, :created_ms)`,
    ).run({
        household_id: household_id ?? null,
        page: report.page ?? null,
        message: report.message,
        contact: report.contact ?? null,
        device: clean(device, 300) || null,
        created_ms: now_ms,
    });
}

function list_open(sqlite) {
    return sqlite.prepare(
        `SELECT r.*, h.email AS household_email FROM readathon_reports r
         LEFT JOIN readathon_households h ON h.household_id = r.household_id
         WHERE r.resolved_ms IS NULL ORDER BY r.created_ms DESC`,
    ).all();
}

function resolve(sqlite, report_id, now_ms = Date.now()) {
    sqlite.prepare("UPDATE readathon_reports SET resolved_ms = :now_ms WHERE report_id = :report_id AND resolved_ms IS NULL")
        .run({report_id, now_ms});
}

exports.clean_page = clean_page;
exports.create_report = create_report;
exports.list_open = list_open;
exports.parse_report = parse_report;
exports.resolve = resolve;
