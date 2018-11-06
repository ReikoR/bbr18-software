const trainingUtils = require('../training/utils');
let measurements = require('../training/measurements.json');

function reloadMeasurements () {
    delete require.cache[require.resolve('../training/measurements.json')];
    measurements = require('../training/measurements.json');

    console.log('RELOADED MEASUREMENTS', measurements.length);
}

function getSpeed (distance) {
    return trainingUtils.interpolate(measurements, distance);
}

const distanceToSpeedMap = [
    [41, 7000],
    [50, 7000],
    [61, 7000],
    [71, 7200],
    [80, 7600],
    [90, 8000],
    [102, 8400],
    [112, 8800],
    [119, 9000],
    [148, 9400],
    [167, 10000],
    [198, 11000],
    [253, 12500],
    [303, 13600],
    [358, 15000],
    [408, 16400],
    [460, 18000]
];

function getSpeedPrev(distance) {
    let lowerDistance = distanceToSpeedMap[0][0];
    let higherDistance = distanceToSpeedMap[distanceToSpeedMap.length - 1][0];
    let lowerSpeed = distanceToSpeedMap[0][1];
    let higherSpeed = distanceToSpeedMap[distanceToSpeedMap.length - 1][1];

    if (distance <= lowerDistance) {
        return lowerSpeed;
    }

    if (distance >= higherDistance) {
        return higherSpeed;
    }

    for (let i = 0; i < distanceToSpeedMap.length - 1; i++) {
        lowerDistance = distanceToSpeedMap[i][0];
        higherDistance = distanceToSpeedMap[i + 1][0];
        lowerSpeed = distanceToSpeedMap[i][1];
        higherSpeed = distanceToSpeedMap[i + 1][1];

        if (distance === lowerDistance) {
            return lowerSpeed;
        }

        if (distance === higherDistance) {
            return higherSpeed;
        }

        if (distance > lowerDistance && distance < higherDistance) {
            break;
        }
    }

    const distanceDiff = higherDistance - lowerDistance;
    const speedDiff = higherSpeed - lowerSpeed;
    const percentage = (distance - lowerDistance) / distanceDiff;

    return lowerSpeed + speedDiff * percentage;
}

module.exports = {
    getSpeed,
    reloadMeasurements
};
