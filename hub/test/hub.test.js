const hub = require('../hub');
const dgram = require('dgram');
const publicConf = require('../public-conf');

afterAll(() => {
    hub.close();
});

test('subscribe and unsubscribe', () => {
    hub.handleInfo({type: 'subscribe', topics: ['test']}, '127.0.0.1', 8092);

    expect(hub.topicTargets).toMatchSnapshot();

    hub.handleInfo({type: 'subscribe', topics: ['test']}, '127.0.0.1', 8093);

    expect(hub.topicTargets).toMatchSnapshot();

    hub.handleInfo({type: 'unsubscribe', topics: ['test']}, '127.0.0.1', 8093);

    expect(hub.topicTargets).toMatchSnapshot();

    hub.handleInfo({type: 'unsubscribe', topics: ['test']}, '127.0.0.1', 8092);

    expect(hub.topicTargets).toMatchSnapshot();

    hub.handleInfo({type: 'subscribe', topics: ['test']}, '127.0.0.1', 8092);

    expect(hub.topicTargets).toMatchSnapshot();
});

test('send message', () => {
    const testInfo = {type: 'message', topic: 'test2', command: 'test_command'};
    let promiseResolve;
    let promiseReject;
    const promise = new Promise((resolve, reject) => {
        promiseResolve = resolve;
        promiseReject = reject;
    });

    const socketPublisher = createUDPSocket('publisher', 8089, () => {}, onFail) ;

    const socketSubscriber = createUDPSocket('subscriber', 8088, message => {
        expect(JSON.parse(message)).toEqual(testInfo);

        promiseResolve();

        socketPublisher.close();
        socketSubscriber.close();
    }, onFail) ;

    function onFail(error) {
        promiseReject(error);

        socketPublisher.close();
        socketSubscriber.close();
    }

    send(socketSubscriber, {type: 'subscribe', topics: ['test2']}, '127.0.0.1', publicConf.port);

    setTimeout(function () {
        send(socketPublisher, testInfo, '127.0.0.1', 8091);
    }, 1000);

    expect.assertions(1);

    return promise;
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

function createUDPSocket(name, port, onMessage, onError) {
    const socket = dgram.createSocket('udp4');

    socket.on('error', (err) => {
        console.log(`${name} error:\n${err.stack}`);
        onError(err);
    });

    socket.on('message', (message, rinfo) => {
        console.log(`${name} got: ${message} from ${rinfo.address}:${rinfo.port}`);
        onMessage(message, rinfo);
    });

    socket.on('listening', () => {
        const address = socket.address();
        console.log(`${name} listening ${address.address}:${address.port}`);
    });

    socket.bind(port, () => {
        socket.setMulticastInterface('127.0.0.1');
    });

    return socket;
}