const dgram = require('dgram');
const socket = dgram.createSocket('udp4');
const omniMotion = require('./omni-motion');
const thrower = require('./thrower');
const publicConf = require('./public-conf.json');

/**
 * @name MainboardFeedback
 * @type object
 * @property {number} speed1
 * @property {number} speed2
 * @property {number} speed3
 * @property {number} speed4
 * @property {number} speed5
 * @property {boolean} ball1
 * @property {boolean} ball2
 * @property {number} distance
 * @property {boolean} isSpeedChanged
 * @property {number} time
 */

/**
 * @enum {string}
 */
const motionStates = {
    IDLE: 'IDLE',
    FIND_BALL: 'FIND_BALL',
    DRIVE_TO_BALL: 'DRIVE_TO_BALL',
    FIND_BASKET: 'FIND_BASKET'
};

/**
 * @enum {string}
 */
const throwerStates = {
    IDLE: 'IDLE',
    THROW_BALL: 'THROW_BALL',
    GRAB_BALL: 'GRAB_BALL',
    HOLD_BALL: 'HOLD_BALL',
    EJECT_BALL: 'EJECT_BALL'
};

const motionStateHandlers = {
    IDLE: handleMotionIdle,
    FIND_BALL: handleMotionFindBall,
    DRIVE_TO_BALL: handleMotionDriveToBall,
    FIND_BASKET: handleMotionFindBasket
};

const throwerStateHandlers = {
    IDLE: handleThrowerIdle,
    THROW_BALL: handleThrowerThrowBall,
    GRAB_BALL: handleThrowerGrabBall,
    HOLD_BALL: handleThrowerHoldBall,
    EJECT_BALL: handleThrowerEjectBall
};

const basketColours = {
    blue: 'blue',
    magenta: 'magenta'
};

const frameHeight = 1024;
const frameWidth = 1280;
const frameCenterX = frameWidth / 2;

let motionState = motionStates.FIND_BALL;
let throwerState = throwerStates.IDLE;

let visionState = {};
let processedVisionState = {closestBall: null, basket: null};
let mainboardState = {
    speeds: [0, 0, 0, 0, 0],
    balls: [false, false], prevBalls: [false, false], ballThrown: false,
    lidarDistance: 0
};
let aiState = {speeds: [0, 0, 0, 0, 0]};

let basketColour = basketColours.blue;

socket.on('error', (err) => {
    console.log(`socketPublisher error:\n${err.stack}`);
    socket.close();
});

