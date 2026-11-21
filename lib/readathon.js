// January 2027 Read-a-thon: data access and the rules for minutes, goals and bingo.
const config = require("config");
const content = require("./readathon-content");
const Catalog = require("./catalog");

const TIMEZONE = config.get("app.timezone");
const SETTINGS = config.get("readathon");

const MAX_READERS = 6;
const READER_COLORS = 6;
const MAX_MANUAL_MINUTES = 600;
const MAX_TIMER_MINUTES = 240;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ---------- dates (always YYYY-MM-DD strings in the library's time zone) ----------

function today(now_ms = Date.now(), settings = SETTINGS) {
    if(settings.today_override) {
        return settings.today_override;
    }
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date(now_ms));
}

function to_utc(day) {
    const [y, m, d] = day.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
}

function add_days(day, n) {
    const date = to_utc(day);
    date.setUTCDate(date.getUTCDate() + n);
    return date.toISOString().slice(0, 10);
}

function days_between(a, b) {
    return Math.round((to_utc(b) - to_utc(a)) / 86400000);
}

// "Today", "Yesterday", or "Fri, Jan 1". Pass no today_day to always get the date.
function label_day(day, today_day = null) {
    if(today_day && day === today_day) {
        return "Today";
    }
    if(today_day && day === add_days(today_day, -1)) {
        return "Yesterday";
    }
    const date = to_utc(day);
    return `${WEEKDAYS[date.getUTCDay()]}, ${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

function event_days(settings = SETTINGS) {
    const days = [];
    for(let day = settings.starts; day <= settings.ends; day = add_days(day, 1)) {
        days.push(day);
    }
    return days;
}

function phase(today_day, settings = SETTINGS) {
    if(today_day < settings.starts) {
        return "before";
    }
    if(today_day > settings.ends) {
        return "after";
    }
    return "during";
}

// Days from day (or the start, if day is earlier) through the last day, counting both
function days_left(day, settings = SETTINGS) {
    const first = day < settings.starts ? settings.starts : day;
    return Math.max(0, days_between(first, settings.ends) + 1);
}

// Days someone may log, most recent first
function loggable_days(today_day, settings = SETTINGS) {
    return event_days(settings).filter(day => day <= today_day).reverse();
}

// ---------- parsing forms ----------

function clean(value, max_length = 200) {
    return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max_length);
}

function as_list(value) {
    if(value === undefined || value === null) {
        return [];
    }
    if(Array.isArray(value)) {
        return value;
    }
    if(typeof value === "object") {
        return Object.keys(value).sort((a, b) => a - b).map(key => value[key]);
    }
    return [value];
}

const EARLIEST_BIRTH_YEAR = 1900;

// A four-digit year from 1900 to this year, or null
function parse_birth_year(value, day = today()) {
    const text = clean(value, 4);
    if(!/^\d{4}$/.test(text)) {
        return null;
    }
    const year = Number(text);
    return year >= EARLIEST_BIRTH_YEAR && year <= Number(day.slice(0, 4)) ? year : null;
}

// A two-letter state code from the list, or null
function parse_state(value) {
    const code = clean(value, 2).toUpperCase();
    return content.STATES.some(state => state.id === code) ? code : null;
}

function parse_join(body, day = today()) {
    const errors = [];
    const age_ids = content.AGE_GROUPS.map(age => age.id);
    const rows = as_list(body.readers).map(row => ({
        name: clean(row?.name, 40),
        age_group: age_ids.includes(row?.age_group) ? row.age_group : "adult",
        birth_year: clean(row?.birth_year, 4),
    }));
    const readers = rows
        .filter(row => row.name !== "")
        .slice(0, MAX_READERS)
        .map(row => ({name: row.name, age_group: row.age_group, birth_year: parse_birth_year(row.birth_year, day)}));
    if(readers.length === 0) {
        errors.push("Tell us at least one reader's first name.");
    }
    for(const reader of readers.filter(r => r.birth_year === null)) {
        errors.push(`Add the year ${reader.name} was born, like 2017.`);
    }

    const goal = parse_goal(body);
    const goal_minutes = goal.minutes ?? null;
    if(goal.error) {
        errors.push(goal.error);
    }

    const email = clean(body.email, 200).toLowerCase();
    if(!EMAIL_PATTERN.test(email)) {
        errors.push("Enter a grown-up's email address so you can sign back in.");
    }

    const city = clean(body.city, 60);
    const state = parse_state(body.state);
    if(city === "" || state === null) {
        errors.push("Tell us your town and state.");
    }

    return {
        errors,
        rows: rows.length > 0 ? rows : [{name: "", age_group: "adult", birth_year: ""}],
        household: {
            email,
            city,
            state,
            wants_updates: body.wants_updates ? 1 : 0,
            goal_minutes: goal_minutes ?? content.DEFAULT_GOAL_MINUTES,
            readers,
        },
    };
}

function parse_log(body, today_day, source = "manual", settings = SETTINGS) {
    const errors = [];
    const max = source === "timer" ? MAX_TIMER_MINUTES : MAX_MANUAL_MINUTES;
    const choice = clean(body.minutes);
    const raw = choice === "other" ? clean(body.minutes_other) : choice;
    const minutes = Number.parseInt(raw, 10);
    if(!Number.isInteger(minutes) || minutes < 1) {
        errors.push("How many minutes did you read? Pick one or type a number.");
    }
    else if(minutes > max) {
        errors.push(`That's more than ${max} minutes in one go. Split it into separate days, or ask a volunteer.`);
    }

    const days = loggable_days(today_day, settings);
    const day = clean(body.day) || today_day;
    if(!days.includes(day)) {
        errors.push(days.length === 0
            ? "Logging opens when the read-a-thon starts on January 1."
            : "Pick a day during the read-a-thon.");
    }

    const format_choice = clean(body.format);
    return {
        errors,
        entry: {
            day,
            minutes: Number.isInteger(minutes) ? minutes : null,
            format: content.FORMATS.includes(format_choice) ? format_choice : null,
            title: clean(body.title, 120) || null,
            source,
        },
    };
}

