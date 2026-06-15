package main

import (
	"fmt"
	"time"
)

func newRequestID() string {
	return fmt.Sprintf("%d", time.Now().UnixNano())
}

func requestAckPayload(requestID string) map[string]any {
	return map[string]any{"requestId": requestID}
}

func connectionAckPayload(requestID string, connectionID string) map[string]any {
	return map[string]any{
		"requestId":    requestID,
		"connectionId": connectionID,
	}
}

func (client *extensionClient) ackRequestOrReplay(
	requestID string,
	ackEvent string,
	ackPayload map[string]any,
	replayLogFormat string,
	replayLogValues ...any,
) bool {
	replay, knownRequest := requestReplays.claim(requestID)
	if !knownRequest {
		client.broadcastAckOrClose(ackEvent, ackPayload)
		return false
	}

	values := append([]any{}, replayLogValues...)
	values = append(values, replay.done)
	logExtension(replayLogFormat, values...)
	client.broadcastAckOrClose(ackEvent, ackPayload)
	if replay.done {
		client.broadcastOrClose(replay.event, replay.data)
	}
	return true
}

func requestErrorPayload(requestID string, message string, extra map[string]any) map[string]any {
	payload := map[string]any{
		"requestId": requestID,
		"message":   message,
	}
	for key, value := range extra {
		payload[key] = value
	}
	return payload
}

func (client *extensionClient) finishRequest(requestID string, event string, payload map[string]any) {
	requestReplays.finish(requestID, event, payload)
	client.broadcastOrClose(event, payload)
}
