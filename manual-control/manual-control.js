const dgram = require('dgram');
const socket = dgram.createSocket('udp4');
const publicConf = require('./public-conf.json');

const steam = require('./steam-controller');
const ps4 = require('./ps4-controller');
const controller = new steam.SteamController();
const ps4Controller = new ps4.PS4Controller();

//controller.connect();

ps4Controller.connect();

const robotName = process.argv[2];

socket.on('error', (err) => {
    console.log(`socketPublisher error:\n${err.stack}`);
    socket.close();
});

socket.on('message', (message, rinfo) => {
    //console.log(`socket got: ${message} from ${rinfo.address}:${rinfo.port}`);

    const info = JSON.parse(message.toString());
    handleInfo(info);
});

socket.on('listening', () => {
    const address = socket.address();
    console.log(`socket listening ${address.address}:${address.port}`);
});

socket.bind(publicConf.port, () => {
    //socket.setMulticastInterface('127.0.0.1');
    socket.setMulticastInterface('127.0.0.1');
});

function exitHandler(options, err) {
    console.log('exitHandler', options);

    clearInterval(speedSendInterval);
    commandObject.speeds = [0, 0, 0, 0, 0];
    update();

    if (err) {
        console.log(err.stack);
    }

    sendToHub({type: 'unsubscribe'}, () => {
        if (options.exit) {
            setTimeout(() => {
                socket.close();
                process.exit();
            }, 1000);
        } else {
            socket.close();
            process.exit();
        }
    });
}

//do something when app is closing
process.on('exit', exitHandler.bind(null, {cleanup: true}));

//catches ctrl+c event
process.on('SIGINT', exitHandler.bind(null, {exit: true}));

// catches "kill pid" (for example: nodemon restart)
process.on('SIGUSR1', exitHandler.bind(null, {exit: true}));
process.on('SIGUSR2', exitHandler.bind(null, {exit: true}));

//catches uncaught exceptions
process.on('uncaughtException', exitHandler.bind(null, {exit: true}));

process.on('message', (message) => {
    console.log('CHILD got message:', message);

    if (message.type === 'close') {
        exitHandler({exit: true});
    }
});

let isControllerActive = true;

const states = {
    IDLE: 'IDLE',
    GRAB_BALL: 'GRAB_BALL',
    HOLD_BALL: 'HOLD_BALL',
    EJECT_BALL: 'EJECT_BALL',
    THROW_BALL: 'THROW_BALL'
};

let state = states.IDLE;
let ballValue = false;
let ball2Value = false;
let prevBallValue = false;
let prevBall2Value = false;
let holdBallTimeout = null;
let startTimeEject = Date.now();
let speedSendInterval;

let ySpeed = 0;
let xSpeed = 0;
let rotation = 0;

const minServo = 1085;
const maxServo = 1650;
const servoRange = maxServo - minServo;
let servo = minServo;
const feederOnSpeed = 20;
let feederSpeed = 0;
let defaultMaxSpeed = 1.0;
let maxSpeed = defaultMaxSpeed;
let defaultMaxRotation = 1.0;
let maxRotation = defaultMaxRotation;

let prevButtons = {};

let robotConfig = {
    robotRadius: 0.14,
    wheelRadius: 0.035,
    wheelFromCenter: 0.117,
    wheel1Angle: -135,
    wheel2Angle: 135,
    wheel3Angle: -45,
    wheel4Angle: 45,
    wheel1AxisAngle: 135,
    wheel2AxisAngle: 45,
    wheel3AxisAngle: -135,
    wheel4AxisAngle: -45,
    metricToRobot: 1
};

if (robotName === '001TRT') {
    robotConfig = {
        robotRadius: 0.14,
        wheelRadius: 0.035,
        wheelFromCenter: 0.117,
        wheel1Angle: 225,
		wheel2Angle: 45,
		wheel3Angle: 315,
		wheel4Angle: 135,
        wheel1AxisAngle: 135,
        wheel2AxisAngle: 45,
        wheel3AxisAngle: -135,
        wheel4AxisAngle: -45,
        metricToRobot: 1
    };
}

robotConfig.metricToRobot = 225 / (robotConfig.wheelRadius * 2 * Math.PI);

const commandObject =  {
    speeds: [0, 0, 0, 0, 0, 0, 1200],
    fieldID: 'Z',
    robotID: 'Z',
    shouldSendAck: false,
    led: 2
};

