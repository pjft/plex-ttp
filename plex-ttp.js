const fs = require("fs");
const argv = require("minimist")(process.argv.slice(2));
const events = require("events");
const ev = new events.EventEmitter();
const plex = require("./plex.js");
const exif = require("./exif.js");

const usage = `
    usage node plex-ttp.js [-h] [-c] [-l tag] [-d tag] [-s [-t date-YYYY-MM-DD]]
    -h : show this help
    -s : scan images and put face tags into Plex
        -t : start date to update pictures from
    -f : force scan ALL images and put face tags into Plex
    -c : clean Lone Tags
    -l [tag] : list matching tags 
    -d tag: delete the tag
    `;

let exifProcessing = 0, // processing EXIF ongoing
    statProcessing = 0, // stat file ongoing
    nbUpdate = 0; // number of updates

let fullScan = false;
let updateDate = "";


// Need to track when to end EXIF process and close DB connection
// emitted when change in exifProcessing or statProcessing 
const evHandler = function () {
    if (argv.debug)
        console.log(`exifProcessing ${exifProcessing}   statProcessing ${statProcessing}`); // eslint-disable-line no-console
    
    if (exifProcessing <= 0 && statProcessing <= 0) {
        plex.cleanLoneTTPTags();
        exif.end();
        plex.createTriggers();
        plex.end();
        console.log(`Done : ${nbUpdate} update(s)`); // eslint-disable-line no-console

    }
};


function DoMainScan() {
    plex.init();
    // backup and clean triggers
    plex.storeTriggers()
    plex.deleteTriggers();
    
    // add a column to bear datetime of TTP tag update and place update
    plex.addColumnTTPUpdate();
    plex.addColumnPlaceUpdate();
    
    // read list des tags TTP existants
    plex.scanTTPTags();

    let recs = plex.scanPhotos();
    // eslint-disable-next-line no-console
    console.log("Total photos", recs.length, "\n");
    if (recs.length == 0)
        return;

    function doTheUpdate(rec) {
//        console.log("doTheUpdate: ", rec.file);
        exifProcessing++;

        exif.getFromImage(rec.file)
            .then(data => {
                nbUpdate++;
                if (data.faces.length == 0) {
                    console.log(`Skipping. No tags in ${rec.file}: `, data.faces);
                    plex.addTTPTags(rec.mid, data.faces); // update UpdatedAt
                }
                else
                {
                    plex.deleteTTPTags(rec.mid); // delete any existing tags of the photo
                    plex.addTTPTags(rec.mid, data.faces); // add new tags
                    // eslint-disable-next-line no-console
                    console.log(`Adding ${rec.file}:`, data.faces);
                    // console.log("full ", data.tags);
                }
                exifProcessing--;
                ev.emit("exif");
            })
            .catch((err) => {
                console.log(`Exception!`, err);
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
            // here we avoid updating older pictures, unless full scan
            if (updateDate != "") {
                dateTTPUpdate = updateDate;
            }
            if (fullScan || (stat && stat.mtimeMs > dateTTPUpdate))
                doTheUpdate(rec);
            ev.emit("stat");

        });


    });
    //Assign the event handler to an event:
    ev.on("stat", evHandler);
    ev.on("exif", evHandler);
}


/******************** So what do we do with all that ?********* */

const reader = require("readline-sync"); //npm install readline-sync
let username = reader.question("Please confirm that Plex is not running, and that the database is backed up. Type 'yes' to continue. ");
if (username != "yes") {
    console.log("Exiting.");
    return;
}

if (argv.h || process.argv.length == 2)
    console.log(usage); // eslint-disable-line no-console



if (argv.c) {
    plex.init();
    // backup and clean triggers
    plex.storeTriggers()
    plex.deleteTriggers();
    // eslint-disable-next-line no-console
    console.log("cleaning Lone tags");
    plex.cleanLoneTTPTags();
    plex.createTriggers();
    plex.end();
}

if (argv.l) {
    if (argv.l === true)
        argv.l = "";

    plex.init();

    let res = plex.listTag(argv.l);
    const nb = res.length;
    res = res.map(elt => elt.tag).sort().join(", ");
    //res = res.sort((a, b) => a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0);
    // eslint-disable-next-line no-console
    console.log(res);
    // eslint-disable-next-line no-console
    console.log(`\n${nb} entries`);
    plex.end();
}

// delete all matching tags 
if (argv.d) {
    plex.init();
    // backup and clean triggers
    plex.storeTriggers()
    plex.deleteTriggers();
    const res = plex.listTag(argv.d);
    // eslint-disable-next-line no-console
    console.log("deleting", res);

    const ids = res.map(elt => elt.id);
    ids.forEach(id => plex.deleteTTPTags(id));

    plex.cleanLoneTTPTags();
    plex.createTriggers();
    plex.end();
}

if (argv.f) {
    fullScan = true;
    DoMainScan();
}


if (argv.s) {
    if (argv.t) {
        console.log("Updating photos added after: ", argv.t);
        updateDate = Date.parse(argv.t);
    }
    DoMainScan();
}

