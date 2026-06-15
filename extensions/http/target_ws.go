package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"nhooyr.io/websocket"
)

func (client *extensionClient) handleTargetWebsocket(ctx context.Context, event string, raw json.RawMessage) {
	switch {
	case eventMatches(event, eventWSConnect):
		client.handleWebsocketConnect(ctx, raw)
	case eventMatches(event, eventWSSend):
		client.handleWebsocketSend(ctx, raw)
	case eventMatches(event, eventWSClose):
		client.handleWebsocketClose(raw)
	}
}

func (client *extensionClient) handleWebsocketConnect(ctx context.Context, raw json.RawMessage) {
	request := websocketConnectRequest{
		RequestID:    newRequestID(),
		ConnectionID: newRequestID(),
	}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &request)
	}
	if request.RequestID == "" {
		request.RequestID = newRequestID()
	}
	if request.ConnectionID == "" {
		request.ConnectionID = request.RequestID
	}

	if client.ackRequestOrReplay(
		request.RequestID,
		eventWSConnectAck,
		connectionAckPayload(request.RequestID, request.ConnectionID),
		"ws connect replay requestId=%s connectionId=%s done=%t",
		request.RequestID,
		request.ConnectionID,
	) {
		return
	}
	logExtension("ws connect start requestId=%s connectionId=%s host=%s", request.RequestID, request.ConnectionID, requestHost(request.URL))

	start := time.Now()
	connection, response, err := dialTargetWebsocket(ctx, request)
	if err != nil {
		errorPayload := requestErrorPayload(request.RequestID, err.Error(), map[string]any{"connectionId": request.ConnectionID})
		client.finishRequest(request.RequestID, eventWSConnectError, errorPayload)
		logExtension("ws connect error requestId=%s connectionId=%s elapsedMs=%d error=%s", request.RequestID, request.ConnectionID, time.Since(start).Milliseconds(), singleLine(err.Error()))
		return
	}

	targetWebsockets.replace(connection)
	payload := map[string]any{
		"requestId":      request.RequestID,
		"connectionId":   request.ConnectionID,
		"url":            request.URL,
		"status":         "OPEN",
		"statusText":     "Connected",
		"elapsedMs":      time.Since(start).Milliseconds(),
		"headers":        responseHeaders(response),
		"httpVersion":    responseHTTPVersion(response),
		"httpProtoMajor": responseProtoMajor(response),
		"httpProtoMinor": responseProtoMinor(response),
	}
	client.finishRequest(request.RequestID, eventWSConnectResult, payload)
	go connection.readLoop(client)
	logExtension("ws connect result requestId=%s connectionId=%s elapsedMs=%d", request.RequestID, request.ConnectionID, payload["elapsedMs"])
}

func (client *extensionClient) handleWebsocketSend(_ context.Context, raw json.RawMessage) {
	request := websocketSendRequest{
		RequestID: newRequestID(),
	}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &request)
	}
	if request.RequestID == "" {
		request.RequestID = newRequestID()
	}

	if client.ackRequestOrReplay(
		request.RequestID,
		eventWSSendAck,
		connectionAckPayload(request.RequestID, request.ConnectionID),
		"ws send replay requestId=%s connectionId=%s done=%t",
		request.RequestID,
		request.ConnectionID,
	) {
		return
	}

	start := time.Now()
	connection := targetWebsockets.get(request.ConnectionID)
	if connection == nil {
		errorPayload := requestErrorPayload(request.RequestID, "websocket connection is not open", map[string]any{"connectionId": request.ConnectionID})
		client.finishRequest(request.RequestID, eventWSSendError, errorPayload)
		return
	}

	if err := connection.writeText(request.Message); err != nil {
		targetWebsockets.remove(connection.id, connection)
		connection.close("write failed")
		errorPayload := requestErrorPayload(request.RequestID, err.Error(), map[string]any{"connectionId": request.ConnectionID})
		client.finishRequest(request.RequestID, eventWSSendError, errorPayload)
		client.broadcastOrClose(eventWSError, map[string]any{
			"connectionId": request.ConnectionID,
			"url":          connection.url,
			"message":      err.Error(),
			"elapsedMs":    time.Since(connection.openedAt).Milliseconds(),
			"time":         time.Now().Format(time.RFC3339Nano),
		})
		logExtension("ws send error requestId=%s connectionId=%s elapsedMs=%d error=%s", request.RequestID, request.ConnectionID, time.Since(start).Milliseconds(), singleLine(err.Error()))
		return
	}

	payload := map[string]any{
		"requestId":    request.RequestID,
		"connectionId": request.ConnectionID,
		"status":       "SENT",
		"statusText":   "Text message sent",
		"elapsedMs":    time.Since(start).Milliseconds(),
		"message":      request.Message,
		"bytes":        len([]byte(request.Message)),
		"time":         time.Now().Format(time.RFC3339Nano),
	}
	client.finishRequest(request.RequestID, eventWSSendResult, payload)
	logExtension("ws send result requestId=%s connectionId=%s bytes=%d elapsedMs=%d", request.RequestID, request.ConnectionID, len([]byte(request.Message)), payload["elapsedMs"])
}

