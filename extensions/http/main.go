package main

import (
	"errors"
	"fmt"
	"os"
	"time"
)

func main() {
	logExtension("extension starting")
	authInfo, err := loadAuthInfo()
	if err != nil {
		logExtension("auth info load failed: %v", err)
		fmt.Fprintln(os.Stderr, err.Error())
		os.Exit(1)
	}

	defer sharedHTTPTransport.CloseIdleConnections()
	defer targetWebsockets.closeAll("extension stopped")
	defer closeAllNetworkConnections()

	if err := runExtensionLoop(authInfo); err != nil {
		logExtension("extension loop failed: %v", err)
		fmt.Fprintln(os.Stderr, err.Error())
		sharedHTTPTransport.CloseIdleConnections()
		os.Exit(1)
	}
	logExtension("extension stopped")
}

func runExtensionLoop(authInfo neutralinoAuthInfo) error {
	reconnectDelay := websocketReconnectDelay

	for {
		connected, err := runExtension(authInfo)
		closeAllNetworkConnections()
		if err == nil || errors.Is(err, errNeutralinoClosed) {
			return nil
		}

		if connected {
			sharedHTTPTransport.CloseIdleConnections()
			logExtension("neutralino websocket closed after a connected session: %v; stopping extension", err)
			return nil
		}

		sharedHTTPTransport.CloseIdleConnections()

		logExtension("neutralino websocket disconnected: %v; reconnecting in %s", err, reconnectDelay)
		time.Sleep(reconnectDelay)
		reconnectDelay = nextReconnectDelay(reconnectDelay)
	}
}

func nextReconnectDelay(current time.Duration) time.Duration {
	next := current * 2
	if next > websocketReconnectMaxDelay {
		return websocketReconnectMaxDelay
	}
	return next
}
