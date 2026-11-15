// Read-a-thon prizes.
//
// - Any bingo: an enamel pin, picked up at the library desk
// - A full bingo card: a tote bag, picked up at the library desk
// - Reaching your own January goal: one entry in the grand prize raffle
// - Each team you're on that reaches its team goal: one more raffle entry
//
// Raffle entries are kept once earned, even if a goal changes or someone leaves a team later.
const Readathon = require("./readathon");
const Teams = require("./readathon-teams");

const PRIZES = ["pin", "tote"];

// Award any raffle entries this reader has just earned. Call after their minutes, goal or teams change.
// Returns what they just earned: {goal: true/false, teams: [team names]}
function update_awards(sqlite, reader_id, now_ms = Date.now()) {
    const reader = Readathon.get_reader(sqlite, reader_id);
    const earned = {goal: false, teams: []};
    if(reader === null) {
        return earned;
    }
    if(reader.goal_reached_ms === null) {
        const {total} = Readathon.stats(Readathon.list_entries(sqlite, reader_id), Readathon.today(now_ms));
        if(total >= reader.goal_minutes) {
            sqlite.prepare("UPDATE readathon_readers SET goal_reached_ms = :now_ms WHERE reader_id = :reader_id")
                .run({reader_id, now_ms});
            earned.goal = true;
        }
    }
    for(const team_id of Teams.team_ids_for_reader(sqlite, reader_id)) {
        if(Teams.check_goal(sqlite, team_id, now_ms).includes(reader_id)) {
            earned.teams.push(Teams.get_team(sqlite, team_id).name);
        }
    }
    return earned;
}

// Check a team after someone joins or leaves (that changes its goal)
function update_team_awards(sqlite, team_id, now_ms = Date.now()) {
    Teams.check_goal(sqlite, team_id, now_ms);
}

// Check everyone, for example after loading sample data
function update_all_awards(sqlite, now_ms = Date.now()) {
    for(const {reader_id} of sqlite.prepare("SELECT reader_id FROM readathon_readers").all()) {
        update_awards(sqlite, reader_id, now_ms);
    }
}

// A reader's raffle entries and why they earned each one
function raffle(sqlite, reader_id) {
    const reader = Readathon.get_reader(sqlite, reader_id);
    const teams = sqlite.prepare(
        `SELECT t.name FROM readathon_team_members m JOIN readathon_teams t ON t.team_id = m.team_id
         WHERE m.reader_id = :reader_id AND m.entry_ms IS NOT NULL ORDER BY m.entry_ms`,
    ).all({reader_id}).map(row => row.name);
    const reasons = [];
    if(reader?.goal_reached_ms) {
        reasons.push("Reached your goal");
    }
    teams.forEach(name => reasons.push(`${name} reached its team goal`));
    return {count: reasons.length, plural: reasons.length !== 1, reasons};
}

function list_pickups(sqlite, reader_id) {
    return sqlite.prepare("SELECT prize FROM readathon_prize_pickups WHERE reader_id = :reader_id")
        .all({reader_id}).map(row => row.prize);
}

function set_pickup(sqlite, reader_id, prize, picked_up, now_ms = Date.now()) {
    if(!PRIZES.includes(prize)) {
        return false;
    }
    if(picked_up) {
        sqlite.prepare(
            "INSERT OR IGNORE INTO readathon_prize_pickups (reader_id, prize, created_ms) VALUES (:reader_id, :prize, :now_ms)",
        ).run({reader_id, prize, now_ms});
    }
    else {
        sqlite.prepare("DELETE FROM readathon_prize_pickups WHERE reader_id = :reader_id AND prize = :prize")
            .run({reader_id, prize});
    }
    return true;
}

// Pin and tote bag: earned on the online bingo card, and whether they've been picked up
function bingo_prizes(board, pickups) {
    return {
        pin: {earned: board.bingos > 0, picked_up: pickups.includes("pin")},
        tote: {earned: board.blackout, picked_up: pickups.includes("tote")},
    };
}

exports.PRIZES = PRIZES;
exports.bingo_prizes = bingo_prizes;
exports.list_pickups = list_pickups;
exports.raffle = raffle;
exports.set_pickup = set_pickup;
exports.update_all_awards = update_all_awards;
exports.update_awards = update_awards;
exports.update_team_awards = update_team_awards;
