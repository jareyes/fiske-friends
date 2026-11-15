// Read-a-thon teams: making them, joining them, and how close they are to their goal.
const config = require("config");
const crypto = require("node:crypto");

const SETTINGS = config.get("readathon");

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
    const reader_ids = as_ids(body.reader_ids).filter(id => allowed_reader_ids.includes(id));
    if(reader_ids.length === 0) {
        errors.push("Pick who from your household is on the team.");
    }
    return {
        errors,
        team: {
            name,
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
            `INSERT INTO readathon_teams (name, code, is_open, created_by_reader_id, created_ms)
             VALUES (:name, :code, :is_open, :created_by, :created_ms)`,
        ).run({
            name: team.name,
            code,
            is_open: team.is_open ?? 0,
            created_by: reader_ids[0] ?? null,
            created_ms: now_ms,
        });
        join(sqlite, Number(lastInsertRowid), reader_ids, now_ms);
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

// Readers can be on any number of teams. Rejoining a team you left keeps any raffle entry you earned there.
function join(sqlite, team_id, reader_ids, now_ms = Date.now()) {
    const insert = sqlite.prepare(
        `INSERT INTO readathon_team_members (team_id, reader_id, joined_ms) VALUES (:team_id, :reader_id, :now_ms)
         ON CONFLICT (team_id, reader_id) DO UPDATE SET left_ms = NULL`,
    );
    for(const reader_id of reader_ids) {
        insert.run({team_id, reader_id, now_ms});
    }
}

function leave(sqlite, team_id, reader_id, now_ms = Date.now()) {
    sqlite.prepare(
        `UPDATE readathon_team_members SET left_ms = :now_ms
         WHERE team_id = :team_id AND reader_id = :reader_id AND left_ms IS NULL`,
    ).run({team_id, reader_id, now_ms});
}

// The teams a reader is on now
function team_ids_for_reader(sqlite, reader_id) {
    return sqlite.prepare(
        "SELECT team_id FROM readathon_team_members WHERE reader_id = :reader_id AND left_ms IS NULL ORDER BY joined_ms",
    ).all({reader_id}).map(row => row.team_id);
}

function set_hidden(sqlite, team_id, hidden) {
    sqlite.prepare("UPDATE readathon_teams SET is_hidden = :hidden WHERE team_id = :team_id")
        .run({team_id, hidden: hidden ? 1 : 0});
}

function member_rows(sqlite, team_id, today, settings) {
    return sqlite.prepare(
        `SELECT r.reader_id, r.name, r.color, r.household_id, r.goal_minutes, m.entry_ms,
                COALESCE(SUM(CASE WHEN e.day BETWEEN :starts AND :ends THEN e.minutes END), 0) AS minutes,
                COALESCE(SUM(CASE WHEN e.day = :today THEN e.minutes END), 0) AS today_minutes
         FROM readathon_team_members m
         JOIN readathon_readers r ON r.reader_id = m.reader_id
         LEFT JOIN readathon_entries e ON e.reader_id = r.reader_id
         WHERE m.team_id = :team_id AND m.left_ms IS NULL
         GROUP BY r.reader_id
         ORDER BY r.name COLLATE NOCASE`,
    ).all({team_id, starts: settings.starts, ends: settings.ends, today: today ?? ""});
}

// The team's total, its goal (everyone's goals added up), its members' parts, and who has read today
function progress(sqlite, team, today = null, settings = SETTINGS) {
    const members = member_rows(sqlite, team.team_id, today, settings);
    const total = members.reduce((sum, m) => sum + m.minutes, 0);
    const goal = members.reduce((sum, m) => sum + m.goal_minutes, 0);
    const reached = goal > 0 && total >= goal;
    return {
        ...team,
        total,
        goal_minutes: goal,
        total_label: hours_label(total),
        total_hours: hours_number(total),
        goal_label: hours_label(goal),
        percent: goal > 0 ? Math.min(100, Math.round(total / goal * 100)) : 0,
        reached,
        // Reached before, but new teammates have made the goal bigger since
        reached_before: !reached && team.reached_ms !== null && team.reached_ms !== undefined,
        to_go_label: hours_label(Math.max(0, goal - total)),
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

// When a team reaches its goal, everyone on it earns a raffle entry, and keeps it.
// Someone who joins later earns theirs when the team reaches its new, bigger goal.
// Returns the reader ids that just earned an entry.
function check_goal(sqlite, team_id, now_ms = Date.now(), settings = SETTINGS) {
    const team = get_team(sqlite, team_id);
    if(team === null) {
        return [];
    }
    const members = member_rows(sqlite, team_id, null, settings);
    const total = members.reduce((sum, m) => sum + m.minutes, 0);
    const goal = members.reduce((sum, m) => sum + m.goal_minutes, 0);
    if(goal === 0 || total < goal) {
        return [];
    }
    if(team.reached_ms === null) {
        sqlite.prepare("UPDATE readathon_teams SET reached_ms = :now_ms WHERE team_id = :team_id").run({team_id, now_ms});
    }
    const earning = members.filter(m => m.entry_ms === null).map(m => m.reader_id);
    const award = sqlite.prepare(
        "UPDATE readathon_team_members SET entry_ms = :now_ms WHERE team_id = :team_id AND reader_id = :reader_id",
    );
    earning.forEach(reader_id => award.run({team_id, reader_id, now_ms}));
    return earning;
}

// Teams a reader is on, with their progress
function for_reader(sqlite, reader_id, today, settings = SETTINGS) {
    return team_ids_for_reader(sqlite, reader_id).map(team_id => progress(sqlite, get_team(sqlite, team_id), today, settings));
}

// Teams anyone can see on the teams page, closest to their goal first
function list_public(sqlite, settings = SETTINGS) {
    return sqlite.prepare("SELECT * FROM readathon_teams WHERE is_hidden = 0").all()
        .map(team => progress(sqlite, team, null, settings))
        .filter(team => team.member_count > 0)
        .sort((a, b) => b.percent - a.percent || b.total - a.total);
}

function list_all(sqlite) {
    return sqlite.prepare(
        `SELECT t.*, COUNT(m.reader_id) AS member_count FROM readathon_teams t
         LEFT JOIN readathon_team_members m ON m.team_id = t.team_id AND m.left_ms IS NULL
         GROUP BY t.team_id ORDER BY t.created_ms DESC`,
    ).all();
}

exports.check_goal = check_goal;
exports.chosen_readers = chosen_readers;
exports.create_team = create_team;
exports.for_reader = for_reader;
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
exports.team_ids_for_reader = team_ids_for_reader;
