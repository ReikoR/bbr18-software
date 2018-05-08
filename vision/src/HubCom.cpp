#include <iostream>
#include "HubCom.h"

HubCom::HubCom(unsigned short port, std::string serverAddress, unsigned short serverPort) :
		port(port),
		serverAddress(serverAddress),
		socket(ioService, udp::endpoint(boost::asio::ip::address::from_string("127.0.0.1"), port)),
		serverEndpoint(udp::endpoint(boost::asio::ip::address::from_string(serverAddress), serverPort)),
		runnerThread(nullptr)
{

}

HubCom::~HubCom() {
	if (runnerThread != nullptr) {
		ioService.stop();
		runnerThread->join();
	}

	delete runnerThread;
};

void HubCom::run() {
    runnerThread = new std::thread(HubCom::runThread, this);
}

void HubCom::runThread() {
	receive();

	ioService.run();
}

void HubCom::receive() {
    socket.async_receive_from(
            boost::asio::buffer(data, max_length), serverEndpoint,
            [this](std::error_code ec, std::size_t bytes_recvd) {
                if (!ec && bytes_recvd > 0) {
					std::string msg = std::string(data, bytes_recvd);

                    messages.push(msg);
                }

                receive();
            });
}

void HubCom::send(char* data, std::size_t length) {
    socket.async_send_to(
            boost::asio::buffer(data, length), serverEndpoint,
            [this](std::error_code ec, std::size_t bytes_sent) {
                std::cout << "sent " << ec << " " << +bytes_sent << std::endl;
            });
}

bool HubCom::gotMessages() {
	//std::cout << "message count: " << messages.size() << std::endl;
	return !messages.empty();
}

std::string HubCom::dequeueMessage() {
	if (messages.empty()) {
		return "";
	}

	std::string message = messages.front();

	messages.pop();

	return message;
}