const fs = require('fs');
const config = require('./public-conf.json');
const regression = require('simple-linear-regression');

exports.getThrowerTechnique = function (distance, angle = 0) {
    if (distance > 200) {
        return 'hoop';
    } else {
        return 'dunk';
    }
};

exports.reloadMeasurements = function () {
    delete require.cache[require.resolve('./' + config.hoop)];
    delete require.cache[require.resolve('./' + config.dunk)];

    console.log('RELOADED MEASUREMENTS');
};

exports.getThrowerSpeed = function (distance) {
    const technique = exports.getThrowerTechnique(distance);
    const measurements = require('./' + config[technique]);

    return Math.min(20000, interpolate(measurements, 'z', distance));
};

exports.getCenterOffset = function (distance) {
    const technique = exports.getThrowerTechnique(distance);
    const measurements = require('./' + config[technique]);

    return interpolate(measurements, 'p', distance);
};

exports.recordFeedback = function (x, fb) {
    const technique = exports.getThrowerTechnique(x);
    const measurements = require('./' + config[technique]);

    const r = 3; // proximity radius

    // Find distance measurements within proximity
    const closeObjs = measurements.filter(
        obj => obj.c > 0 && Math.abs(obj.x - x) < r
    );

    // Remove previous measurements within proximity
    closeObjs.forEach(obj =>
        measurements.splice(measurements.indexOf(obj), 1)
    );

    const c = interpolate(measurements, 'c', x) * (fb[0] ? 0.75 : 0.25);

    // Add new measurement
    measurements.push({
        x,
        y: 0,
        z: exports.getThrowerSpeed(x) + fb[0] * Math.max(50, c), //message.feedback * c,
        c,
        n: closeObjs.reduce((sum, obj) => sum + obj.n, 1),
        p: exports.getCenterOffset(x) + fb[1]
    });

    fs.writeFileSync(__dirname + '/' + config[technique], JSON.stringify(measurements, null, 2));
};

exports.getMeasurements = function () {
    return {
        dunk: require('./' + config.dunk),
        hoop: require('./' + config.hoop)
    };
};

function interpolate (measurements, z, x, y = 0) {
    let closeData = measurements;//.filter(m => Math.abs(m.x - x) <= 10);

    // Find two closest points if there are no points close enough
    if (closeData.length < 2) {
        const sortedData = [...measurements].sort((a, b) =>
            Math.abs(a.x - x) - Math.abs(b.x - x)
        );

        // Find two closest objects with different x-positions
        const obj1 = sortedData.find(obj => obj.x < x) || sortedData[0];
        const obj2 = sortedData.find(obj => obj.x > x && obj.x !== obj1.x) || sortedData.find(obj => obj.x !== obj1.x);

        closeData = [obj1, obj2];
    }

    const line = regression(closeData.map(m => m.x), closeData.map(m => m[z]));

    console.log(closeData.length, line, line.a * x + line.b);

    /*
    // Get 2 closest object interpolation
    const a = (obj1[z] - obj2[z]) / (obj1.x - obj2.x);
    const b = obj1[z] - a*obj1.x;

    return a*x + b;
    */

    return line.a * x + line.b;
}
