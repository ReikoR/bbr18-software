const dgram = require('dgram');
const socket = dgram.createSocket('udp4');
const omniMotion = require('./omni-motion');
const thrower = require('./thrower');
const util = require('./util');
const calibration = require('../calibration/calibration');
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
    DRIVE_GRAB_BALL: 'DRIVE_GRAB_BALL',
    DRIVE_WITH_BALL: 'DRIVE_WITH_BALL',
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
    DRIVE_GRAB_BALL: handleMotionDriveGrabBall,
    DRIVE_WITH_BALL: handleMotionDriveWithBall,
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
let findBallRotateLoopCount = 0;
const findBallRotateLoopLimit = 5;

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
    speeds: [0, 0, 0, 0, 0],
    balls: [false, false], prevBalls: [false, false],
    ballThrown: false,
    ballGrabbed: false,
    ballEjected: false,
    lidarDistance: 0,
    refereeCommand: 'X',
    prevRefereeCommand: 'X'
};

let aiState = {
    speeds: [0, 0, 0, 0, 0],
    fieldID: 'Z',
    robotID: 'Z',
    shouldSendAck: false
};

let basketColour = basketColours.blue;

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
            }

            if (
                mainboardState.prevBalls[0] !==  mainboardState.balls[0] ||
                mainboardState.prevBalls[1] !==  mainboardState.balls[1]
            ) {
                handleBallValueChanged();
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
        case 'training':
            calibration.reloadMeasurements();
            break;
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
        lidarDistance: mainboardState.lidarDistance,
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
    else if (throwerState === throwerStates.GRAB_BALL) {
        if (mainboardState.prevBalls[1] === false && mainboardState.balls[1] === true) {
            mainboardState.ballGrabbed = true;
        }
    }
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
    setThrowerState(throwerStates.IDLE);

    if (processedVisionState.closestBall) {
        resetMotionFindBall();
        setMotionState(motionStates.DRIVE_TO_BALL);
        return;
    }

    const patternStep = findBallRotatePattern[findBallRotatePatternIndex];

    if (findBallRotateLoopCount === findBallRotateLoopLimit) {
        setMotionState(motionStates.IDLE);
    } else if (findBallRotateTimeout == null) {
        findBallRotateTimeout = setTimeout(() => {
            findBallRotateTimeout = null;
            findBallRotatePatternIndex++;

            if (findBallRotatePatternIndex >= findBallRotatePattern.length) {
                findBallRotatePatternIndex = 0;
                findBallRotateLoopCount++;
            }
        }, patternStep[1] * (findBallRotateLoopCount + 1));

        setAiStateSpeeds(omniMotion.calculateSpeeds(0, 0, patternStep[0] / (findBallRotateLoopCount + 1), true));
    }
}

function resetMotionFindBall() {
    clearTimeout(findBallRotateTimeout);
    findBallRotateTimeout = null;
    findBallRotatePatternIndex = 0;
    findBallRotateLoopCount = 0;
}

const driveToBallMinSpeed = 0.1;
const driveToBallMaxSpeed = 3;
const driveToBallStartSpeed = 0.5;
let driveToBallStartTime = null;

const driveToBallRotationSpeedRampUpLimit = 0.05;
const driveToBallMaxRotationSpeed = 8;
let driveToBallCurrentRotationSpeedLimit = 2;

