const fs = require("node:fs");
const path = require("node:path");

async function readdir(dirpath) {
    const filenames = await fs.promises.readdir(dirpath);
    const filepaths = [];
    for(const filename of filenames) {
        const filepath = path.join(dirpath, filename);
        filepaths.push(filepath);
    }
    return filepaths;
}

exports.readdir = readdir;
