const dgram = require('dgram');
const socket = dgram.createSocket('udp4');
const publicConf = require('./public-conf.json');
const HubCom = require('../common/HubCom');
const hubCom = new HubCom(publicConf.port, publicConf.hubIpAddress, publicConf.hubPort);
const omniMotion = require('./omni-motion');
const thrower = require('./thrower');
const util = require('./util');
const calibration = require('../calibration/calibration');

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
 * @property {number} button
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
    DRIVE_TO_GOAL_TIMEOUT: 'DRIVE_TO_GOAL_TIMEOUT',
    FIND_BASKET: 'FIND_BASKET',
    FIND_BASKET_TIMEOUT: 'FIND_BASKET_TIMEOUT',
    THROW_BALL_MOVING: 'THROW_BALL_MOVING'
};

/**
 * @enum {string}
 */
const throwerStates = {
    IDLE: 'IDLE',
    THROW_BALL: 'THROW_BALL',
    GRAB_BALL: 'GRAB_BALL',
    HOLD_BALL: 'HOLD_BALL',
    EJECT_BALL: 'EJECT_BALL',
    THROW_BALL_MOVING: 'THROW_BALL_MOVING'
};

const motionStateHandlers = {
    IDLE: handleMotionIdle,
    FIND_BALL: handleMotionFindBall,
    DRIVE_TO_BALL: handleMotionDriveToBall,
    GRAB_BALL: handleMotionGrabBall,
    DRIVE_TO_GOAL_TIMEOUT: handleMotionDriveToGoalTimeout,
    FIND_BASKET: handleMotionFindBasket,
    FIND_BASKET_TIMEOUT: handleMotionFindBasketTimeout,
    THROW_BALL_MOVING: handleMotionThrowBallMoving
};

const throwerStateHandlers = {
    IDLE: handleThrowerIdle,
    THROW_BALL: handleThrowerThrowBall,
    GRAB_BALL: handleThrowerGrabBall,
    HOLD_BALL: handleThrowerHoldBall,
    EJECT_BALL: handleThrowerEjectBall,
    THROW_BALL_MOVING: handleThrowerThrowBallMoving
};

const basketColours = {
    blue: 'blue',
    magenta: 'magenta'
};

const frameHeight = 1024;
const frameWidth = 1280;
const frameCenterX = frameWidth / 2;
const frameCenterY = frameHeight / 2;

const minServo = thrower.getServoMin();
const maxServo = thrower.getServoMax();
const servoRange = maxServo - minServo;
let servo = maxServo;

let motionState = motionStates.IDLE;
let throwerState = throwerStates.IDLE;

const findObjectRotatePattern = [[-1, 100], [-7, 200], [-1, 100], [-7, 200], [-1, 50]];
let findObjectRotatePatternIndex = 0;
let findObjectRotateTimeout = null;
let findObjectRotateLoopCount = 0;
const findObjectRotateLoopLimit = 3;

const throwerIdleSpeed = 6000;

let throwBallTimeout = 0;
const throwBallTimeoutDelay = 3000;

const lastClosestBallLimit = 10;
let lastClosestBallCount = 0;

let visionState = {};