function getDriveToBallMaxSpeed(startTime, startSpeed, speedLimit) {
    const currentTime = Date.now();
    const timeDiff = currentTime - startTime;
    const speedDiff = speedLimit - startSpeed;
    const rampUpTime = 1000;
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
        const maxForwardSpeed = getDriveToBallMaxSpeed(
            driveToBallStartTime, driveToBallStartSpeed, driveToBallMaxSpeed
        );
        const maxRotationSpeed = driveToBallCurrentRotationSpeedLimit;
        const maxErrorForwardSpeed = 5;
        const maxErrorRotationSpeed = 16;
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
        let closestBasket = getClosestBasket();

        let isBasketTooClose = closestBasket && closestBasket.y2 > 400;

        if (isBasketTooClose && errorY <= 50 && Math.abs(errorX) <= 50) {
            setThrowerState(throwerStates.GRAB_BALL);
            setMotionState(motionStates.DRIVE_GRAB_BALL);

        } else if (Math.abs(sideMetric) >= 0.1) {
            //driveToBallStartTime = Date.now();
            //forwardSpeed = forwardSpeed * 0.5;
            //rotationSpeed = 0;
            sideSpeed = -Math.sign(sideMetric) * Math.max(4 * Math.abs(sideMetric), 0.2);

            const normalizedCloseToBallErrorY = Math.abs(errorY) / 400;

            if (normalizedCloseToBallErrorY < 1) {
                sideSpeed *= Math.pow(normalizedCloseToBallErrorY, 2);
            }
        }

        setAiStateSpeeds(omniMotion.calculateSpeedsFromXY(sideSpeed, forwardSpeed, rotationSpeed, true));

        if (
            !isBasketTooClose &&
            errorY <= 100 &&
            Math.abs(errorX) <= 100 &&
            centerY <= 950 //avoid too close ball
        ) {
            setMotionState(motionStates.FIND_BASKET);
            //setMotionState(motionStates.IDLE);
        }


    } else {
        setMotionState(motionStates.FIND_BALL);
    }
}

function resetMotionDriveToBall() {
    driveToBallCurrentRotationSpeedLimit = 2;
    driveToBallStartTime = null;
}

let driveGrabBallTimeout = null;
const driveGrabBallTimeoutDelay = 5000;

function handleMotionDriveGrabBall() {
    if (driveGrabBallTimeout === null) {
        driveGrabBallTimeout = setTimeout(() => {
            if (!mainboardState.balls[0] && !mainboardState.balls[1]) {
                setMotionState(motionStates.FIND_BALL);
                setThrowerState(throwerStates.IDLE);
            }

            driveGrabBallTimeout = null;
        }, driveGrabBallTimeoutDelay);
    }

    setAiStateSpeeds(omniMotion.calculateSpeedsFromXY(0, 0.1, 0, true));
}

function resetMotionDriveGrabBall() {
    clearTimeout(driveGrabBallTimeout);
    driveGrabBallTimeout = null;
}

let driveWithBallTimeout = null;
const driveWithBallTimeoutDelay = 2000;
let isDriveWithBallNoBasket = false;

function handleMotionDriveWithBall() {
    const basket = processedVisionState.basket;

    const maxRotationSpeed = 2;
    let rotationSpeed = 0;

    if (basket) {
        clearTimeout(driveWithBallTimeout);
        driveWithBallTimeout = null;
        isDriveWithBallNoBasket = false;

        const centerX = basket.cx;
        const basketY = basket.y2;
        const errorX = centerX - frameCenterX;
        const errorY = 0.1 * frameHeight - basketY;
        const normalizedErrorY = errorY / frameHeight;
        const maxForwardSpeed = 2;

        let forwardSpeed = Math.sign(normalizedErrorY) *
            Math.max(Math.abs(maxForwardSpeed * normalizedErrorY), 0.1);
        rotationSpeed = Math.sign(-errorX) * Math.max(Math.abs(maxRotationSpeed * errorX / frameWidth), 0.1);

        if (throwerState === throwerStates.EJECT_BALL) {
            forwardSpeed = 0;
        }

        setAiStateSpeeds(omniMotion.calculateSpeedsFromXY(0, forwardSpeed, rotationSpeed, true));

        if (basketY < 200) {
            setThrowerState(throwerStates.EJECT_BALL);
        }
    } else {
        if (driveWithBallTimeout === null) {
            driveWithBallTimeout = setTimeout(() => {
                console.log('handleMotionDriveWithBall: basket not found');
                //driveWithBallTimeout = null;
                //isDriveWithBallNoBasket = true;
                setThrowerState(throwerStates.EJECT_BALL);
            }, driveWithBallTimeoutDelay);
        }

        let forwardSpeed = 0;
        let rotationSpeed = 0;

        if (throwerState !== throwerStates.EJECT_BALL) {
            const visionMetrics = visionState.metrics;
            const leftSideMetric = visionMetrics.straightAhead.leftSideMetric;
            const rightSideMetric = visionMetrics.straightAhead.rightSideMetric;
            let sideMetric = -leftSideMetric + rightSideMetric;
            const reach = visionMetrics.straightAhead.reach;

            if (sideMetric < 0.1 && (leftSideMetric > 0.1 || rightSideMetric > 0.1)) {
                if (sideMetric > 0) {
                    sideMetric = rightSideMetric;
                } else {
                    sideMetric = -leftSideMetric;
                }
            }

            if (Math.abs(sideMetric) >= 0.1) {
                rotationSpeed = Math.sign(sideMetric) * Math.max(4 * Math.abs(sideMetric), 0.2);
            }

            if (reach < 150) {
                forwardSpeed = 0.5;
            }
        }

        setAiStateSpeeds(omniMotion.calculateSpeedsFromXY(0, forwardSpeed, rotationSpeed, true));
    }
}