function clone(obj) {
    let cloned = {};

    for (let key in obj) {
        cloned[key] = obj[key];
    }

    return cloned;
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
ps4Controller.on('data', (data) => {
    //console.log(data.center);//, data.bottom);

    //console.log(data);

    /*if (data.status !== 'input') {
        return;
    }*/
	
	if (!prevButtons.psButton && data.psButton) {
        console.log(data);
    }

    if (!prevButtons.circle && data.circle) {
        console.log('circle - changing basket colors');

        toggleBasketColour();
    }

    if (!prevButtons.cross && data.cross) {
        console.log('cross - toggle competition mode');

        toggleIsCompetition();
    }

    if (!prevButtons.triangle && data.triangle) {
        console.log('TRIANGLE - resetting speeds');
        maxSpeed = defaultMaxSpeed;
        maxRotation = defaultMaxRotation;
        console.log(maxSpeed);
    }

    if (!prevButtons.square && data.square) {
        console.log('square - toggle controller');
        toggleController();
    }

    if (!prevButtons.dPadDown && data.dPadDown) {
        console.log('dPadDown - decreasing speeds by 2x');
        maxSpeed /= 2;
        maxRotation /= 2;
        console.log(maxSpeed);
    }

    if (!prevButtons.dPadUp && data.dPadUp) {
        console.log('dPadUp - increasing speeds by 2x');
        maxSpeed *= 2;
        maxRotation *= 2;
        console.log(maxSpeed);
    }

    if (!prevButtons.l1 && data.l1) {
        console.log('L1 - toggleing game logic');

        if (state === states.IDLE) {
            state = states.GRAB_BALL;
        }
        else if (state === states.GRAB_BALL) {
            state = states.IDLE;
        }
        else if (state === states.HOLD_BALL) {
            state = states.EJECT_BALL;
            startTimeEject = Date.now();
        }
    }

    if (!prevButtons.r1 && data.r1) {
        console.log('R1 - toggleing throwing ball');

        if (state === states.IDLE || state === states.GRAB_BALL) {
            state = states.THROW_BALL;
        } else if (state === states.THROW_BALL) {
            state = states.IDLE;
        }
    }
	
	const analogMax = 255;
	const deadZone = 5;

    if (!prevButtons.r2 && data.r2) {
		console.log('R2 - toggleing thrower angle');
        if (servo === minServo) {
            servo = maxServo;
        } else if (servo === maxServo) {
            servo = Math.floor(minServo + servoRange / 2);
        } else {
            servo = minServo;
        }
        console.log('servo', servo);
    }
	
	if (!prevButtons.l2 && data.l2) {
		console.log('R2 - toggleing feeder motor');
		feederSpeed = feederSpeed > 0 ? 0 : feederOnSpeed;
    }
	
	
    prevButtons = clone({ ...data});

    xSpeed = (inInDeadZone(data.leftAnalogX, 128, deadZone) - 128.0) / (analogMax / 2.0) * maxSpeed;
    ySpeed = -(inInDeadZone(data.leftAnalogY, 128, deadZone) - 128.0) / (analogMax / 2.0) * maxSpeed;

    rotation = -(inInDeadZone(data.rightAnalogX, 128, deadZone) - 128.0) / (analogMax / 2.0) * maxRotation;

    //console.log(data);
});

ps4Controller.on('error', (error) => {
	console.log(error);
	ps4Controller.connect();
});

function inInDeadZone(value, zeroPosition, deadZone) {
	
	return Math.abs(Math.abs(value) - zeroPosition) < deadZone ? zeroPosition : value;
}

function handleInfo(info) {
    switch (info.topic) {
        case 'mainboard_feedback':
            prevBallValue = ballValue;
            ballValue = info.message.ball2;
            prevBall2Value = ball2Value;
            ball2Value = info.message.ball1;

            if (prevBallValue !==  ballValue || prevBall2Value !== ball2Value) {
                handleBallValueChanged();
            }

            break;
        case 'ai_state':
            isControllerActive = info.state.isManualOverride;
            break;
    }
}

function handleBallValueChanged() {
    if (robotName === '001TRT') {
        return;
    }

    if (state === states.EJECT_BALL) {
        if (prevBall2Value && !ball2Value) {
            state = states.IDLE;
        }
    }
    else if (state === states.THROW_BALL) {
        if (prevBallValue && !ballValue) {
            state = states.IDLE;
        }
    }
    else if (state === states.GRAB_BALL) {
        if (!prevBallValue && ballValue) {
            state = states.HOLD_BALL;
        }
    }
    /*else if (state === states.HOLD_BALL) {
        if (holdBallTimeout === null) {
            holdBallTimeout = setTimeout(() => {
                startTimeEject = Date.now();
                state = states.EJECT_BALL;
                holdBallTimeout = null;
            }, 1000);
        }
    }*/

    console.log(ballValue, ball2Value, state);
}

function drive() {
    const rotationalSpeed = speedMetricToRobot(rotationRadiansToMetersPerSecond(rotation));
    const speed = Math.sqrt(xSpeed * xSpeed + ySpeed * ySpeed);
    const angle = Math.atan2(ySpeed, xSpeed);

    const speeds = commandObject.speeds;

    speeds[0] = Math.round(speedMetricToRobot(wheelSpeed(speed, angle, robotConfig.wheel1Angle / 180 * Math.PI)) + rotationalSpeed);
    speeds[1] = Math.round(speedMetricToRobot(wheelSpeed(speed, angle, robotConfig.wheel2Angle / 180 * Math.PI)) + rotationalSpeed);
    speeds[2] = Math.round(speedMetricToRobot(wheelSpeed(speed, angle, robotConfig.wheel3Angle / 180 * Math.PI)) + rotationalSpeed);
    speeds[3] = Math.round(speedMetricToRobot(wheelSpeed(speed, angle, robotConfig.wheel4Angle / 180 * Math.PI)) + rotationalSpeed);

    //console.log('speeds', speeds);

    update();
}

function wheelSpeed(robotSpeed, robotAngle, wheelAngle) {
    return robotSpeed * Math.cos(wheelAngle - robotAngle);
}

function speedMetricToRobot(metersPerSecond) {
    return metersPerSecond * robotConfig.metricToRobot;
}

function speedRobotToMetric(wheelSpeed) {
    if (robotConfig.metricToRobot === 0) {
        return 0;
    }

    return wheelSpeed / robotConfig.metricToRobot;
}

function rotationRadiansToMetersPerSecond(radiansPerSecond) {
    return radiansPerSecond * robotConfig.wheelFromCenter;
}

function toggleBasketColour() {
    sendToHub({
        type: 'message',
        topic: 'ai_configuration',
        key: 'basketColour',
        toggle: true
    });
}

function toggleIsCompetition() {
    sendToHub({
        type: 'message',
        topic: 'ai_configuration',
        key: 'isCompetition',
        toggle: true
    });
}

function toggleController() {
    //isControllerActive = !isControllerActive;
    
    sendToHub({
        type: 'message',
        topic: 'ai_configuration',
        key: 'isManualOverride',
        toggle: true
    });

    //sendControllerActiveMessages();
}

function sendControllerActiveMessages() {
    if (isControllerActive) {
        sendToHub({
            type: 'message',
            topic: 'ai_command',
            commandInfo: {
                command: 'set_manual_control',
                state: true,
            }
        });
    } else {
        sendToHub({
            type: 'message',
            topic: 'ai_command',
            commandInfo: {
                command: 'set_manual_control',
                state: false,
            }
        });
    }
}

speedSendInterval = setInterval(() => {
    if (state === states.THROW_BALL) {
        commandObject.speeds[4] = 7000;
    }
    else if (state === states.GRAB_BALL) {
        commandObject.speeds[4] = 200;
    }
    else if (state === states.HOLD_BALL || state === states.IDLE) {
        commandObject.speeds[4] = 0;
    }

    if (state === states.EJECT_BALL) {
        let currentTime = Date.now();
        let timeDiff = currentTime - startTimeEject;
        let speed = -200 + timeDiff * 0.2;

        if (speed > -10){
            speed = -10;
        }

        commandObject.speeds[4] = speed;
    }

    if (robotName === '001TRT') {
        commandObject.speeds[5] = feederSpeed;
        commandObject.speeds[6] = servo;
    }

    if (isControllerActive) {
        drive();
    }
}, 20);

function update() {
    sendToHub({type: 'message', topic: 'mainboard_command', command: commandObject});
}

function sendToHub(info, onSent) {
    const message = Buffer.from(JSON.stringify(info));

    socket.send(message, publicConf.hubPort, publicConf.hubIpAddress, (err) => {
        if (err) {
            console.error(err);
        }

        if (typeof onSent === 'function') {
            onSent(err);
        }
    });
}

sendToHub({type: 'subscribe', topics: ['mainboard_feedback', 'ai_state']});
//sendControllerActiveMessages();