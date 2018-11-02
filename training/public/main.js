/* eslint-disable no-undef */
let socket = createWebsocket(onSocketMessage, onSocketOpened, onSocketClosed);

const socketReconnectDelay = new BackOffDelay();

let sendInterval;
let throwerSpeed = 0;

function recordMeasurement(position, feedback) {
    wsSend({
        type: 'training_feedback',
        x: position.x,
        y: position.y,
        z: position.z,
        feedback
    });
}

function onSocketMessage(message) {
    try {
        const info = JSON.parse(message);

        if (info.type === 'ai_state') {
            renderState(info.state);
        }

        if (info.type === 'measurements') {
            const data = {
                x: info.values.map(value => value.x),
                y: info.values.map(value => value.y),
                z: info.values.map(value => value.z),
                mode: 'markers',
                type: 'scatter3d',
                marker: {
                    size: 1,
                    symbol: 'circle',
                    line: {
                        color: 'rgb(204, 204, 204)',
                        width: 1
                    },
                    opacity: 0.8
                },
            };

            // Plotting the surfaces..
            Plotly.newPlot('plot', [data]);
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
        console.log(event.data);

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

function renderState(state) {
    const elState = document.querySelector('#state');
    elState.innerText = JSON.stringify(state, null, 2);
}

function createButton(name, onClick) {
    const button = document.createElement('button');
    button.innerText = name;

    button.addEventListener('click', onClick);

    return button;
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
