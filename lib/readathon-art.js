// The read-a-thon's winter night scene, drawn once and used two ways: as the hero banner on the give and
// cheer pages, and as the background of the sharing images (lib/readathon-og.js). Plain SVG with the
// colors written in (no CSS classes), so it looks the same in a browser and in the image renderer.
//
// A snowy library with lit windows, pine trees, and a stack of books wrapped up like a gift. The cheer
// version adds bunting.
const COLORS = {
    night: "#1f2559",
    night_2: "#2d3680",
    snow: "#f3f5fc",
    snow_back: "#dfe6ff",
    lamp: "#ffc83d",
    lamp_deep: "#d99c08",
    mitten: "#e5483f",
    pine: "#2b8562",
    tree: "#1d6b4e",
    sky: "#6684f5",
    brick: "#7a3b2e",
    brick_dark: "#5c2b25",
    stone: "#e8dccb",
};

// A pine tree, like the ones on the home page. x, y: the middle of its base. Trees are all one color,
// so they're spaced so none overlaps another (it would disappear into it).
function tree(x, y, size = 1) {
    return `<g transform="translate(${x} ${y}) scale(${size})">
      <path d="M-30 0 L0 -70 L30 0 Z M-22 -34 L0 -96 L22 -34 Z" fill="${COLORS.tree}"/>
    </g>`;
}

// An arched window, lit. x: its left edge; it sits on y.
function window_lit(x, y, width = 44, height = 54) {
    const r = width / 2;
    return `<circle cx="${x + r}" cy="${y - height / 2}" r="${width}" fill="${COLORS.lamp}" opacity="0.16"/>
      <path d="M${x} ${y} V${y - height + r} a${r} ${r} 0 0 1 ${width} 0 V${y} Z" fill="${COLORS.lamp}"/>
      <path d="M${x + r} ${y} V${y - height} M${x} ${y - height / 2 + 4} H${x + width}" stroke="${COLORS.brick}" stroke-width="3"/>
      <rect x="${x - 4}" y="${y}" width="${width + 8}" height="5" rx="2" fill="#fff"/>`;
}

// The library: brick, a snowy roof, warm windows and an open door. x, y: bottom left.
function library(x, y) {
    return `<g transform="translate(${x} ${y})">
      <rect x="-12" y="-12" width="284" height="12" rx="3" fill="#cdd6f5"/>
      <rect x="0" y="-132" width="260" height="120" fill="${COLORS.brick}"/>
      <rect x="-8" y="-142" width="276" height="12" fill="${COLORS.stone}"/>
      <path d="M-16 -142 L130 -200 L276 -142 Z" fill="${COLORS.brick_dark}"/>
      <path d="M-18 -143 L130 -202 L278 -143" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M130 -160 C 122 -166 112 -167 104 -165 V-147 C 112 -149 122 -148 130 -142 C 138 -148 148 -149 156 -147 V-165 C 148 -167 138 -166 130 -160 Z" fill="${COLORS.lamp}"/>
      <path d="M130 -160 V-142" stroke="${COLORS.brick_dark}" stroke-width="2"/>
      <path d="M137 -164 H143 V-140 L140 -143 L137 -140 Z" fill="${COLORS.mitten}"/>
      ${window_lit(26, -44)}
      ${window_lit(190, -44)}
      <rect x="80" y="-130" width="12" height="118" fill="${COLORS.stone}"/>
      <rect x="168" y="-130" width="12" height="118" fill="${COLORS.stone}"/>
      <rect x="76" y="-132" width="20" height="6" fill="${COLORS.stone}"/><rect x="164" y="-132" width="20" height="6" fill="${COLORS.stone}"/>
      <circle cx="130" cy="-50" r="44" fill="${COLORS.lamp}" opacity="0.18"/>
      <path d="M106 -12 V-66 a24 24 0 0 1 48 0 V-12 Z" fill="#ffb627"/>
      <path d="M130 -12 V-90" stroke="${COLORS.brick}" stroke-width="3"/>
      <circle cx="122" cy="-40" r="2.5" fill="${COLORS.brick}"/><circle cx="138" cy="-40" r="2.5" fill="${COLORS.brick}"/>
    </g>`;
}

