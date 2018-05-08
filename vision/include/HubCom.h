#ifndef XIMEA_TEST_COMM_H
#define XIMEA_TEST_COMM_H

#include <boost/asio.hpp>
#include <queue>

using boost::asio::ip::udp;

class HubCom {
public:
	HubCom(unsigned short port, std::string serverAddress, unsigned short serverPort);
	~HubCom();

    void run();

    void send(char* data, std::size_t length);

    bool gotMessages();

	std::string dequeueMessage();

private:
    unsigned short port;
	std::string serverAddress;
	boost::asio::io_service ioService;
    udp::socket socket;
    udp::endpoint serverEndpoint;
    enum {
        max_length = 1024
    };
    char data[max_length];

	std::queue<std::string> messages;

	std::thread* runnerThread;

	void runThread();
    void receive();
};

#endif //XIMEA_TEST_COMM_H