function parse_recommendation(body) {
    const errors = [];
    const title = clean(body.title, 150);
    if(title === "") {
        errors.push("What's the book called?");
    }
    const list_ids = content.LISTS.map(list => list.id);
    const list = list_ids.includes(clean(body.list)) ? clean(body.list) : "community";
    const audience = content.AUDIENCES.includes(clean(body.audience)) ? clean(body.audience) : "All ages";
    return {
        errors,
        recommendation: {
            title,
            author: clean(body.author, 100) || null,
            list,
            audience,
            why: clean(body.why, 280) || null,
            recommended_by: clean(body.recommended_by, 60) || null,
            read_during: body.read_during ? 1 : 0,
        },
    };
}

// ---------- reading statistics ----------

function stats(entries, today_day, settings = SETTINGS) {
    const by_day = {};
    let total = 0;
    for(const entry of entries) {
        if(entry.day < settings.starts || entry.day > settings.ends) {
            continue;
        }
        by_day[entry.day] = (by_day[entry.day] ?? 0) + entry.minutes;
        total += entry.minutes;
    }
    const days_read = Object.keys(by_day).length;

    // Streak counts back from today, or from yesterday if today has no reading yet
    let streak = 0;
    let cursor = by_day[today_day] ? today_day : add_days(today_day, -1);
    while(by_day[cursor]) {
        streak += 1;
        cursor = add_days(cursor, -1);
    }
    let best_streak = 0;
    let run = 0;
    for(const day of event_days(settings)) {
        run = by_day[day] ? run + 1 : 0;
        best_streak = Math.max(best_streak, run);
    }

    return {
        by_day,
        total,
        hours: Math.round(total / 6) / 10,
        days_read,
        streak,
        best_streak,
        today_minutes: by_day[today_day] ?? 0,
    };
}

// "45 minutes", "1 hour", "3 hours, 10 minutes"
function duration_label(minutes) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    const parts = [];
    if(hours > 0) {
        parts.push(`${hours.toLocaleString("en-US")} ${hours === 1 ? "hour" : "hours"}`);
    }
    if(rest > 0 || hours === 0) {
        parts.push(`${rest} ${rest === 1 ? "minute" : "minutes"}`);
    }
    return parts.join(", ");
}

// "45 min", "1 hr", "3 hr 25 min", for big numbers where space is tight
function duration_short(minutes) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if(hours === 0) {
        return `${rest} min`;
    }
    return rest === 0 ? `${hours.toLocaleString("en-US")} hr` : `${hours.toLocaleString("en-US")} hr ${rest} min`;
}

// ---------- calendars and the reading log ----------

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// The Sunday that starts day's week
function week_start(day) {
    return add_days(day, -to_utc(day).getUTCDay());
}

// For a calendar-page date badge: {day_name: "Sat", day_number: 2, month: "Jan"}
function event_date(day) {
    const date = to_utc(day);
    return {day_name: WEEKDAYS[date.getUTCDay()], day_number: date.getUTCDate(), month: MONTHS[date.getUTCMonth()]};
}

