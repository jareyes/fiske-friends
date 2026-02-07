const config = require("config");

const MS_PER_MIN = 1000 * 60;
const TIMEZONE = config.get("app.timezone");

function get_timezone_offset(timezone, now=new Date()) {
    const local_now = new Date(
        now.toLocaleString(
            "en-US",
            {timeZone: timezone},
        ),
    );
    const utc_now = new Date(
        now.toLocaleString(
            "en-US",
            {timeZone: "UTC"},
        ),
    );
    const offset_min = (local_now - utc_now) / MS_PER_MIN;
    // Format as "[+-]HH:MM"
    const sign = (offset_min > 0)? "+" : "-";
    const total_min = Math.abs(offset_min);
    const hours = `${Math.floor(total_min / 60)}`;
    const minutes =`${total_min % 60}`;

    return `${sign}${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
}

function parse_datetime_local(
    datetime_local,
    timezone=TIMEZONE,
    now=new Date(),
) {
    const tz_offset = get_timezone_offset(timezone, now);
    const iso_date = `${datetime_local}${tz_offset}`;
    return Date.parse(iso_date);
}

exports.parse_datetime_local = parse_datetime_local;
exports.timezone_offset = get_timezone_offset;
