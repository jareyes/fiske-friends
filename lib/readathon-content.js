// Words and lists for the January 2027 Read-a-thon.
// Everything here is meant to be edited by the committee without touching the logic.

// Goals are for the whole month, so a missed day is no big deal.
// minutes is the month's total. The "about 15 minutes, most days" hint is worked out from the days left.
const GOALS = [
    {minutes: 120, name: "A little nibble"},
    {minutes: 300, name: "A chapter"},
    {minutes: 600, name: "A cozy evening"},
    {minutes: 1200, name: "Total bookworm"},
];
const DEFAULT_GOAL_MINUTES = 300;

const AGE_GROUPS = [
    {id: "kid", name: "Kid"},
    {id: "teen", name: "Teen"},
    {id: "adult", name: "Grown-up"},
];

// Two-letter codes are what's saved
const STATES = [
    ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"],
    ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"], ["DC", "District of Columbia"],
    ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"],
    ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"],
    ["ME", "Maine"], ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"],
    ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"],
    ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"],
    ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"], ["OR", "Oregon"],
    ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"], ["SD", "South Dakota"],
    ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"],
    ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
].map(([id, name]) => ({id, name}));

const FORMATS = ["Book", "Audiobook", "Read aloud", "Comics", "Magazine"];

// Bingo cards: one for kids, one for teens, one for grown-ups. Each reader gets the card for the age they
// picked at sign-up. To edit a card:
// - Keep exactly 25 squares, written row by row (5 rows of 5). The middle square (the 13th) must be free.
// - A plain square is one people tap when they've done it: {label: "Read a graphic novel"}
// - An event square is marked with the code shown at the event: {label: "...", kind: "event", code: "SILENT"}
//   Codes are letters only, and the same code can be used on more than one card.
// - An automatic square fills in from the reading log. The keys that work are streak7 (7 days in a row),
//   hours5 (5 hours in all) and recommended (recommended a book): {label: "...", kind: "auto", key: "hours5"}
// npm test checks every card follows these rules.
const BINGO_CARDS = {
    kid: {
        title: "Kids' card",
        squares: [
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
        ],
    },
    teen: {
        title: "Teen card",
        squares: [
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
        ],
    },
    adult: {
        title: "Grown-up card",
        squares: [
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
        ],
    },
};

// Placeholder schedule until the library confirms dates and rooms.
// Events now live in the main site's events table, tagged with the read-a-thon's series
// (readathon.event_tag in the config). Add and edit them at /plan/events.

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
exports.BINGO_CARDS = BINGO_CARDS;
exports.BOOKS = BOOKS;
exports.FORMATS = FORMATS;
exports.FUNDRAISING_PURPOSE = FUNDRAISING_PURPOSE;
exports.DEFAULT_GOAL_MINUTES = DEFAULT_GOAL_MINUTES;
exports.GOALS = GOALS;
exports.LISTS = LISTS;
exports.STATES = STATES;
