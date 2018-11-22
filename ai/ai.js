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
    DRIVE_GRAB_BALL: 'DRIVE_GRAB_BALL',
    DRIVE_WITH_BALL: 'DRIVE_WITH_BALL',
    FIND_BASKET: 'FIND_BASKET',
    GET_RID_OF_BALL: 'GET_RID_OF_BALL',
    NUDGE_BALL: 'NUDGE_BALL'
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
    THROW_BALL_AWAY: 'THROW_BALL_AWAY'
};

const motionStateHandlers = {
    IDLE: handleMotionIdle,
    FIND_BALL: handleMotionFindBall,
    DRIVE_TO_BALL: handleMotionDriveToBall,
    DRIVE_GRAB_BALL: handleMotionDriveGrabBall,
    DRIVE_WITH_BALL: handleMotionDriveWithBall,
    FIND_BASKET: handleMotionFindBasket,
    GET_RID_OF_BALL: handleMotionGetRidOfBall,
    NUDGE_BALL: handleMotionNudgeBall
};

const throwerStateHandlers = {
    IDLE: handleThrowerIdle,
    THROW_BALL: handleThrowerThrowBall,
    THROW_BALL_AWAY: handleThrowerThrowBallAway,
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
const findBallRotateLoopLimit = 2;

let throwBallTimeout = 0;
const throwBallTimeoutDelay = 3000;

const lastClosestBallLimit = 10;
let lastClosestBallCount = 0;

let visionState = {};

/**
 * @typedef {Object} ProcessedVisionStateInfo
 * @property {?VisionBallInfo} closestBall
 * @property {?VisionBallInfo} lastClosestBall
 * @property {?VisionBasketInfo} basket
 * @property {?VisionBasketInfo} otherBasket
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

const lidarDistanceSampleCount = 5;
let lidarDistanceSamples = [];

const mainboardButtonEvents = {
    NONE: 0,
    PRESSED: 1,
    PRESSED_LONG: 2
};

let mainboardState = {
    speeds: [0, 0, 0, 0, 0],
    balls: [false, false], prevBalls: [false, false],
    ballThrown: false,
    ballThrowSpeed: 0,
    ballThrownSpeed: 0,
    ballThrownBasketOffset: 0,
    ballGrabbed: false,
    ballEjected: false,
    lidarDistance: 0,
    lidarDistanceFiltered: 0,
    refereeCommand: 'X',
    prevRefereeCommand: 'X',
    button: mainboardButtonEvents.NONE,
    prevButton: mainboardButtonEvents.NONE
};

const mainboardLedStates = {
    MAGENTA_BASKET: 0,
    BLUE_BASKET: 1,
    UNKNOWN_BASKET: 2
};

const defaultBallTopArcFilterThreshold = 0.4;
const defaultBasketBottomFilterThreshold = 0.5;

let aiState = {
    speeds: [0, 0, 0, 0, 0],
    fieldID: 'Z',
    robotID: 'Z',
    shouldSendAck: false,
    isManualOverride: false,
    isCompetition: true,
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

                processedVisionState.lastClosestBall = null;
                lastClosestBallCount = 0;
            }

            if (throwerState === throwerStates.THROW_BALL
                && mainboardState.prevBalls[0] === false
                && mainboardState.balls[0] === true
            ) {
                mainboardState.ballThrowSpeed = mainboardState.speeds[4];
            }

            if (
                mainboardState.prevBalls[0] !==  mainboardState.balls[0] ||
                mainboardState.prevBalls[1] !==  mainboardState.balls[1]
            ) {
                handleBallValueChanged();
            }

            mainboardState.lidarDistance = info.message.distance;

            lidarDistanceSamples.push(mainboardState.lidarDistance);
            lidarDistanceSamples = lidarDistanceSamples.slice(-lidarDistanceSampleCount);

            mainboardState.lidarDistanceFiltered = util.average(lidarDistanceSamples);

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
        case 'ai_configuration':
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
        refereeCommand: mainboardState.refereeCommand,
        fieldID: aiState.fieldID,
        robotID: aiState.robotID,
        isManualOverride: aiState.isManualOverride,
        isCompetition: aiState.isCompetition,
        basketColour: aiState.basketColour,
        ballThrowSpeed: mainboardState.ballThrowSpeed,
        ballThrownSpeed: mainboardState.ballThrownSpeed,
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
    else if (throwerState === throwerStates.GRAB_BALL) {
        if (mainboardState.prevBalls[1] === false && mainboardState.balls[1] === true) {
            mainboardState.ballGrabbed = true;
        }
    }
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
    setThrowerState(throwerStates.IDLE);

    if (processedVisionState.closestBall) {
        resetMotionFindBall();
        setMotionState(motionStates.DRIVE_TO_BALL);
        return;
    }

    const patternStep = findBallRotatePattern[findBallRotatePatternIndex];

    if (isFindBallDriveToBasket) {
        const visionMetrics = visionState.metrics;
        const leftSideMetric = visionMetrics.straightAhead.leftSideMetric;
        const rightSideMetric = visionMetrics.straightAhead.rightSideMetric;
        let sideMetric = -leftSideMetric + rightSideMetric;
        const reach = visionMetrics.straightAhead.reach;
        const driveability = visionMetrics.straightAhead.driveability;

        if (Math.abs(sideMetric) < 0.1 && (leftSideMetric > 0.1 || rightSideMetric > 0.1)) {
            if (sideMetric > 0) {
                sideMetric = rightSideMetric;
            } else {
                sideMetric = -leftSideMetric;
            }
        }

        const basket = processedVisionState.basket;
        const otherBasket = processedVisionState.otherBasket;
        const driveToBasket = aiState.basketColour === driveToBasketColour ? basket : otherBasket;

        let forwardSpeed = 0;
        let rotationSpeed = 0;
        let sideSpeed = -sideMetric;

        if (driveToBasket) {
            const centerX = driveToBasket.cx;
            const basketY = driveToBasket.y2;
            const errorX = centerX - frameCenterX;
            const errorY = 0.4 * frameHeight - basketY;
            const normalizedErrorY = util.clamped(errorY / frameHeight, 0, 1);
            const maxForwardSpeed = 3;

            forwardSpeed = Math.sign(normalizedErrorY) *
                Math.max(Math.abs(maxForwardSpeed * Math.pow(normalizedErrorY, 0.5)), 0.1);
            rotationSpeed = Math.sign(-errorX) * Math.max(Math.abs(4 * errorX / frameWidth), 0.1);

            if (driveToBasket.w > 80) {
                driveToBasketColour = driveToBasketColour === basketColours.blue ?
                    basketColours.magenta : basketColours.blue;

                console.log('driveToBasketColour', driveToBasketColour);
            }

        } else {
            rotationSpeed = util.clamped((reach / 100), 0, 2);

            if (reach < 150) {
                forwardSpeed = Math.max(3 * (150 - reach) / 150, 0.2);
            }
        }

        forwardSpeed *= util.mapFromRangeToRange(driveability, 0.6, 1, 0.1, 1);

        setAiStateSpeeds(omniMotion.calculateSpeedsFromXY(sideSpeed, forwardSpeed, rotationSpeed, true));

    } else if (findBallRotateLoopCount === findBallRotateLoopLimit) {
        isFindBallDriveToBasket = true;

    } else if (findBallRotateTimeout == null) {
        findBallRotateTimeout = setTimeout(() => {
            findBallRotateTimeout = null;
            findBallRotatePatternIndex++;

            if (findBallRotatePatternIndex >= findBallRotatePattern.length) {
                findBallRotatePatternIndex = 0;
                findBallRotateLoopCount++;
            }

            aiState.ballTopArcFilterThreshold /= 2;

            if (aiState.ballTopArcFilterThreshold < 0.01) {
                aiState.ballTopArcFilterThreshold = 0;
            }

            console.log('aiState.ballTopArcFilterThreshold', aiState.ballTopArcFilterThreshold);
        }, patternStep[1] * (findBallRotateLoopCount + 1));

        setAiStateSpeeds(omniMotion.calculateSpeeds(0, 0, patternStep[0] / (findBallRotateLoopCount + 1), true));
    }
}

function resetMotionFindBall() {
    clearTimeout(findBallRotateTimeout);
    findBallRotateTimeout = null;
    findBallRotatePatternIndex = 0;
    findBallRotateLoopCount = 0;
    isFindBallDriveToBasket = false;
}

const driveToBallMinSpeed = 0.1;
const driveToBallMaxSpeed = 3;
const driveToBallStartSpeed = 0.5;
let driveToBallStartTime = null;

const driveToBallRotationSpeedRampUpLimit = 0.05;
const driveToBallMaxRotationSpeed = 8;
let driveToBallCurrentRotationSpeedLimit = 2;

let lastBallErrorY = 0;
let forwardSpeedMultiplier = 1;

const maxDriveToBallTime = 5000;

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
    const basket = processedVisionState.basket;

    if (!driveToBallStartTime) {
        driveToBallStartTime = Date.now();
    }

    if (Date.now() - driveToBallStartTime > maxDriveToBallTime) {
        setMotionState(motionStates.FIND_BALL);
        return;
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
        const errorY = 0.85 * frameHeight - centerY;
        const maxSideSpeed = 5;
        const maxForwardSpeed = getDriveToBallMaxSpeed(
            driveToBallStartTime, driveToBallStartSpeed, driveToBallMaxSpeed
        );
        const maxRotationSpeed = driveToBallCurrentRotationSpeedLimit;
        const maxErrorForwardSpeed = 5;
        const maxErrorRotationSpeed = 16;
        const normalizedErrorY = errorY / frameHeight;
        let forwardSpeed = maxErrorForwardSpeed * Math.pow(normalizedErrorY, 2);
        let rotationSpeed = maxErrorRotationSpeed * -errorX / frameWidth;

        if (lastBallErrorY === -1) {
            lastBallErrorY = errorY;
        }

        const ballErrorYDiff = lastBallErrorY - errorY;
        lastBallErrorY = errorY;

        forwardSpeed *= util.mapFromRangeToRange(driveability, 0.6, 1, 0.1, 1);

        if (forwardSpeed > maxForwardSpeed) {
            forwardSpeed = maxForwardSpeed;
        } else if (forwardSpeed < driveToBallMinSpeed) {
            forwardSpeed = driveToBallMinSpeed;
        }

        if (errorY < 400) {
            forwardSpeedMultiplier += (10 - ballErrorYDiff) / 200;

            if (forwardSpeedMultiplier < 1) {
                forwardSpeedMultiplier = 1;
            } else if (forwardSpeedMultiplier > 10) {
                forwardSpeedMultiplier = 10;
            }
        }

        //TODO: throw ball state should probably continue to use the same multiplier
        forwardSpeed *= forwardSpeedMultiplier;

        /*console.log(
            'forwardSpeedMultiplier', forwardSpeedMultiplier,
            'ballErrorYDiff', ballErrorYDiff,
            'forwardSpeed', forwardSpeed
        );*/

        // Reduce rotation speed when ball is far away
        rotationSpeed *= util.clamped(1.4 - normalizedErrorY, 0.5, 1);

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

        const normalizedCloseToBallErrorY = Math.abs(errorY) / 400;

        let avoidObstacleSideSpeed = 0;
        let turnToBasketSideSpeed = 0;

        if (isBasketTooClose && errorY <= 50 && Math.abs(errorX) <= 50) {
            setThrowerState(throwerStates.GRAB_BALL);
            setMotionState(motionStates.DRIVE_GRAB_BALL);

        } else if (Math.abs(sideMetric) >= 0.1) {
            avoidObstacleSideSpeed = -Math.sign(sideMetric) *
                Math.max(Math.min(forwardSpeed, 1) * 2 * Math.abs(sideMetric), 0.2);

            if (normalizedCloseToBallErrorY < 1) {
                avoidObstacleSideSpeed *= Math.pow(normalizedCloseToBallErrorY, 4);
            }
        }

        const maxTurnToBasketSideSpeed = 0.1;

        if (basket && Math.abs(sideMetric) < 0.1) {
            const basketCenterX = basket.cx;
            const basketErrorX = basketCenterX - frameCenterX;
            turnToBasketSideSpeed = maxTurnToBasketSideSpeed * -basketErrorX / (frameWidth / 2);
        }

        sideSpeed += avoidObstacleSideSpeed;
        sideSpeed += turnToBasketSideSpeed * forwardSpeed;

        sideSpeed = util.clamped(sideSpeed, -maxSideSpeed, maxSideSpeed);
        forwardSpeed = util.clamped(forwardSpeed, -maxForwardSpeed, maxForwardSpeed);

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

    lastBallErrorY = -1;

    forwardSpeedMultiplier = 1;
}

