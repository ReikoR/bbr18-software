const dgram = require('dgram');
const socket = dgram.createSocket('udp4');
const omniMotion = require('./omni-motion');
const thrower = require('./thrower');
const util = require('./util');
const publicConf = require('./public-conf.json');

/**
 * @name MainboardFeedback
 * @type object
 * @property {number} speed1
 * @property {number} speed2
 * @property {number} speed3
 * @property {number} speed4
 * @property {number} speed5
 * @property {number} speed6
 * @property {boolean} ball1
 * @property {boolean} ball2
 * @property {number} distance
 * @property {boolean} isSpeedChanged
 * @property {string} refereeCommand
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
 * @typedef {Object} VisionStraightAheadInfo
 * @property {number} driveability
 * @property {number} reach
 * @property {number} leftSideMetric
 * @property {number} rightSideMetric
 */

/**
 * @typedef {Object} VisionBallInfo
 * @property {number} cx
 * @property {number} cy
 * @property {number} w
 * @property {number} h
 * @property {number[]} metrics
 * @property {VisionStraightAheadInfo} straightAhead
 * @property {number} size
 */

/**
 * @typedef {Object} VisionBasketInfo
 * @property {number} cx
 * @property {number} cy
 * @property {number} w
 * @property {number} h
 * @property {string} color
 * @property {number[]} metrics
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
    GRAB_BALL: 'GRAB_BALL',
    FIND_BASKET: 'FIND_BASKET',
    FIND_BASKET_TIMEOUT: 'FIND_BASKET_TIMEOUT'
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
    GRAB_BALL: handleMotionGrabBall,
    FIND_BASKET: handleMotionFindBasket,
    FIND_BASKET_TIMEOUT: handleMotionFindBasketTimeout
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
const frameCenterY = frameHeight / 2;

const minServo = 1050;
const maxServo = 1650;
const servoRange = maxServo - minServo;
let servo = maxServo;

let motionState = motionStates.IDLE;
let throwerState = throwerStates.IDLE;

const findObjectRotatePattern = [[-1, 100], [-7, 200], [-1, 100], [-7, 200], [-1, 50]];
let findObjectRotatePatternIndex = 0;
let findObjectRotateTimeout = null;
let findObjectRotateLoopCount = 0;
const findObjectRotateLoopLimit = 5;

const throwerIdleSpeed = 5000;

let throwBallTimeout = 0;
const throwBallTimeoutDelay = 5000;

const lastClosestBallLimit = 10;
let lastClosestBallCount = 0;

let visionState = {};

/**
 * @typedef {Object} ProcessedVisionStateInfo
 * @property {VisionBallInfo} closestBall
 * @property {VisionBallInfo} lastClosestBall
 * @property {VisionBasketInfo} basket
 * @property {VisionBasketInfo} otherBasket
 * @property {number} lastVisibleBasketDirection
 * @property {{straightAhead: VisionStraightAheadInfo}} metrics
 */

/**
 * @type {ProcessedVisionStateInfo}
 */
let processedVisionState = {
    closestBall: null,
    lastClosestBall: null,
    basket: null,
    otherBasket: null,
    lastVisibleBasketDirection: -1,
    metrics: null
};

let mainboardState = {
    speeds: [0, 0, 0, 0, 0, minServo],
    balls: [false, false],
    prevBalls: [false, false],
    ballThrown: false,
    ballGrabbed: false,
    realsenseDistance: 0,
    refereeCommand: 'X',
    prevRefereeCommand: 'X'
};

let basketState = {distance: 0, angel: 0};

let aiState = {
    speeds: [0, 0, 0, 0, 0, minServo],
    fieldID: 'Z',
    robotID: 'Z',
    shouldSendAck: false
};

let basketColour = basketColours.magenta;

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

