const csv = require("../lib/csv");
const Router = require("express");
const Member = require("../lib/member");
const multer = require("multer");
const {Readable} = require("node:stream");

const HEADERS = [
    "first_name",
    "last_name",
    "email",
    "address_line1",
    "address_line2",
    "city",
    "state",
    "zipcode",
    "telephone",
];
const UPLOAD_LIMIT_MB = 10 * 1024 * 1024;

function rollback(sqlite) {
    if(!sqlite.isTranaction) {
        return;
    }
    try {
        sqlite.exec("ROLLBACK");
    }
    catch(err) {
        console.log(err);
    }
}

async function import_csv(req, res, next, sqlite) {
    if(req.file === undefined) {
        res.status(400);
        return res.send("No CSV file");
    }

    try {
        const readable = Readable.from(req.file.buffer);
        const members = await csv.parse(readable, HEADERS);
        // Save in a transaction
        sqlite.exec("BEGIN TRANSACTION");
        for(const member of members) {
            Member.save(sqlite, member);
        }
        sqlite.exec("COMMIT");
        return res.send("COOL");
    }
    catch(err) {
        rollback(sqlite);
        next(err);
    }
}

function create(sqlite) {
    const router = new Router();
    const upload = multer({
        limits: UPLOAD_LIMIT_MB,
        storage: multer.memoryStorage(),
        fileFilter: (req, file, callback) => {
            if(file.mimetype === "text/csv") {
                return callback(null, true);
            }
            const err = new Error("Only CSV files are allowed");
            callback(err, false);
        },
    });
    router.get("/import", (req, res) => res.render("memberships/import"));
    router.post(
        "/import",
        upload.single("csv_file"),
        (req, res, next) => import_csv(req, res, next, sqlite),
    );
    return router;
}

exports.create = create;
