package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"strings"
	"time"

	"nhooyr.io/websocket"
)

func runExtension(authInfo neutralinoAuthInfo) (bool, error) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	dialCtx, dialCancel := context.WithTimeout(ctx, websocketDialTimeout)
	conn, _, err := websocket.Dial(dialCtx, neutralinoWebsocketURL(authInfo), nil)
	dialCancel()
	if err != nil {
		return false, fmt.Errorf("websocket dial failed: %w", err)
	}
	conn.SetReadLimit(neutralinoIPCReadLimit)
	defer conn.Close(websocket.StatusNormalClosure, "extension stopped")

	connectionErrors := make(chan error, 1)
	client := &extensionClient{conn: conn, accessToken: authInfo.Token, connectionErrors: connectionErrors}
	activeConnection.set(client)
	defer activeConnection.clear(client)
	logExtension("neutralino websocket connected")
	go client.keepAlive(ctx)
	if err := pendingEvents.flush(client); err != nil {
		client.closeNow()
		return true, fmt.Errorf("pending websocket broadcast flush failed: %w", err)
	}

	for {
		select {
		case err := <-connectionErrors:
			if isNeutralinoShutdownClose(err) {
				return true, errNeutralinoClosed
			}
			return true, err
		default:
		}

		_, data, err := conn.Read(ctx)
		if err != nil {
			if isNeutralinoShutdownClose(err) {
				return true, errNeutralinoClosed
			}
			return true, fmt.Errorf("websocket read failed: %w", err)
		}

		var message neutralinoMessage
		if err := json.Unmarshal(data, &message); err != nil {
			continue
		}

		if isClientLogEvent(message.Event) {
			go handleClientLog(message.Data)
		} else if isHealthEvent(message.Event) {
			go client.handleHealth(message.Data)
		} else if isFetchEvent(message.Event) {
			go client.handleFetch(ctx, message.Data)
		} else if isGRPCEvent(message.Event) {
			go client.handleGRPCEvent(message.Event, message.Data)
		} else if isNetworkEvent(message.Event) {
			go client.handleNetworkEvent(message.Event, message.Data)
		} else if isTargetWebsocketEvent(message.Event) {
			go client.handleTargetWebsocket(ctx, message.Event, message.Data)
		}
	}
}

func isNeutralinoShutdownClose(err error) bool {
	status := websocket.CloseStatus(err)
	return status == websocket.StatusNormalClosure || status == websocketStatusGoingAway
}

func neutralinoWebsocketURL(authInfo neutralinoAuthInfo) string {
	return fmt.Sprintf(
		"ws://127.0.0.1:%s?extensionId=%s&connectToken=%s",
		authInfo.Port,
		url.QueryEscape(authInfo.ExtensionID),
		url.QueryEscape(authInfo.ConnectToken),
	)
}

func loadAuthInfo() (neutralinoAuthInfo, error) {
	authInfo := neutralinoAuthInfo{
		Port:         os.Getenv("NL_PORT"),
		Token:        os.Getenv("NL_TOKEN"),
		ConnectToken: firstNonEmpty(os.Getenv("NL_CTOKEN"), os.Getenv("NL_CONNECT_TOKEN")),
		ExtensionID:  os.Getenv("NL_EXTID"),
	}

	stdin, err := io.ReadAll(os.Stdin)
	if err == nil && len(strings.TrimSpace(string(stdin))) > 0 {
		if err := json.Unmarshal(stdin, &authInfo); err != nil {
			return authInfo, fmt.Errorf("invalid Neutralino auth info from stdin: %w", err)
		}
	}

	if authInfo.ConnectToken == "" {
		authInfo.ConnectToken = connectTokenFromAccessToken(authInfo.Token)
	}
	if authInfo.Port == "" || authInfo.ExtensionID == "" || authInfo.Token == "" || authInfo.ConnectToken == "" {
		return authInfo, errors.New("Neutralino auth info is incomplete")
	}
	return authInfo, nil
}