let previousBall0 = null;
let previousBall1 = null;
let previousBall0Counter = 0;
let previousBall1Counter = 1;
const ballSensorFilterSize = 3;

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
            mainboardState.speeds[5] = info.message.speed6;

            mainboardState.prevBalls = mainboardState.balls.slice();

            //mainboardState.balls[0] = info.message.ball1;
            //mainboardState.balls[1] = info.message.ball2;

            if(info.message.ball1 == previousBall0) {
                previousBall0Counter ++;
            } else {
                previousBall0Counter = 0;
            }

            if(info.message.ball2 == previousBall1) {
                previousBall1Counter ++;
            } else {
                previousBall1Counter = 0;
            }

            if(previousBall0Counter > ballSensorFilterSize){
                mainboardState.balls[0] = info.message.ball1;
            }
            if(previousBall1Counter > ballSensorFilterSize){
                mainboardState.balls[1] = info.message.ball2;
            }

            previousBall0 = info.message.ball1;
            previousBall1 = info.message.ball2;



            if (mainboardState.balls[0] && mainboardState.balls[1]) {
                mainboardState.ballGrabbed = true;
            } else {
                mainboardState.ballGrabbed = false;
            }

            mainboardState.prevRefereeCommand = mainboardState.refereeCommand;
            mainboardState.refereeCommand = info.message.refereeCommand;

            if (mainboardState.refereeCommand !== mainboardState.prevRefereeCommand) {
                handleRefereeCommandChanged();
            }

            if (
                !mainboardState.ballThrown
                && mainboardState.prevBalls[1] === true
                && mainboardState.balls[1] === false
            ) {
                mainboardState.ballThrown = true;
                console.log('mainboardState.ballThrown', mainboardState.ballThrown);

                if (visionState.basket) {
                    console.log('THROWN', visionState.basket.cx);
                }
            }

            if (
                mainboardState.prevBalls[0] !==  mainboardState.balls[0] ||
                mainboardState.prevBalls[1] !==  mainboardState.balls[1]
            ) {
                handleBallValueChanged();
            }

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
        case 'goal_distance': {
            basketState.angel = info.data.angle;
            basketState.distance = info.data.distance;
            break;
        }
    }

    if (shouldUpdate) {
        update();
    }
}

/**
 * @param {VisionBallInfo} ball
 * @param {VisionBasketInfo} basket
 * @param {VisionBasketInfo} otherBasket
 * @returns {number}
 */
function computeBallConfidence(ball, basket, otherBasket) {
    //ball distance
    //ball size
    //bottom surround metric
    //top surround metric
    //distance from basket
    //sideMetric
    //driveability

    const ballDistance = 8000 * Math.pow(ball.cy, -1.85);
    const ballDistanceMetric = 0.2 * util.clamp((6 - ballDistance) / 6, 0, 1);
    const bottomMetric = 0.1 * ball.metrics[0];
    const topMetric = 0.1 * ball.metrics[1];
    const sizeMetric = Math.min(0.5 * ball.w / 150, 1);
    let distanceFromBasketMetric = 0;

    const baskets = [];

    if (basket) {
        baskets.push(basket);
    }

    if (otherBasket) {
        baskets.push(otherBasket);
    }

    if (baskets.length > 0) {
        for (let i = 0; i < baskets.length; i++) {
            const distanceToBasket = Math.abs(baskets[i].y2 - ball.cy);
            const metric = 0.1 * distanceToBasket / frameHeight;

            if (metric > distanceFromBasketMetric) {
                distanceFromBasketMetric = metric;
            }
        }
    } else {
        distanceFromBasketMetric = 0.1;
    }

    return ballDistanceMetric +
        sizeMetric +
        bottomMetric +
        topMetric +
        distanceFromBasketMetric +
        //0.05 * Math.abs(ball.straightAhead.sideMetric) +
        0.05 * ball.straightAhead.driveability;
}

/**
 *
 * @param {HubInfo} info
 */
