const fs = require('fs');
const config = require('./public-conf.json');
const Trainer = require('./trainer');
const COMPETITION_DATA = {
    bounce: require('./data/competition/bounce.json'),
    straight: require('./data/competition/straight.json')
};

//console.log(COMPETITION_DATA);

const MAX_DISTANCE = 500;

/*
const MIN_THROWER_SPEED = 6000;
const MAX_THROWER_SPEED = 20000;
const MAX_CENTER_OFFSET = 30;

const MEASUREMENTS = {};
const THROWER_SPEED_NETS = {};
const CENTER_OFFSET_NETS = {};

let RANDOM_THROWER_SPEED, RANDOM_CENTER_OFFSET, RANDOM_SPEEDS_GENERATED = 0;

function generateRandomSpeeds () {
    RANDOM_THROWER_SPEED = 5000 + Math.random() * 10000;
    RANDOM_CENTER_OFFSET = -20 + Math.random() * 40;
    RANDOM_SPEEDS_GENERATED = new Date();
}
*/

const TRAINERS = {
    bounce: new Trainer(config.bounce),
    straight: new Trainer(config.straight)
};

exports.getThrowerTechnique = function (distance, angle = 0) {
    if (distance > 200) {
        return 'bounce';
    } else {
        return 'straight';
    }
};

// Thrower speed and center offset while training data is unpredictable
const PRE_TRAINING_DATA = {
    throwerSpeed: [6000, 17000],
    centerOffset: [-25, 25]
};

const LAST_TRAINING_DATA = {
    straight: { throwerSpeed: 0, centerOffset: 0 },
    bounce: { throwerSpeed: 0, centerOffset: 0 }
};

// Overwrite competition data during training
exports.setCompetitionData = function (data, isPredictable) {
    for (let technique of ['bounce', 'straight']) {
        for (let y of ['throwerSpeed', 'centerOffset']) {
            if (isPredictable[technique][y]) {
                COMPETITION_DATA[technique][y] = data[technique][y];
            } else {
                COMPETITION_DATA[technique][y] = Array(MAX_DISTANCE).fill(
                    PRE_TRAINING_DATA[y][++LAST_TRAINING_DATA[technique][y] % PRE_TRAINING_DATA[y].length]
                );
            }
        }
    }
};

exports.getThrowerSpeed = function (technique, distance) {
    console.log(technique);
    const data = COMPETITION_DATA[technique];
    return data.throwerSpeed[Math.max(0, Math.min(499, Math.round(distance)))];
};

exports.getCenterOffset = function (technique, distance) {
    console.log(technique);
    const data = COMPETITION_DATA[technique];
    return data.centerOffset[Math.max(0, Math.min(499, Math.round(distance)))];
};

exports.recordFeedback = function (measurement, fb) {
    TRAINERS[measurement.technique].addMeasurement(measurement, fb);
};

exports.deleteMeasurement = function (measurement) {
    TRAINERS[measurement.technique].deleteMeasurement(measurement);
    TRAINERS[measurement.technique].trainAllMeasurements(200);
};

exports.trainAllTechniques = function (N = 200) {
    TRAINERS.bounce.trainAllMeasurements(N);
    TRAINERS.straight.trainAllMeasurements(N);
};

/*
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

    /
    // Get 2 closest object interpolation
    //const a = (obj1[z] - obj2[z]) / (obj1.x - obj2.x);
    //const b = obj1[z] - a*obj1.x;

    //return a*x + b;

    return line.a * x + line.b;
}
*/

exports.getNets = function () {
    TRAINERS.bounce.trainAllMeasurements(20);
    TRAINERS.straight.trainAllMeasurements(20);

    TRAINERS.bounce.save();
    TRAINERS.straight.save();

    return {
        bounce: { throwerSpeed: TRAINERS.bounce.throwerSpeedNet.toJSON() },
        straight: { throwerSpeed: TRAINERS.straight.throwerSpeedNet.toJSON() }
    };
};

exports.getTrainingData = function () {
    const data = {
        bounce: TRAINERS.bounce.getTrainingData(),
        straight: TRAINERS.straight.getTrainingData()
    };

    return data;
};

exports.getMeasurements = function () {
    return {
        bounce: TRAINERS.bounce.measurements,
        straight: TRAINERS.straight.measurements
    };
};

exports.saveTrainingData = function () {
    TRAINERS.bounce.save();
    TRAINERS.straight.save();
};

exports.saveCompetitionData = function () {
    const data = {
        bounce: TRAINERS.bounce.getTrainingData(),
        straight: TRAINERS.straight.getTrainingData()
    };

    fs.writeFileSync(`${__dirname}/data/competition/bounce.json`, JSON.stringify(data.bounce));
    fs.writeFileSync(`${__dirname}/data/competition/straight.json`, JSON.stringify(data.straight));
};

exports.isPredictable = function () {
    return {
        bounce: TRAINERS.bounce.isPredictable(),
        straight: TRAINERS.straight.isPredictable()
    };
};
