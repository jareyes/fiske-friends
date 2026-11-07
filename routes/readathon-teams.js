// Read-a-thon teams. Mounted inside routes/readathon.js.
//
//   /readathon/teams             every team and how close it is to its goal
//   /readathon/teams/new         start a team (signed in)
//   /readathon/teams/:code       a team's page; also its invite link
const config = require("config");
const Readathon = require("../lib/readathon");
const Teams = require("../lib/readathon-teams");
const {Router} = require("express");

const MOUNTS = config.get("app.mounts");
const BASE = `/${MOUNTS.readathon}`;

function create(sqlite, {page, household_id}) {
    const router = Router();

    function household_readers(req) {
        const id = household_id(req);
        return id === null ? [] : Readathon.list_readers(sqlite, id);
    }

    router.get("/teams", (req, res, next) => {
        try {
            const readers = household_readers(req);
            page(res, "teams", {
                title: "Teams",
                nav: "teams",
                signed_in: household_id(req) !== null,
                teams: Teams.list_public(sqlite).map(team => ({
                    ...team,
                    is_mine: readers.some(r => r.team_id === team.team_id),
                    // Invite-only teams are listed but only linked for their own members
                    linkable: !!team.is_open || readers.some(r => r.team_id === team.team_id),
                })),
                my_team_count: new Set(readers.map(r => r.team_id).filter(Boolean)).size,
            });
        }
        catch(err) {
            next(err);
        }
    });

    function show_new(req, res, readers, form = {}, errors = []) {
        const goal = String(form.goal_hours ?? "25");
        const picked = form.reader_ids ?? readers.map(r => r.reader_id);
        page(res, "team-new", {
            title: "Start a team",
            nav: "teams",
            errors,
            form,
            goals: Teams.GOAL_HOURS.map(hours => ({hours, checked: String(hours) === goal})),
            open_checked: form.is_open === "1",
            readers: readers.map(r => ({
                ...r,
                initial: r.name.charAt(0).toUpperCase(),
                checked: picked.includes(r.reader_id),
                current_team: Teams.get_team(sqlite, r.team_id)?.name ?? null,
            })),
        });
    }

    router.get("/teams/new", (req, res, next) => {
        try {
            const readers = household_readers(req);
            if(readers.length === 0) {
                return res.redirect(`${BASE}/join`);
            }
            show_new(req, res, readers);
        }
        catch(err) {
            next(err);
        }
    });

    router.post("/teams/new", (req, res, next) => {
        try {
            const readers = household_readers(req);
            if(readers.length === 0) {
                return res.redirect(`${BASE}/join`);
            }
            const {errors, team, reader_ids} = Teams.parse_team(req.body, readers.map(r => r.reader_id));
            if(errors.length > 0) {
                res.status(400);
                return show_new(req, res, readers, {...req.body, reader_ids}, errors);
            }
            const code = Teams.create_team(sqlite, team, reader_ids);
            console.log({event: "Readathon.TEAM_CREATED", code, members: reader_ids.length});
            req.session.readathon_team_flash = "new";
            res.redirect(`${BASE}/teams/${code}`);
        }
        catch(err) {
            next(err);
        }
    });

    function load_team(req, res, next) {
        const team = Teams.get_by_code(sqlite, req.params.code);
        if(team === null) {
            return res.redirect(`${BASE}/teams`);
        }
        res.locals.team = team;
        next();
    }

    router.get("/teams/:code", load_team, (req, res, next) => {
        try {
            const today = Readathon.today();
            const team = Teams.progress(sqlite, res.locals.team, today);
            const readers = household_readers(req).map(r => ({
                ...r,
                initial: r.name.charAt(0).toUpperCase(),
                on_team: r.team_id === team.team_id,
                other_team: r.team_id && r.team_id !== team.team_id ? Teams.get_team(sqlite, r.team_id)?.name : null,
            }));
            const flash = req.session.readathon_team_flash ?? null;
            delete req.session.readathon_team_flash;
            const mine_ids = new Set(readers.filter(r => r.on_team).map(r => r.reader_id));
            page(res, "team", {
                title: team.name,
                nav: "teams",
                team: {
                    ...team,
                    members: team.members.map(m => ({...m, is_mine: mine_ids.has(m.reader_id)})),
                },
                flash,
                signed_in: household_id(req) !== null,
                readers,
                on_team: readers.some(r => r.on_team),
                can_join: readers.some(r => !r.on_team),
                invite_url: `${req.protocol}://${req.get("host")}${BASE}/teams/${team.code}`,
                og: {
                    title: `Join ${team.name} in the Fiske Free Library Read-a-thon`,
                    description: `${team.name} is reading ${team.goal_label} together this January. Join the team!`,
                    url: `${req.protocol}://${req.get("host")}${BASE}/teams/${team.code}`,
                },
            });
        }
        catch(err) {
            next(err);
        }
    });

    router.post("/teams/:code/join", load_team, (req, res, next) => {
        try {
            const readers = household_readers(req);
            if(readers.length === 0) {
                return res.redirect(`${BASE}/join?team=${encodeURIComponent(req.params.code)}`);
            }
            const ids = Teams.chosen_readers(req.body, readers.map(r => r.reader_id));
            if(ids.length > 0) {
                Teams.join(sqlite, res.locals.team.team_id, ids);
                req.session.readathon_team_flash = "joined";
            }
            res.redirect(`${BASE}/teams/${res.locals.team.code}`);
        }
        catch(err) {
            next(err);
        }
    });

    router.post("/teams/:code/leave", load_team, (req, res, next) => {
        try {
            const readers = household_readers(req);
            const ids = Teams.chosen_readers(req.body, readers.map(r => r.reader_id));
            for(const id of ids) {
                if(readers.find(r => r.reader_id === id)?.team_id === res.locals.team.team_id) {
                    Teams.leave(sqlite, id);
                }
            }
            res.redirect(`${BASE}/teams`);
        }
        catch(err) {
            next(err);
        }
    });

    return router;
}

exports.create = create;
