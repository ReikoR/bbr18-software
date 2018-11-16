/* eslint-disable no-undef */
let socket = createWebsocket(onSocketMessage, onSocketOpened, onSocketClosed);

const socketReconnectDelay = new BackOffDelay();

let sendInterval;
let throwerSpeed = 0;

function getDecisionBoundary (net, x, initialBounds) {
    const bounds = initialBounds.slice();
    const input = new convnetjs.Vol(1, 1, 2);
    input.w[0] = x;
  
    for (let i = 0; i < 100; ++i) {
        input.w[1] = (bounds[0] + bounds[1]) / 2;
        const output = net.forward(input);

        if (Math.abs(output.w[1] - output.w[0]) < 0.0001) {
            break;
        }

        bounds[(output.w[0] > output.w[1]) ? 1 : 0] = input.w[1];
    }

    return input.w[1];
}

function getThrowerTechniqueData(label, calibration, color1) {
    const high = calibration.measurements.filter(m => m.fb[0] === -1);
    const ok = calibration.measurements.filter(m => m.fb[0] === 0);
    const low = calibration.measurements.filter(m => m.fb[0] === 1);

    const boundary = {
        x: [],
        y: [],
        mode: 'line'
    };

    const net = new convnetjs.Net();
    net.fromJSON(calibration.throwerSpeedNet);

    for (let x = 0; x <= 520; x += 20) {
        boundary.x.push(x);
        boundary.y.push(getDecisionBoundary(net, x, [0, 1]));
    }

    const throwerSpeedData = [
        boundary,
        {
            x: high.map(obj => obj.distance),
            y: high.map(obj => obj.throwerSpeed),
            mode: 'markers',
            name: label,
            marker: {
                color: color1,
                symbol: 'triangle-down'
            }
        },
        {
            x: ok.map(obj => obj.distance),
            y: ok.map(obj => obj.throwerSpeed),
            mode: 'markers',
            name: label,
            marker: {
                color: color1,
                symbol: 'x'
            }
        },
        {
            x: low.map(obj => obj.distance),
            y: low.map(obj => obj.throwerSpeed),
            mode: 'markers',
            name: label,
            marker: {
                color: color1,
                symbol: 'triangle-up'
            }
        }
    ];

    const centerOffsetData = {
        x: calibration.measurements.map(obj => obj.distance),
        y: calibration.measurements.map(obj => obj.centerOffset),
        mode: 'markers',
        name: label,
        line: {
            color: color1
        }
    };

    return {
        throwerSpeed: throwerSpeedData,
        centerOffset: [centerOffsetData]
    };
}

function onSocketMessage(message) {
    try {
        const info = JSON.parse(message);

        if (info.type === 'ai_state') {
            renderState(info.state);
        }

        if (info.type === 'calibration') {
            const dunk = getThrowerTechniqueData('Dunk', info.calibration.dunk, 'rgb(0, 255, 0)', 'rgb(0, 255, 255)');

            Plotly.newPlot('thrower-speed-plot', [
                ...dunk.throwerSpeed
            ], {
                title: 'Thrower Speed Calibration'
            });

            Plotly.newPlot('center-offset-plot', [
                ...dunk.centerOffset
            ], {
                title: 'Center Offset Calibration'
            });
        }
    } catch (error) {
        console.info(error);
    }
}

function onSocketOpened() {
    socketReconnectDelay.reset();
}

function onSocketClosed() {
    setTimeout(() => {
        socket = createWebsocket(onSocketMessage, onSocketOpened, onSocketClosed);
    }, socketReconnectDelay.get());
}

function BackOffDelay() {
    this.min = 1000;
    this.max = 10000;
    this.step = 500;
    this.current = this.min;
}

BackOffDelay.prototype.get = function () {
    const returnValue = this.current;
    this.current = Math.min(this.current + this.step, this.max);

    console.log('delay', returnValue);

    return returnValue;
};

BackOffDelay.prototype.reset = function () {
    this.current = this.min;
};

function createWebsocket(onMessage, onOpened, onClosed) {
    const socket = new WebSocket('ws://' + location.host);

    socket.addEventListener('message', function (event) {
        //console.log(event.data);

        onMessage(event.data);
    });

    socket.addEventListener('close', function (event) {
        console.log('socket closed', event.code, event.reason);

        onClosed();
    });

    socket.addEventListener('error', function () {
        console.log('socket error');
    });

    socket.addEventListener('open', function () {
        console.log('socket opened');

        onOpened();
    });

    return socket;
}

let lastAiState;

function renderState(state) {
    if (document.getElementById('feedback').style.display === 'block') {
        return;
    }

    lastAiState = state;

    document.getElementById('info-technique').innerHTML = state.technique;
    document.getElementById('info-distance').innerHTML = state.lidarDistance;
    document.getElementById('info-thrower-speed').innerHTML = state.ballThrownSpeed;
    document.getElementById('info-center-offset').innerHTML = state.ballThrownBasketOffset;

    if (state.ballThrown) {
        document.getElementById('feedback').style.display = 'block';
    }
}

function sendFeedback(feedback) {
    wsSend({
        type: 'training_feedback',
        distance: lastAiState.lidarDistance,
        centerOffset: lastAiState.ballThrownBasketOffset,
        throwerSpeed: lastAiState.ballThrownSpeed,
        feedback
    });

    document.getElementById('feedback').style.display = 'none';
}

function skipFeedback() {
    document.getElementById('feedback').style.display = 'none';
}

function wsSend(info) {
    socket.send(JSON.stringify(info));
}

function startSendInterval() {
    clearInterval(sendInterval);

    sendInterval = setInterval(() => {
        wsSend({type: 'mainboard_command', info: [0, 0, 0, 0, throwerSpeed]});
    }, 200);
}

function stopSendInterval() {
    clearInterval(sendInterval);
    sendInterval = null;

    wsSend({type: 'mainboard_command', info: [0, 0, 0, 0, 0]});
}