function resetMotionDriveWithBall() {
    clearTimeout(driveWithBallTimeout);
    driveWithBallTimeout = null;
}

let findBasketTimeout = null;
const findBasketTimeoutDelay = 5000;

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

    if (findBasketTimeout === null) {
        findBasketTimeout = setTimeout(() => {
            findBasketTimeout = null;

            console.log('handleMotionFindBasket: basket not found');

            setThrowerState(throwerStates.GRAB_BALL);
            setMotionState(motionStates.DRIVE_GRAB_BALL);
        }, findBasketTimeoutDelay);
    }

    if (throwerState === throwerStates.THROW_BALL) {
        clearTimeout(findBasketTimeout);
        findBasketTimeout = null;
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
        const basketCenterX = basket.cx + calibration.getCenterOffset(mainboardState.lidarDistance);
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

function resetMotionFindBasket() {
    clearTimeout(findBasketTimeout);
    findBasketTimeout = null;
}

function handleThrowerIdle() {
    aiState.speeds[4] = 0;
}

function handleThrowerThrowBall() {
    aiState.speeds[4] = calibration.getThrowerSpeed(mainboardState.lidarDistance);

    //console.log('HELLO SPEED IS', aiState.speeds[4]);

    if (mainboardState.ballThrown) {
        mainboardState.ballThrown = false;
        setMotionState(motionStates.FIND_BALL);
        setThrowerState(throwerStates.IDLE);
    }
}

function handleThrowerGrabBall() {
    aiState.speeds[4] = 200;

    if (mainboardState.ballGrabbed) {
        mainboardState.ballGrabbed = false;

        setThrowerState(throwerStates.HOLD_BALL);
        setMotionState(motionStates.DRIVE_WITH_BALL);
    }
}

function handleThrowerHoldBall() {
    aiState.speeds[4] = 0;
}

let startTimeEject = null;

function handleThrowerEjectBall() {
    if (!startTimeEject) {
        startTimeEject = Date.now();
    }

    let currentTime = Date.now();
    let timeDiff = currentTime - startTimeEject;
    let speed = -200 + timeDiff * 0.1;

    if (speed > -50){
        speed = -50;
    }

    aiState.speeds[4] = speed;

    if (mainboardState.ballEjected) {
        mainboardState.ballEjected = false;

        startTimeEject = null;
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
        } else if (motionState === motionStates.DRIVE_GRAB_BALL) {
            resetMotionDriveGrabBall();
        } else if (motionState === motionStates.FIND_BASKET) {
            resetMotionFindBasket();
        } else if (motionState === motionStates.DRIVE_WITH_BALL) {
            resetMotionDriveWithBall();
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

        if (throwerState === throwerStates.THROW_BALL) {
            throwBallTimeout = setTimeout(() => {
                setThrowerState(throwerStates.IDLE);
                setMotionState(motionStates.FIND_BALL);
            }, throwBallTimeoutDelay);
        }
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

sendToHub({type: 'subscribe', topics: ['vision', 'mainboard_feedback', 'ai_command', 'training']});