/**
 * @typedef {Object} ProcessedVisionStateInfo
 * @property {VisionBallInfo} closestBall
 * @property {VisionBallInfo} lastClosestBall
 * @property {VisionBallInfo} secondClosestBall
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
    secondClosestBall: null,
    basket: null,
    otherBasket: null,
    lastVisibleBasketDirection: -1,
    metrics: null
};

const mainboardButtonEvents = {
    NONE: 0,
    PRESSED: 1,
    PRESSED_LONG: 2
};

let mainboardState = {
    speeds: [0, 0, 0, 0, 0, minServo],
    balls: [false, false],
    prevBalls: [false, false],
    ballThrown: false,
    ballThrowSpeed: 0,
    ballThrownBasketOffset: 0,
    ballGrabbed: false,
    refereeCommand: 'X',
    prevRefereeCommand: 'X'
};

const mainboardLedStates = {
    MAGENTA_BASKET: 0,
    BLUE_BASKET: 1,
    UNKNOWN_BASKET: 2
};

let basketState = {distance: 0, angel: 0};

const defaultBallTopArcFilterThreshold = 0.4;

const defaultBasketBottomFilterThreshold = 0.5;

let aiState = {
    speeds: [0, 0, 0, 0, 0, 0, minServo],
    fieldID: 'Z',
    robotID: 'Z',
    shouldSendAck: false,
    isManualOverride: false,
    isCompetition: true,
    secondaryBallY: null,
    updatedSecondaryLastState: false,
    basketColour: basketColours.blue,
    ballTopArcFilterThreshold: defaultBallTopArcFilterThreshold,
    basketBottomFilterThreshold: defaultBasketBottomFilterThreshold,
    otherBasketBottomFilterThreshold: defaultBasketBottomFilterThreshold
};

hubCom.on('info', handleInfo);

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

            if (info.message.ball1 == previousBall0) {
                previousBall0Counter++;
            } else {
                previousBall0Counter = 0;
            }

            if (info.message.ball2 == previousBall1) {
                previousBall1Counter++;
            } else {
                previousBall1Counter = 0;
            }

            if (previousBall0Counter > ballSensorFilterSize) {
                mainboardState.balls[0] = info.message.ball1;
            }
            if (previousBall1Counter > ballSensorFilterSize) {
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

            mainboardState.prevButton = mainboardState.button;
            mainboardState.button = info.message.button;

            if (mainboardState.refereeCommand !== mainboardState.prevRefereeCommand) {
                handleRefereeCommandChanged();
            }

            if (mainboardState.button !== mainboardState.prevButton) {
                handleMainboardButtonChanged();
            }

            if (
                !mainboardState.ballThrown
                && mainboardState.prevBalls[1] === true
                && mainboardState.balls[1] === false
            ) {
                mainboardState.ballThrown = true;
                mainboardState.ballThrownSpeed = mainboardState.speeds[4];
                mainboardState.ballThrownBasketOffset = processedVisionState.basket ?
                    processedVisionState.basket.cx - frameCenterX : 0;
                console.log('mainboardState.ballThrown', mainboardState.ballThrown);

                if (visionState.basket) {
                    console.log('THROWN', visionState.basket.cx);
                }

                aiState.basketBottomFilterThreshold = defaultBasketBottomFilterThreshold;
                console.log('aiState.basketBottomFilterThreshold', aiState.basketBottomFilterThreshold);
            }

            if (throwerState === throwerStates.THROW_BALL
                && mainboardState.prevBalls[0] === false
                && mainboardState.balls[1] === false
            ) {
                mainboardState.ballThrowSpeed = mainboardState.speeds[4];
            }

            if (
                mainboardState.prevBalls[0] !== mainboardState.balls[0] ||
                mainboardState.prevBalls[1] !== mainboardState.balls[1]
            ) {
                handleBallValueChanged();
            }
            sendState();

            break;
        case 'ai_command': {
            const commandInfo = info.commandInfo;

            if (commandInfo.command === 'set_manual_control') {
                aiState.isManualOverride = commandInfo.state === true;
                console.log('isManualOverride', aiState.isManualOverride);
            } else if (commandInfo.command === 'set_motion_state') {
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
        case 'ai_configuration':
            shouldUpdate = true;
            console.log('ai_configuration: ', info);
            if (info.toggle) {
                switch (info.key) {
                    default:
                        aiState[info.key] = !aiState[info.key];
                        break;
                    case 'basketColour':
                        toggleBasketColour();
                        break;
                    case 'isManualOverride':
                        aiState.isManualOverride = !aiState.isManualOverride;
                        console.log('isManualOverride', aiState.isManualOverride);

                        if (aiState.isManualOverride) {
                            setMotionState(motionStates.IDLE);
                            setThrowerState(throwerStates.IDLE);
                        } else if (!aiState.isCompetition) {
                            setMotionState(motionStates.FIND_BALL);
                            setThrowerState(throwerStates.IDLE);
                        }
                        break;
                    case 'isCompetition':
                        aiState.isCompetition = !aiState.isCompetition;
                        console.log('isCompetition', aiState.isCompetition);
                        break;
                }
            } else {
                aiState[info.key] = info.value;
            }
            break;
        case 'training':
            calibration.reloadMeasurements();
            break;
    }

    if (shouldUpdate) {
        update();
    }
}

function setBasketColour(colour) {
    if (Object.values(basketColours).includes(colour)) {
        console.log('setBasketColour', colour);
        aiState.basketColour = colour;
    }
}

function toggleBasketColour() {
    setBasketColour((aiState.basketColour === basketColours.blue)
        ? basketColours.magenta : basketColours.blue);
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
    const ballDistanceMetric = 0.2 * util.clamped((6 - ballDistance) / 6, 0, 1);
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
    let secondBall= null;
    let basket = null;
    let otherBasket = null;

    let basketCandidate;
    let bottomLeftMetric;
    let bottomRightMetric;
    let threshold;
    let isTargetColour;
    let targetBasket;

    // Find largest basket
    for (let i = 0; i < baskets.length; i++) {
        basketCandidate = baskets[i];
        bottomLeftMetric = basketCandidate.metrics[0];
        bottomRightMetric = basketCandidate.metrics[1];

        basketCandidate.size = basketCandidate.w * basketCandidate.h;
        basketCandidate.y2 = basketCandidate.cy + basketCandidate.h / 2;
        basketCandidate.bottomMetric = Math.max(bottomLeftMetric, bottomRightMetric);

        isTargetColour = basketCandidate.color === aiState.basketColour;

        threshold = isTargetColour ?
            aiState.basketBottomFilterThreshold :
            aiState.otherBasketBottomFilterThreshold;

        // At least one of the metrics should be above threshold
        if (basketCandidate.bottomMetric >= threshold) {
            targetBasket = isTargetColour ? basket : otherBasket;

            if (!targetBasket || targetBasket.size < basketCandidate.size) {
                if (isTargetColour) {
                    basket = basketCandidate;
                } else {
                    otherBasket = basketCandidate;
                }
            }
        }

        // Reset threshold back to default if basket is above it
        if (isTargetColour) {
            if (
                basket &&
                basket.bottomMetric >= defaultBasketBottomFilterThreshold &&
                aiState.basketBottomFilterThreshold !== defaultBasketBottomFilterThreshold
            ) {
                aiState.basketBottomFilterThreshold = defaultBasketBottomFilterThreshold;
                console.log('aiState.basketBottomFilterThreshold', aiState.basketBottomFilterThreshold);
            }
        } else if (
            otherBasket &&
            otherBasket.bottomMetric >= defaultBasketBottomFilterThreshold &&
            aiState.otherBasketBottomFilterThreshold !== defaultBasketBottomFilterThreshold
        ) {
            aiState.otherBasketBottomFilterThreshold = defaultBasketBottomFilterThreshold;
            aiState.basketBottomFilterThreshold = defaultBasketBottomFilterThreshold;
            console.log('aiState.otherBasketBottomFilterThreshold', aiState.otherBasketBottomFilterThreshold);
        }
    }

    processedVisionState.basket = basket;
    processedVisionState.otherBasket = otherBasket;

    for (let i = 0; i < balls.length; i++) {
        // Ignore bad balls by top arc metric
        if (balls[i].metrics[1] < aiState.ballTopArcFilterThreshold) {
            continue;
        }

        balls[i].size = balls[i].w * balls[i].h;
        balls[i].confidence = computeBallConfidence(balls[i], basket, otherBasket);

        // Find ball with highest confidence
        /*if (!ball || ball.confidence > balls[i].confidence) {
            ball = balls[i];
        }*/

        // Find largest ball
        if (!ball || ball.w * ball.h < balls[i].w * balls[i].h) {

            if(ball) {
                secondBall = ball;
            }

            ball = balls[i];
        }
    }

    processedVisionState.closestBall = ball;

    if(secondBall)
        processedVisionState.secondClosestBall = secondBall;


    if (processedVisionState.closestBall) {
        processedVisionState.lastClosestBall = processedVisionState.closestBall;
        lastClosestBallCount = 0;
    } else {
        lastClosestBallCount++;

        if (lastClosestBallCount >= lastClosestBallLimit) {
            processedVisionState.lastClosestBall = null;
            processedVisionState.secondClosestBall = null;
            lastClosestBallCount = 0;
        }
    }

    if (processedVisionState.basket) {
        processedVisionState.lastVisibleBasketDirection = Math.sign(frameWidth / 2 - processedVisionState.basket.cx);
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
        secondaryBallY: aiState.secondaryBallY,
        ballSensors: mainboardState.balls,
        ballThrown: mainboardState.ballThrown,
        realSenseData: basketState,
        visionMetrics: visionState.metrics,
        closestBall: processedVisionState.closestBall,
        lastClosestBall: processedVisionState.lastClosestBall,
        otherClosestYBall: processedVisionState.secondClosestBall,
        basket: processedVisionState.basket,
        otherBasket: processedVisionState.otherBasket,
        refereeCommand: mainboardState.refereeCommand,
        fieldID: aiState.fieldID,
        robotID: aiState.robotID,
        isManualOverride: aiState.isManualOverride,
        isCompetition: aiState.isCompetition,
        basketColour: aiState.basketColour,
        ballThrowSpeed: mainboardState.ballThrowSpeed,
        currentThrowSpeed: mainboardState.speeds[4],
        currentGrabSpeed: mainboardState.speeds[5],
        ballThrownBasketOffset: mainboardState.ballThrownBasketOffset,
    };

    hubCom.send({type: 'message', topic: 'ai_state', state: state});
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
    if (!aiState.isCompetition) {
        return;
    }

    console.log('refereeCommand', mainboardState.prevRefereeCommand, '->', mainboardState.refereeCommand);

    if (mainboardState.refereeCommand === 'P') {
        aiState.shouldSendAck = true;
    } else if (mainboardState.refereeCommand === 'S') {
        setMotionState(motionStates.FIND_BALL);
        setThrowerState(throwerStates.IDLE);
    } else if (mainboardState.refereeCommand === 'T') {
        setMotionState(motionStates.IDLE);
        setThrowerState(throwerStates.IDLE);
    }
}

