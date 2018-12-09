const fs = require('fs');
const convnet = require('./convnet');

const MAX_DISTANCE = 500;
const MIN_THROWER_SPEED = 6000;
const MAX_THROWER_SPEED = 19000;
const MAX_CENTER_OFFSET = 50;
const MAX_ANGLE = 0.2;

class Trainer {
    constructor (filename, trainCenterOffset=true) {
        this.path = `${__dirname}/data/training/${filename}.json`;
        this.trainCenterOffset = trainCenterOffset;

        if (!fs.existsSync(this.path)) {
            this.initialize();
        } else {
            this.load();
        }
    }

    initialize () {
        this.measurements = [];
        this.resetNets();

        //this.save();
    }

    resetNets() {
        this.throwerSpeedNet = new convnet.Net();
        this.centerOffsetNet = new convnet.Net();

        // Layers
        this.throwerSpeedNet.makeLayers([
            { type: 'input', out_sx: 1, out_sy: 1, out_depth: 2 },
            //{ type: 'fc', num_neurons: 4 },
            { type: 'fc', num_neurons: 4, activation: 'relu' },
            //{ type: 'fc', num_neurons: 4, activation: 'relu' },
            { type: 'svm', num_classes: 2 }
        ]);

        this.centerOffsetNet.makeLayers([
            {type: 'input', out_sx: 1, out_sy: 1, out_depth: 2},
            { type: 'fc', num_neurons: 4 },
            //{type: 'fc', num_neurons: 4, activation: 'relu'},
            {type: 'svm', num_classes: 2}
        ]);

        // Trainers
        this.resetTrainers();
    }

    resetTrainers () {
        this.throwerSpeedTrainer = new convnet.SGDTrainer(this.throwerSpeedNet, {
            learning_rate: 0.01,
            momentum: 0.1,
            batch_size: 5,
            l2_decay: 0.001
        });

        /*
        this.throwerSpeedTrainer = new convnet.Trainer(this.throwerSpeedNet, {
            method: 'adadelta',
            l2_decay: 0.001,
            batch_size: 10
        });
        */

        if (this.trainCenterOffset) {
            this.centerOffsetTrainer = new convnet.SGDTrainer(this.centerOffsetNet, {
                learning_rate: 0.1,
                momentum: 0.1,
                batch_size: 1,
                l2_decay: 0.001
            });
        }

        /*
        this.centerOffsetTrainer = new convnet.Trainer(this.centerOffsetNet, {
            method: 'adadelta',
            l2_decay: 0.1,
            batch_size: 10
        });
        */

        this.trainAllMeasurements();
    }

    trainAllMeasurements (N = 1) {
        for (let i = 0; i < N; ++i) {
            this.measurements.forEach(m => this.trainMeasurement(m));
        }
    }

    addMeasurement (measurement, fb) {
        this.measurements.push({
            ...measurement,
            fb
        });

        //this.trainMeasurement(this.measurements[this.measurements.length - 1]);
        this.trainAllMeasurements(200);

        //this.save();
    }

    trainMeasurement (m) {
        if (m.fb[0]) {
            const input = new convnet.Vol([m.distance/MAX_DISTANCE, m.throwerSpeed/MAX_THROWER_SPEED]);
            this.throwerSpeedTrainer.train(input, m.fb[0] === -1 ? 0 : 1);
        }

        if (this.trainCenterOffset && m.fb[1] && m.angle !== 0 && m.distance < 400) {
            const input = new convnet.Vol([m.angle/MAX_ANGLE, m.centerOffset/MAX_CENTER_OFFSET]);
            this.centerOffsetTrainer.train(input, m.fb[1] === -1 ? 0 : 1);
        }
    }

    deleteMeasurement (measurement) {
        this.measurements.splice(measurement.index, 1);
        this.resetNets();
        //this.save();
    }

    getTrainingData () {
        const data = {
            throwerSpeed: [],
            centerOffset: []
        };

        for (let distance = 0; distance < MAX_DISTANCE; ++distance) {
            data.throwerSpeed.push(
                this.getDecisionBoundary(this.throwerSpeedNet, distance / MAX_DISTANCE, [0, 1]) * MAX_THROWER_SPEED
            );
        }

        if (this.trainCenterOffset) {
            const angleStep = 2 * MAX_ANGLE / 200;

            for (let i = 0; i < 200; ++i) {
                const angle = -MAX_ANGLE + angleStep * i;

                data.centerOffset.push(
                    this.getDecisionBoundary(this.centerOffsetNet, angle / MAX_ANGLE, [-1, 1]) * MAX_CENTER_OFFSET
                );
            }
        }

        return data;
    }

    getDecisionBoundary (net, x, initialBounds) {
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

    isPredictable () {
        return {
            throwerSpeed: !!(this.measurements.find(m => m.fb[0] === -1) && this.measurements.find(m => m.fb[0] === 1)),
            centerOffset: !!(this.measurements.find(m => m.fb[1] === -1) && this.measurements.find(m => m.fb[1] === 1))
        };
    }

    load () {
        const data = require(this.path);

        this.measurements = data.measurements;

        this.resetNets();
        this.throwerSpeedNet.fromJSON(data.throwerSpeedNet);
        this.centerOffsetNet.fromJSON(data.centerOffsetNet);

        this.resetTrainers();
    }

    reload () {
        delete require.cache[require.resolve(this.path)];
        this.load();
    }

    save() {
        const data = {
            measurements: this.measurements,
            throwerSpeedNet: this.throwerSpeedNet.toJSON(),
            centerOffsetNet: this.centerOffsetNet.toJSON()
        };

        fs.writeFileSync(this.path, JSON.stringify(data, null, 2));
    }
}

module.exports = Trainer;