let driveGrabBallTimeout = null;
const driveGrabBallTimeoutDelay = 3000;

function handleMotionDriveGrabBall() {
    if (driveGrabBallTimeout === null) {
        driveGrabBallTimeout = setTimeout(() => {
            if (!mainboardState.balls[0] && !mainboardState.balls[1]) {
                setMotionState(motionStates.NUDGE_BALL);
                setThrowerState(throwerStates.IDLE);
            }

            driveGrabBallTimeout = null;
        }, driveGrabBallTimeoutDelay);
    }

    const basket = processedVisionState.basket;
    const closestBall = processedVisionState.closestBall;

    let rotationSpeed = 0;
    let sideSpeed = 0;

    if (basket) {
        const basketErrorX = basket.cx - frameCenterX;
        rotationSpeed = -2 * basketErrorX / frameWidth;
    }

    if (closestBall) {
        const ballErrorX = closestBall.cx - frameCenterX;
        sideSpeed = 2 * ballErrorX / frameWidth;
    }

    setAiStateSpeeds(omniMotion.calculateSpeedsFromXY(sideSpeed, 0.2, rotationSpeed, true));
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
        const maxForwardSpeed = 3;

        let forwardSpeed = Math.sign(normalizedErrorY) *
            Math.max(Math.abs(maxForwardSpeed * normalizedErrorY), 0.5);
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
                isDriveWithBallNoBasket = true;
                //setThrowerState(throwerStates.EJECT_BALL);

                driveWithBallTimeout = setTimeout(() => {
                    console.log('handleMotionDriveWithBall: basket not found by driving around');
                    isDriveWithBallNoBasket = false;
                    driveWithBallTimeout = null;
                }, driveWithBallTimeoutDelay * 2);

            }, driveWithBallTimeoutDelay);
        }

        let forwardSpeed = 0;
        let rotationSpeed = 0;

        if (isDriveWithBallNoBasket && throwerState !== throwerStates.EJECT_BALL) {
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

            if (Math.abs(sideMetric) >= 0.01) {
                rotationSpeed = Math.sign(sideMetric) * Math.max(8 * Math.abs(sideMetric), 0.2);
            }

            if (reach < 150) {
                forwardSpeed = Math.max(2 * (150 - reach) / 150, 0.2);
            }
        } else {
            // Try to find basket
            rotationSpeed = maxRotationSpeed * processedVisionState.lastVisibleBasketDirection;
        }

        setAiStateSpeeds(omniMotion.calculateSpeedsFromXY(0, forwardSpeed, rotationSpeed, true));
    }
}

