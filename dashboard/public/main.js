let socket = createWebsocket(onSocketMessage, onSocketOpened, onSocketClosed);

const socketReconnectDelay = new BackOffDelay();

function onSocketMessage(message) {
    try {
        const info = JSON.parse(message);

        if (info.type === 'ai_state') {
            renderState(info.state);
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

function renderControls() {
    const stateNamesMotion = ['IDLE', 'FIND_BALL', 'DRIVE_TO_BALL', 'FIND_BASKET'];
    const stateNamesThrower = ['IDLE', 'THROW_BALL', 'GRAB_BALL', 'HOLD_BALL', 'EJECT_BALL'];
    const motionStateControls = document.createElement('div');
    const throwerStateControls = document.createElement('div');

    const elControls = document.querySelector('#controls');
    elControls.appendChild(motionStateControls);
    elControls.appendChild(throwerStateControls);

    stateNamesMotion.forEach((stateName) => {
        motionStateControls.appendChild(createButton(stateName, () => {
            wsSend({type: 'ai_command', command: 'set_motion_state', state: stateName});
        }));
    });

    stateNamesThrower.forEach((stateName) => {
        throwerStateControls.appendChild(createButton(stateName, () => {
            wsSend({type: 'ai_command', command: 'set_thrower_state', state: stateName});
        }));
    });
}

renderControls();