// "Sunday, January 3"
function long_day(day) {
    const date = to_utc(day);
    return `${WEEKDAY_NAMES[date.getUTCDay()]}, ${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

// How dark to shade a day: 0 (none) to 4 (an hour or more)
function reading_level(minutes) {
    if(!minutes) {
        return 0;
    }
    if(minutes < 15) {
        return 1;
    }
    if(minutes < 30) {
        return 2;
    }
    return minutes < 60 ? 3 : 4;
}

function calendar_day(day, by_day, today_day, settings) {
    const minutes = by_day[day] ?? 0;
    const date = to_utc(day);
    const outside = day < settings.starts || day > settings.ends;
    const future = day > today_day;
    let label = long_day(day);
    if(!outside && !future) {
        label += minutes > 0 ? `: ${duration_label(minutes)}` : "";
    }
    return {
        day,
        number: date.getUTCDate(),
        letter: WEEKDAYS[date.getUTCDay()].charAt(0),
        minutes,
        read: minutes > 0,
        level: reading_level(minutes),
        is_today: day === today_day,
        future,
        outside,
        label: day === today_day ? `Today, ${label}` : label,
    };
}

// The seven days of this week, Sunday to Saturday
function week_strip(by_day, today_day, settings = SETTINGS) {
    const first = week_start(today_day);
    return Array.from({length: 7}, (_, i) => calendar_day(add_days(first, i), by_day, today_day, settings));
}

// The read-a-thon as calendar rows of seven days, Sunday to Saturday
function month_calendar(by_day, today_day, settings = SETTINGS) {
    const weeks = [];
    for(let first = week_start(settings.starts); first <= settings.ends; first = add_days(first, 7)) {
        weeks.push(Array.from({length: 7}, (_, i) => calendar_day(add_days(first, i), by_day, today_day, settings)));
    }
    return weeks;
}

// "Jan 3 to 9", or "Jan 31 to Feb 6" across months
function range_label(first, last) {
    const a = to_utc(first);
    const b = to_utc(last);
    if(first === last) {
        return `${MONTHS[a.getUTCMonth()]} ${a.getUTCDate()}`;
    }
    const end = a.getUTCMonth() === b.getUTCMonth() ? `${b.getUTCDate()}` : `${MONTHS[b.getUTCMonth()]} ${b.getUTCDate()}`;
    return `${MONTHS[a.getUTCMonth()]} ${a.getUTCDate()} to ${end}`;
}

// Entries (newest first) grouped into Sunday-to-Saturday weeks, each with its total
function log_by_week(entries, today_day, settings = SETTINGS) {
    const weeks = [];
    for(const entry of entries) {
        const first = week_start(entry.day);
        let week = weeks.at(-1);
        if(!week || week.first !== first) {
            const shown_first = first < settings.starts ? settings.starts : first;
            const last = add_days(first, 6);
            const shown_last = last > settings.ends ? settings.ends : last;
            week = {first, label: range_label(shown_first, shown_last), is_this_week: first === week_start(today_day), minutes: 0, entries: []};
            weeks.push(week);
        }
        week.minutes += entry.minutes;
        week.entries.push({...entry, day_label: label_day(entry.day, today_day)});
    }
    return weeks.map(week => ({...week, total_label: duration_short(week.minutes)}));
}

// The titles someone typed in, with the time spent on each, most recent first.
// "the hobbit" and "The Hobbit " count as the same book.
function books_read(entries, today_day = null) {
    const books = new Map();
    for(const entry of entries) {
        const title = clean(entry.title, 120);
        if(title === "") {
            continue;
        }
        const key = title.toLowerCase();
        const book = books.get(key) ?? {title, minutes: 0, sessions: 0, last_day: entry.day, format: entry.format};
        book.minutes += entry.minutes;
        book.sessions += 1;
        if(entry.day >= book.last_day) {
            book.last_day = entry.day;
        }
        books.set(key, book);
    }
    return [...books.values()]
        .sort((a, b) => b.last_day.localeCompare(a.last_day) || b.minutes - a.minutes)
        .map(book => ({
            ...book,
            minutes_label: duration_short(book.minutes),
            sessions_plural: book.sessions !== 1,
            // "today", "yesterday" or "Tue, Jan 5", to follow "last read"
            last_label: label_day(book.last_day, today_day).replace(/^(Today|Yesterday)$/, word => word.toLowerCase()),
        }));
}

// ---------- monthly goals ----------

// "about 10 minutes", "about an hour", "about 1 hour 15 minutes", "about 2 and a half hours"
function friendly_minutes(minutes) {
    if(minutes < 7.5) {
        return "about 5 minutes";
    }
    if(minutes < 52.5) {
        return `about ${Math.round(minutes / 5) * 5} minutes`;
    }
    const quarters = Math.round(minutes / 15);
    const hours = Math.floor(quarters / 4);
    const rest = (quarters % 4) * 15;
    const hour_words = hours === 1 ? "an hour" : `${hours} hours`;
    if(rest === 0) {
        return `about ${hour_words}`;
    }
    if(rest === 30) {
        return hours === 1 ? "about an hour and a half" : `about ${hours} and a half hours`;
    }
    return `about ${hours} ${hours === 1 ? "hour" : "hours"} ${rest} minutes`;
}

// Minutes a day to get through minutes in the days left, reading every day
function pace_minutes(minutes, days) {
    return minutes / Math.max(1, days);
}

// The same, in words: "about 10 minutes"
function pace(minutes, days) {
    return friendly_minutes(pace_minutes(minutes, days));
}

// "about 40 minutes a day", or "... a day for the rest of January" for someone starting partway through
function pace_hint(minutes, days, settings = SETTINGS) {
    const all_days = days_between(settings.starts, settings.ends) + 1;
    if(days >= all_days) {
        return `${pace(minutes, days)} a day`;
    }
    if(days <= 1) {
        return `${pace(minutes, days)} today`;
    }
    const month = new Date(`${settings.ends}T12:00:00Z`).toLocaleString("en-US", {month: "long", timeZone: "UTC"});
    return `${pace(minutes, days)} a day for the rest of ${month}`;
}

function goal_label(goal_minutes) {
    const hours = Math.round(goal_minutes / 60 * 100) / 100;
    return `${hours.toLocaleString("en-US")} ${hours === 1 ? "hour" : "hours"}`;
}

// A goal from a form: one of the choices (goal=600), or "My own goal" (goal=own, goal_hours=37).
// Hours typed without picking "My own goal" count as picking it. Returns {minutes} or {error}.
function parse_goal(body) {
    const typed = String(body?.goal_hours ?? "").trim().replace(",", ".");
    const choice = String(body?.goal ?? "");
    if(choice === "own" || (choice === "" && typed !== "")) {
        const hours = Number(typed);
        if(typed === "" || !Number.isFinite(hours)) {
            return {error: "Type how many hours you'd like to read in January, like 30."};
        }
        if(hours < content.MIN_OWN_GOAL_HOURS) {
            return {error: `Pick a goal of at least ${content.MIN_OWN_GOAL_HOURS} hour.`};
        }
        // Nobody can read more than every hour of the month
        if(hours > 24 * 31) {
            return {error: "That's more hours than January has! Try a smaller number."};
        }
        return {minutes: Math.round(hours * 60)};
    }
    const minutes = Number.parseInt(choice, 10);
    if(content.GOALS.some(goal => goal.minutes === minutes)) {
        return {minutes};
    }
    return {error: "Pick a goal for January. You can change it any time."};
}

// The goal choices with hints for someone starting on today_day, and "My own goal" filled in when the
// current goal isn't one of the choices. current_minutes is the reader's goal (or the form's).
function goal_choices(today_day, current_minutes = null, settings = SETTINGS, form = {}) {
    const days = Math.max(1, days_left(today_day, settings));
    const is_preset = content.GOALS.some(goal => goal.minutes === current_minutes);
    const own_picked = form.goal === "own" || (current_minutes !== null && !Number.isNaN(current_minutes) && !is_preset);
    const own_hours = form.goal_hours ?? (own_picked && current_minutes ? String(Math.round(current_minutes / 60 * 100) / 100) : "");
    return {
        presets: content.GOALS.map(goal => ({
            ...goal,
            label: goal_label(goal.minutes),
            hint: pace_hint(goal.minutes, days, settings),
            current: !own_picked && goal.minutes === current_minutes,
        })),
        own: {
            picked: own_picked,
            hours: own_hours,
            hint: own_picked && Number(own_hours) >= content.MIN_OWN_GOAL_HOURS
                ? pace_hint(Number(own_hours) * 60, days, settings) : "Any number of hours, 1 or more",
            min: content.MIN_OWN_GOAL_HOURS,
            // For the page's script, to show the daily pace as someone types
            days,
            // " for the rest of January" when starting partway through, to match the other hints
            rest: pace_hint(60, days, settings).replace(/^.* a day/, ""),
        },
    };
}

// The day a reader's pace is measured from: the day they joined, or the first day they logged if
// that's earlier (people can add reading from before they signed up), but never before the start
function reader_start_day(reader, entries, settings = SETTINGS) {
    let start = today(reader.created_ms, settings);
    for(const entry of entries) {
        if(entry.day < start) {
            start = entry.day;
        }
    }
    return start < settings.starts ? settings.starts : start;
}

// Progress toward a monthly goal, with a friendly note that never says "behind"
function goal_progress(total, goal_minutes, start_day, today_day, settings = SETTINGS) {
    const reached = total >= goal_minutes;
    const remaining = Math.max(0, goal_minutes - total);
    const window_days = Math.max(1, days_between(start_day, settings.ends) + 1);
    // Days before today since they started; today doesn't count against them until it's over
    const days_done = Math.min(window_days, Math.max(0, days_between(start_day, today_day)));
    const on_pace = total >= goal_minutes * days_done / window_days;
    const left = days_left(today_day, settings);
    let status;
    let message;
    if(reached) {
        status = "reached";
        message = "You reached your goal! Every extra minute still counts.";
    }
    else if(today_day > settings.ends) {
        status = "over";
        message = "Thanks for reading with us!";
    }
    else if(on_pace) {
        status = "on_track";
        message = "Right on track!";
    }
    else {
        status = "keep_going";
        message = "Keep going, there's still plenty of time!";
    }
    return {
        total_label: duration_label(total),
        total_short: duration_short(total),
        goal_label: goal_label(goal_minutes),
        percent: Math.min(100, Math.round(total / goal_minutes * 100)),
        reached,
        status,
        message,
    };
}

// Today's goal: the monthly goal's pace for a reading day, rounded to 5 minutes, and whether it's done.
// It uses what was left at the start of today, so it doesn't move while they read.
function today_plan(total, today_minutes, goal_minutes, today_day, settings = SETTINGS) {
    const remaining_this_morning = Math.max(0, goal_minutes - (total - today_minutes));
    if(remaining_this_morning === 0 || today_day > settings.ends) {
        // Monthly goal already reached: there's no goal for today, just what they read
        return {done: today_minutes > 0, text: today_minutes > 0 ? `Today: ${duration_label(today_minutes)} read.` : "Not yet today."};
    }
    const target = Math.max(5, Math.round(pace_minutes(remaining_this_morning, days_left(today_day, settings)) / 5) * 5);
    if(today_minutes >= target) {
        return {done: true, text: `Today's Goal: ${duration_label(today_minutes)}. Nice job!`};
    }
    if(today_minutes > 0) {
        return {done: false, text: `Today's Goal: ${duration_label(today_minutes)} so far. ${duration_label(target - today_minutes)} left!`};
    }
    return {done: false, text: `Today's Goal: ${duration_label(target)}`};
}

