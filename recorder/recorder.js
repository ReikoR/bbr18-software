const dgram = require('dgram');
const fs = require('fs');
const statistics = require('simple-statistics');
const publicConf = require('./public-conf.json');

const HubCom = require('../common/HubCom');
const hubCom = new HubCom(publicConf.port, publicConf.hubIpAddress, publicConf.hubPort, handleClose);

hubCom.on('info', handleInfo);

hubCom.send({type: 'subscribe', topics: ['ai_state']});

const distanceToY2Samples = [];
const maxSampleCount = 100;

function handleInfo(info) {
    if (info.type === 'message') {
        if (info.topic === 'ai_state') {
            handleAiState(info.state);
        }
    }
}

function handleAiState(state) {
    if (state.basket && Math.abs(state.basket.cx - 640) < 5) {
        const distance = state.lidarDistance;
        const y2 = state.basket.y2;

        console.log(distance, y2);

        if (!distanceToY2Samples[distance]) {
            distanceToY2Samples[distance] = [];
        }

        distanceToY2Samples[distance].push(y2);

        distanceToY2Samples[distance] = distanceToY2Samples[distance].slice(-100);
    }
}

function saveResults() {
    let results = [];

    for (let distance = 0; distance < distanceToY2Samples.length; distance++) {
        let samples = distanceToY2Samples[distance];

        if (Array.isArray(samples) && samples.length > 0) {
            samples = samples.sort((a, b) => a - b);

            results.push({
                distance,
                count: samples.length,
                stdDev: statistics.standardDeviation(samples),
                mean: statistics.mean(samples),
                min: statistics.minSorted(samples),
                max: statistics.maxSorted(samples),
                median: statistics.medianSorted(samples)
            });
        }
    }

    console.log(results);

    fs.writeFileSync(
        'distance_basket_y2_' + (new Date().toISOString().replace(/[:.]/g, '_')) + '.json',
        JSON.stringify(results, null, 2)
    );
}

function handleClose() {
    saveResults();
}

/*
{ type: 'message',
  topic: 'ai_state',
  state:
   { motionState: 'IDLE',
     throwerState: 'IDLE',
     ballSensors: [ false, false ],
     ballThrown: false,
     lidarDistance: 177,
     visionMetrics: { straightAhead: [Object] },
     closestBall:
      { cx: 144,
        cy: 184,
        h: 8,
        metrics: [Array],
        straightAhead: [Object],
        w: 12,
        size: 96,
        confidence: 0.4425689689889145 },
     basket:
      { color: 'blue',
        cx: 645,
        cy: 55,
        h: 110,
        metrics: [Array],
        w: 67,
        size: 7370,
        y2: 110,
        bottomMetric: 0.9624999761581421 },
     otherBasket: null,
     refereeCommand: 'X',
     fieldID: 'Z',
     robotID: 'Z',
     isManualOverride: true,
     isCompetition: false,
     basketColour: 'blue',
     ballThrowSpeed: 0,
     ballThrownSpeed: 0,
     ballThrownBasketOffset: 0 } }
 */

