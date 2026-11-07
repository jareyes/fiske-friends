// Read-a-thon teams: making them, joining them, and how close they are to their goal.
const config = require("config");
const crypto = require("node:crypto");

const SETTINGS = config.get("readathon");

const GOAL_HOURS = [10, 25, 50, 100];
const MIN_NAME = 3;
const MAX_NAME = 40;

function clean(value, max_length = 200) {
    return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max_length);
}

function as_ids(value) {
    const list = Array.isArray(value) ? value : (value === undefined ? [] : [value]);
    return [...new Set(list.map(v => Number.parseInt(v, 10)).filter(Number.isInteger))];
}

function hours_number(minutes) {
    return (Math.round(minutes / 6) / 10).toLocaleString("en-US");
}

function hours_label(minutes) {
    const hours = Math.round(minutes / 6) / 10;
    return `${hours.toLocaleString("en-US")} ${hours === 1 ? "hour" : "hours"}`;
}

// allowed_reader_ids are the readers in the signed-in household
function parse_team(body, allowed_reader_ids) {
    const errors = [];
    const name = clean(body.name, MAX_NAME);
    if(name.length < MIN_NAME) {
        errors.push("Give your team a name, at least 3 letters.");
    }
    const hours = Number.parseInt(body.goal_hours, 10);
    if(!GOAL_HOURS.includes(hours)) {
        errors.push("Pick a team goal.");
    }
    const reader_ids = as_ids(body.reader_ids).filter(id => allowed_reader_ids.includes(id));
    if(reader_ids.length === 0) {
        errors.push("Pick who from your household is on the team.");
    }
    return {
        errors,
        team: {
            name,
            goal_minutes: (GOAL_HOURS.includes(hours) ? hours : 25) * 60,
            is_open: body.is_open === "1" ? 1 : 0,
        },
        reader_ids,
    };
}

function chosen_readers(body, allowed_reader_ids) {
    return as_ids(body.reader_ids).filter(id => allowed_reader_ids.includes(id));
}

function create_team(sqlite, team, reader_ids, now_ms = Date.now()) {
    const code = crypto.randomBytes(6).toString("base64url");
    sqlite.exec("BEGIN");
    try {
        const {lastInsertRowid} = sqlite.prepare(
            `INSERT INTO readathon_teams (name, goal_minutes, code, is_open, created_by_reader_id, created_ms)
             VALUES (:name, :goal_minutes, :code, :is_open, :created_by, :created_ms)`,
        ).run({
            name: team.name,
            goal_minutes: team.goal_minutes,
            code,
            is_open: team.is_open ?? 0,
            created_by: reader_ids[0] ?? null,
            created_ms: now_ms,
        });
        join(sqlite, Number(lastInsertRowid), reader_ids);
        sqlite.exec("COMMIT");
        return code;
    }
    catch(err) {
        sqlite.exec("ROLLBACK");
        throw err;
    }
}

function get_by_code(sqlite, code) {
    if(!/^[A-Za-z0-9_-]{6,16}$/.test(String(code ?? ""))) {
        return null;
    }
    return sqlite.prepare("SELECT * FROM readathon_teams WHERE code = :code").get({code}) ?? null;
}

function get_team(sqlite, team_id) {
    if(team_id === null || team_id === undefined) {
        return null;
    }
    return sqlite.prepare("SELECT * FROM readathon_teams WHERE team_id = :team_id").get({team_id}) ?? null;
}

// Joining moves a reader off any team they were on before
function join(sqlite, team_id, reader_ids) {
    const update = sqlite.prepare("UPDATE readathon_readers SET team_id = :team_id WHERE reader_id = :reader_id");
    for(const reader_id of reader_ids) {
        update.run({team_id, reader_id});
    }
}

function leave(sqlite, reader_id) {
    sqlite.prepare("UPDATE readathon_readers SET team_id = NULL WHERE reader_id = :reader_id").run({reader_id});
}

function set_hidden(sqlite, team_id, hidden) {
    sqlite.prepare("UPDATE readathon_teams SET is_hidden = :hidden WHERE team_id = :team_id")
        .run({team_id, hidden: hidden ? 1 : 0});
}

// The team's total, its members' parts, and who has read today
function progress(sqlite, team, today, settings = SETTINGS) {
    const members = sqlite.prepare(
        `SELECT r.reader_id, r.name, r.color, r.household_id,
                COALESCE(SUM(CASE WHEN e.day BETWEEN :starts AND :ends THEN e.minutes END), 0) AS minutes,
                COALESCE(SUM(CASE WHEN e.day = :today THEN e.minutes END), 0) AS today_minutes
         FROM readathon_readers r
         LEFT JOIN readathon_entries e ON e.reader_id = r.reader_id
         WHERE r.team_id = :team_id
         GROUP BY r.reader_id
         ORDER BY r.name COLLATE NOCASE`,
    ).all({team_id: team.team_id, starts: settings.starts, ends: settings.ends, today});
    const total = members.reduce((sum, m) => sum + m.minutes, 0);
    return {
        ...team,
        total,
        total_label: hours_label(total),
        total_hours: hours_number(total),
        goal_label: hours_label(team.goal_minutes),
        percent: Math.min(100, Math.round(total / team.goal_minutes * 100)),
        reached: total >= team.goal_minutes,
        to_go_label: hours_label(Math.max(0, team.goal_minutes - total)),
        member_count: members.length,
        read_today: members.filter(m => m.today_minutes > 0).length,
        members: members.map(m => ({
            ...m,
            initial: m.name.charAt(0).toUpperCase(),
            share: total > 0 ? Math.round(m.minutes / total * 100) : 0,
            read_today: m.today_minutes > 0,
        })),
    };
}

// Teams anyone can see on the teams page, closest to their goal first
function list_public(sqlite, settings = SETTINGS) {
    const rows = sqlite.prepare(
        `SELECT t.*, COUNT(DISTINCT r.reader_id) AS member_count,
                COALESCE((SELECT SUM(e.minutes) FROM readathon_entries e
                          JOIN readathon_readers r2 ON r2.reader_id = e.reader_id
                          WHERE r2.team_id = t.team_id AND e.day BETWEEN :starts AND :ends), 0) AS total
         FROM readathon_teams t
         LEFT JOIN readathon_readers r ON r.team_id = t.team_id
         WHERE t.is_hidden = 0
         GROUP BY t.team_id
         HAVING member_count > 0`,
    ).all({starts: settings.starts, ends: settings.ends});
    return rows.map(row => ({
        ...row,
        total_label: hours_label(row.total),
        total_hours: hours_number(row.total),
        goal_label: hours_label(row.goal_minutes),
        percent: Math.min(100, Math.round(row.total / row.goal_minutes * 100)),
        reached: row.total >= row.goal_minutes,
    })).sort((a, b) => b.percent - a.percent || b.total - a.total);
}

function list_all(sqlite) {
    return sqlite.prepare(
        `SELECT t.*, COUNT(r.reader_id) AS member_count FROM readathon_teams t
         LEFT JOIN readathon_readers r ON r.team_id = t.team_id
         GROUP BY t.team_id ORDER BY t.created_ms DESC`,
    ).all();
}

exports.GOAL_HOURS = GOAL_HOURS;
exports.chosen_readers = chosen_readers;
exports.create_team = create_team;
exports.get_by_code = get_by_code;
exports.get_team = get_team;
exports.hours_label = hours_label;
exports.join = join;
exports.leave = leave;
exports.list_all = list_all;
exports.list_public = list_public;
exports.parse_team = parse_team;
exports.progress = progress;
exports.set_hidden = set_hidden;