func isFetchEvent(event string) bool {
	return eventMatches(event, eventHTTPRequest) || eventMatches(event, eventFetchPosts)
}

func isGRPCEvent(event string) bool {
	return eventMatches(event, eventGRPCRequest) || eventMatches(event, eventGRPCDescribe)
}

func isNetworkEvent(event string) bool {
	return eventMatches(event, eventNetworkRequest) ||
		eventMatches(event, eventNetworkStopRead) ||
		eventMatches(event, eventNetworkClose)
}

func isTargetWebsocketEvent(event string) bool {
	return eventMatches(event, eventWSConnect) || eventMatches(event, eventWSSend) || eventMatches(event, eventWSClose)
}

func eventMatches(event string, name string) bool {
	return event == name || strings.HasSuffix(event, "."+name)
}

func isHealthEvent(event string) bool {
	return eventMatches(event, eventExtensionHealthCheck)
}

func isClientLogEvent(event string) bool {
	return eventMatches(event, eventClientLog)
}

func handleClientLog(raw json.RawMessage) {
	if !extensionLogger.isEnabled() {
		return
	}

	message := struct {
		Level   string          `json:"level"`
		Message string          `json:"message"`
		Detail  json.RawMessage `json:"detail"`
	}{}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &message)
	}
	if strings.TrimSpace(message.Message) == "" {
		return
	}

	detail := strings.TrimSpace(string(message.Detail))
	if detail != "" {
		logExtension("client level=%s message=%s detail=%s", singleLine(message.Level), singleLine(message.Message), truncateLogValue(detail, 800))
		return
	}
	logExtension("client level=%s message=%s", singleLine(message.Level), singleLine(message.Message))
}

func (client *extensionClient) handleHealth(raw json.RawMessage) {
	request := struct {
		RequestID string `json:"requestId"`
	}{
		RequestID: newRequestID(),
	}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &request)
	}
	logExtension("health requestId=%s", request.RequestID)

	client.broadcastAckOrClose(eventExtensionHealthPong, map[string]any{
		"requestId": request.RequestID,
		"ok":        true,
		"time":      time.Now().Format(time.RFC3339Nano),
	})
}

func (client *extensionClient) keepAlive(ctx context.Context) {
	ticker := time.NewTicker(websocketPingInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			pingCtx, cancel := context.WithTimeout(ctx, websocketPingTimeout)
			err := client.ping(pingCtx)
			cancel()
			if err != nil {
				client.reportConnectionError(fmt.Errorf("websocket ping failed: %w", err))
				return
			}
		}
	}
}

func (client *extensionClient) ping(ctx context.Context) error {
	client.mu.Lock()
	defer client.mu.Unlock()
	return client.conn.Ping(ctx)
}

func (client *extensionClient) closeNow() {
	client.conn.CloseNow()
}

func (client *extensionClient) reportConnectionError(err error) {
	logExtension("connection error: %v", err)
	client.closeNow()
	select {
	case client.connectionErrors <- err:
	default:
	}
}

func (client *extensionClient) broadcastAckOrClose(event string, data any) bool {
	return activeConnection.broadcast(event, data, false)
}

func (client *extensionClient) broadcastOrClose(event string, data any) bool {
	return activeConnection.broadcast(event, data, true)
}

func (client *extensionClient) broadcast(event string, data any) error {
	payload := map[string]any{
		"id":          randomID(),
		"method":      "app.broadcast",
		"accessToken": client.accessToken,
		"data": map[string]any{
			"event": event,
			"data":  data,
		},
	}

	encoded, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	client.mu.Lock()
	defer client.mu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), websocketWriteTimeout)
	defer cancel()
	if err := client.conn.Write(ctx, websocket.MessageText, encoded); err != nil {
		return err
	}
	return nil
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func connectTokenFromAccessToken(accessToken string) string {
	parts := strings.Split(accessToken, ".")
	if len(parts) > 1 {
		return parts[1]
	}
	return accessToken
}
