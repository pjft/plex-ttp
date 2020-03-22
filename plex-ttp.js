const fs = require("fs");
const argv = require("minimist")(process.argv.slice(2));
const events = require("events");
const ev = new events.EventEmitter();
const plex = require("./plex.js");
const exif = require("./exif.js");

const usage = `
    usage node plex-ttp.js [-h] [-c] [-l tag] [-d tag] [-s]
    -h : show this help
    -s : scan images and put face tags into Plex
    -c : clean Lone Tags
    -l [tag] : list matching tags 
    -d tag: delete the tag
    `;

let exifProcessing = 0, // processing EXIF ongoing
    statProcessing = 0; // stat file ongoing


// Need to track when to end EXIF process and close DB connection
// emitted when change in exifProcessing or statProcessing 
const evHandler = function () {
    //    console.log(`exifProcessing ${exifProcessing}   statProcessing ${statProcessing}`);

    if (exifProcessing <= 0 && statProcessing <= 0) {
        plex.cleanLoneTTPTags();
        exif.end();
        plex.end();
    }
};


function DoMainScan() {
    plex.init();

    // read list des tags TTP existants
    plex.scanTTPTags();

    // add a colum to bear datetime of TTP tag update
    plex.addColumnTTPUpdate();

    let recs = plex.scanPhotos();
    // eslint-disable-next-line no-console
    console.log("Total photos", recs.length, "\n");


    function doTheUpdate(rec) {
        //console.log("doTheUpdate", rec.file);
        exifProcessing++;

        exif.getFromImage(rec.file)
            .then(data => {

                plex.deleteTTPTags(rec.mid); // delete any existing tags of the photo
                plex.addTTPTags(rec.mid, data.faces); // add new tags
                // eslint-disable-next-line no-console
                console.log(`${rec.file}:`, data.faces);
                // console.log("full ", data.tags);
                exifProcessing--;
                ev.emit("exif");
            })
            .catch(() => {
                exifProcessing--;
                ev.emit("exif");
            });
    }


    recs.forEach(rec => {
        //console.log(rec.file);
        if (!rec.FaceUpdateTime) rec.FaceUpdateTime = 0;
        let dateTTPUpdate = Date.parse(rec.FaceUpdateTime);
        statProcessing++;
        fs.stat(rec.file, (err, stat) => {
            statProcessing--;
            if (stat && stat.mtimeMs > dateTTPUpdate)
                doTheUpdate(rec);
            ev.emit("stat");

        });

    });
    //Assign the event handler to an event:
    ev.on("stat", evHandler);
    ev.on("exif", evHandler);
}


/******************** So what do we do with all that ?********* */

if (argv.h)
    console.log(usage); // eslint-disable-line no-console



if (argv.c) {
    plex.init();
    // eslint-disable-next-line no-console
    console.log("cleaning Lone tags");
    plex.cleanLoneTTPTags();
    plex.end();
}

if (argv.l) {
    if (argv.l === true)
        argv.l = "";

    plex.init();

    let res = plex.listTag(argv.l);
    res = res.sort((a, b) => a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0);
    // eslint-disable-next-line no-console
    console.log(res);
    // eslint-disable-next-line no-console
    console.log(`${res.length} entries`);
    plex.end();
}

// delete all matching tags 
if (argv.d) {
    plex.init();
    const res = plex.listTag(argv.d);
    // eslint-disable-next-line no-console
    console.log("deleting", res);

    const ids = res.map(elt => elt.id);
    ids.forEach(id => plex.deleteTTPTags(id));

    plex.cleanLoneTTPTags();
    plex.end();
}


if (argv.s)
    DoMainScan();