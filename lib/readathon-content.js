// Words and lists for the January 2027 Read-a-thon.
// Everything here is meant to be edited by the committee without touching the logic.

// Goals are for the whole month, so a missed day is no big deal.
// minutes is the month's total. The "about 10 minutes a day" hint spreads it over the days left. Families can
// also type their own goal ("My own goal"), from MIN_OWN_GOAL_HOURS up.
const GOALS = [
    {minutes: 120, name: "A little nibble"},
    {minutes: 300, name: "A chapter"},
    {minutes: 600, name: "A cozy evening"},
    {minutes: 1200, name: "Total bookworm"},
    {minutes: 2400, name: "Reading marathon"},
];
// "My own goal": any number of hours, at least this many
const MIN_OWN_GOAL_HOURS = 1;
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
const FUNDRAISING_PURPOSE = "summer reading and other programming at the Fiske Free Library";

// The book lists and sample books are in the database now: volunteers edit them at /readathon/desk/books
// (the lists come with migration 017; the sample books are in seeds/readathon-books.sql).

const AUDIENCES = ["All ages", "Little kids", "Kids", "Teens", "Grown-ups"];


exports.AGE_GROUPS = AGE_GROUPS;
exports.AUDIENCES = AUDIENCES;
exports.BINGO_CARDS = BINGO_CARDS;
exports.FORMATS = FORMATS;
exports.FUNDRAISING_PURPOSE = FUNDRAISING_PURPOSE;
exports.DEFAULT_GOAL_MINUTES = DEFAULT_GOAL_MINUTES;
exports.GOALS = GOALS;
exports.MIN_OWN_GOAL_HOURS = MIN_OWN_GOAL_HOURS;
exports.STATES = STATES;