function processVisionInfo(info) {
    visionState = info;
    const balls = visionState.balls || [];
    const baskets = visionState.baskets || [];

    let ball = null;
    let basket = null;
    let otherBasket = null;

    // Find largest basket
    for (let i = 0; i < baskets.length; i++) {
        baskets[i].y2 = baskets[i].cy + baskets[i].h / 2;

        if (baskets[i].color === basketColour) {
            if (!basket || basket.w * basket.h < baskets[i].w * baskets[i].h) {
                basket = baskets[i];
            }
        } else {
            if (!otherBasket || otherBasket.w * otherBasket.h < baskets[i].w * baskets[i].h) {
                otherBasket = baskets[i];
            }
        }
    }

    processedVisionState.basket = basket;
    processedVisionState.otherBasket = otherBasket;

    for (let i = 0; i < balls.length; i++) {
        balls[i].size = balls[i].w * balls[i].h;
        balls[i].confidence = computeBallConfidence(balls[i], basket, otherBasket);

        // Find ball with highest confidence
        /*if (!ball || ball.confidence > balls[i].confidence) {
            ball = balls[i];
        }*/

        // Find largest ball
        if (!ball || ball.w * ball.h < balls[i].w * balls[i].h) {
            ball = balls[i];
        }
    }

    processedVisionState.closestBall = ball;

    if (processedVisionState.closestBall) {
        processedVisionState.lastClosestBall = processedVisionState.closestBall;
        lastClosestBallCount = 0;
    } else {
        lastClosestBallCount++;

        if (lastClosestBallCount >= lastClosestBallLimit) {
            processedVisionState.lastClosestBall = null;
            lastClosestBallCount = 0;
        }
    }

    if (processedVisionState.basket) {
        processedVisionState.lastVisibleBasketDirection =  Math.sign(frameWidth / 2 - processedVisionState.basket.cx);
    }

    //console.log(processedVisionState);
}

function getClosestBasket() {
    if (!processedVisionState.basket) {
        return processedVisionState.otherBasket;
    }

    if (!processedVisionState.otherBasket) {
        return processedVisionState.basket;
    }

    return processedVisionState.basket.y2 > processedVisionState.otherBasket.y2 ?
        processedVisionState.basket : processedVisionState.otherBasket;
}