function resetMotionDriveWithBall() {
    clearTimeout(driveWithBallTimeout);
    driveWithBallTimeout = null;
}

let findBasketTimeout = null;
const findBasketTimeoutDelay = 2000;

const requiredStableThrowerSpeedCount = 5;
let stableThrowerSpeedCount = 0;
let isThrowerSpeedStable = false;
let basketNotFoundCount = 0;
const basketNotFoundLimit = 2;
let unstableThrowerSpeedAllowedError = 100;

function handleMotionFindBasket() {
    const closestBall = processedVisionState.closestBall || processedVisionState.lastClosestBall;
    const basket = processedVisionState.basket;
    const minRotationSpeed = 0.05;
    const maxRotationSpeed = 3;
    const maxSideSpeed = 5;
    const maxForwardSpeed = 5;
    let rotationSpeed = maxRotationSpeed * processedVisionState.lastVisibleBasketDirection;
    let xSpeed = 0;
    let forwardSpeed = 0;
    let isBasketErrorXSmallEnough = false;
    let isBallCloseEnough = false;

    if (findBasketTimeout === null) {
        findBasketTimeout = setTimeout(() => {
            findBasketTimeout = null;

            basketNotFoundCount++;

            console.log('handleMotionFindBasket: basket not found', basketNotFoundCount);

            aiState.basketBottomFilterThreshold -= 0.5;

            if (basketNotFoundCount > basketNotFoundLimit) {
                const visionMetrics = visionState.metrics;
                const reach = visionMetrics.straightAhead.reach;

                if (reach > 200 || basketNotFoundCount > basketNotFoundLimit + 1) {
                    setThrowerState(throwerStates.THROW_BALL_AWAY);
                    setMotionState(motionStates.GET_RID_OF_BALL);
                } else if (throwerState === throwerStates.IDLE) {
                    setThrowerState(throwerStates.GRAB_BALL);
                    setMotionState(motionStates.DRIVE_GRAB_BALL);
                }
            }

            if (aiState.basketBottomFilterThreshold < 0.05) {
                aiState.basketBottomFilterThreshold = 0;
            }

            console.log('aiState.basketBottomFilterThreshold', aiState.basketBottomFilterThreshold);
        }, findBasketTimeoutDelay);
    }

    if (closestBall || throwerState === throwerStates.THROW_BALL && mainboardState.balls[0]) {
        if (closestBall) {
            const ballCenterX = closestBall.cx;
            const ballCenterY = closestBall.cy;
            const ballErrorX = ballCenterX - frameCenterX;
            const ballErrorY = 0.8 * frameHeight - ballCenterY;

            xSpeed = Math.sign(ballErrorX) * Math.pow(Math.abs(ballErrorX) / 400, 1.5);
            forwardSpeed = ballErrorY / 400;

            if (
                ballErrorY > 200 ||
                Math.abs(ballErrorX) > 200 ||
                ballCenterY > 950 //ball too close
            ) {
                setMotionState(motionStates.DRIVE_TO_BALL);
            } else {
                isBallCloseEnough = true;
            }
        }

        if (throwerState === throwerStates.THROW_BALL) {
            clearTimeout(findBasketTimeout);
            findBasketTimeout = null;

            const expectedThrowerSpeed = aiState.speeds[4];
            const actualThrowerSpeed = mainboardState.speeds[4];
            const throwerSpeedDiff =  actualThrowerSpeed - expectedThrowerSpeed;

            console.log('throwerSpeedDiff', throwerSpeedDiff);

            if (!isThrowerSpeedStable) {
                if (Math.abs(throwerSpeedDiff) < (expectedThrowerSpeed > 16000 ? unstableThrowerSpeedAllowedError : 50)) {
                    stableThrowerSpeedCount++;

                    if (stableThrowerSpeedCount >= requiredStableThrowerSpeedCount) {
                        isThrowerSpeedStable = true;
                        console.log('isThrowerSpeedStable', isThrowerSpeedStable);
                    }
                } else {
                    stableThrowerSpeedCount = 0;

                    if (expectedThrowerSpeed > 16000) {
                        unstableThrowerSpeedAllowedError += 10;
                    }
                }
            }

            forwardSpeed = isThrowerSpeedStable ? 0.2 : 0;
        }

    } else {
        setMotionState(motionStates.FIND_BALL);
    }

    if (basket && (closestBall || throwerState === throwerStates.THROW_BALL)) {
        const basketCenterX = basket.cx + calibration.getCenterOffset(mainboardState.lidarDistance);
        const basketErrorX = basketCenterX - frameCenterX;
        isBasketErrorXSmallEnough = Math.abs(basketErrorX) < 40;
        rotationSpeed = maxRotationSpeed * -basketErrorX / (frameWidth / 2);

        if (isBasketErrorXSmallEnough && isBallCloseEnough) {
            setThrowerState(throwerStates.THROW_BALL);
        }

        console.log('basketErrorX', Math.abs(basketErrorX));
    }

    if (Math.abs(rotationSpeed) < minRotationSpeed) {
        rotationSpeed = Math.sign(rotationSpeed) * minRotationSpeed;
    }

    xSpeed += rotationSpeed * 0.2;

    if (throwerState === throwerStates.THROW_BALL) {
        xSpeed = 0;
    }

    xSpeed = util.clamped(xSpeed, -maxSideSpeed, maxSideSpeed);
    forwardSpeed = util.clamped(forwardSpeed, -maxForwardSpeed, maxForwardSpeed);

    setAiStateSpeeds(omniMotion.calculateSpeedsFromXY(xSpeed, forwardSpeed, rotationSpeed, true));
}

