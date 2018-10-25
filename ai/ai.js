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
 * @typedef {Object} HubInfo
 * @property {string} topic
 * @property {AiCommandInfo} [commandInfo]
 * @property {Object.<string, VisionBlobInfo[]>} [blobs]
 */

/**
 * @typedef {Object} VisionBlobInfo
 * @property {number} area
 * @property {number} cx
 * @property {number} cy
 * @property {number} x1
 * @property {number} x2
 * @property {number} y1
 * @property {number} y2
 */

/**
 * @typedef {Object} AiCommandInfo
 * @property {string} command
 * @property {string} [state]
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

let motionState = motionStates.IDLE;
let throwerState = throwerStates.IDLE;

const findBallRotatePattern = [[-1, 100], [-8, 200], [-1, 100], [-8, 200], [-1, 50]];
let findBallRotatePatternIndex = 0;
let findBallRotateTimeout = null;

let throwBallTimeout = 0;
const throwBallTimeoutDelay = 5000;

let visionState = {};
let processedVisionState = {closestBall: null, basket: null, lastVisibleBasketDirection: -1};
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

process.on('SIGINT', close);

process.on('message', (message) => {
    console.log('CHILD got message:', message);

    if (message.type === 'close') {
        close();
    }
});

function close() {
    console.log('closing');

    sendToHub({type: 'unsubscribe'}, () => {
        socket.close();
        process.exit();
    });
}

/**
 *
 * @param {HubInfo} info
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
                console.log('mainboardState.ballThrown', mainboardState.ballThrown);
            }

            mainboardState.lidarDistance = info.message.distance;

            sendState();

            break;
        case 'ai_command': {
            const commandInfo = info.commandInfo;

            if (commandInfo.command === 'set_motion_state') {
                if (motionStates[commandInfo.state]) {
                    setMotionState(commandInfo.state);
                }
            } else if (commandInfo.command === 'set_thrower_state') {
                if (throwerStates[commandInfo.state]) {
                    setThrowerState(commandInfo.state);
                }
            }

            break;
        }
    }

    if (shouldUpdate) {
        update();
    }
}

/**
 *
 * @param {HubInfo} info
 */
function processVisionInfo(info) {
    visionState = info;
    const blobs = visionState.blobs;

    processedVisionState.closestBall =
        blobs && Array.isArray(blobs.green) && blobs.green.length > 0 ? blobs.green[0] : null;
    processedVisionState.basket =
        blobs && Array.isArray(blobs[basketColour]) && blobs[basketColour].length > 0 ? blobs[basketColour][0] : null;

    if (processedVisionState.basket) {
        processedVisionState.lastVisibleBasketDirection =  Math.sign(frameWidth / 2 - processedVisionState.basket.cx);
    }
}

function sendState() {
    const state = {
        motionState,
        throwerState,
        ballSensors: mainboardState.balls,
        ballThrown: mainboardState.ballThrown,
        lidarDistance: mainboardState.lidarDistance,
        closestBall: processedVisionState.closestBall,
        basket: processedVisionState.basket
    };

    sendToHub({type: 'message', topic: 'ai_state', state: state}, () => {

    });
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
    setThrowerState(throwerStates.IDLE);

    if (processedVisionState.closestBall && processedVisionState.closestBall.area > 10) {
        setMotionState(motionStates.DRIVE_TO_BALL);
        resetMotionFindBall();
        return;
    }

    const patternStep = findBallRotatePattern[findBallRotatePatternIndex];

    if (findBallRotateTimeout == null) {
        findBallRotateTimeout = setTimeout(() => {
            findBallRotateTimeout = null;
            findBallRotatePatternIndex++;

            if (findBallRotatePatternIndex >= findBallRotatePattern.length) {
                findBallRotatePatternIndex = 0;
            }
        }, patternStep[1]);

        setAiStateSpeeds(omniMotion.calculateSpeeds(0, 0, patternStep[0], true));
    }
}

function resetMotionFindBall() {
    clearTimeout(findBallRotateTimeout);
    findBallRotateTimeout = null;
    findBallRotatePatternIndex = 0;
}

function handleMotionDriveToBall() {
    const closestBall = processedVisionState.closestBall;

    if (closestBall) {
        const centerX = closestBall.cx;
        const centerY = closestBall.cy;
        const errorX = centerX - frameCenterX;
        const errorY = 0.8 * frameHeight - centerY;
        const maxForwardSpeed = 2;
        const maxRotationSpeed = 8;
        const forwardSpeed = maxForwardSpeed * errorY / frameHeight;
        const rotationSpeed = maxRotationSpeed * -errorX / frameWidth;

        setAiStateSpeeds(omniMotion.calculateSpeedsFromXY(0, forwardSpeed, rotationSpeed, true));

        if (
            errorY <= 100 &&
            Math.abs(errorX) <= 100 &&
            centerY <= 950 //avoid too close ball
        ) {
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
    const maxRotationSpeed = 2;
    let rotationSpeed = maxRotationSpeed * processedVisionState.lastVisibleBasketDirection;
    let xSpeed = 0;
    let forwardSpeed = 0;
    let isBasketErrorXSmallEnough = false;
    let isBallCloseEnough = false;

    if (throwerState === throwerStates.THROW_BALL) {
        forwardSpeed = 0.1;


    } else if (closestBall) {
        const ballCenterX = closestBall.cx;
        const ballCenterY = closestBall.cy;
        const ballErrorX = ballCenterX - frameCenterX;
        const ballErrorY = 0.8 * frameHeight - ballCenterY;

        if (
            ballErrorY > 100 ||
            Math.abs(ballErrorX) > 100 ||
            ballCenterX > 950 //ball too close
        ) {
            setMotionState(motionStates.DRIVE_TO_BALL);
        } else {
            isBallCloseEnough = true;
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
        rotationSpeed = maxRotationSpeed * -basketErrorX / (frameWidth / 2);

        if (isBasketErrorXSmallEnough && isBallCloseEnough) {
            setThrowerState(throwerStates.THROW_BALL);
        }
    }

    if (Math.abs(rotationSpeed) < minRotationSpeed) {
        rotationSpeed = Math.sign(rotationSpeed) * minRotationSpeed;
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
        setMotionState(motionStates.FIND_BALL);
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

        if (motionState === motionStates.IDLE) {
            resetMotionFindBall();
        }
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

        clearTimeout(throwBallTimeout);

        if (throwerState === throwerStates.THROW_BALL) {
            throwBallTimeout = setTimeout(() => {
                setThrowerState(throwerStates.IDLE);
            }, throwBallTimeoutDelay);
        }
    }
}

function update() {
    motionStateHandlers[motionState]();
    throwerStateHandlers[throwerState]();

    if (motionState !== motionStates.IDLE || throwerState !== throwerStates.IDLE) {
        sendToHub({type: 'message', topic: 'mainboard_command', command: formatSpeedCommand(aiState.speeds)});
    }
}

sendToHub({type: 'subscribe', topics: ['vision', 'mainboard_feedback', 'ai_command']});

//sendToHub({type: 'message', topic: 'mainboard_command', command: 'fs:1'});