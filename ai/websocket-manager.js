const BackOffDelay = require("./backoff-delay");
const WebSocket = require('ws');
const EventEmitter = require('events');

class WebsocketManager extends EventEmitter{
    constructor(address) {
        super();
        this.address =  address;
        this.socketReconnectDelay = new BackOffDelay();
        this.socket = this.createWebsocket();
    }

    onSocketOpened() {
        this.socketReconnectDelay.reset();
    }

    onSocketClosed() {
        setTimeout(() => {
            this.socket = this.createWebsocket();
        }, this.socketReconnectDelay.get());
    }

    createWebsocket() {
        const socket = new WebSocket('ws://' + this.address);

        socket.on('message', (data) => {
            //console.log(data);
            this.emit('message', data);
        });

        socket.on('close', (event) => {
            console.log('socket closed', event.code, event.reason);
            this.onSocketClosed();
        });

        socket.on('error', () => {
            console.log('socket error');
        });

        socket.on('open', () => {
            console.log('socket opened');
            this.onSocketOpened();
            this.emit('open');
        });

        return socket;
    }

    send(info) {
        this.socket.send(JSON.stringify(info));
    }
}

module.exports = WebsocketManager;