function sendState() {
    const state = {
        motionState,
        throwerState,
        ballSensors: mainboardState.balls,
        ballThrown: mainboardState.ballThrown,
        realSenseData: basketState,
        visionMetrics: visionState.metrics,
        closestBall: processedVisionState.closestBall,
        basket: processedVisionState.basket,
        otherBasket: processedVisionState.otherBasket,
        refereeCommand: mainboardState.refereeCommand
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

/**
 *
 * @param {array} wheelRPMs
 */
function setAiStateSpeeds(wheelRPMs) {
    for (let i = 0; i < aiState.speeds.length && i < wheelRPMs.length; i++) {
        aiState.speeds[i] = wheelRPMs[i];
    }
}

function handleBallValueChanged() {
    if (throwerState === throwerStates.EJECT_BALL) {
        if (mainboardState.prevBalls[0] === true && mainboardState.balls[0] === false) {
            mainboardState.ballEjected = true;
        }
    }
    /*
    else if (throwerState === throwerStates.GRAB_BALL) {
        if (mainboardState.prevBalls[1] === false && mainboardState.balls[1] === true) {
            mainboardState.ballGrabbed = true;
        }
    }*/
}

function handleRefereeCommandChanged() {
    console.log('refereeCommand', mainboardState.prevRefereeCommand, '->', mainboardState.refereeCommand);

    if (mainboardState.refereeCommand === 'P') {
        aiState.shouldSendAck = true;
    }
}

function handleMotionIdle() {
    aiState.speeds = aiState.speeds.fill(0, 0, 4);

    setThrowerState(throwerStates.IDLE);
}

function handleMotionFindBall() {

    if(mainboardState.balls[0] || mainboardState.balls[1]) {
        setThrowerState(throwerStates.GRAB_BALL);
    } else {
        setThrowerState(throwerStates.IDLE);

        if (processedVisionState.closestBall) {
            resetMotionFindBall();
            setMotionState(motionStates.DRIVE_TO_BALL);
            return;
        }

        const patternStep = findObjectRotatePattern[findObjectRotatePatternIndex];

        if (findObjectRotateLoopCount === findObjectRotateLoopLimit) {
            setMotionState(motionStates.IDLE);
        } else if (findObjectRotateTimeout == null) {
            findObjectRotateTimeout = setTimeout(() => {
                findObjectRotateTimeout = null;
                findObjectRotatePatternIndex++;

                if (findObjectRotatePatternIndex >= findObjectRotatePattern.length) {
                    findObjectRotatePatternIndex = 0;
                    findObjectRotateLoopCount++;
                }
            }, patternStep[1] * (findObjectRotateLoopCount + 1));

            setAiStateSpeeds(omniMotion.calculateSpeeds(0, 0, patternStep[0] / (findObjectRotateLoopCount + 1), true));
        }
    }


}

function resetMotionFindBall() {
    clearTimeout(findObjectRotateTimeout);
    findObjectRotateTimeout = null;
    findObjectRotatePatternIndex = 0;
    findObjectRotateLoopCount = 0;
}

const driveToBallMinSpeed = 0.6;
const driveToBallMaxSpeed = 5;
const driveToBallStartSpeed = 1;
let driveToBallStartTime = null;

const driveToBallRotationSpeedRampUpLimit = 0.04;
const driveToBallMaxRotationSpeed = 5;
let driveToBallCurrentRotationSpeedLimit = 2;

function getDriveToBallMaxSpeed(startTime, startSpeed, speedLimit) {
    const currentTime = Date.now();
    const timeDiff = currentTime - startTime;
    const speedDiff = speedLimit - startSpeed;
    const rampUpTime = 2000;
    const timePassedPercent = timeDiff / rampUpTime;

    if (timeDiff >= rampUpTime) {
        return speedLimit;
    }

    return startSpeed + speedDiff * Math.pow(timePassedPercent, 2);
}

function handleMotionDriveToBall() {
    const closestBall = processedVisionState.closestBall || processedVisionState.lastClosestBall;

    if (!driveToBallStartTime) {
        driveToBallStartTime = Date.now();
    }

    if (closestBall) {
        const driveability = closestBall.straightAhead.driveability;
        const leftSideMetric = closestBall.straightAhead.leftSideMetric;
        const rightSideMetric = closestBall.straightAhead.rightSideMetric;
        let sideMetric = -leftSideMetric + rightSideMetric;
        const reach = closestBall.straightAhead.reach;

        if (sideMetric < 0.1 && (leftSideMetric > 0.1 || rightSideMetric > 0.1)) {
            if (sideMetric > 0) {
                sideMetric = rightSideMetric;
            } else {
                sideMetric = -leftSideMetric;
            }
        }

        const centerX = closestBall.cx;
        const centerY = closestBall.cy;
        const errorX = centerX - frameCenterX;
        const errorY = 0.8 * frameHeight - centerY;

        if(710 > centerX > 660 && centerY > 950) {
            setThrowerState(throwerStates.EJECT_BALL);
        } else {
            setThrowerState(throwerStates.IDLE);
        }

        const maxForwardSpeed = getDriveToBallMaxSpeed(
            driveToBallStartTime, driveToBallStartSpeed, driveToBallMaxSpeed
        );

        const maxRotationSpeed = driveToBallCurrentRotationSpeedLimit;

        const maxErrorForwardSpeed = 6;
        const maxErrorRotationSpeed = 10;
        const normalizedErrorY = errorY / frameHeight;

        let forwardSpeed = maxErrorForwardSpeed * Math.pow(normalizedErrorY, 2);
        let rotationSpeed = maxErrorRotationSpeed * -errorX / frameWidth;

        if (forwardSpeed > maxForwardSpeed) {
            forwardSpeed = maxForwardSpeed;
        } else if (forwardSpeed < driveToBallMinSpeed) {
            forwardSpeed = driveToBallMinSpeed;
        }


        if (rotationSpeed > maxRotationSpeed) {
            rotationSpeed = maxRotationSpeed;
        }

        driveToBallCurrentRotationSpeedLimit += driveToBallRotationSpeedRampUpLimit;

        if (driveToBallCurrentRotationSpeedLimit >= driveToBallMaxRotationSpeed) {
            driveToBallCurrentRotationSpeedLimit = driveToBallMaxRotationSpeed;
        }

        let sideSpeed = 0;

        if (Math.abs(sideMetric) > 0.1) {
            sideSpeed = -Math.sign(sideMetric) * Math.max(6 * Math.abs(sideMetric), 0.3);

            const normalizedCloseToBallErrorY = Math.abs(errorY) / 400;

            if (normalizedCloseToBallErrorY < 1) {
                sideSpeed *= Math.pow(normalizedCloseToBallErrorY, 2);
            }
        }

        setAiStateSpeeds(omniMotion.calculateSpeedsFromXY(sideSpeed, forwardSpeed, rotationSpeed, true));

        if (
            errorY <= 100 &&
            Math.abs(errorX) <= 100 &&
            centerY <= 950 //avoid too close ball
        ) {
            setMotionState(motionStates.GRAB_BALL);
        }
    } else {
        setMotionState(motionStates.FIND_BALL);
    }
}

function handleMotionGrabBall() {

    const closestBall = processedVisionState.closestBall;

    if(closestBall) {
        const centerX = closestBall.cx;
        const centerY = closestBall.cy;

        const errorX = centerX - frameCenterX;
        const errorY = 0.9 * frameHeight - centerY;

        const sideMetric = closestBall.straightAhead.sideMetric;

        const maxForwardSpeed = getDriveToBallMaxSpeed(
            driveToBallStartTime, driveToBallStartSpeed, driveToBallMaxSpeed
        );

        const maxErrorForwardSpeed = 6;
        const maxErrorRotationSpeed = 4;
        const normalizedErrorY = errorY / frameHeight;
        let forwardSpeed = maxErrorForwardSpeed * Math.pow(normalizedErrorY, 2);
        let rotationSpeed = maxErrorRotationSpeed * -errorX / frameWidth * -normalizedErrorY * 1.2;

        const maxRotationSpeed = driveToBallCurrentRotationSpeedLimit;

        if (forwardSpeed > maxForwardSpeed) {
            forwardSpeed = maxForwardSpeed;
        } else if (forwardSpeed < driveToBallMinSpeed) {
            forwardSpeed = driveToBallMinSpeed;
        }

        if (rotationSpeed > maxRotationSpeed) {
            rotationSpeed = maxRotationSpeed;
        }

        driveToBallCurrentRotationSpeedLimit += driveToBallRotationSpeedRampUpLimit;

        if (driveToBallCurrentRotationSpeedLimit >= driveToBallMaxRotationSpeed) {
            driveToBallCurrentRotationSpeedLimit = driveToBallMaxRotationSpeed;
        }

        let sideSpeed = 0;
        let closestBasket = getClosestBasket();

        let isBasketTooClose = closestBasket && closestBasket.y2 > 400;

        const minBasketForwardSpeed = 0.15;
        const maxBasketForwardSpeed = 2;

        if (isBasketTooClose) {
            setThrowerState(throwerStates.GRAB_BALL);
            forwardSpeed = maxBasketForwardSpeed * Math.pow(normalizedErrorY, 2);

            if (forwardSpeed > maxBasketForwardSpeed) {
                forwardSpeed = maxBasketForwardSpeed;
            } else if (forwardSpeed < minBasketForwardSpeed) {
                forwardSpeed = minBasketForwardSpeed;
            }
        }


        if (Math.abs(sideMetric) > 0.1) {
            sideSpeed = -Math.sign(sideMetric) * Math.max(4 * Math.abs(sideMetric), 0.2);
            const normalizedCloseToBallErrorY = Math.abs(errorY) / 400;
            if (normalizedCloseToBallErrorY < 1) {
                sideSpeed *= Math.pow(normalizedCloseToBallErrorY, 4);
            }
        }


        setAiStateSpeeds(omniMotion.calculateSpeedsFromXY(sideSpeed, forwardSpeed, rotationSpeed, true));

        if (
            !isBasketTooClose &&
            errorY <= 100 &&
            Math.abs(errorX) <= 100 &&
            centerY <= 950 //avoid too close ball
        ) {
            setThrowerState(throwerStates.GRAB_BALL);
        }

    } else {
        if (throwerState == throwerStates.GRAB_BALL)
            setMotionState(motionStates.FIND_BASKET);
        else {
            setThrowerState(throwerStates.IDLE);
            setMotionState(motionStates.FIND_BALL);
        }

    }

}

function resetMotionDriveToBall() {
    driveToBallCurrentRotationSpeedLimit = 2;
    driveToBallStartTime = null;
}

let findBasketFallbackTimeout = null;
const findBasketFallbackTimeoutDelay = 200;
let findBasketDriveTimeout = null;
const findBasketDriveTimeoutDelay = 1000;
let enableSpin = true;
let spinTimeout = true;
let droveForward = false;
let basketFrameCount = 0;

function resetHandleMotionFindBasketTimeout() {
    clearTimeout(findBasketFallbackTimeout);
    findBasketFallbackTimeout = null;
    clearTimeout(findBasketDriveTimeout);
    findBasketDriveTimeout = null;
    enableSpin = true;
    spinTimeout = true;
    droveForward = false;
    basketFrameCount = 0;
}

function handleMotionFindBasketTimeout() {
    const basket = processedVisionState.basket;
    const maxRotationSpeed = 4;

    let rotationSpeed = 0;
    let forwardSpeed = 0;
    let sideSpeed = 0;

    const basketMinFrameCount = 20;

    if (findBasketFallbackTimeout == null && enableSpin) {
        spinTimeout = true;
        findBasketFallbackTimeout = setTimeout(() => {
            console.log('handleMotionFindBasketTimeout: time to spin');
            findBasketFallbackTimeout = null;
            spinTimeout = false;
            enableSpin = false;
            droveForward = false;
        }, findBasketFallbackTimeoutDelay);
    }

    const visionMetrics = visionState.metrics;
    const leftSideMetric = visionMetrics.straightAhead.leftSideMetric;
    const rightSideMetric = visionMetrics.straightAhead.rightSideMetric;
    let sideMetric = -leftSideMetric + rightSideMetric

    if (sideMetric < 0.1 && (leftSideMetric > 0.1 || rightSideMetric > 0.1)) {
        if (sideMetric > 0) {
            sideMetric = rightSideMetric;
        } else {
            sideMetric = -leftSideMetric;
        }
    }

    if (Math.abs(sideMetric) >= 0.1) {
        sideSpeed = -Math.sign(sideMetric) * Math.max(2 * Math.abs(sideMetric), 0.2);
    }

    const reach = visionMetrics.straightAhead.reach;

    if(spinTimeout){
        rotationSpeed = maxRotationSpeed;
    } else {
        if (findBasketDriveTimeout == null) {
            findBasketDriveTimeout = setTimeout(() => {
                findBasketDriveTimeout = null;
                enableSpin = true;
                droveForward = true;
            }, findBasketDriveTimeoutDelay);
        }

        if (reach < 150) {
            forwardSpeed = 1;
            droveForward = true;
        } else if (!droveForward) {
            rotationSpeed = 3;
        } else {
            enableSpin = true;
            clearTimeout(findBasketDriveTimeout);
        }
    }

    if (basket) {
        basketFrameCount ++;
        if (basketFrameCount > basketMinFrameCount ) {
            basketFrameCount = 0;
            setMotionState(motionStates.FIND_BASKET);
        }
        rotationSpeed = 0.1;
    }
    setAiStateSpeeds(omniMotion.calculateSpeedsFromXY(sideSpeed, forwardSpeed, rotationSpeed, true));
}

let findBasketTimeout = null;
const findBasketTimeoutDelay = 5000;
let validAimFrames = 0;
let movedForThrowFlag = false;

function resetMotionFindBasket() {
    clearTimeout(findObjectRotateTimeout);
    findObjectRotateTimeout = null;
    findObjectRotatePatternIndex = 0;
    findObjectRotateLoopCount = 0;

    clearTimeout(findBasketTimeout);
    findBasketTimeout = null;
    movedForThrowFlag = false;
}

function handleMotionFindBasket() {

    if(!mainboardState.ballGrabbed){
        setMotionState(motionStates.FIND_BALL);
        return;
    }


    const basket = processedVisionState.basket;
    const minRotationSpeed = 0.1;
    const maxRotationSpeed = 4;
    const minThrowError = 4;
    const maxThrowDistance = 6.0;
    const maxForwardSpeed = 1;
    const defaultAimFrames = 5;
    const minValidAimFrames = movedForThrowFlag ? defaultAimFrames * 1 : defaultAimFrames;

    let sideSpeed = 0;
    let forwardSpeed = 0;
    let isBasketErrorXSmallEnough = false;

    const patternStep = findObjectRotatePattern[findObjectRotatePatternIndex];

    if (findObjectRotateTimeout == null) {
        findObjectRotateTimeout = setTimeout(() => {
            findObjectRotateTimeout = null;
            findObjectRotatePatternIndex++;

            if (findObjectRotatePatternIndex >= findObjectRotatePattern.length) {
                findObjectRotatePatternIndex = 0;
                findObjectRotateLoopCount++;
            }
        }, patternStep[1] * (findObjectRotateLoopCount + 1));

    }

    let rotationSpeed = patternStep[0] / (findObjectRotateLoopCount + 1);

    if (findBasketTimeout === null) {
        findBasketTimeout = setTimeout(() => {
            findBasketTimeout = null;

            console.log('handleMotionFindBasket: basket not found');

            setThrowerState(throwerStates.HOLD_BALL);
            setMotionState(motionStates.FIND_BASKET_TIMEOUT);
        }, findBasketTimeoutDelay);
    }

    if (throwerState === throwerStates.THROW_BALL) {
        clearTimeout(findBasketTimeout);
        findBasketTimeout = null;
    }

    if (basket) {
        const basketCenterX = basket.cx;
        const basketCenterY = basket.cy;
        const basketErrorX = basketCenterX - frameCenterX;
        const basketErrorY = basketCenterY - frameCenterY;
        const minBasketDistance = 400;
        const maxBasketDistance = 110;

        aiState.speeds[4] = throwerIdleSpeed;

        rotationSpeed = maxRotationSpeed * -basketErrorX / (frameWidth / 2) * -frameCenterY / basketErrorY / 2;

        let isBasketTooClose = basket && basket.y2 > minBasketDistance;
        let isBasketTooFar = basket && basket.y2 < maxBasketDistance;

        if (isBasketTooClose) {
            movedForThrowFlag = true;
            forwardSpeed = -maxForwardSpeed * minBasketDistance / basket.y2;
        } else if (isBasketTooFar) {
            movedForThrowFlag = true;
            forwardSpeed = maxForwardSpeed * Math.max((maxBasketDistance - basket.y2) / 8, 0.3);
        }


        if (Math.abs(rotationSpeed) < minRotationSpeed) {
            rotationSpeed = Math.sign(rotationSpeed) * minRotationSpeed;
        }

        if (Math.abs(rotationSpeed) > maxRotationSpeed) {
            rotationSpeed = Math.sign(rotationSpeed) * maxRotationSpeed;
        }

        let throwError = maxThrowDistance / basketState.distance * minThrowError;

        if (throwError < minThrowError) {
            throwError = minThrowError;
        }

        isBasketErrorXSmallEnough = Math.abs(basketErrorX) < throwError;

        if (isBasketErrorXSmallEnough && !isBasketTooClose && !isBasketTooFar) {
            validAimFrames ++;
            if (validAimFrames > minValidAimFrames){
                setThrowerState(throwerStates.THROW_BALL);
                rotationSpeed = 0;
                validAimFrames = 0;
            }

        }
    }

    setAiStateSpeeds(omniMotion.calculateSpeedsFromXY(sideSpeed, forwardSpeed, rotationSpeed, true));

}

function handleThrowerIdle() {
    aiState.speeds[4] = 0;
    aiState.speeds[5] = 0;
}

let stabilizedFrames = 0;

function handleThrowerThrowBall() {
    const requiredSpeed = thrower.getSpeedPrev(basketState.distance);
    const actualSpeed = mainboardState.speeds[4];
    const rpmThreshold = 50;
    const minRequiredSpeed = requiredSpeed - rpmThreshold;
    const maxRequiredSpeed = requiredSpeed + rpmThreshold;
    const minStableFrames = 10;

    aiState.speeds[4] = requiredSpeed;
    aiState.speeds[6] = thrower.getAngle(basketState.distance);

    const isCorrectSpeed = minRequiredSpeed < actualSpeed < maxRequiredSpeed;

    if (isCorrectSpeed) {
        stabilizedFrames ++;
        if (stabilizedFrames > minStableFrames){
            aiState.speeds[5] = 200;
        }
    } else {
        stabilizedFrames = 0;
    }

    if (!mainboardState.balls[1]) {
        mainboardState.ballThrown = true;
    }

    if (mainboardState.ballThrown) {
        stabilizedFrames = 0;
        mainboardState.ballThrown = false;
        setMotionState(motionStates.FIND_BALL);
        setThrowerState(throwerStates.IDLE);
    }
}

function handleThrowerGrabBall() {
    const feederGrabSpeed = 80;
    const feederTweakSpeed = 25;

    if (mainboardState.balls[1] && !mainboardState.balls[0]) {
        aiState.speeds[5] = -feederTweakSpeed;
    } else if (!mainboardState.ballGrabbed) {
        aiState.speeds[5] = feederGrabSpeed;
    } else if (!mainboardState.balls[1] && !mainboardState.balls[0]){
        setMotionState(motionStates.FIND_BALL);
    }

    if (mainboardState.ballGrabbed) {
        if (motionState !== motionStates.FIND_BASKET_TIMEOUT) {
            setMotionState(motionStates.FIND_BASKET);
        }
        setThrowerState(throwerStates.HOLD_BALL);
    }
}

function handleThrowerHoldBall() {

    if ((mainboardState.balls[0] || mainboardState.balls[1]) && !mainboardState.ballGrabbed) {
        setThrowerState(throwerStates.GRAB_BALL);
    } else if (!mainboardState.ballGrabbed) {
        setMotionState(motionStates.FIND_BALL);
        setThrowerState(throwerStates.IDLE);
    } else {
        aiState.speeds[5] = 0;
    }
}

function handleThrowerEjectBall() {
    const feederSpeed = 150;

    aiState.speeds[4] = throwerIdleSpeed;
    aiState.speeds[5] = feederSpeed;

    if(!mainboardState.balls[1]){
        setThrowerState(throwerStates.IDLE);
        setMotionState(motionStates.FIND_BALL);
    }
}

/**
 *
 * @param {motionStates} newState
 */
function setMotionState(newState) {
    if (motionState !== newState) {
        console.log('Motion state:', motionState, '->', newState);

        if (motionState === motionStates.DRIVE_TO_BALL) {
            resetMotionDriveToBall();
        } else if (motionState === motionStates.FIND_BASKET) {
            resetMotionFindBasket();
        } else if (motionState === motionStates.FIND_BASKET_TIMEOUT) {
            resetHandleMotionFindBasketTimeout();
        }

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

        /*if (throwerState === throwerStates.THROW_BALL) {
            throwBallTimeout = setTimeout(() => {
                setThrowerState(throwerStates.IDLE);
                setMotionState(motionStates.FIND_BALL);
            }, throwBallTimeoutDelay);
        }*/
    }
}

function update() {
    motionStateHandlers[motionState]();
    throwerStateHandlers[throwerState]();

    if (motionState !== motionStates.IDLE || throwerState !== throwerStates.IDLE) {
        const mainboardCommand = {
            speeds: aiState.speeds,
            fieldID: aiState.fieldID,
            robotID: aiState.robotID,
            shouldSendAck: aiState.shouldSendAck
        };

        aiState.shouldSendAck = false;

        sendToHub({type: 'message', topic: 'mainboard_command', command: mainboardCommand});
    }
}

sendToHub({type: 'subscribe', topics: ['vision', 'mainboard_feedback', 'ai_command', 'training', 'goal_distance']});