func (client *extensionClient) handleWebsocketClose(raw json.RawMessage) {
	request := websocketCloseRequest{
		RequestID: newRequestID(),
		Reason:    "closed by OmniPort",
	}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &request)
	}
	if request.RequestID == "" {
		request.RequestID = newRequestID()
	}
	if request.Reason == "" {
		request.Reason = "closed by OmniPort"
	}

	if client.ackRequestOrReplay(
		request.RequestID,
		eventWSCloseAck,
		connectionAckPayload(request.RequestID, request.ConnectionID),
		"ws close replay requestId=%s connectionId=%s done=%t",
		request.RequestID,
		request.ConnectionID,
	) {
		return
	}

	start := time.Now()
	connection := targetWebsockets.pop(request.ConnectionID)
	if connection != nil {
		connection.close(request.Reason)
	}

	payload := map[string]any{
		"requestId":    request.RequestID,
		"connectionId": request.ConnectionID,
		"status":       "CLOSED",
		"statusText":   "Closed",
		"elapsedMs":    time.Since(start).Milliseconds(),
		"time":         time.Now().Format(time.RFC3339Nano),
	}
	client.finishRequest(request.RequestID, eventWSCloseResult, payload)
	logExtension("ws close result requestId=%s connectionId=%s elapsedMs=%d", request.RequestID, request.ConnectionID, payload["elapsedMs"])
}

func dialTargetWebsocket(ctx context.Context, request websocketConnectRequest) (*targetWebsocketConnection, *http.Response, error) {
	if strings.TrimSpace(request.ConnectionID) == "" {
		return nil, nil, errors.New("websocket connection id is required")
	}
	if strings.TrimSpace(request.URL) == "" {
		return nil, nil, errors.New("websocket url is required")
	}

	parsed, err := url.Parse(request.URL)
	if err != nil {
		return nil, nil, fmt.Errorf("invalid websocket url: %w", err)
	}
	if parsed.Scheme != "ws" && parsed.Scheme != "wss" {
		return nil, nil, errors.New("only ws and wss urls are allowed")
	}
	if parsed.Host == "" {
		return nil, nil, errors.New("websocket host is required")
	}

	dialCtx, cancel := context.WithTimeout(ctx, targetWebsocketDialTimeout)
	defer cancel()

	conn, response, err := websocket.Dial(dialCtx, request.URL, &websocket.DialOptions{
		HTTPHeader: targetWebsocketHeaders(request.Headers),
	})
	if err != nil {
		return nil, response, fmt.Errorf("websocket dial failed: %w", err)
	}
	conn.SetReadLimit(maxBodyBytes + 1)

	readCtx, readCancel := context.WithCancel(ctx)
	return &targetWebsocketConnection{
		id:       request.ConnectionID,
		url:      request.URL,
		ctx:      readCtx,
		conn:     conn,
		cancel:   readCancel,
		openedAt: time.Now(),
	}, response, nil
}