// Three books tied up with a ribbon and a bow. x, y: the middle of the bottom.
function gift_books(x, y, size = 1) {
    return `<g transform="translate(${x} ${y}) scale(${size})">
      <ellipse cx="0" cy="2" rx="104" ry="8" fill="#000" opacity="0.12"/>
      <rect x="-96" y="-34" width="192" height="34" rx="7" fill="${COLORS.mitten}"/>
      <rect x="-88" y="-26" width="176" height="5" rx="2.5" fill="#fff" opacity="0.7"/>
      <rect x="-80" y="-64" width="164" height="30" rx="7" fill="${COLORS.pine}"/>
      <rect x="52" y="-64" width="12" height="30" fill="${COLORS.snow_back}" opacity="0.5"/>
      <rect x="-88" y="-92" width="174" height="28" rx="7" fill="${COLORS.sky}"/>
      <rect x="-80" y="-82" width="158" height="5" rx="2.5" fill="#fff" opacity="0.7"/>
      <rect x="-11" y="-92" width="22" height="92" fill="${COLORS.lamp}"/>
      <rect x="-11" y="-92" width="4" height="92" fill="${COLORS.lamp_deep}" opacity="0.5"/>
      <path d="M0 -94 C -30 -136 -70 -118 -48 -98 C -36 -88 -14 -92 0 -94 Z" fill="${COLORS.lamp}" stroke="${COLORS.lamp_deep}" stroke-width="3"/>
      <path d="M0 -94 C 30 -136 70 -118 48 -98 C 36 -88 14 -92 0 -94 Z" fill="${COLORS.lamp}" stroke="${COLORS.lamp_deep}" stroke-width="3"/>
      <circle cx="0" cy="-96" r="10" fill="${COLORS.lamp_deep}"/>
    </g>`;
}

// A string of little flags across the top, for cheering someone on
function bunting(width, y = 26, sag = 34) {
    const colors = [COLORS.lamp, COLORS.mitten, COLORS.sky, COLORS.pine];
    const count = Math.max(8, Math.round(width / 70));
    const point = t => ({x: t * width, y: y + 4 * sag * t * (1 - t)});
    let flags = "";
    for(let i = 0; i < count; i++) {
        const a = point((i + 0.15) / count);
        const b = point((i + 0.85) / count);
        const mid = {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + 30};
        flags += `<path d="M${a.x.toFixed(1)} ${a.y.toFixed(1)} L${b.x.toFixed(1)} ${b.y.toFixed(1)} L${mid.x.toFixed(1)} ${mid.y.toFixed(1)} Z" fill="${colors[i % colors.length]}"/>`;
    }
    return `<path d="M0 ${y} Q${width / 2} ${y + 2 * sag} ${width} ${y}" fill="none" stroke="#fff" stroke-width="2" opacity="0.7"/>${flags}`;
}

// The scene. width, height: its size; focus: where the library and books go across it (0 to 1);
// sky: false leaves the sky clear for the page's own background; cheer: bunting.
// size: how big the library, trees and books are drawn.
// left_trees: false keeps the left side clear, for text on the sharing images.
// bunting_y: how far down the bunting hangs from.
// ground_gap: how much snow there is below the library.
function scene({width = 1200, height = 630, focus = 0.5, sky = true, cheer = false, size = 1, left_trees = true, bunting_y = 26, ground_gap = 96, id = "ra-art"} = {}) {
    const ground = height - ground_gap;
    const fx = width * focus;
    // Grow the scenery from the point where the library meets the snow
    const grow = inner => size === 1 ? inner : `<g transform="translate(${fx} ${ground}) scale(${size}) translate(${-fx} ${-ground})">${inner}</g>`;
    return `<defs>
        <radialGradient id="${id}-sky" cx="0.8" cy="0" r="1.2"><stop offset="0" stop-color="${COLORS.night_2}"/><stop offset="0.7" stop-color="${COLORS.night}"/></radialGradient>
      </defs>
      ${sky ? `<rect width="${width}" height="${height}" fill="url(#${id}-sky)"/>` : ""}
      <mask id="${id}-moon"><rect width="${width}" height="${height}" fill="#fff"/><circle cx="${width - 94}" cy="74" r="30" fill="#000"/></mask>
      <circle cx="${width - 110}" cy="86" r="34" fill="${COLORS.lamp}" mask="url(#${id}-moon)"/>
      ${cheer ? bunting(width, bunting_y, bunting_y < 20 ? 20 : 34) : ""}
      <path d="M0 ${ground} C ${width * 0.15} ${ground - 22} ${width * 0.3} ${ground - 6} ${width * 0.45} ${ground - 12} C ${width * 0.62} ${ground - 20} ${width * 0.8} ${ground - 28} ${width} ${ground - 8} V${height} H0 Z" fill="${COLORS.snow_back}"/>
      ${grow(`${left_trees ? `${tree(fx - 352, ground - 4, 1.1)}${tree(fx - 278, ground + 2, 0.8)}` : ""}
      ${library(fx - 236, ground - 2)}
      ${tree(fx + 286, ground - 8, 1.15)}${tree(fx + 366, ground - 2, 0.85)}`)}
      <path d="M0 ${ground + 26} C ${width * 0.2} ${ground + 12} ${width * 0.38} ${ground + 32} ${width * 0.55} ${ground + 22} C ${width * 0.72} ${ground + 12} ${width * 0.86} ${ground + 30} ${width} ${ground + 18} V${height} H0 Z" fill="${COLORS.snow}"/>
      ${grow(gift_books(fx + 150, ground + 34))}`;
}

// A whole <svg> of the scene, for the page heroes
function scene_svg(options = {}) {
    const {width = 1200, height = 330} = options;
    return `<svg class="ra-give-art" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">${scene({width, height, ...options})}</svg>`;
}

exports.COLORS = COLORS;
exports.scene = scene;
exports.scene_svg = scene_svg;