// ---------- bingo ----------

const BINGO_LINES = (() => {
    const lines = [];
    for(let i = 0; i < 5; i++) {
        lines.push([0, 1, 2, 3, 4].map(j => i * 5 + j));
        lines.push([0, 1, 2, 3, 4].map(j => j * 5 + i));
    }
    lines.push([0, 6, 12, 18, 24], [4, 8, 12, 16, 20]);
    return lines;
})();

const AUTO_SQUARE_KEYS = ["streak7", "hours5", "recommended"];

// The bingo card for a reader's age group: kid, teen or adult
function bingo_card(age_group) {
    return content.BINGO_CARDS[age_group] ?? content.BINGO_CARDS.adult;
}

// Problems with a card's squares, for checking edits (empty when it's fine)
function bingo_card_problems(card) {
    const problems = [];
    if(card.squares.length !== 25) {
        problems.push(`has ${card.squares.length} squares instead of 25`);
    }
    if(card.squares[12]?.kind !== "free") {
        problems.push("the middle square isn't free");
    }
    card.squares.forEach((square, i) => {
        const where = `square ${i + 1} ("${square.label}")`;
        if(!square.label) {
            problems.push(`square ${i + 1} has no label`);
        }
        if(square.kind === "event" && !/^[A-Z]+$/.test(square.code ?? "")) {
            problems.push(`${where} needs a code in capital letters`);
        }
        if(square.kind === "auto" && !AUTO_SQUARE_KEYS.includes(square.key)) {
            problems.push(`${where} has an unknown automatic key "${square.key}"`);
        }
        if(square.kind === "free" && i !== 12) {
            problems.push(`${where} is free but isn't the middle square`);
        }
        if(square.kind && !["event", "auto", "free"].includes(square.kind)) {
            problems.push(`${where} has an unknown kind "${square.kind}"`);
        }
    });
    const codes = card.squares.filter(s => s.code).map(s => s.code);
    if(new Set(codes).size !== codes.length) {
        problems.push("uses the same event code twice");
    }
    return problems;
}

