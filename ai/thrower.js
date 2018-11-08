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
    [0.57, 8000],
    [0.95, 9300],
    [1.48, 11100],
    [2.72, 15300],
    [3.27, 17000],
];

const distanceToSpeedMap1050 = [
    [0.62, 7000],
    [1.12, 8200],
    [1.83, 9800],
    [2.72, 11700],
    [3.65, 13200],
    [4.45, 15000],
];

const dist_tresh = 2.5;

function getAngle(distance) {
    return distance > dist_tresh ? 1050 : 1600;
}

function getSpeedPrev(distance) {

    let map;

    if(distance > dist_tresh){
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
