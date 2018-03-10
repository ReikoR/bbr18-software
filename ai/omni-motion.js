const conf = require('./conf');

/**
 *
 * @param {number} xSpeed X speed [m/s]
 * @param {number} ySpeed Y speed [m/s]
 * @param {number} angularVelocity Angular velocity [rad/s]
 * @param {boolean} returnMotorRPM Whether to return motor RPMs or wheel linear speeds
 * @return {number[]} Wheel linear speeds [m/s] or motor RPMs
 */
function calculateSpeedsFromXY(xSpeed, ySpeed, angularVelocity, returnMotorRPM) {
    const wheelsConf = conf.robot.wheels;
    let speeds = [];

    for (let i = 0; i < wheelsConf.length; i++) {
        speeds.push(calculateWheelSpeedFromXY(xSpeed, ySpeed, angularVelocity, wheelsConf[i], returnMotorRPM));
    }

    return speeds;
}

/**
 *
 * @param {number} robotSpeed Robot speed [m/s]
 * @param {number} robotDirectionAngle Direction angle [rad]
 * @param {number} angularVelocity Angular velocity [rad/s]
 * @param {boolean} returnMotorRPM Whether to return motor RPMs or wheel linear speeds
 * @return {number[]} Wheel linear speeds [m/s] or motor RPMs
 */
function calculateSpeeds(robotSpeed, robotDirectionAngle, angularVelocity, returnMotorRPM) {
    const wheelsConf = conf.robot.wheels;
    let speeds = [];

    for (let i = 0; i < wheelsConf.length; i++) {
        speeds.push(
            calculateWheelSpeed(robotSpeed, robotDirectionAngle, angularVelocity, wheelsConf[i], returnMotorRPM)
        );
    }

    return speeds;
}

/**
 *
 * @param {number} xSpeed X speed [m/s]
 * @param {number} ySpeed Y speed [m/s]
 * @param {number} angularVelocity Angular velocity [rad/s]
 * @param {object} wheelConf
 * @param {number} wheelConf.angle Wheel angle [rad]
 * @param {number} wheelConf.centerDistance Wheel center distance [m]
 * @param {number} wheelConf.linearSpeedToMotorRPM
 * @param {boolean} returnMotorRPM Whether to return motor RPM or wheel linear speed
 * @return {number} Wheel linear speed [m/s] or motor RPM
 */
function calculateWheelSpeedFromXY(xSpeed, ySpeed, angularVelocity, wheelConf, returnMotorRPM) {
    const robotSpeed = Math.sqrt(xSpeed * xSpeed + ySpeed * ySpeed);
    const robotDirectionAngle = Math.atan2(ySpeed, xSpeed);

    return calculateWheelSpeed(robotSpeed, robotDirectionAngle, angularVelocity, wheelConf, returnMotorRPM);
}

/**
 *
 * @param {number} robotSpeed Robot speed [m/s]
 * @param {number} robotDirectionAngle Direction angle [rad]
 * @param {number} angularVelocity Angular velocity [rad/s]
 * @param {object} wheelConf
 * @param {number} wheelConf.angle Wheel angle [rad]
 * @param {number} wheelConf.centerDistance Wheel center distance [m]
 * @param {number} wheelConf.linearSpeedToMotorRPM
 * @param {boolean} returnMotorRPM Whether to return motor RPM or wheel linear speed
 * @return {number} Wheel linear speed [m/s] or motor RPM
 */
function calculateWheelSpeed(robotSpeed, robotDirectionAngle, angularVelocity, wheelConf, returnMotorRPM) {
    const linearSpeed = robotSpeed * Math.cos(robotDirectionAngle - wheelConf.angle) +
        wheelConf.centerDistance * angularVelocity;

    return returnMotorRPM ? linearSpeed * wheelConf.linearSpeedToMotorRPM : linearSpeed;
}

module.exports = {
    calculateSpeedsFromXY: calculateSpeedsFromXY,
    calculateSpeeds: calculateSpeeds,
    calculateWheelSpeedFromXY: calculateWheelSpeedFromXY,
    calculateWheelSpeed: calculateWheelSpeed
};