function bingo_board(card, marked_squares, auto) {
    const marked = new Set(marked_squares);
    card.squares.forEach((square, index) => {
        if(square.kind === "free" || (square.kind === "auto" && auto[square.key])) {
            marked.add(index);
        }
    });
    const winning = BINGO_LINES.filter(line => line.every(i => marked.has(i)));
    const in_win = new Set(winning.flat());
    const closest = Math.min(...BINGO_LINES.map(line => line.filter(i => !marked.has(i)).length));
    return {
        title: card.title,
        squares: card.squares.map((square, index) => ({
            index,
            label: square.label,
            kind: square.kind ?? "self",
            marked: marked.has(index),
            in_win: in_win.has(index),
            tappable: square.kind !== "free" && square.kind !== "auto",
        })),
        count: marked.size,
        bingos: winning.length,
        blackout: marked.size === 25,
        to_bingo: closest,
    };
}

// The square on this card for an event code, or -1
function event_code_square(card, code) {
    const wanted = clean(code).toUpperCase();
    if(wanted === "") {
        return -1;
    }
    return card.squares.findIndex(square => square.code === wanted);
}

// Whether a code belongs to an event on any card
function is_event_code(code) {
    const wanted = clean(code).toUpperCase();
    return wanted !== "" && Object.values(content.BINGO_CARDS).some(card => card.squares.some(square => square.code === wanted));
}

// ---------- database ----------

function find_household_by_email(sqlite, email) {
    return sqlite.prepare(
        "SELECT * FROM readathon_households WHERE email = :email",
    ).get({email}) ?? null;
}

function get_household(sqlite, household_id) {
    return sqlite.prepare(
        "SELECT * FROM readathon_households WHERE household_id = :household_id",
    ).get({household_id}) ?? null;
}

function create_household(sqlite, household, now_ms = Date.now()) {
    sqlite.exec("BEGIN");
    try {
        const {lastInsertRowid} = sqlite.prepare(
            `INSERT INTO readathon_households (email, city, state, wants_updates, source, created_ms)
             VALUES (:email, :city, :state, :wants_updates, :source, :created_ms)`,
        ).run({
            email: household.email || null,
            city: household.city || null,
            state: household.state || null,
            wants_updates: household.wants_updates ?? 0,
            source: household.source ?? "web",
            created_ms: now_ms,
        });
        const household_id = Number(lastInsertRowid);
        const insert = sqlite.prepare(
            `INSERT INTO readathon_readers (household_id, name, age_group, birth_year, goal_minutes, color, created_ms)
             VALUES (:household_id, :name, :age_group, :birth_year, :goal_minutes, :color, :created_ms)`,
        );
        household.readers.forEach((reader, i) => insert.run({
            household_id,
            name: reader.name,
            age_group: reader.age_group,
            birth_year: reader.birth_year ?? null,
            goal_minutes: reader.goal_minutes ?? household.goal_minutes ?? content.DEFAULT_GOAL_MINUTES,
            color: i % READER_COLORS,
            created_ms: now_ms,
        }));
        sqlite.exec("COMMIT");
        return household_id;
    }
    catch(err) {
        sqlite.exec("ROLLBACK");
        throw err;
    }
}

// ---------- managing a household after joining ----------

