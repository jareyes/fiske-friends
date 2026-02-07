const csv_parser = require("csv-parser");
const {Transform} = require("node:stream");

function trim() {
    return new Transform({
        transform(chunk, encoding, callback) {
            const text = chunk.toString();
            const trimmed_text = text.replace(/\s*,\s*/g, ",");
            callback(null, trimmed_text);
        },
    });
}

function normalize_header(header) {
    return header.toLowerCase().trim();
}

function normalize_obj(obj) {
    const normalized_obj = {};
    for(const [key, value] of Object.entries(obj)) {
        const normalized_key = normalize_header(key);
        normalized_obj[normalized_key] = value.trim();
    }
    return normalized_obj;
}

function parse_headers(actual, expected, reject) {
    const normalized_headers = actual.map(normalize_header);
    const missing_headers = expected.filter(header => !normalized_headers.includes(header));
    if(missing_headers.length > 0) {
        const msg = `The header is missing the columns: ${missing_headers.join(", ")}`;
        const err = new RangeError(msg);
        reject(err);
    }
}

/* async */  function parse(readable, headers) {
    return new Promise((resolve, reject) => {
        const rows = [];

        const parser = csv_parser();
        
        const headers_handler = (csv_headers) => parse_headers(csv_headers, headers, reject);
        const row_handler = (row) => rows.push(normalize_obj(row));
        const success_handler = () => resolve(rows);

        parser.on("headers", headers_handler);
        parser.on("data", row_handler);
        parser.on("end", success_handler);
        parser.on("error", reject);
        
        readable.pipe(trim()).pipe(parser);
    });
}

exports.parse = parse;
