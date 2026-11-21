// Links to a book in the Fiske Free Library's public catalog (Atriuum, by Book Systems). There's no
// catalog access here, so each link is a catalog search for the book's title and author's last name,
// which opens on the library's copies (or "no results" if it doesn't have one).
//
// The link patterns are in config readathon.catalog, so if the catalog's addresses change, it's a
// settings fix. {title} and {author} are filled in.
const config = require("config");

const SETTINGS = config.has("readathon.catalog") ? config.get("readathon.catalog") : {};
// Name endings that aren't a last name
const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "phd", "md"]);

// "The Lincoln Highway: A Novel" -> "The Lincoln Highway". Catalogs often store a subtitle separately.
function main_title(title) {
    return String(title ?? "").split(/\s*[:;]\s+|\s+\(|\s+[-–—]\s+/)[0].trim();
}

// The first author's last name: "Donald Hall" -> "Hall", "Hall, Donald" -> "Hall",
// "Ruth Krauss and Crockett Johnson" -> "Krauss", "Martin Luther King Jr." -> "King"
function surname(author) {
    const first = String(author ?? "").split(/\s+(?:and|&|with)\s+|;|\//i)[0].trim();
    if(first === "") {
        return "";
    }
    // "Last, First" (a comma with a single word before it)
    const comma = first.split(",").map(part => part.trim());
    if(comma.length > 1 && !comma[0].includes(" ")) {
        return comma[0];
    }
    const words = comma[0].split(/\s+/).map(word => word.replace(/[.,]/g, "")).filter(Boolean);
    while(words.length > 1 && SUFFIXES.has(words.at(-1).toLowerCase())) {
        words.pop();
    }
    return words.at(-1) ?? "";
}

// The catalog search for a book, or null if there's no catalog set up
function book_url(book, settings = SETTINGS) {
    const title = main_title(book?.title);
    if(title === "") {
        return null;
    }
    const author = surname(book?.author);
    const template = author ? settings.search_url : (settings.title_search_url ?? null);
    if(!template) {
        return null;
    }
    return template
        .replaceAll("{title}", encodeURIComponent(title))
        .replaceAll("{author}", encodeURIComponent(author));
}

exports.book_url = book_url;
exports.main_title = main_title;
exports.surname = surname;