// A reader's name, age group and birth year from a form, checked like the join form
function parse_reader(body, day = today()) {
    const errors = [];
    const age_ids = content.AGE_GROUPS.map(age => age.id);
    const name = clean(body.name, 40);
    const birth_year_text = clean(body.birth_year, 4);
    const birth_year = parse_birth_year(birth_year_text, day);
    if(name === "") {
        errors.push("Enter the reader's first name.");
    }
    if(birth_year === null) {
        errors.push(name ? `Add the year ${name} was born, like 2017.` : "Add the year they were born, like 2017.");
    }
    const goal = parse_goal(body);
    if(goal.error && (body.goal !== undefined || body.goal_hours !== undefined)) {
        errors.push(goal.error);
    }
    return {
        errors,
        form: {name, age_group: age_ids.includes(body.age_group) ? body.age_group : "kid", birth_year: birth_year_text, goal: String(body.goal ?? ""), goal_hours: String(body.goal_hours ?? "")},
        reader: {
            name,
            age_group: age_ids.includes(body.age_group) ? body.age_group : "kid",
            birth_year,
            goal_minutes: goal.minutes ?? content.DEFAULT_GOAL_MINUTES,
        },
    };
}

function add_reader(sqlite, household_id, reader, now_ms = Date.now()) {
    const count = sqlite.prepare("SELECT COUNT(*) AS n FROM readathon_readers WHERE household_id = :household_id").get({household_id}).n;
    const {lastInsertRowid} = sqlite.prepare(
        `INSERT INTO readathon_readers (household_id, name, age_group, birth_year, goal_minutes, color, created_ms)
         VALUES (:household_id, :name, :age_group, :birth_year, :goal_minutes, :color, :created_ms)`,
    ).run({
        household_id,
        name: reader.name,
        age_group: reader.age_group,
        birth_year: reader.birth_year ?? null,
        goal_minutes: reader.goal_minutes ?? content.DEFAULT_GOAL_MINUTES,
        color: count % READER_COLORS,
        created_ms: now_ms,
    });
    return Number(lastInsertRowid);
}

// Changing kid, teen or grown-up switches bingo cards, and squares are saved by position,
// so their hand-marked squares are cleared. (Automatic squares are worked out, not saved.)
function update_reader(sqlite, reader_id, changes) {
    const reader = get_reader(sqlite, reader_id);
    if(reader === null) {
        return false;
    }
    sqlite.exec("BEGIN");
    try {
        sqlite.prepare(
            "UPDATE readathon_readers SET name = :name, age_group = :age_group, birth_year = :birth_year WHERE reader_id = :reader_id",
        ).run({reader_id, name: changes.name, age_group: changes.age_group, birth_year: changes.birth_year ?? null});
        if(changes.age_group !== reader.age_group) {
            sqlite.prepare("DELETE FROM readathon_bingo WHERE reader_id = :reader_id").run({reader_id});
        }
        sqlite.exec("COMMIT");
        return true;
    }
    catch(err) {
        sqlite.exec("ROLLBACK");
        throw err;
    }
}

// A reader can be removed by their family only if nothing would be lost: no reading and no gifts.
// Returns null if they can be removed, or the reason they can't.
function why_not_remove(sqlite, reader) {
    const others = sqlite.prepare("SELECT COUNT(*) AS n FROM readathon_readers WHERE household_id = :household_id AND reader_id != :reader_id")
        .get({household_id: reader.household_id, reader_id: reader.reader_id}).n;
    if(others === 0) {
        return "Every household needs at least one reader.";
    }
    const entries = sqlite.prepare("SELECT COUNT(*) AS n FROM readathon_entries WHERE reader_id = :reader_id").get({reader_id: reader.reader_id}).n;
    const gifts = sqlite.prepare("SELECT COUNT(*) AS n FROM readathon_gifts WHERE reader_id = :reader_id").get({reader_id: reader.reader_id}).n;
    if(entries > 0 || gifts > 0) {
        return `${reader.name} already has ${entries > 0 ? "reading" : "sponsors"}, so a volunteer at the library desk needs to help remove them.`;
    }
    return null;
}

function remove_reader(sqlite, reader) {
    if(why_not_remove(sqlite, reader) !== null) {
        return false;
    }
    sqlite.exec("BEGIN");
    try {
        for(const table of ["readathon_bingo", "readathon_team_members", "readathon_prize_pickups"]) {
            sqlite.prepare(`DELETE FROM ${table} WHERE reader_id = :reader_id`).run({reader_id: reader.reader_id});
        }
        sqlite.prepare("UPDATE readathon_teams SET created_by_reader_id = NULL WHERE created_by_reader_id = :reader_id").run({reader_id: reader.reader_id});
        sqlite.prepare("DELETE FROM readathon_readers WHERE reader_id = :reader_id").run({reader_id: reader.reader_id});
        sqlite.exec("COMMIT");
        return true;
    }
    catch(err) {
        sqlite.exec("ROLLBACK");
        throw err;
    }
}

