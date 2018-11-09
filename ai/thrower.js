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

const distanceToSpeedMap1600 = [
    [0.27, 6000],
    [0.57, 7900],
    [0.95, 9100],
    [1.48, 11300],
    [2.72, 15000],
    [3.27, 16700],
];

const distanceToSpeedMap1050 = [
    [0.62, 7000],
    [1.12, 8100],
    [1.83, 9800],
    [2.72, 11600],
    [3.65, 13100],
    [4.45, 14900],
];

const angleSwapDistance = 2.5;

function getAngle(distance) {
    return distance > angleSwapDistance ? 1050 : 1600;
}

function getSpeedPrev(distance) {

    let map;

    if(distance > angleSwapDistance){
        map = distanceToSpeedMap1050;
    } else {
        map = distanceToSpeedMap1600;
    }

    let lowerDistance = map[0][0];
    let higherDistance = map[map.length - 1][0];
    let lowerSpeed = map[0][1];
    let higherSpeed = map[map.length - 1][1];

    if (distance <= lowerDistance) {
        return lowerSpeed;
    }

    if (distance >= higherDistance) {
        return higherSpeed;
    }

    for (let i = 0; i < map.length - 1; i++) {
        lowerDistance = map[i][0];
        higherDistance = map[i + 1][0];
        lowerSpeed = map[i][1];
        higherSpeed = map[i + 1][1];

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
    getSpeedPrev,
    getAngle,
    reloadMeasurements
};
