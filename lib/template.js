const config = require("config");
const TIMEZONE = config.get("app.timezone");

function block_directive(name, opts) {
    if(opts.data.root === undefined) {
        opts.data.root = {};
    }
    opts.data.root[name] = opts.fn(this);
}

function get_date(date) {
    return new Intl.DateTimeFormat(
        "en-US",
        {
            timeZone: TIMEZONE,
            month: "long",
            day: "numeric",
            year: "numeric",
        },
    ).format(date);
}

function get_time(date) {
    return new Intl.DateTimeFormat(
        "en-US",
        {
            timeZone: TIMEZONE,
            hour: "numeric",
            minute: "numeric",
            hour12: true
        },
    ).format(date);
}

function get_weekday(date) {
    return new Intl.DateTimeFormat(
        "en-US",
        {
            timeZone: TIMEZONE,
            weekday: "long"
        },
    ).format(date);
}

function find(parts, type) {
    const part = parts.find(part => part.type === type);
    return part?.value;
}

function get_datetime_local(date) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    }).formatToParts(date);

    const get = (type) => {
        const part = parts.find(p => p.type === type);
        return part.value;
    };
    const year = find(parts, "year");
    const month = find(parts, "month");
    const day = find(parts, "day");
    const hour = find(parts, "hour");
    const minute = find(parts, "minute");
    return `${year}-${month}-${day}T${hour}:${minute}`;
}

function equals(a, b) {
    return String(a) === String(b);
}

exports.block = block_directive;
exports.date = get_date;
exports.datetime_local = get_datetime_local;
exports.eq = equals;
exports.time = get_time;
exports.weekday = get_weekday;
