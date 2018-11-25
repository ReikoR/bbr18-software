const fs = require('fs');
const config = require('./public-conf.json');
const regression = require('simple-linear-regression');
const convnet = require('./convnet');

const MAX_DISTANCE = 500;
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

// Initialize empty measurements and net
function initializeTechnique (technique) {
    // Write empty measurements
    MEASUREMENTS[technique] = [];

    fs.writeFileSync(`${__dirname}/${config[technique]}.measurements.json`, '[]');

    // Write empty thrower speed neural net
    THROWER_SPEED_NETS[technique] = new convnet.Net();
    THROWER_SPEED_NETS[technique].makeLayers([
        { type: 'input', out_sx: 1, out_sy: 1, out_depth: 2 },
        { type: 'fc', num_neurons: 4, activation: 'relu' },
        { type: 'fc', num_neurons: 4, activation: 'relu' },
        { type: 'svm', num_classes: 2 }
    ]);

    fs.writeFileSync(
        `${__dirname}/${config[technique]}.thrower_speed.json`,
        JSON.stringify(THROWER_SPEED_NETS[technique].toJSON(), null, 2)
    );

    // Write empty center offset neural net
    CENTER_OFFSET_NETS[technique] = new convnet.Net();
    CENTER_OFFSET_NETS[technique].makeLayers([
        { type: 'input', out_sx: 1, out_sy: 1, out_depth: 2 },
        { type: 'fc', num_neurons: 4, activation: 'tanh' },
        { type: 'fc', num_neurons: 4, activation: 'relu' },
        { type: 'svm', num_classes: 2 }
    ]);

    fs.writeFileSync(
        `${__dirname}/${config[technique]}.center_offset.json`,
        JSON.stringify(CENTER_OFFSET_NETS[technique].toJSON(), null, 2)
    );

    /*
    // Initialize random speeds
    COMPETITION[technique] = {
        throwerSpeed: [],
        centerOffset: []
    };

    for (let i = 0; i < 500; ++i) {
        COMPETITION[technique]
    }
    */
}

function resetNets (technique) {
    // Write empty thrower speed neural net
    THROWER_SPEED_NETS[technique] = new convnet.Net();
    THROWER_SPEED_NETS[technique].makeLayers([
        { type: 'input', out_sx: 1, out_sy: 1, out_depth: 2 },
        { type: 'fc', num_neurons: 4, activation: 'relu' },
        { type: 'fc', num_neurons: 4, activation: 'relu' },
        { type: 'svm', num_classes: 2 }
    ]);

    fs.writeFileSync(
        `${__dirname}/${config[technique]}.thrower_speed.json`,
        JSON.stringify(THROWER_SPEED_NETS[technique].toJSON(), null, 2)
    );

    // Write empty center offset neural net
    CENTER_OFFSET_NETS[technique] = new convnet.Net();
    CENTER_OFFSET_NETS[technique].makeLayers([
        { type: 'input', out_sx: 1, out_sy: 1, out_depth: 2 },
        { type: 'fc', num_neurons: 4, activation: 'tanh' },
        { type: 'fc', num_neurons: 4, activation: 'relu' },
        { type: 'svm', num_classes: 2 }
    ]);

    fs.writeFileSync(
        `${__dirname}/${config[technique]}.center_offset.json`,
        JSON.stringify(CENTER_OFFSET_NETS[technique].toJSON(), null, 2)
    );
}

// Measurement and net singletons
exports.getMeasurements = function (technique) {
    if (!(technique in MEASUREMENTS)) {
        try {
            MEASUREMENTS[technique] = require(`./${config[technique]}.measurements.json`);
        } catch (err) {
            initializeTechnique(technique);
            return exports.getMeasurements(technique);
        }
    }

    return MEASUREMENTS[technique];
};

