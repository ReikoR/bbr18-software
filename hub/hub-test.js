const dgram = require('dgram');
const socketPublisher = dgram.createSocket('udp4');
const socketSubscriber = dgram.createSocket('udp4');

socketPublisher.on('error', (err) => {
    console.log(`socketPublisher error:\n${err.stack}`);
    socketPublisher.close();
});

socketPublisher.on('message', (message, rinfo) => {
    console.log(`socketPublisher got: ${message} from ${rinfo.address}:${rinfo.port}`);
});

socketPublisher.on('listening', () => {
    const address = socketPublisher.address();
    console.log(`socketPublisher listening ${address.address}:${address.port}`);
});

socketPublisher.bind(8089, () => {
    socketPublisher.setMulticastInterface('127.0.0.1');
});

socketSubscriber.on('error', (err) => {
    console.log(`socketSubscriber error:\n${err.stack}`);
    socketSubscriber.close();
});

socketSubscriber.on('message', (message, rinfo) => {
    console.log(`socketSubscriber got: ${message} from ${rinfo.address}:${rinfo.port}`);
});

socketSubscriber.on('listening', () => {
    const address = socketSubscriber.address();
    console.log(`socketSubscriber listening ${address.address}:${address.port}`);
});

socketSubscriber.bind(8088, () => {
    socketSubscriber.setMulticastInterface('127.0.0.1');
});

function send(socket, info, address, port) {
    const message = Buffer.from(JSON.stringify(info));
    console.log('send:', info, 'to', address, port);

    socket.send(message, port, address, (err) => {
        if (err) {
            console.error(err);
        }
    });
}

send(socketSubscriber, {type: 'subscribe', topics: ['test']}, '127.0.0.1', 8091);
setTimeout(function () {
    send(socketPublisher, {type: 'message', topic: 'test', data: 'payload'}, '127.0.0.1', 8091);
}, 1000);

setTimeout(function () {
    send(socketSubscriber, {type: 'unsubscribe', topics: ['test']}, '127.0.0.1', 8091);
}, 2000);

setTimeout(function () {
    send(socketPublisher, {type: 'message', topic: 'test', data: 'payload2'}, '127.0.0.1', 8091);
}, 3000);