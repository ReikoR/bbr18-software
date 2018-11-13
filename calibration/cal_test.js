const cal = require('./calibration');

for (let i = 0; i < 600; i+= 10) {
    console.log(i, cal.getThrowerSpeed(i));
}