function resetMotionFindBasket() {
    clearTimeout(findBasketTimeout);
    findBasketTimeout = null;
    isThrowerSpeedStable = false;
    stableThrowerSpeedCount = 0;
    basketNotFoundCount = 0;
    unstableThrowerSpeedAllowedError = 100;

    setThrowerState(throwerStates.IDLE);
}

function handleMotionGetRidOfBall() {
    const closestBall = processedVisionState.closestBall;

    let forwardSpeed = 0;
    let sideSpeed = 0;
    let rotationSpeed = 0;

    if (closestBall) {
        const ballCenterX = closestBall.cx;
        const ballErrorX = ballCenterX - frameCenterX;

        forwardSpeed = 0.1;
        rotationSpeed = 16 * -ballErrorX / frameWidth;

    } else {
        setMotionState(motionStates.FIND_BALL);
        setThrowerState(throwerStates.IDLE);
    }

    setAiStateSpeeds(omniMotion.calculateSpeedsFromXY(sideSpeed, forwardSpeed, rotationSpeed, true));
}

function handleMotionNudgeBall() {
    setAiStateSpeeds(omniMotion.calculateSpeedsFromXY(0, 0, 8, true));

    setTimeout(() => {
        setMotionState(motionStates.FIND_BALL);
    }, 500);
}

