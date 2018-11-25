/* eslint-disable no-undef */
let socket = createWebsocket(onSocketMessage, onSocketOpened, onSocketClosed);

const socketReconnectDelay = new BackOffDelay();

let sendInterval;
let throwerSpeed = 0;
let selectedTechniques;

const COLORS = {
    'bounce': '#1f77b4',//rgb(255, 0, 0)',
    'straight': '#ff7f0e'//rgb(0, 255, 0)'
};

function selectTechniques(techniques) {
    selectedTechniques = techniques;

    // Load measurements
    wsSend({
        type: 'change_technique',
        techniques
    });
}

function getDecisionBoundary (net, x, initialBounds) {
    const bounds = initialBounds.slice();
    const input = new convnetjs.Vol([x, 0]);
  
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

// Initialize plot with measurements
function initializePlot(id, title, y, fbIndex, info) {
    let data = [];

    for (let technique of selectedTechniques) {
        const measurements = info[technique];
        const high =  measurements.filter(m => m.fb[fbIndex] === -1);
        const ok = measurements.filter(m => m.fb[0] === 0 && m.fb[1] === 0);
        const low = measurements.filter(m => m.fb[fbIndex] === 1);

        data.push({
            x: high.map(obj => obj.distance),
            y: high.map(obj => obj[y]),
            mode: 'markers',
            name: 'Too high',
            marker: {
                symbol: 'triangle-down',
                color: COLORS[technique]
            }
        });

        data.push({
            x: ok.map(obj => obj.distance),
            y: ok.map(obj => obj[y]),
            mode: 'markers',
            name: 'OK',
            marker: {
                symbol: 'x',
                color: COLORS[technique]
            }  
        });

        data.push({
            x: low.map(obj => obj.distance),
            y: low.map(obj => obj[y]),
            mode: 'markers',
            name: 'Too low',
            marker: {
                symbol: 'triangle-up',
                color: COLORS[technique]
            }
        });

        data.push({
            x: [],
            y: [],
            name: 'Decision boundary',
            mode: 'line'
        });
    }

    Plotly.newPlot(id, data, {
        title,
        hovermode: 'closest',
        xaxis: {
            range: [0, 500]
        },
        yaxis: {
            range: (y === 'throwerSpeed') ? [0, 20000] : [-30, 30]
        }
    });

    document.getElementById(id).on('plotly_click', data => {
        let point = data.points[0];

        if (point.curvenumber !== 3 || point.curvenumber !== 7) {
            const technique = selectedTechniques[(point.curveNumber < 4) ? 0 : 1];
            wsSend({
                type: 'delete_measurement',
                technique,
                index: info[technique].findIndex(m => m.distance === point.x && m[y] === point.y)
            });

            console.log('Point', point.x, point.y, point.pointNumber, point.curveNumber, technique);
        }
    });
}

// Plot decision boundary
function plotDecisionBoundaries(plotId, info, y, bounds, scale) {
    for (let technique of selectedTechniques) {
        if (!info[technique] || !info[technique][y]) {
            continue;
        }

        const traceIndex = selectedTechniques.indexOf(technique) * 4 + 3;

        Plotly.deleteTraces(plotId, traceIndex);

        const net = new convnetjs.Net();
        net.fromJSON(info[technique][y]);

        const boundary = {
            x: [],
            y: [],
            name: 'Decision boundary',
            mode: 'line',
            line: {
                color: COLORS[technique]
            }
        };

        for (let x = 0; x <= scale[0]; x += Math.floor(scale[0]/200)) {
            boundary.x.push(x);
            boundary.y.push(getDecisionBoundary(net, x / scale[0], bounds) * scale[1]);
        }
        
        Plotly.addTraces(plotId, [boundary], traceIndex);
    }

    /*
    const t = new convnetjs.Vol([0.3, 0.5]);
    const one = { x: [], y: [], mode: 'markers', marker: { color: 'rgb(255, 0, 0)' } };
    const two = { x: [], y: [], mode: 'markers', marker: { color: 'rgb(0, 255, 0)' } };

    for (let x = 0; x <= 1; x += 0.1) {
        for (let y = 0; y <= 1; y += 0.1) {
            t.w = [x, y];
            const output = net.forward(t);

            if (output.w[0] < output.w[1]) {
                one.x.push(x * 500);
                one.y.push(y * 20000);
            } else {
                two.x.push(x * 500);
                two.y.push(y * 20000);
            }
        }
    }
    */
}

// Plot decision boundary
function plotTrainingData(plotId, info, y) {
    for (let technique of selectedTechniques) {
        if (!info[technique] || !info[technique][y]) {
            continue;
        }

        const traceIndex = selectedTechniques.indexOf(technique) * 4 + 3;

        Plotly.deleteTraces(plotId, traceIndex);

        /*
        const net = new convnetjs.Net();
        net.fromJSON(info[technique][y]);
        */

        const boundary = {
            x: Array(500).fill().map((x, i) => i),
            y: info[technique][y],
            name: 'Decision boundary',
            mode: 'line',
            line: {
                color: COLORS[technique]
            }
        };
        
        Plotly.addTraces(plotId, [boundary], traceIndex);
    }
}

function onSocketMessage(message) {
    try {
        const info = JSON.parse(message);

        if (info.type === 'ai_state') {
            renderState(info.state);
        }

        if (info.type === 'measurements') {
            initializePlot('thrower-speed-plot', 'Thrower speed calibration', 'throwerSpeed', 0, info);
            initializePlot('center-offset-plot', 'Center offset calibration', 'centerOffset', 1, info);
        }

        if (info.type === 'nets') {
            plotDecisionBoundaries('thrower-speed-plot', info, 'throwerSpeed', [0, 1], [500, 20000]);
            plotDecisionBoundaries('center-offset-plot', info, 'centerOffset', [-1, 1], [500, 30]);
        }

        if (info.type === 'training_data') {
            plotTrainingData('thrower-speed-plot', info.data, 'throwerSpeed');
            plotTrainingData('center-offset-plot', info.data, 'centerOffset');
        }
    } catch (error) {
        console.info(error.message, error.stack);
    }
}

function onSocketOpened() {
    socketReconnectDelay.reset();
    
    selectTechniques(['bounce', 'straight']);
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

    document.getElementById('info-technique').innerHTML = state.ballThrownTechnique;
    document.getElementById('info-distance').innerHTML = state.lidarDistance;
    document.getElementById('info-thrower-speed').innerHTML = state.ballThrowSpeed;
    document.getElementById('info-center-offset').innerHTML = state.ballThrowBasketOffset;
    
    if (state.basket) {
        document.getElementById('info-angle').innerHTML = state.basket.metrics[0] - state.basket.metrics[1];
    } else {
        document.getElementById('info-angle').innerHTML = 'basket not found';
    }

    if (state.ballThrown) {
        document.getElementById('feedback').style.display = 'block';
    }
}

function sendFeedback(feedback) {
    wsSend({
        type: 'training_feedback',
        technique: lastAiState.ballThrownTechnique,
        distance: lastAiState.lidarDistance,
        angle: lastAiState.basket ? (lastAiState.basket.metrics[0] - lastAiState.basket.metrics[1]) : 0,
        centerOffset: lastAiState.ballThrowBasketOffset,
        throwerSpeed: lastAiState.ballThrowSpeed,
        feedback
    });

    document.getElementById('feedback').style.display = 'none';

    /*
    // Add feedback to plots
    Plotly.extendTraces('thrower-speed-plot', {
        x: [[lastAiState.lidarDistance]],
        y: [[lastAiState.ballThrowSpeed]]
    }, [feedback[0] + 1]);
    
    Plotly.extendTraces('center-offset-plot', {
        x: [[lastAiState.lidarDistance]],
        y: [[lastAiState.ballThrownBasketOffset]]
    }, [feedback[1] + 1]);
    */
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

function demo() {
    setInterval(() => {
        const distance = Math.round(Math.random() * 500);
        const throwerSpeed = Math.round(Math.random() * 20000);
        const centerOffset = Math.round(Math.random() * 40 - 20);

        let fb = [0, 0];
        const a = (selectTechniques[0] === 'straight') ? 40 : 60;
        const b = (selectTechniques[0] === 'straight') ? 0 : 1000;

        if (throwerSpeed > (distance * a + b + 30)) {
            fb[0] = -1;
        } else if (throwerSpeed < (distance * a + b - 30)) {
            fb[0] = 1;
        }

        if (centerOffset > 10) {
            fb[1] = -1;
        } else {
            fb[1] = 1;
        }

        lastAiState = {
            ballThrownTechnique: selectedTechniques[0],
            lidarDistance: distance,
            ballThrowSpeed: throwerSpeed,
            ballThrowBasketOffset: centerOffset
        };

        sendFeedback(fb);
    }, 1000);
}