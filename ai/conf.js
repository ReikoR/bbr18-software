function toRad(degrees) {
    return degrees * Math.PI / 180;
}

let conf = {
    robot: {
        wheels: [
            {angle: toRad(225), radius: 0.035, centerDistance: 0.127, motorReduction: 90 / 24},
            {angle: toRad(45), radius: 0.035, centerDistance: 0.127, motorReduction: 90 / 24},
            {angle: toRad(315), radius: 0.035, centerDistance: 0.127, motorReduction: 90 / 24},
            {angle: toRad(135), radius: 0.035, centerDistance: 0.127, motorReduction: 90 / 24}
            ]
    }
};

const wheelsConf = conf.robot.wheels;
let wheelConf;

for (let i = 0; i < wheelsConf.length; i++) {
    wheelConf = wheelsConf[i];
    wheelConf.linearSpeedToMotorRPM = (wheelConf.motorReduction * 60) / (wheelConf.radius * 2 * Math.PI);
}

module.exports = conf;