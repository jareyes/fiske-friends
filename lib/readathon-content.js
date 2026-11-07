// Words and lists for the January 2027 Read-a-thon.
// Everything here is meant to be edited by the committee without touching the logic.

const GOALS = [
    {minutes: 5, name: "A little nibble", hint: "5 minutes a day"},
    {minutes: 15, name: "A chapter", hint: "15 minutes a day"},
    {minutes: 30, name: "A cozy evening", hint: "30 minutes a day"},
    {minutes: 60, name: "Total bookworm", hint: "60 minutes a day"},
];

const AGE_GROUPS = [
    {id: "kid", name: "Kid"},
    {id: "teen", name: "Teen"},
    {id: "adult", name: "Grown-up"},
];

const FORMATS = ["Book", "Audiobook", "Read aloud", "Comics", "Magazine"];

// kind: "free" (center), "auto" (worked out from the log), "event" (marked with a code)
const BINGO_SQUARES = [
    {label: "Read a book by a NH or VT author"},
    {label: "Go to Silent Book Club", kind: "event", code: "SILENT"},
    {label: "Read a graphic novel"},
    {label: "Listen to an audiobook"},
    {label: "Read aloud to someone"},

    {label: "Read outside (bundle up!)"},
    {label: "Visit the library"},
    {label: "Read a book from the year you were born"},
    {label: "Read 7 days in a row", kind: "auto", key: "streak7"},
    {label: "Try a kind of book you never read"},

    {label: "Read with cocoa or tea"},
    {label: "Go to the author talk", kind: "event", code: "AUTHOR"},
    {label: "Sign up!", kind: "free"},
    {label: "Read a poem out loud"},
    {label: "Get or renew a library card"},

    {label: "Read at a local cafe"},
    {label: "Read in your pajamas"},
    {label: "Take a book from the swap table"},
    {label: "Read for 5 hours in all", kind: "auto", key: "hours5"},
    {label: "Read a librarian's pick"},

    {label: "Join the read-in marathon", kind: "event", code: "MARATHON"},
    {label: "Read a book under 100 pages"},
    {label: "Bring a friend to an event"},
    {label: "Read a book set somewhere cold"},
    {label: "Recommend a book", kind: "auto", key: "recommended"},
];

// Placeholder schedule until the library confirms dates and rooms.
const EVENTS = [
    {day: "2027-01-02", at: "10 AM to 1 PM", title: "Kickoff open house", where: "Whole library", blurb: "Pick up your kit and get help signing up."},
    {day: "2027-01-07", at: "6:30 PM", title: "Silent Book Club", where: "Reading Room", blurb: "Read quietly together. Cocoa and low lamps."},
    {day: "2027-01-09", at: "10:30 AM", title: "Pajama story time", where: "Children's Room", blurb: "Wear your pajamas. Hot cocoa after."},
    {day: "2027-01-14", at: "6:30 PM", title: "Silent Book Club", where: "Reading Room", blurb: "Read quietly together. Cocoa and low lamps."},
    {day: "2027-01-16", at: "2 PM", title: "Author talk", where: "Community Room", blurb: "A New Hampshire author, to be announced."},
    {day: "2027-01-18", at: "10:30 AM", title: "MLK Day read-aloud", where: "Children's Room", blurb: "No school today. Stories and card-making."},
    {day: "2027-01-21", at: "6:30 PM", title: "Silent Book Club", where: "Reading Room", blurb: "Read quietly together. Cocoa and low lamps."},
    {day: "2027-01-22", at: "5 PM", title: "Teen night: manga and pizza", where: "Teen corner", blurb: "Ages 12 to 18."},
    {day: "2027-01-28", at: "6:30 PM", title: "Silent Book Club", where: "Reading Room", blurb: "Read quietly together. Cocoa and low lamps."},
    {day: "2027-01-30", at: "10 AM to 6 PM", title: "Read-in marathon", where: "Whole library", blurb: "Drop in and read for any amount of time."},
    {day: "2027-02-06", at: "Noon", title: "Finale party", where: "Community Room", blurb: "Pizza, prizes, and the big total."},
];

// What the money is for. Placeholder until the board decides.
const FUNDRAISING_PURPOSE = "new large-print books and audiobooks at the Fiske Free Library";

const LISTS = [
    {id: "library", name: "Library picks", blurb: "Chosen by Fiske Free Library staff."},
    {id: "kids", name: "Kids' picks", blurb: "Picked by kids, for kids."},
    {id: "easy", name: "Easy reads", blurb: "Short and welcoming. Most take an evening or two."},
    {id: "classics", name: "Classics", blurb: "Loved for generations. Many are free as e-books."},
    {id: "local", name: "New England authors", blurb: "Writers from New Hampshire and nearby."},
    {id: "cozy", name: "Cozy winter", blurb: "Snow, warmth, and comfort."},
    {id: "teens", name: "Teens", blurb: "For readers 12 and up."},
    {id: "community", name: "Community picks", blurb: "Recommended by read-a-thon readers."},
];

