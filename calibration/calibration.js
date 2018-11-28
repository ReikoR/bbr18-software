const fs = require('fs');
const config = require('./public-conf.json');
const Trainer = require('./trainer');
const COMPETITION_DATA = {
    bounce: require('./data/competition/bounce.json'),
    straight: require('./data/competition/straight.json')
};

const MAX_DISTANCE = 500;

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
