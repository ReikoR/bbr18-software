const trainingUtils = require('../calibration/calibration');
let measurements = require('../calibration/measurements.json');

function reloadMeasurements () {
    delete require.cache[require.resolve('../training/measurements.json')];
    measurements = require('../calibration/measurements.json');

    console.log('RELOADED MEASUREMENTS', measurements.length);
}

function getSpeed (distance) {
    return trainingUtils.interpolate(measurements, distance);
}

const distanceToSpeedMap1650 = [
    [0.26, 7600],
    [0.49, 8650],
    [0.80, 9550],
    [1.05, 10550],
    [1.45, 12450],
    [1.92, 14100],
    [2.45, 16500]
];

const distanceToSpeedMap1050 = [
    [1.44, 8500],
    [1.76, 9500],
    [2.15, 10650],
    [2.65, 11700],
    [3.55, 13700],
    [4.40, 14920],
    [5.20, 17000]
];

const angleSwapDistance = 2.2;

function getAngle(distance) {
    return distance > angleSwapDistance ? 1050 : 1650;
}

function getSpeedPrev(distance) {

    let map;

    if(distance > angleSwapDistance){
        map = distanceToSpeedMap1050;
    } else {
        map = distanceToSpeedMap1650;
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