func targetWebsocketHeaders(values map[string]string) http.Header {
	headers := http.Header{}
	for key, value := range values {
		key = strings.TrimSpace(key)
		if key != "" {
			headers.Set(key, strings.TrimSpace(value))
		}
	}
	return headers
}

func responseHeaders(response *http.Response) map[string]string {
	if response == nil {
		return map[string]string{}
	}

	headers := make(map[string]string, len(response.Header))
	for key, values := range response.Header {
		headers[strings.ToLower(key)] = strings.Join(values, ", ")
	}
	return headers
}

func responseHTTPVersion(response *http.Response) string {
	if response == nil {
		return ""
	}
	return response.Proto
}

func responseProtoMajor(response *http.Response) int {
	if response == nil {
		return 0
	}
	return response.ProtoMajor
}

func responseProtoMinor(response *http.Response) int {
	if response == nil {
		return 0
	}
	return response.ProtoMinor
}

func (connection *targetWebsocketConnection) readLoop(client *extensionClient) {
	for {
		messageType, data, err := connection.conn.Read(connection.ctx)
		if err != nil {
			if !targetWebsockets.remove(connection.id, connection) {
				logExtension("ws read stopped for stale connectionId=%s error=%s", connection.id, singleLine(err.Error()))
				return
			}
			eventName := eventWSClosed
			if !isNormalTargetWebsocketClose(err) {
				eventName = eventWSError
			}
			payload := map[string]any{
				"connectionId": connection.id,
				"url":          connection.url,
				"status":       "CLOSED",
				"statusCode":   int(websocket.CloseStatus(err)),
				"message":      err.Error(),
				"elapsedMs":    time.Since(connection.openedAt).Milliseconds(),
				"time":         time.Now().Format(time.RFC3339Nano),
			}
			client.broadcastOrClose(eventName, payload)
			logExtension("ws read closed connectionId=%s event=%s error=%s", connection.id, eventName, singleLine(err.Error()))
			return
		}

		payload := map[string]any{
			"connectionId": connection.id,
			"url":          connection.url,
			"direction":    "in",
			"messageType":  targetWebsocketMessageType(messageType),
			"message":      targetWebsocketMessage(data, messageType),
			"encoding":     targetWebsocketEncoding(messageType),
			"bytes":        len(data),
			"elapsedMs":    time.Since(connection.openedAt).Milliseconds(),
			"time":         time.Now().Format(time.RFC3339Nano),
		}
		client.broadcastOrClose(eventWSMessage, payload)
		logExtension("ws message connectionId=%s direction=in type=%s bytes=%d", connection.id, payload["messageType"], len(data))
	}
}

func (connection *targetWebsocketConnection) writeText(message string) error {
	connection.mu.Lock()
	defer connection.mu.Unlock()

	writeCtx, cancel := context.WithTimeout(context.Background(), websocketWriteTimeout)
	defer cancel()
	return connection.conn.Write(writeCtx, websocket.MessageText, []byte(message))
}

func (connection *targetWebsocketConnection) close(reason string) {
	connection.cancel()

	connection.mu.Lock()
	defer connection.mu.Unlock()

	if err := connection.conn.Close(websocket.StatusNormalClosure, truncateCloseReason(reason)); err != nil {
		connection.conn.CloseNow()
	}
}

func targetWebsocketMessageType(messageType websocket.MessageType) string {
	if messageType == websocket.MessageBinary {
		return "binary"
	}
	return "text"
}

func targetWebsocketMessage(data []byte, messageType websocket.MessageType) string {
	if messageType == websocket.MessageBinary {
		return base64.StdEncoding.EncodeToString(data)
	}
	return string(data)
}

func targetWebsocketEncoding(messageType websocket.MessageType) string {
	if messageType == websocket.MessageBinary {
		return "base64"
	}
	return "utf-8"
}

func isNormalTargetWebsocketClose(err error) bool {
	if errors.Is(err, context.Canceled) {
		return true
	}
	status := websocket.CloseStatus(err)
	return status == websocket.StatusNormalClosure || status == websocketStatusGoingAway
}

func truncateCloseReason(reason string) string {
	reason = singleLine(reason)
	if len(reason) <= 120 {
		return reason
	}
	return reason[:120]
}