const AUDIENCES = ["All ages", "Little kids", "Kids", "Teens", "Grown-ups"];

// Sample titles. Library staff will supply the real Library picks and Easy reads.
const BOOKS = [
    ["Ox-Cart Man", "Donald Hall", ["local", "kids", "cozy"], "A New Hampshire farm family through the seasons. Donald Hall lived in Wilmot, NH.", "Fiske children's staff", "Little kids"],
    ["The Lincoln Highway", "Amor Towles", ["library"], "A road trip in 1954 with four unforgettable young men.", "Fiske staff", "Grown-ups"],
    ["Remarkably Bright Creatures", "Shelby Van Pelt", ["library", "cozy"], "A widow, a night-shift job, and a very clever octopus.", "Fiske staff", "Grown-ups"],
    ["Project Hail Mary", "Andy Weir", ["library"], "A science teacher wakes up alone on a spaceship. Great as an audiobook.", "Fiske staff", "Grown-ups"],
    ["Dog Man", "Dav Pilkey", ["kids", "easy"], "It's so funny and the pictures are the best part.", "Katie, age 8", "Kids"],
    ["The Wild Robot", "Peter Brown", ["kids"], "A robot learns to live on an island with animals. I read it twice.", "Ava, age 9", "Kids"],
    ["Wings of Fire: The Dragonet Prophecy", "Tui T. Sutherland", ["kids"], "Dragons! Every chapter ends so you have to keep going.", "Owen, age 10", "Kids"],
    ["Hatchet", "Gary Paulsen", ["kids", "teens"], "A boy survives alone in the woods with just a hatchet.", "Leo, age 11", "Kids"],
    ["Frog and Toad Are Friends", "Arnold Lobel", ["easy", "kids", "classics"], "Five gentle stories about two best friends.", "Fiske children's staff", "Little kids"],
    ["Small Things Like These", "Claire Keegan", ["easy", "library", "cozy"], "A quiet, powerful story set in a small Irish town at Christmas.", "Fiske staff", "Grown-ups"],
    ["The Old Man and the Sea", "Ernest Hemingway", ["easy", "classics"], "One fisherman, one giant fish. Short enough for a weekend.", "Friends book group", "Grown-ups"],
    ["Little Women", "Louisa May Alcott", ["classics", "cozy", "local"], "Four sisters growing up in Massachusetts. It opens at Christmas.", "Friends book group", "All ages"],
    ["The Call of the Wild", "Jack London", ["classics", "easy"], "A dog's adventure in the frozen Yukon.", "Friends book group", "Teens"],
    ["Our Town", "Thornton Wilder", ["classics", "local", "easy"], "The play set in Grover's Corners, New Hampshire. Reads in one sitting.", "Friends book group", "Teens"],
    ["Strega Nona", "Tomie dePaola", ["local", "kids", "classics"], "A magic pasta pot gets out of hand. Tomie dePaola lived in New London, NH.", "Fiske children's staff", "Little kids"],
    ["The Snowy Day", "Ezra Jack Keats", ["cozy", "kids", "classics"], "A boy explores his city after a snowfall.", "Fiske children's staff", "Little kids"],
    ["Owl Moon", "Jane Yolen", ["cozy", "kids"], "A child and father go owling on a snowy night.", "Fiske children's staff", "Little kids"],
    ["The Snow Child", "Eowyn Ivey", ["cozy"], "An Alaskan homesteading couple and a mysterious girl in the snow.", "Fiske staff", "Grown-ups"],
    ["Heartstopper, Volume 1", "Alice Oseman", ["teens", "easy"], "A sweet graphic novel about friendship and first crushes.", "Stevens High Book Club", "Teens"],
    ["The Hunger Games", "Suzanne Collins", ["teens"], "The book that hooked a generation of readers.", "Stevens High Book Club", "Teens"],
].map(([title, author, lists, why, recommended_by, audience]) => ({
    title, author, lists, why, recommended_by, audience,
}));

exports.AGE_GROUPS = AGE_GROUPS;
exports.AUDIENCES = AUDIENCES;
exports.BINGO_SQUARES = BINGO_SQUARES;
exports.BOOKS = BOOKS;
exports.EVENTS = EVENTS;
exports.FORMATS = FORMATS;
exports.FUNDRAISING_PURPOSE = FUNDRAISING_PURPOSE;
exports.GOALS = GOALS;
exports.LISTS = LISTS;
