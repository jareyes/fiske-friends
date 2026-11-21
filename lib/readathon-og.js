// Sharing images: the picture a link shows when it's posted to Facebook, texted, or pasted into Slack
// (og:image). 1200 x 630 PNGs drawn from SVG with resvg, using the site's own fonts (fonts/, both under
// the SIL Open Font License), and kept in memory once drawn.
//
//   site:  the read-a-thon, for most pages
//   give:  the give page
//   cheer: a reader's cheer page, with their initial, name and goal
const fs = require("node:fs");
const path = require("node:path");
const {Resvg} = require("@resvg/resvg-js");
const Art = require("./readathon-art");

const WIDTH = 1200;
const HEIGHT = 630;
const FONT_DIRPATH = path.join(__dirname, "..", "fonts");
const FONT_FILES = ["Fredoka-SemiBold.ttf", "Nunito-Bold.ttf", "Nunito-ExtraBold.ttf"].map(name => path.join(FONT_DIRPATH, name));
const LOGO = fs.readFileSync(path.join(__dirname, "..", "static", "img", "readathon", "logo.svg"), "utf8")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^[\s\S]*?<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "");
// The avatar colors, the same as .a0 to .a5 in readathon.css
const AVATAR_COLORS = [Art.COLORS.mitten, Art.COLORS.pine, Art.COLORS.sky, Art.COLORS.lamp, "#8a5cd6", "#178f8f"];
const MAX_CACHED = 500;
const cache = new Map();