// Email, town, state and updates, checked like the join form. The email must not belong to another household.
function parse_household(sqlite, household_id, body) {
    const errors = [];
    const email = clean(body.email, 200).toLowerCase();
    const city = clean(body.city, 60);
    const state = parse_state(body.state);
    if(!EMAIL_PATTERN.test(email)) {
        errors.push("Enter a grown-up's email address so you can sign back in.");
    }
    else {
        const other = find_household_by_email(sqlite, email);
        if(other !== null && other.household_id !== household_id) {
            errors.push(`${email} is already used by another household.`);
        }
    }
    if(city === "" || state === null) {
        errors.push("Tell us your town and state.");
    }
    return {
        errors,
        form: {email: clean(body.email, 200), city, state: clean(body.state, 2).toUpperCase(), wants_updates: !!body.wants_updates},
        household: {email, city, state, wants_updates: body.wants_updates ? 1 : 0},
    };
}

function update_household(sqlite, household_id, household) {
    sqlite.prepare(
        `UPDATE readathon_households SET email = :email, city = :city, state = :state, wants_updates = :wants_updates
         WHERE household_id = :household_id`,
    ).run({household_id, ...household});
}

function list_readers(sqlite, household_id) {
    return sqlite.prepare(
        "SELECT * FROM readathon_readers WHERE household_id = :household_id ORDER BY reader_id",
    ).all({household_id});
}

function get_reader(sqlite, reader_id) {
    return sqlite.prepare(
        "SELECT * FROM readathon_readers WHERE reader_id = :reader_id",
    ).get({reader_id}) ?? null;
}

function set_goal(sqlite, reader_id, goal_minutes) {
    if(!Number.isInteger(goal_minutes) || goal_minutes < content.MIN_OWN_GOAL_HOURS * 60) {
        return false;
    }
    sqlite.prepare(
        "UPDATE readathon_readers SET goal_minutes = :goal_minutes WHERE reader_id = :reader_id",
    ).run({reader_id, goal_minutes});
    return true;
}

function add_entry(sqlite, reader_id, entry, now_ms = Date.now()) {
    sqlite.prepare(
        `INSERT INTO readathon_entries (reader_id, day, minutes, format, title, source, created_ms)
         VALUES (:reader_id, :day, :minutes, :format, :title, :source, :created_ms)`,
    ).run({
        reader_id,
        day: entry.day,
        minutes: entry.minutes,
        format: entry.format ?? null,
        title: entry.title ?? null,
        source: entry.source ?? "manual",
        created_ms: now_ms,
    });
}

function list_entries(sqlite, reader_id) {
    return sqlite.prepare(
        "SELECT * FROM readathon_entries WHERE reader_id = :reader_id ORDER BY day DESC, entry_id DESC",
    ).all({reader_id});
}

function get_entry(sqlite, reader_id, entry_id) {
    return sqlite.prepare(
        "SELECT * FROM readathon_entries WHERE reader_id = :reader_id AND entry_id = :entry_id",
    ).get({reader_id, entry_id}) ?? null;
}

// Change how long, which day and what was read. Where it came from (timer, typed in, desk) stays the same.
function update_entry(sqlite, reader_id, entry_id, entry) {
    sqlite.prepare(
        `UPDATE readathon_entries SET day = :day, minutes = :minutes, format = :format, title = :title
         WHERE reader_id = :reader_id AND entry_id = :entry_id`,
    ).run({
        reader_id,
        entry_id,
        day: entry.day,
        minutes: entry.minutes,
        format: entry.format ?? null,
        title: entry.title ?? null,
    });
}

function delete_entry(sqlite, reader_id, entry_id) {
    sqlite.prepare(
        "DELETE FROM readathon_entries WHERE reader_id = :reader_id AND entry_id = :entry_id",
    ).run({reader_id, entry_id});
}

function list_marks(sqlite, reader_id) {
    return sqlite.prepare(
        "SELECT square FROM readathon_bingo WHERE reader_id = :reader_id",
    ).all({reader_id}).map(row => row.square);
}

function set_mark(sqlite, reader_id, square, on, source = "self", now_ms = Date.now()) {
    if(on) {
        sqlite.prepare(
            `INSERT OR IGNORE INTO readathon_bingo (reader_id, square, source, created_ms)
             VALUES (:reader_id, :square, :source, :created_ms)`,
        ).run({reader_id, square, source, created_ms: now_ms});
    }
    else {
        sqlite.prepare(
            "DELETE FROM readathon_bingo WHERE reader_id = :reader_id AND square = :square",
        ).run({reader_id, square});
    }
}

function count_recommendations(sqlite, household_id) {
    return sqlite.prepare(
        "SELECT COUNT(*) AS n FROM readathon_recommendations WHERE household_id = :household_id",
    ).get({household_id}).n;
}

function auto_squares(sqlite, reader, reader_stats) {
    return {
        streak7: reader_stats.best_streak >= 7,
        hours5: reader_stats.total >= 300,
        recommended: count_recommendations(sqlite, reader.household_id) > 0,
    };
}

// Automatic squares on this card that are marked in after but weren't in before
function newly_earned_squares(card, before_auto, after_auto) {
    return card.squares
        .map((square, index) => ({index, label: square.label, key: square.key}))
        .filter(square => square.key && after_auto[square.key] && !before_auto[square.key])
        .map(({index, label}) => ({index, label}));
}