function getNet (NETS, technique) {
    if (!(technique in NETS)) {
        try {
            let weights;

            if (NETS === THROWER_SPEED_NETS) {
                weights = require(`./${config[technique]}.thrower_speed.json`);
            } else {
                weights = require(`./${config[technique]}.center_offset.json`);
            }
            
            NETS[technique] = new convnet.Net();
            NETS[technique].fromJSON(weights);
        } catch (err) {
            initializeTechnique(technique);
            return getNet(NETS, technique);
        }
    }

    return NETS[technique];
}

function getThrowerSpeedNet (technique) {
    return getNet(THROWER_SPEED_NETS, technique);
}

function getCenterOffsetNet (technique) {
    return getNet(CENTER_OFFSET_NETS, technique);
}

exports.getThrowerTechnique = function (distance, angle = 0) {
    if (distance > 200) {
        return 'hoop';
    } else {
        return 'dunk';
    }
};

exports.reloadMeasurements = function () {
    for (let technique of ['hoop', 'dunk']) {
        delete MEASUREMENTS[technique];
        delete THROWER_SPEED_NETS[technique];
        delete CENTER_OFFSET_NETS[technique];

        delete require.cache[require.resolve(`./${config[technique]}.measurements.json`)];
        delete require.cache[require.resolve(`./${config[technique]}.thrower_speed.json`)];
        delete require.cache[require.resolve(`./${config[technique]}.center_offset.json`)];
        delete require.cache[require.resolve(`./${config[technique]}.competition.json`)];
    }

    console.log('RELOADED MEASUREMENTS');
};

// Estimate decision boundary
function getDecisionBoundary (net, x, initialBounds) {
    const bounds = initialBounds.slice();
    const input = new convnet.Vol(1, 1, 2);
    input.w[0] = x;
  
    for (let i = 0; i < 100; ++i) {
        input.w[1] = (bounds[0] + bounds[1]) / 2;
        const output = net.forward(input);

        if (Math.abs(output.w[1] - output.w[0]) < 0.0001) {
            break;
        }

        bounds[(output.w[0] > output.w[1]) ? 1 : 0] = input.w[1];
    }

    return input.w[1];
}

exports.getThrowerSpeed = function (technique, distance) {
    const COMPETITION = require(`./${config[technique]}.competition.json`);
    return COMPETITION.throwerSpeed[Math.max(0, Math.min(499, Math.round(distance)))];
};

exports.getThrowerSpeedFromNet = function (technique, distance) {
    const measurements = exports.getMeasurements(technique);

    if (!measurements.filter(m => m.fb[0] === 1).length || !measurements.filter(m => m.fb[0] === -1).length) {
        if ((new Date() - RANDOM_SPEEDS_GENERATED) > 5000) {
            generateRandomSpeeds();
        }

        return RANDOM_THROWER_SPEED; //distance / MAX_DISTANCE * MAX_THROWER_SPEED;
    }

    const net = getThrowerSpeedNet(technique);
    const speed = getDecisionBoundary(net, distance / MAX_DISTANCE, [0, 1]) * MAX_THROWER_SPEED;

    return Math.max(MIN_THROWER_SPEED, Math.min(MAX_THROWER_SPEED, speed));
};

exports.getCenterOffset = function (technique, distance) {
    const COMPETITION = require(`./${config[technique]}.competition.json`);
    return COMPETITION.centerOffset[Math.max(0, Math.min(499, Math.round(distance)))];
};

exports.getCenterOffsetFromNet = function (technique, distance) {
    //const technique = exports.getThrowerTechnique(distance);
    const measurements = exports.getMeasurements(technique);

    if (!measurements.filter(m => m.fb[1] === 1).length || !measurements.filter(m => m.fb[1] === -1).length) {
        if ((new Date() - RANDOM_SPEEDS_GENERATED) > 5000) {
            generateRandomSpeeds();
        }

        return RANDOM_CENTER_OFFSET; //distance / MAX_DISTANCE * MAX_THROWER_SPEED;
    }

    const net = getCenterOffsetNet(technique);
    const speed = getDecisionBoundary(net, distance / MAX_DISTANCE, [-1, 1]) * MAX_CENTER_OFFSET;

    return Math.max(-MAX_CENTER_OFFSET, Math.min(MAX_CENTER_OFFSET, speed));
};