socket.on('message', (message, rinfo) => {
    console.log(`socket got: ${message} from ${rinfo.address}:${rinfo.port}`);

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

/**
 *
 * @param {object} info
 * @param {string} info.topic
 * @param {MainboardFeedback} info.message
 */
function handleInfo(info) {
    let shouldUpdate = false;

    switch (info.topic) {
        case 'vision':
            processVisionInfo(info);
            shouldUpdate = true;
            break;
        case 'mainboard_feedback':
            /*if (info.message.isSpeedChanged) {
                shouldUpdate = true;
            }*/

            mainboardState.speeds[0] = info.message.speed1;
            mainboardState.speeds[1] = info.message.speed2;
            mainboardState.speeds[2] = info.message.speed3;
            mainboardState.speeds[3] = info.message.speed4;
            mainboardState.speeds[4] = info.message.speed5;

            mainboardState.prevBalls = mainboardState.balls.slice();
            mainboardState.balls[0] = info.message.ball1;
            mainboardState.balls[1] = info.message.ball2;

            if (
                !mainboardState.ballThrown
                && mainboardState.prevBalls[1] === true
                && mainboardState.balls[1] === false
            ) {
                mainboardState.ballThrown = true;
            }

            mainboardState.lidarDistance = info.message.distance;

            break;
    }

    if (shouldUpdate) {
        update();
    }
}

function processVisionInfo(info) {
    visionState = info;
    const blobs = visionState.blobs;
    processedVisionState.closestBall =
        blobs && Array.isArray(blobs.green) && blobs.green.length > 0 ? blobs.green[0] : null;
    processedVisionState.basket =
        blobs && Array.isArray(blobs[basketColour]) && blobs[basketColour].length > 0 ? blobs[basketColour][0] : null;
}

function sendToHub(info) {
    const message = Buffer.from(JSON.stringify(info));
    //console.log('send:', info, 'to', '127.0.0.1', 8091);

    socket.send(message, publicConf.hubPort, publicConf.hubIpAddress, (err) => {
        if (err) {
            console.error(err);
        }
    });
}

function formatSpeedCommand(wheelRPMs) {
    return wheelRPMs.slice();
}

/**
 *
 * @param {array} wheelRPMs
 */
function setAiStateSpeeds(wheelRPMs) {
    for (let i = 0; i < aiState.speeds.length && i < wheelRPMs.length; i++) {
        aiState.speeds[i] = wheelRPMs[i];
    }
}

function handleMotionIdle() {
    aiState.speeds = aiState.speeds.fill(0, 0, 4);
}

function handleMotionFindBall() {
    if (processedVisionState.closestBall) {
        setMotionState(motionStates.DRIVE_TO_BALL);
    } else {
        setAiStateSpeeds(omniMotion.calculateSpeeds(0, 0, -1, true));
    }
}

function handleMotionDriveToBall() {
    const closestBall = processedVisionState.closestBall;

    if (closestBall) {
        const centerX = closestBall.cx;
        const centerY = closestBall.cy;
        const errorX = centerX - frameCenterX;
        const errorY = 0.8 * frameHeight - centerY;
        const forwardSpeed = errorY / 1000;
        const rotationSpeed = -errorX / 320;

        setAiStateSpeeds(omniMotion.calculateSpeedsFromXY(0, forwardSpeed, rotationSpeed, true));

        if (errorY <= 100) {
            setMotionState(motionStates.FIND_BASKET);
        }
    } else {
        setMotionState(motionStates.FIND_BALL);
    }
}

function handleMotionFindBasket() {
    const closestBall = processedVisionState.closestBall;
    const basket = processedVisionState.basket;
    const minRotationSpeed = 0.05;
    let rotationSpeed = -1;
    let xSpeed = 0;
    let forwardSpeed = 0;
    let isBasketErrorXSmallEnough = false;

    if (throwerState === throwerStates.THROW_BALL) {
        forwardSpeed = 0.05;


    } else if (closestBall) {
        const ballCenterX = closestBall.cx;
        const ballCenterY = closestBall.cy;
        const ballErrorX = ballCenterX - frameCenterX;
        const ballErrorY = 0.8 * frameHeight - ballCenterY;

        if (ballErrorY > 100) {
            setMotionState(motionStates.DRIVE_TO_BALL);
        } else {
            forwardSpeed = ballErrorY / 1000;
            //xSpeed = ballErrorX / 1000;
        }
    } else {
        setMotionState(motionStates.FIND_BALL);
    }

    if (basket && (closestBall || throwerState === throwerStates.THROW_BALL)) {
        const basketCenterX = basket.cx;
        const basketErrorX = basketCenterX - frameCenterX;
        isBasketErrorXSmallEnough = Math.abs(basketErrorX) < 5;
        rotationSpeed = -basketErrorX / 640;

        if (isBasketErrorXSmallEnough) {
            setThrowerState(throwerStates.THROW_BALL);
        }
    }

    if (Math.abs(rotationSpeed) < minRotationSpeed) {
        rotationSpeed = isBasketErrorXSmallEnough ? rotationSpeed : Math.sign(rotationSpeed) * minRotationSpeed;
    }

    xSpeed = rotationSpeed * 0.14;

    setAiStateSpeeds(omniMotion.calculateSpeedsFromXY(xSpeed, forwardSpeed, rotationSpeed, true));
}

function handleThrowerIdle() {
    aiState.speeds[4] = 0;
}

function handleThrowerThrowBall() {
    aiState.speeds[4] = thrower.getSpeed(mainboardState.lidarDistance);

    if (mainboardState.ballThrown) {
        mainboardState.ballThrown = false;
        setThrowerState(throwerStates.IDLE);
    }
}

function handleThrowerGrabBall() {

}

function handleThrowerHoldBall() {

}

function handleThrowerEjectBall() {

}

/**
 *
 * @param {motionStates} newState
 */
function setMotionState(newState) {
    if (motionState !== newState) {
        console.log('Motion state:', motionState, '->', newState);
        motionState = newState;
    }
}

/**
 *
 * @param {throwerStates} newState
 */
function setThrowerState(newState) {
    if (throwerState !== newState) {
        console.log('Thrower state:', throwerState, '->', newState);
        throwerState = newState;
    }
}

function update() {
    motionStateHandlers[motionState]();
    throwerStateHandlers[throwerState]();

    sendToHub({type: 'message', topic: 'mainboard_command', command: formatSpeedCommand(aiState.speeds)});
}

sendToHub({type: 'subscribe', topics: ['vision', 'mainboard_feedback']});

//sendToHub({type: 'message', topic: 'mainboard_command', command: 'fs:1'});