function handleMainboardButtonChanged() {
    console.log('mainboard button', mainboardState.prevButton, '->', mainboardState.button);

    switch (mainboardState.button) {
        case mainboardButtonEvents.PRESSED:
            // During competition, starting is only allowed while idling
            if (!aiState.isCompetition || motionState === motionStates.IDLE) {
                setMotionState(motionStates.FIND_BALL);
                setThrowerState(throwerStates.IDLE);
            }

            break;
        case mainboardButtonEvents.PRESSED_LONG:
            // Basket colour can be changed any time if not competition or during competition when idling
            if (!aiState.isCompetition || motionState === motionStates.IDLE) {
                toggleBasketColour();
            }

            break;
    }
}

function handleMotionIdle() {
    aiState.speeds = aiState.speeds.fill(0, 0, 4);

    setThrowerState(throwerStates.IDLE);
}

let isFindBallDriveToBasket = false;
let driveToBasketColour = basketColours.blue;

function handleMotionFindBall() {

    if (mainboardState.balls[0] || mainboardState.balls[1]) {
        setThrowerState(throwerStates.GRAB_BALL);
    } else {
        setThrowerState(throwerStates.IDLE);

        const ball = processedVisionState.closestBall;

        if (ball) {

            const secondaryBall = aiState.secondaryBallY;

            if (secondaryBall) {
                const lastY = aiState.secondaryBallY;
                const currentY = ball.cy;
                const allowedDiff = Math.round(lastY * 0.2);

                if (Math.abs(lastY - currentY) < allowedDiff && findObjectRotateLoopCount === 0) {
                    aiState.updatedSecondaryLastState = false;
                    resetMotionFindBall();
                    setMotionState(motionStates.DRIVE_TO_BALL);
                    return;
                }

                if (findObjectRotateLoopCount === 1) {
                    aiState.secondaryBallY = null;
                }
            } else {
                aiState.updatedSecondaryLastState = false;
                resetMotionFindBall();
                setMotionState(motionStates.DRIVE_TO_BALL);
                return;
            }


        }

        const patternStep = findObjectRotatePattern[findObjectRotatePatternIndex];

        if (findObjectRotateLoopCount === findObjectRotateLoopLimit) {
            //TODO: disabled timeout that shuts robot down
            setMotionState(motionStates.DRIVE_TO_GOAL_TIMEOUT);
        } else if (findObjectRotateTimeout == null) {
            findObjectRotateTimeout = setTimeout(() => {
                findObjectRotateTimeout = null;
                findObjectRotatePatternIndex++;

                if (findObjectRotatePatternIndex >= findObjectRotatePattern.length) {
                    findObjectRotatePatternIndex = 0;
                    findObjectRotateLoopCount++;
                }

                aiState.ballTopArcFilterThreshold /= 2;
                if (aiState.ballTopArcFilterThreshold < 0.01) {
                    aiState.ballTopArcFilterThreshold = 0;
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
    isFindBallDriveToBasket = false;
    driveToBallStartTime = null;
    aiState.secondaryBallY = null;
}

const driveToBallMinSpeed = 0.2;
const driveToBallMaxSpeed = 4.5;
const driveToBallStartSpeed = 0.2;
let driveToBallStartTime = null;

const driveToBallRotationSpeedRampUpLimit = 0.05;
const driveToBallMaxRotationSpeed = 5;
let driveToBallCurrentRotationSpeedLimit = 1;

let ballBasketAligned = false;
let ballBasketAlignedCounter = 0;

let lastBallErrorY = 0;
const maxBallErrorYDiffSamples = 100;
let ballErrorYDiffSamples = [];
ballErrorYDiffSamples.fill(20, 0, maxBallErrorYDiffSamples);
let smallDeltaYCounter = 0;

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

function resetMotionDriveToBall() {
    driveToBallCurrentRotationSpeedLimit = 2;
    driveToBallStartTime = null;
    ballBasketAligned = false;
    ballBasketAlignedCounter = 0;
    lastBallErrorY = -1;
    ballErrorYDiffSamples.fill(20, 0, maxBallErrorYDiffSamples);
    smallDeltaYCounter = 0;
    lockCounter = 0;
}

function updateSecondaryBall() {
    const secondaryBall = processedVisionState.secondClosestBall;
    if (secondaryBall) {
        aiState.secondaryBallY = secondaryBall.cy > aiState.secondaryBallY ? secondaryBall.cy : aiState.secondaryBallY;
        aiState.updatedSecondaryLastState = true;
    }
}

function handleMotionDriveToBall() {
    const closestBall = processedVisionState.closestBall || processedVisionState.lastClosestBall;
    const basket = processedVisionState.basket;

    if (!driveToBallStartTime) {
        driveToBallStartTime = Date.now();
    }

    if (closestBall) {

        updateSecondaryBall();

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

        const errorY = 0.83 * frameHeight - centerY;

        if (710 > centerX > 660 && centerY > 950) {
            setThrowerState(throwerStates.EJECT_BALL);
        } else {
            setThrowerState(throwerStates.IDLE);
        }

        const maxForwardSpeed = getDriveToBallMaxSpeed(
            driveToBallStartTime, driveToBallStartSpeed, driveToBallMaxSpeed
        );

        const maxRotationSpeed = driveToBallCurrentRotationSpeedLimit;

        const normalizedErrorY = errorY / frameHeight;

        const maxErrorForwardSpeed = 6;
        const maxErrorRotationSpeed = 9;



        let forwardSpeed = maxErrorForwardSpeed * Math.pow(normalizedErrorY, 2);
        let rotationSpeed = maxErrorRotationSpeed * -errorX / frameWidth;





        if (lastBallErrorY === -1) {
            lastBallErrorY = errorY;
        }
        const ballErrorYDiff = lastBallErrorY - errorY;
        lastBallErrorY = errorY;

        const averageBallErrorYDiff = util.average(ballErrorYDiffSamples);

        if (errorY < 350) {
            // Increase speed when ball is moving/robot is not reaching it fast enough
            ballErrorYDiffSamples.push(ballErrorYDiff);
            ballErrorYDiffSamples = ballErrorYDiffSamples.slice(-maxBallErrorYDiffSamples);

            if (averageBallErrorYDiff <= 20 && averageBallErrorYDiff >= 0) {
                smallDeltaYCounter ++;
            } else {
                if(smallDeltaYCounter > 0)
                    smallDeltaYCounter --;
            }
            //increase speed by 3% every frame
            forwardSpeed *= 1 + smallDeltaYCounter / 33;
        }





        if (forwardSpeed > maxForwardSpeed) {
            forwardSpeed = maxForwardSpeed;
        } else if (forwardSpeed < driveToBallMinSpeed) {
            forwardSpeed = driveToBallMinSpeed;
        }

        rotationSpeed *= util.clamped(1.5 - normalizedErrorY, 0.5, 1);

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

        //sideSpeed = calculateSideSpeedBallBasketAlign(sideSpeed, basket, centerY, maxForwardSpeed);

        sideSpeed = util.clamped(sideSpeed, -maxForwardSpeed, maxForwardSpeed);
        forwardSpeed = util.clamped(forwardSpeed, -maxForwardSpeed, maxForwardSpeed);

        setAiStateSpeeds(omniMotion.calculateSpeedsFromXY(sideSpeed, forwardSpeed, rotationSpeed, true));

        if (
            errorY <= 100 &&
            Math.abs(errorX) <= 100 &&
            centerY <= 900 //avoid too close ball
        ) {
            setMotionState(motionStates.GRAB_BALL);
        }
    } else {
        setMotionState(motionStates.FIND_BALL);
    }
}

function calculateSideSpeedBallBasketAlign(sideSpd, basket, ballY, maxSpeed) {
    let sideSpeed = sideSpd;
    if (basket) {
        const basketCenterX = basket.cx;
        const basketY = basket.cy;
        const basketDiff = basketCenterX - (frameWidth / 2);
        const normalizedBasketDiff = basketDiff / frameWidth;
        const minBasketDiff = 6;
        const minAlignedFrames = 3;

        if (ballY > basketY) {
            if (Math.abs(basketDiff) > minBasketDiff) {
                sideSpeed = -Math.sign(normalizedBasketDiff) * Math.pow(Math.max(maxSpeed * normalizedBasketDiff, 0.01), 2);
            }
        }
        ballBasketAligned = ballBasketAlignedCounter > minAlignedFrames;
    }
    return sideSpeed;
}

const grabBallStartSpeed = 0.1;
const grabBallMaxSpeed = 1;

function handleMotionGrabBall() {

    const closestBall = processedVisionState.closestBall;

    if (throwerState === throwerStates.HOLD_BALL || mainboardState.balls[0]) {
        setMotionState(motionStates.FIND_BASKET);
        return;
    }

    if (closestBall) {

        updateSecondaryBall();

        const centerX = closestBall.cx;
        const centerY = closestBall.cy;

        const errorX = centerX - frameCenterX;
        const errorY = frameHeight - centerY;

        const leftSideMetric = closestBall.straightAhead.leftSideMetric;
        const rightSideMetric = closestBall.straightAhead.leftSideMetric;

        let sideMetric = -leftSideMetric + rightSideMetric;

        if (sideMetric < 0.1 && (leftSideMetric > 0.1 || rightSideMetric > 0.1)) {
            if (sideMetric > 0) {
                sideMetric = rightSideMetric;
            } else {
                sideMetric = -leftSideMetric;
            }
        }

        const maxForwardSpeed = getDriveToBallMaxSpeed(
            driveToBallStartTime, grabBallStartSpeed, grabBallMaxSpeed
        );

        const maxErrorForwardSpeed = 3;
        const maxErrorRotationSpeed = 12;
        const normalizedErrorY = errorY / frameHeight;
        let forwardSpeed = maxErrorForwardSpeed * normalizedErrorY;
        let rotationSpeed = maxErrorRotationSpeed * -errorX / frameWidth;

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

        const minBasketForwardSpeed = 0.1;

        if (isBasketTooClose) {
            forwardSpeed = grabBallMaxSpeed * Math.pow(normalizedErrorY, 2);

            if (forwardSpeed > grabBallMaxSpeed) {
                forwardSpeed = grabBallMaxSpeed;
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

        const basket = processedVisionState.basket;

        sideSpeed = calculateSideSpeedBallBasketAlign(sideSpeed, basket, centerY, maxForwardSpeed);

        const visionMetrics = visionState.metrics;
        const reach = visionMetrics.straightAhead.reach;
        const maxReach = 1000;
        const slowdownReach = 150;

        const clampedNormalizedReach = 1 - (util.clamped((reach - slowdownReach), 0, maxReach) / maxReach);

        forwardSpeed = util.clamped(forwardSpeed * Math.pow(clampedNormalizedReach, 2), -grabBallMaxSpeed, grabBallMaxSpeed);
        sideSpeed = util.clamped(sideSpeed, -grabBallMaxSpeed, grabBallMaxSpeed);


        setAiStateSpeeds(omniMotion.calculateSpeedsFromXY(sideSpeed, forwardSpeed, rotationSpeed, true));

        setThrowerState(throwerStates.GRAB_BALL);

    } else {
        setThrowerState(throwerStates.IDLE);
        setMotionState(motionStates.FIND_BALL);
    }

}

function handleMotionDriveToGoalTimeout() {

    let basket;
    if (driveToBasketColour === aiState.basketColour)
        basket = processedVisionState.basket;
    else
        basket = processedVisionState.otherBasket;

    const minRotationSpeed = 0.05;
    const maxRotationSpeed = 4;
    const maxForwardSpeed = 1.5;
    const minForwardSpeed = 0.2;

    let rotationSpeed = 0;
    let forwardSpeed = 0;
    let sideSpeed = 0;

    if(basket) {
        const basketCenterX = basket.cx;
        const basketCenterY = basket.cy;
        const basketErrorX = basketCenterX - thrower.getAimOffset(basketState.distance) - frameCenterX;
        const basketErrorY = basketCenterY - frameCenterY;
        const normalizedErrorY = basketErrorY / frameHeight;
        const minBasketDistance = 400;

        const maxErrorRotationSpeed = 9;

        rotationSpeed = maxErrorRotationSpeed * -basketErrorX / frameWidth;

        let isBasketTooClose = basket && basket.y2 > minBasketDistance;

        forwardSpeed = maxForwardSpeed * Math.max(Math.min((100 - basket.y2) / 10, 1), 0.2);

        if(Math.abs(forwardSpeed) < minForwardSpeed) {
            forwardSpeed = Math.sign(forwardSpeed) * minForwardSpeed;
        }

        rotationSpeed *= util.clamped(1.5 - normalizedErrorY, 0.5, 1);

        if (Math.abs(rotationSpeed) < minRotationSpeed) {
            rotationSpeed = Math.sign(rotationSpeed) * minRotationSpeed;
        }

        if (Math.abs(rotationSpeed) > maxRotationSpeed) {
            rotationSpeed = Math.sign(rotationSpeed) * maxRotationSpeed;
        }

        if (isBasketTooClose) {
            driveToBasketColour = driveToBasketColour == basketColours.magenta ? basketColours.blue : basketColours.magenta;
            setMotionState(motionStates.FIND_BALL);
            setThrowerState(throwerStates.IDLE);
        }
    }

    if (processedVisionState.closestBall) {
        sideSpeed = 0;
        forwardSpeed = 0;
        rotationSpeed = 0;
        setMotionState(motionStates.FIND_BALL);
        setThrowerState(throwerStates.IDLE);
    }

    setAiStateSpeeds(omniMotion.calculateSpeedsFromXY(sideSpeed, forwardSpeed, rotationSpeed, true));
}


let findBasketFallbackTimeout = null;
const findBasketFallbackTimeoutDelay = 900;
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
    const maxForwardSpeed = 2;

    let rotationSpeed = 0;
    let forwardSpeed = 0;
    let sideSpeed = 0;

    const basketMinFrameCount = 10;

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
    let sideMetric = -leftSideMetric + rightSideMetric;

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

    if (spinTimeout) {
        rotationSpeed = maxRotationSpeed;
    } else {
        if (findBasketDriveTimeout == null) {
            findBasketDriveTimeout = setTimeout(() => {
                findBasketDriveTimeout = null;
                enableSpin = true;
                droveForward = true;
            }, findBasketDriveTimeoutDelay);
        }

        if (droveForward) {
            enableSpin = true;
            clearTimeout(findBasketDriveTimeout);
        } else if (reach < 150) {
            forwardSpeed = util.clamped(maxForwardSpeed * 100 / reach, 0.1, maxForwardSpeed);
        } else if (reach > 150) {
            forwardSpeed = 0;
            droveForward = true;
        } else {
            rotationSpeed = 2;
        }
    }

    if (basket) {
        basketFrameCount++;
        if (basketFrameCount > basketMinFrameCount) {
            basketFrameCount = 0;
            setMotionState(motionStates.FIND_BASKET);
        }
        rotationSpeed = 0.1;
    }
    setAiStateSpeeds(omniMotion.calculateSpeedsFromXY(sideSpeed, forwardSpeed, rotationSpeed, true));
}


function handleMotionThrowBallMoving() {
    setAiStateSpeeds(omniMotion.calculateSpeedsFromXY(0, 0, 0, true));
}

let findBasketTimeout = null;
const findBasketTimeoutDelay = 5000;
let validAimFrames = 0;
let movedForThrowFlag = 0;

function resetMotionFindBasket() {
    clearTimeout(findObjectRotateTimeout);
    findObjectRotateTimeout = null;
    findObjectRotatePatternIndex = 0;
    findObjectRotateLoopCount = 0;
    validAimFrames = 0;

    clearTimeout(findBasketTimeout);
    findBasketTimeout = null;
    movedForThrowFlag = 0;
}

function handleMotionFindBasket() {
    const basket = processedVisionState.basket;
    const minRotationSpeed = 0.05;
    const maxRotationSpeed = 4;
    const minThrowError = 5;
    const maxThrowDistance = 600;
    const maxForwardSpeed = 1.5;
    const minForwardSpeed = 0.2;
    const defaultAimFrames = 6;
    let minValidAimFrames = defaultAimFrames;

    let sideSpeed = 0;
    let forwardSpeed = 0;
    let rotationSpeed = 0;
    let isBasketErrorXSmallEnough = false;

    const patternStep = findObjectRotatePattern[findObjectRotatePatternIndex];

    if (!(throwerState === throwerStates.THROW_BALL || throwerState === throwerStates.HOLD_BALL || mainboardState.balls[0])) {
        setMotionState(motionStates.FIND_BALL);
        setThrowerState(throwerStates.IDLE);
    }

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

    if (findBasketTimeout === null) {
        findBasketTimeout = setTimeout(() => {
            findBasketTimeout = null;

            setThrowerState(throwerStates.HOLD_BALL);
            setMotionState(motionStates.FIND_BASKET_TIMEOUT);
        }, findBasketTimeoutDelay);
    }

    if (throwerState === throwerStates.THROW_BALL) {
        clearTimeout(findBasketTimeout);
        findBasketTimeout = null;
    }

    const visionMetrics = visionState.metrics;
    const reach = visionMetrics.straightAhead.reach;
    const drivability = visionMetrics.driveability;
    const leftSideMetric = visionMetrics.straightAhead.leftSideMetric;
    const rightSideMetric = visionMetrics.straightAhead.rightSideMetric;
    let sideMetric = -leftSideMetric + rightSideMetric;

    if (sideMetric < 0.1 && (leftSideMetric > 0.1 || rightSideMetric > 0.1)) {
        if (sideMetric > 0) {
            sideMetric = rightSideMetric;
        } else {
            sideMetric = -leftSideMetric;
        }
    }

    if (reach > 230) {
        forwardSpeed = -1;
        if (Math.abs(sideMetric) >= 0.1) {
            sideSpeed = -Math.sign(sideMetric) * Math.max(2 * Math.abs(sideMetric), 0.2);
        }
        clearTimeout(findObjectRotateTimeout);
        findObjectRotateTimeout = null;
        findObjectRotatePatternIndex = 0;
        findObjectRotateLoopCount = 0;
    }
    else
        rotationSpeed = patternStep[0] / (findObjectRotateLoopCount + 1) * -processedVisionState.lastVisibleBasketDirection;

    if (basket) {
        const basketCenterX = basket.cx;
        const basketCenterY = basket.cy;
        const basketErrorX = basketCenterX - thrower.getAimOffset(basketState.distance) - frameCenterX;
        const basketErrorY = basketCenterY - frameCenterY;
        const normalizedErrorY = basketErrorY / frameHeight;
        const minBasketDistance = 450;
        const maxBasketDistance = 105;

        aiState.speeds[4] = throwerIdleSpeed;

        const maxErrorRotationSpeed = 9;

        rotationSpeed = maxErrorRotationSpeed * -basketErrorX / frameWidth;

        let isBasketTooClose = basket && basket.y2 > minBasketDistance;
        let isBasketTooFar = basket && basket.y2 < maxBasketDistance;

        if (isBasketTooClose) {
            movedForThrowFlag = -1;
            forwardSpeed = -maxForwardSpeed * minBasketDistance / basket.y2;
        } else if (isBasketTooFar) {
            movedForThrowFlag = +1;
            forwardSpeed = maxForwardSpeed * Math.max(Math.min((maxBasketDistance - basket.y2) / 10, 1), 0.2);
        }

        if(Math.abs(forwardSpeed) < minForwardSpeed) {
            forwardSpeed = Math.sign(forwardSpeed) * minForwardSpeed;
        }

        rotationSpeed *= util.clamped(1.5 - normalizedErrorY, 0.5, 1);

        if (Math.abs(rotationSpeed) < minRotationSpeed) {
            rotationSpeed = Math.sign(rotationSpeed) * minRotationSpeed;
        }

        if (Math.abs(rotationSpeed) > maxRotationSpeed) {
            rotationSpeed = Math.sign(rotationSpeed) * maxRotationSpeed;
        }

        let throwError = Math.round((1 + (basketState.distance / maxThrowDistance) * 2) * minThrowError);

        let aimFrames = Math.round((1 + (basketState.distance / maxThrowDistance) * 2) * minValidAimFrames);

        isBasketErrorXSmallEnough = Math.abs(basketErrorX) < throwError;

        let isRobotStopped = robotWheelSpeedsLessThan(mainboardState.speeds, 30);

        if (isBasketErrorXSmallEnough && !isBasketTooClose && !isBasketTooFar && isRobotStopped) {
            validAimFrames++;
            rotationSpeed = 0;
            forwardSpeed = 0;
            sideSpeed = 0;
            if (validAimFrames > aimFrames) {
                setThrowerState(throwerStates.THROW_BALL);
                validAimFrames = 0;
            }

        }
    }

    setAiStateSpeeds(omniMotion.calculateSpeedsFromXY(sideSpeed, forwardSpeed, rotationSpeed, true));
}

function robotWheelSpeedsLessThan(wheelSpeeds, limit) {
    let i = 0;
    for(i; i < 4; i++) {
        if ((Math.abs(wheelSpeeds[i])) > limit)
            return false;
    }
    return true;
}

function handleThrowerIdle() {
    aiState.speeds[4] = 0;
    aiState.speeds[5] = 0;
}

let stabilizedFrames = 0;
let lingeringThrowCounter = 0;

function resetThrowerThrowBall() {
    stabilizedFrames = 0;
    lingeringThrowCounter = 0;
}

function handleThrowerThrowBall() {
    const moveCoeficient = movedForThrowFlag * 0;
    const correctedDistance = basketState.distance + moveCoeficient;
    //const requiredSpeed = calibration.getThrowerSpeed(correctedDistance);
    const requiredSpeed = thrower.getSpeedPrev(correctedDistance);
    const actualSpeed = mainboardState.speeds[4];
    const rpmThreshold = 50;
    const minRequiredSpeed = requiredSpeed - rpmThreshold;
    const maxRequiredSpeed = requiredSpeed + rpmThreshold;
    const minStableFrames = 5;
    const lingeringFrames = 3;

    aiState.speeds[4] = requiredSpeed;
    aiState.speeds[6] = thrower.getAngle(correctedDistance);

    const isCorrectSpeed = minRequiredSpeed < actualSpeed < maxRequiredSpeed;

    if (isCorrectSpeed) {
        stabilizedFrames++;
    }

    if (stabilizedFrames > minStableFrames) {
        aiState.speeds[5] = 200;
    }

    if (!mainboardState.balls[1]) {
        mainboardState.ballThrown = true;
    }

    if (mainboardState.ballThrown) {
        mainboardState.ballThrown = false;
        setMotionState(motionStates.FIND_BALL);
        setThrowerState(throwerStates.IDLE);

        //setMotionState(motionStates.IDLE);
        //setThrowerState(throwerStates.IDLE);
    }
}

function handleThrowerGrabBall() {
    const feederGrabSpeed = 80;
    const feederTweakSpeed = 25;

    if (mainboardState.balls[1] && !mainboardState.balls[0]) {
        aiState.speeds[5] = -feederTweakSpeed;
    } else if (!mainboardState.ballGrabbed) {
        aiState.speeds[5] = feederGrabSpeed;
    } else if (!mainboardState.balls[1] && !mainboardState.balls[0]) {
        setMotionState(motionStates.FIND_BALL);
    } else if (mainboardState.balls[1]) {
        aiState.speeds[5] = 0;
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

    aiState.speeds[4] = throwerIdleSpeed;
}

function handleThrowerEjectBall() {
    const feederSpeed = 150;

    aiState.speeds[4] = throwerIdleSpeed;
    aiState.speeds[5] = feederSpeed;

    if (!mainboardState.balls[1]) {
        setThrowerState(throwerStates.IDLE);
        setMotionState(motionStates.FIND_BALL);
    }
}

function handleThrowerThrowBallMoving() {
    aiState.speeds[4] = thrower.getSpeed(basketState.distance);
    aiState.speeds[5] = 150;
    aiState.speeds[6] = thrower.getAngle(basketState.distance);
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
            aiState.ballTopArcFilterThreshold = defaultBallTopArcFilterThreshold;
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

        if (throwerState === throwerStates.THROW_BALL) {
            resetThrowerThrowBall();
        }

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

    if (!aiState.isManualOverride) {
        const mainboardCommand = {
            speeds: aiState.speeds,
            fieldID: aiState.fieldID,
            robotID: aiState.robotID,
            shouldSendAck: aiState.shouldSendAck,
            led: mainboardLedStates.UNKNOWN_BASKET
        };

        aiState.shouldSendAck = false;

        switch (aiState.basketColour) {
            case basketColours.magenta:
                mainboardCommand.led = mainboardLedStates.MAGENTA_BASKET;
                break;
            case basketColours.blue:
                mainboardCommand.led = mainboardLedStates.BLUE_BASKET;
                break;
        }

        hubCom.send({type: 'message', topic: 'mainboard_command', command: mainboardCommand});
    }
}

hubCom.send({
    type: 'subscribe',
    topics: ['vision', 'mainboard_feedback', 'ai_command', 'ai_configuration', 'goal_distance']
});