function train (net, measurements, fbIndex, inputWeights, N=50) {
    if (!measurements.filter(m => m.fb[fbIndex] === 1).length || !measurements.filter(m => m.fb[fbIndex] === -1).length) {
        return false;
    }

    // TODO: might want a singleton trainer
    const trainer = new convnet.SGDTrainer(net, {
        learning_rate: 0.01,
        momentum: 0.1,
        batch_size: 10,
        l2_decay: 0.001
    });

    const input = new convnet.Vol(1, 1, 2);
    //let totalLoss = 0;

    for (let i = 0; i < N; ++i) {
        let loss = 0;

        measurements.forEach(m => {
            if (!m.fb[fbIndex]) {
                return;
            }

            input.w = inputWeights(m);

            loss += trainer.train(input, (m.fb[fbIndex] === -1) ? 0 : 1).loss;
        });

        //const meanLoss = loss / Math.pow(measurements.length, 2);
        //totalLoss += meanLoss;
    }

    //console.log(totalLoss/200);

    return true;
}

// Run training iterations
exports.updateNets = function (techniques = ['hoop', 'dunk']) {
    const updated = {};

    for (let technique of techniques) {
        const measurements = exports.getMeasurements(technique);
        const throwerSpeedNet = getThrowerSpeedNet(technique);
        const centerOffsetNet = getCenterOffsetNet(technique);

        updated[technique] = {};

        if (train(throwerSpeedNet, measurements, 0, m => [m.distance/MAX_DISTANCE, m.throwerSpeed/MAX_THROWER_SPEED])) {
            updated[technique]['throwerSpeed'] = throwerSpeedNet.toJSON();
            
            fs.writeFileSync(
                `${__dirname}/${config[technique]}.thrower_speed.json`,
                JSON.stringify(updated[technique]['throwerSpeed'], null, 2)
            );
        }

        if (train(centerOffsetNet, measurements, 1, m => [m.distance/MAX_DISTANCE, m.centerOffset/MAX_CENTER_OFFSET])) {
            updated[technique]['centerOffset'] = centerOffsetNet.toJSON();
            
            fs.writeFileSync(
                `${__dirname}/${config[technique]}.center_offset.json`,
                JSON.stringify(updated[technique]['centerOffset'], null, 2)
            );
        }
    }

    const COMPETITION = {};

    for (let technique of ['hoop', 'dunk']) {
        COMPETITION[technique] = {
            throwerSpeed: [],
            centerOffset: []
        };

        for (let d = 0; d < 500; ++d) {
            COMPETITION[technique].throwerSpeed.push(
                exports.getThrowerSpeedFromNet(technique, d)
            );

            COMPETITION[technique].centerOffset.push(
                exports.getCenterOffsetFromNet(technique, d)
            );
        }

        fs.writeFileSync(
            `${__dirname}/${config[technique]}.competition.json`,
            JSON.stringify(COMPETITION[technique], null, 2)
        );
    }

    return updated;
};

exports.recordFeedback = function (measurement, fb) {
    const technique = measurement.technique;
    const measurements = exports.getMeasurements(technique);

    // Record measurement
    measurements.push({
        ...measurement,
        fb
    });
    
    fs.writeFileSync(`${__dirname}/${config[technique]}.measurements.json`, JSON.stringify(measurements, null, 2));
};

exports.deleteMeasurement = function (measurement) {
    const technique = measurement.technique;
    const measurements = exports.getMeasurements(technique);

    //const index = measurements.findIndex(m => m.x === measurement.x && m.y === measurement.y);
    measurements.splice(measurement.index, 1);

    fs.writeFileSync(`${__dirname}/${config[technique]}.measurements.json`, JSON.stringify(measurements, null, 2));

    resetNets(technique);
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
