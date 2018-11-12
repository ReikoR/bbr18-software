const fs = require('fs');
let measurements = require('./measurements.json');

exports.reloadMeasurements = function () {
    delete require.cache[require.resolve('./measurements.json')];

    measurements = require('./measurements.json');

    console.log('RELOADED MEASUREMENTS', measurements.length);
};

exports.getThrowerSpeed = function (distance) {
    return interpolate('z', distance);
};

exports.getCenterOffset = function (distance) {
    return interpolate('p', distance);
};

exports.recordFeedback = function (x, fb) {
    const r = 3; // proximity radius

    // Find distance measurements within proximity
    const closeObjs = measurements.filter(
        obj => obj.c > 0 && Math.abs(obj.x - x) < r
    );

    // Remove previous measurements within proximity
    closeObjs.forEach(obj =>
        measurements.splice(measurements.indexOf(obj), 1)
    );

    const c = interpolate('c', x) * (fb[0] ? 0.75 : 0.25);

    // Add new measurement
    measurements.push({
        x,
        y: 0,
        z: exports.getThrowerSpeed(x) + fb[0] * Math.max(100, c), //message.feedback * c,
        c,
        n: closeObjs.reduce((sum, obj) => sum + obj.n, 1),
        p: exports.getCenterOffset(x) + fb[1]
    });

    fs.writeFileSync(__dirname + '/measurements.json', JSON.stringify(measurements, null, 2));
};

exports.getMeasurements = function () {
    return measurements;
};

function interpolate (z, x, y = 0) {
    const sortedData = [ ...measurements ].sort((a, b) =>
        Math.abs(a.x - x) - Math.abs(b.x - x)
    );

    // Find two closest objects with different x-positions
    const obj1 = sortedData.find(obj => obj.x < x) || sortedData[0];
    const obj2 = sortedData.find(obj => obj.x > x) || sortedData.find(obj => obj.x !== obj1.x);

    // Get 2 closest object interpolation
    const a = (obj1[z] - obj2[z]) / (obj1.x - obj2.x);
    const b = obj1[z] - a*obj1.x;

    return a*x + b;
}