function community(sqlite, settings = SETTINGS) {
    const minutes = sqlite.prepare(
        `SELECT COALESCE(SUM(minutes), 0) AS minutes FROM readathon_entries
         WHERE day BETWEEN :starts AND :ends`,
    ).get({starts: settings.starts, ends: settings.ends}).minutes;
    const readers = sqlite.prepare(
        "SELECT COUNT(*) AS n FROM readathon_readers",
    ).get().n;
    const goal = settings.community_goal_minutes;
    return {
        minutes,
        readers,
        goal,
        percent: Math.min(100, Math.round(minutes / goal * 100)),
    };
}

function create_recommendation(sqlite, household_id, recommendation, now_ms = Date.now()) {
    sqlite.prepare(
        `INSERT INTO readathon_recommendations
           (household_id, title, author, list, audience, why, recommended_by, read_during, created_ms)
         VALUES
           (:household_id, :title, :author, :list, :audience, :why, :recommended_by, :read_during, :created_ms)`,
    ).run({household_id: household_id ?? null, ...recommendation, created_ms: now_ms});
}

function list_recommendations(sqlite, status) {
    return sqlite.prepare(
        "SELECT * FROM readathon_recommendations WHERE status = :status ORDER BY created_ms DESC",
    ).all({status});
}

function review_recommendation(sqlite, recommendation_id, status, now_ms = Date.now()) {
    if(!["approved", "declined", "pending"].includes(status)) {
        return;
    }
    sqlite.prepare(
        `UPDATE readathon_recommendations SET status = :status, reviewed_ms = :reviewed_ms
         WHERE recommendation_id = :recommendation_id`,
    ).run({recommendation_id, status, reviewed_ms: now_ms});
}

// Sample books plus approved recommendations, filtered by list and search words
function books(sqlite, list_id, query) {
    const approved = list_recommendations(sqlite, "approved").map(rec => ({
        title: rec.title,
        author: rec.author,
        why: rec.why,
        recommended_by: rec.recommended_by || "a reader",
        audience: rec.audience,
        read_during: !!rec.read_during,
        lists: [...new Set(["community", rec.list])],
    }));
    const words = clean(query, 80).toLowerCase();
    return [...approved, ...content.BOOKS].filter(book =>
        (!list_id || book.lists.includes(list_id))
        && (!words || `${book.title} ${book.author ?? ""} ${book.why ?? ""}`.toLowerCase().includes(words)),
    ).map((book, i) => ({
        ...book,
        initial: book.title.replace(/^(The|A|An) /, "").charAt(0).toUpperCase(),
        color: i % 4,
        catalog_url: Catalog.book_url(book),
    }));
}

function search_readers(sqlite, query) {
    const words = clean(query, 60);
    if(words === "") {
        return [];
    }
    return sqlite.prepare(
        `SELECT r.*, h.email FROM readathon_readers r
         JOIN readathon_households h ON h.household_id = r.household_id
         WHERE r.name LIKE :pattern OR h.email LIKE :pattern
         ORDER BY r.name LIMIT 25`,
    ).all({pattern: `%${words}%`});
}

exports.MAX_READERS = MAX_READERS;
exports.add_days = add_days;
exports.add_reader = add_reader;
exports.add_entry = add_entry;
exports.auto_squares = auto_squares;
exports.bingo_board = bingo_board;
exports.books_read = books_read;
exports.bingo_card = bingo_card;
exports.bingo_card_problems = bingo_card_problems;
exports.books = books;
exports.clean = clean;
exports.community = community;
exports.create_household = create_household;
exports.create_recommendation = create_recommendation;
exports.days_between = days_between;
exports.days_left = days_left;
exports.delete_entry = delete_entry;
exports.duration_label = duration_label;
exports.duration_short = duration_short;
exports.event_code_square = event_code_square;
exports.event_date = event_date;
exports.event_days = event_days;
exports.find_household_by_email = find_household_by_email;
exports.get_entry = get_entry;
exports.get_household = get_household;
exports.goal_choices = goal_choices;
exports.parse_goal = parse_goal;
exports.goal_label = goal_label;
exports.goal_progress = goal_progress;
exports.get_reader = get_reader;
exports.is_event_code = is_event_code;
exports.label_day = label_day;
exports.list_entries = list_entries;
exports.list_marks = list_marks;
exports.list_readers = list_readers;
exports.list_recommendations = list_recommendations;
exports.log_by_week = log_by_week;
exports.loggable_days = loggable_days;
exports.long_day = long_day;
exports.month_calendar = month_calendar;
exports.newly_earned_squares = newly_earned_squares;
exports.pace_hint = pace_hint;
exports.parse_birth_year = parse_birth_year;
exports.parse_household = parse_household;
exports.parse_join = parse_join;
exports.parse_log = parse_log;
exports.parse_reader = parse_reader;
exports.parse_recommendation = parse_recommendation;
exports.parse_state = parse_state;
exports.phase = phase;
exports.reader_start_day = reader_start_day;
exports.remove_reader = remove_reader;
exports.review_recommendation = review_recommendation;
exports.search_readers = search_readers;
exports.set_goal = set_goal;
exports.set_mark = set_mark;
exports.stats = stats;
exports.today = today;
exports.update_entry = update_entry;
exports.update_household = update_household;
exports.update_reader = update_reader;
exports.week_strip = week_strip;
exports.why_not_remove = why_not_remove;
exports.today_plan = today_plan;