function handleThrowerIdle() {
    aiState.speeds[4] = 0;
}

function getAllowedThrowerTechnique() {
    let technique = calibration.getThrowerTechnique(mainboardState.lidarDistance);

    if (!aiState.allowedTechniques.includes(technique)) {
        technique = aiState.allowedTechniques[0];
    }

    mainboardState.ballThrownTechnique = technique;

    return technique;
}

function handleThrowerThrowBall() {
    const technique = getAllowedThrowerTechnique();
    aiState.speeds[4] = calibration.getThrowerSpeed(technique, mainboardState.lidarDistance);

    console.log('Thrower speed: expected', aiState.speeds[4], 'actual', mainboardState.speeds[4]);
    console.log('lidarDistance', mainboardState.lidarDistance, 'filtered', mainboardState.lidarDistanceFiltered);

    if (mainboardState.ballThrown) {
        mainboardState.ballThrown = false;
        setMotionState(motionStates.FIND_BALL);
        setThrowerState(throwerStates.IDLE);
    }
}

function handleThrowerThrowBallAway() {
    aiState.speeds[4] = 15000;

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

            aiState.ballTopArcFilterThreshold = defaultBallTopArcFilterThreshold;
            console.log('aiState.ballTopArcFilterThreshold', aiState.ballTopArcFilterThreshold);
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

    //if (motionState !== motionStates.IDLE || throwerState !== throwerStates.IDLE) {
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
    topics: ['vision', 'mainboard_feedback', 'ai_command', 'ai_configuration', 'training']
});