//const exiftool = require("exiftool-vendored").exiftool;

const ExifTool = require("exiftool-vendored").ExifTool;
let numCPUs = require("os").cpus().length;
const exiftool = new ExifTool({
    maxProcs: numCPUs
});

// maxProcs: DefaultMaxProcs,

/**
 * look for XMP tag and return an array of it
 * @param {} filename 
 * @returns {modif,tags}
 */
function getFromImage(filename) {
    //   console.log(`getting exif for ${filename}`);

    return new Promise(function (resolve, reject) {
        exiftool
            .read(filename)
            .then(tags => {

                //console.log("exif tags ",tags);
                const d = tags.FileModifyDate;
                const modif = new Date(d.year, d.month - 1, d.day, d.hour, d.minute, d.second, 0);
                //console.log("fileModifyDate: ",d );

                const lat = tags.GPSLatitude;
                const lng = tags.GPSLongitude;
                let pos = null;
                if (lat && lng)
                    pos = {
                        lat: lat,
                        lng: lng
                    };

                let faces = [];
                if (Object.prototype.hasOwnProperty.call(tags, "PersonInImage")){
                    faces = tags.PersonInImage;
                    console.log("Found Person in Image Names: ", faces);
                }
                // support for Picasa face regions
                else if (Object.prototype.hasOwnProperty.call(tags, "RegionInfo")) {
                    out = [];
                    for (i=0; i < tags.RegionInfo.RegionList.length; i++) {
                        if (tags.RegionInfo.RegionList[i].Name)
                            out[i] = tags.RegionInfo.RegionList[i].Name;
                    }
                    console.log("Found Region Names: ", out);
                    faces = out;
                }

                resolve({
                    modif: modif,
                    faces: faces,
                    pos: pos,
                    tags: tags
                });

            })
            .catch(err => {
                reject(err);

            });

    });

}

function end() {
    exiftool.end();
}


module.exports = {
    getFromImage: getFromImage,
    end: end
};
