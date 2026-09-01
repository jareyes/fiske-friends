#let card-size = 3in
#let card-margin = 0.25in
#let sans-font = "Liberation Sans"
#let books = csv("./202602-blind-date-book-list.csv")
#set page(
    paper: "us-letter",
    margin: 0.5in
)
#set par(
    spacing: 0em
)

#let make-card(book) = {
    let title = book.at(0)
    let genre = book.at(2)
    let clues = book.at(3)
    let hook = book.at(6).trim("\"")
    let pairing = book.at(5)

    rect(
        width: card-size,
        height: card-size,
        stroke: 0.5pt,
        inset: (x: 15pt)        
    )[
        // NOTE: The title, clues, and genre are for the volunteers
        // TODO: Make these fields tiny and easy to cut off
          #text(size: 8pt)[
              *Title:* #emph[#title]\
              *Clues:* #clues\
              *Genre:* #genre
          ]
        // Dashed cut line
        #v(5pt)
        #line(length: 100%, stroke: (dash: "dashed", thickness: 0.5pt))
        #v(15pt)

        // Here is what will be glued to the wrapping
        #text(size: 8pt, font: sans-font, weight: "bold")[
            Dating Profile:
        ]
        #v(15pt)
        #text(size: 14pt)[#hook]
        #v(20pt)
        #text(size: 8pt, font: sans-font)[*Recommended Pairing:*]
        #text(size: 10pt)[#emph[#pairing]]
    ]
}

#grid(
    columns: 2,
    gutter: card-margin,
    ..books.slice(1).map(book => make-card(book))
)