function escape(text) {
    return String(text ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"})[c]);
}

const FONT_OPTIONS = {fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: "Nunito"};
const widths = new Map();

// How wide text really draws, in pixels, measured with the actual font
function measure(text, family, weight, size) {
    const key = `${family}|${weight}|${size}|${text}`;
    if(!widths.has(key)) {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="${size * 2}"><text x="0" y="${size * 1.5}" font-family="${family}" font-weight="${weight}" font-size="${size}">${escape(text)}</text></svg>`;
        widths.set(key, new Resvg(svg, {font: FONT_OPTIONS}).getBBox()?.width ?? 0);
    }
    return widths.get(key);
}

// Splits text into lines no wider than max_width. Returns null if it needs more than max_lines.
function wrap(text, font, max_width, max_lines) {
    const fits = line => measure(line, font.family, font.weight, font.size) <= max_width;
    const lines = [];
    let line = "";
    for(const word of String(text).split(/\s+/).filter(Boolean)) {
        const longer = line ? `${line} ${word}` : word;
        if(fits(longer)) {
            line = longer;
        }
        else if(line && fits(word)) {
            lines.push(line);
            line = word;
        }
        else {
            return null;
        }
    }
    if(line) {
        lines.push(line);
    }
    return lines.length <= max_lines ? lines : null;
}

// The text cut to fit one line, with "…"
function shorten(text, font, max_width) {
    let cut = String(text);
    while(cut.length > 1 && measure(`${cut}…`, font.family, font.weight, font.size) > max_width) {
        cut = cut.slice(0, -1);
    }
    return `${cut.trimEnd()}…`;
}

function text_lines(lines, font, x, y, line_height) {
    return lines.map((line, i) =>
        `<text x="${x}" y="${(y + i * font.size * line_height).toFixed(1)}" font-family="${font.family}" font-weight="${font.weight}" font-size="${font.size}" fill="${font.fill}">${escape(line)}</text>`,
    ).join("");
}

// A rounded label, like "January 1 to 31, 2027"
function chip(text, x, y) {
    const font = {family: "Nunito", weight: 800, size: 25};
    const width = Math.round(measure(text, font.family, font.weight, font.size) + 44);
    return `<rect x="${x}" y="${y}" width="${width}" height="50" rx="25" fill="${Art.COLORS.lamp}"/>
      <text x="${x + 22}" y="${y + 34}" font-family="Nunito" font-weight="800" font-size="${font.size}" fill="#1c1f3f">${escape(text)}</text>`;
}

const TEXT_X = 72;
const TEXT_WIDTH = 560;
// The text sits between the logo and the snow
const TEXT_TOP = 168;
const TEXT_BOTTOM = 522;
// Title and description sizes to try, biggest first
const SIZES = [[84, 30], [76, 28], [68, 27], [60, 25], [54, 23], [48, 22]];

function card({title, subtitle, label, avatar = null, cheer = false}) {
    const parts = [];
    // The logo and name, top left
    parts.push(`<g transform="translate(${TEXT_X} 56) scale(${64 / 42})">${LOGO}</g>
      <text x="${TEXT_X + 82}" y="88" font-family="Fredoka" font-weight="600" font-size="34" fill="#fff">Resolve to Read</text>
      <text x="${TEXT_X + 82}" y="116" font-family="Nunito" font-weight="700" font-size="20" fill="#c9d2ff">Friends of the Fiske Free Library</text>`);

    // The biggest sizes at which everything fits in the space
    const avatar_height = avatar ? 86 : 0;
    const chip_height = label ? 50 + 26 : 0;
    let layout = null;
    for(const [title_size, sub_size] of SIZES) {
        const title_font = {family: "Fredoka", weight: 600, size: title_size, fill: "#fff"};
        const sub_font = {family: "Nunito", weight: 700, size: sub_size, fill: "#e8ebff"};
        const title_lines = wrap(title, title_font, TEXT_WIDTH, 2);
        const sub_lines = subtitle ? wrap(subtitle, sub_font, TEXT_WIDTH, 3) : [];
        if(!title_lines || !sub_lines) {
            continue;
        }
        const height = avatar_height + title_lines.length * title_size * 1.06 + (sub_lines.length ? 14 + sub_lines.length * sub_size * 1.32 : 0) + chip_height;
        if(height <= TEXT_BOTTOM - TEXT_TOP) {
            layout = {title_font, sub_font, title_lines, sub_lines, height};
            break;
        }
    }
    if(layout === null) {
        // Too long for any size (a very long name): one line of each, cut short
        const [title_size, sub_size] = SIZES.at(-1);
        const title_font = {family: "Fredoka", weight: 600, size: title_size, fill: "#fff"};
        const sub_font = {family: "Nunito", weight: 700, size: sub_size, fill: "#e8ebff"};
        layout = {title_font, sub_font, title_lines: [shorten(title, title_font, TEXT_WIDTH)],
            sub_lines: subtitle ? [shorten(subtitle, sub_font, TEXT_WIDTH)] : [], height: 0};
    }

    // Centered in the space between the logo and the snow
    let y = TEXT_TOP + Math.max(0, (TEXT_BOTTOM - TEXT_TOP - layout.height) / 2);
    if(avatar) {
        const color = AVATAR_COLORS[avatar.color % AVATAR_COLORS.length] ?? Art.COLORS.mitten;
        parts.push(`<circle cx="${TEXT_X + 38}" cy="${y + 38}" r="38" fill="${color}" stroke="#fff" stroke-width="5"/>
          <text x="${TEXT_X + 38}" y="${y + 55}" text-anchor="middle" font-family="Fredoka" font-weight="600" font-size="46" fill="${color === Art.COLORS.lamp ? "#1c1f3f" : "#fff"}">${escape(avatar.initial)}</text>`);
        y += avatar_height;
    }
    const {title_font, sub_font} = layout;
    y += title_font.size * 0.8;
    parts.push(text_lines(layout.title_lines, title_font, TEXT_X, y, 1.06));
    y += title_font.size * 1.06 * (layout.title_lines.length - 1);
    if(layout.sub_lines.length) {
        y += 14 + sub_font.size * 1.25;
        parts.push(text_lines(layout.sub_lines, sub_font, TEXT_X, y, 1.32));
        y += sub_font.size * 1.32 * (layout.sub_lines.length - 1);
    }
    if(label) {
        parts.push(chip(label, TEXT_X, y + 24));
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
      ${Art.scene({width: WIDTH, height: HEIGHT, focus: 0.755, size: 1.15, cheer, left_trees: false, bunting_y: 6, id: "og"})}
      ${parts.join("")}
    </svg>`;
}

function render(key, build) {
    if(cache.has(key)) {
        return cache.get(key);
    }
    const png = new Resvg(build(), {
        fitTo: {mode: "width", value: WIDTH},
        font: FONT_OPTIONS,
    }).render().asPng();
    if(cache.size >= MAX_CACHED) {
        cache.delete(cache.keys().next().value);
    }
    cache.set(key, png);
    return png;
}

function site_image(date_range) {
    return render(`site|${date_range}`, () => card({
        title: "A month of reading together",
        subtitle: "A read-a-thon for every age at the Fiske Free Library. No rules, just read.",
        label: date_range,
    }));
}

function give_image(purpose) {
    return render(`give|${purpose}`, () => card({
        title: "Give to the read-a-thon",
        subtitle: `Every gift supports ${purpose}.`,
        label: "Every minute read counts",
    }));
}

// reader: {name, initial, color, goal_label}
function cheer_image(reader) {
    return render(`cheer|${reader.name}|${reader.color}|${reader.goal_label}`, () => card({
        title: `Cheer on ${reader.name}!`,
        subtitle: `${reader.name} is reading all January for the Fiske Free Library.`,
        label: reader.goal_label ? `Goal: ${reader.goal_label} of reading` : null,
        avatar: {initial: reader.initial, color: Number(reader.color) || 0},
        cheer: true,
    }));
}

exports.HEIGHT = HEIGHT;
exports.WIDTH = WIDTH;
exports.cheer_image = cheer_image;
exports.give_image = give_image;
exports.site_image = site_image;
exports.measure = measure;
exports.wrap = wrap;
