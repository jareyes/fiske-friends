const assert = require("node:assert");
const Art = require("../lib/readathon-art");
const OgImages = require("../lib/readathon-og");
const {suite, test} = require("node:test");

// Width and height from a PNG's header
function png_size(png) {
    assert.strictEqual(png.subarray(1, 4).toString(), "PNG");
    return [png.readUInt32BE(16), png.readUInt32BE(20)];
}

suite("lib/readathon-og.js sharing images", () => {
    test("every image is a 1200 x 630 PNG", () => {
        for(const png of [
            OgImages.site_image("January 1 to 31, 2027"),
            OgImages.give_image("summer reading at the Fiske Free Library"),
            OgImages.cheer_image({name: "Katie", initial: "K", color: 2, goal_label: "10 hours"}),
        ]) {
            assert.deepStrictEqual(png_size(png), [1200, 630]);
            assert.ok(png.length > 20000, "has the scene, not a blank image");
        }
    });

    test("each picture is drawn once, then reused", () => {
        const reader = {name: "Sam", initial: "S", color: 1, goal_label: "5 hours"};
        assert.strictEqual(OgImages.cheer_image(reader), OgImages.cheer_image({...reader}));
        assert.notStrictEqual(OgImages.cheer_image(reader), OgImages.cheer_image({...reader, goal_label: "37 hours"}));
    });

    test("names with symbols and very long names still draw", () => {
        const odd = OgImages.cheer_image({name: "Tom & <Jerry>", initial: "T", color: 9, goal_label: "1 hour"});
        assert.deepStrictEqual(png_size(odd), [1200, 630]);
        const long = OgImages.cheer_image({name: "Maximiliana-Bartholomew Featherstonehaugh-Wolfeschlegel", initial: "M", color: 0, goal_label: "100 hours"});
        assert.deepStrictEqual(png_size(long), [1200, 630]);
    });

    test("lines wrap to the width with the real font", () => {
        // "reading together" is about 635px at 84px, so it doesn't fit; at 68px it does
        assert.strictEqual(OgImages.wrap("A month of reading together", {family: "Fredoka", weight: 600, size: 84}, 560, 2), null);
        const font = {family: "Fredoka", weight: 600, size: 68};
        assert.deepStrictEqual(OgImages.wrap("A month of reading together", font, 560, 2), ["A month of", "reading together"]);
        assert.strictEqual(OgImages.wrap("A month of reading together", font, 560, 1), null);
        assert.ok(OgImages.measure("mmmm", "Fredoka", 600, 100) > OgImages.measure("iiii", "Fredoka", 600, 100));
    });
});

suite("lib/readathon-art.js", () => {
    test("the scene is plain SVG with its own colors, and the cheer version adds bunting", () => {
        const plain = Art.scene_svg({width: 1200, height: 270});
        const cheer = Art.scene_svg({width: 1200, height: 270, cheer: true});
        assert.match(plain, /^<svg class="ra-give-art"/);
        assert.doesNotMatch(plain, /class="ra-(?!give-art)/, "no CSS classes inside, so it draws the same everywhere");
        assert.ok(cheer.length > plain.length);
    });
});
