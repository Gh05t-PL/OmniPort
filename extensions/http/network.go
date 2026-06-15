package main

import (
	"bytes"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"strings"
	"time"
	"unicode/utf8"
)

func (client *extensionClient) handleNetworkEvent(event string, raw json.RawMessage) {
	switch {
	case eventMatches(event, eventNetworkRequest):
		client.handleNetworkRequest(raw)
	case eventMatches(event, eventNetworkStopRead):
		client.handleNetworkStopRead(raw)
	case eventMatches(event, eventNetworkClose):
		client.handleNetworkClose(raw)
	}
}

func (client *extensionClient) handleNetworkRequest(raw json.RawMessage) {
	request := networkRequest{
		RequestID: newRequestID(),
		Protocol:  "tcp",
		TimeoutMs: int(networkDefaultTimeout / time.Millisecond),
		ReadMode:  "idle",
	}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &request)
	}

	if client.ackRequestOrReplay(
		request.RequestID,
		eventNetworkRequestAck,
		requestAckPayload(request.RequestID),
		"network replay requestId=%s done=%t",
		request.RequestID,
	) {
		return
	}
	logExtension(
		"network start requestId=%s protocol=%s target=%s",
		request.RequestID,
		singleLine(request.Protocol),
		singleLine(request.Target),
	)

	start := time.Now()
	payload, err := executeNetworkRequest(request)
	if err != nil {
		errorPayload := requestErrorPayload(request.RequestID, err.Error(), nil)
		client.finishRequest(request.RequestID, eventNetworkRequestError, errorPayload)
		logExtension("network error requestId=%s elapsedMs=%d error=%s", request.RequestID, time.Since(start).Milliseconds(), singleLine(err.Error()))
		return
	}

	payload["requestId"] = request.RequestID
	payload["elapsedMs"] = time.Since(start).Milliseconds()
	client.finishRequest(request.RequestID, eventNetworkRequestResult, payload)
	logExtension("network result requestId=%s protocol=%s receivedBytes=%v elapsedMs=%d", request.RequestID, request.Protocol, payload["receivedBytes"], payload["elapsedMs"])
}

func (client *extensionClient) handleNetworkStopRead(raw json.RawMessage) {
	request := networkControlRequest{RequestID: newRequestID()}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &request)
	}

	client.broadcastAckOrClose(eventNetworkStopReadAck, requestAckPayload(request.RequestID))
	stopped := activeNetworkReads.stop(request.ActiveRequestID)
	client.broadcastOrClose(eventNetworkStopReadResult, map[string]any{
		"requestId":       request.RequestID,
		"activeRequestId": request.ActiveRequestID,
		"stopped":         stopped,
	})
}

func (client *extensionClient) handleNetworkClose(raw json.RawMessage) {
	request := networkControlRequest{RequestID: newRequestID()}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &request)
	}

	client.broadcastAckOrClose(eventNetworkCloseAck, requestAckPayload(request.RequestID))
	if request.ActiveRequestID != "" {
		activeNetworkReads.stop(request.ActiveRequestID)
	}
	connection := targetTCPConnections.pop(request.ConnectionID)
	closed := connection != nil
	if connection != nil {
		_ = connection.conn.Close()
	}
	client.broadcastOrClose(eventNetworkCloseResult, map[string]any{
		"requestId":    request.RequestID,
		"connectionId": request.ConnectionID,
		"closed":       closed,
	})
}

type networkReadResult struct {
	data             []byte
	reason           string
	complete         bool
	connectionClosed bool
	stopped          bool
	frameLength      int
}

func executeNetworkRequest(request networkRequest) (map[string]any, error) {
	protocol := strings.ToLower(strings.TrimSpace(request.Protocol))
	if protocol != "tcp" && protocol != "udp" {
		return nil, errors.New("network protocol must be tcp or udp")
	}
	target := strings.TrimSpace(request.Target)
	if target == "" {
		return nil, errors.New("network target is required")
	}
	if _, _, err := net.SplitHostPort(target); err != nil {
		return nil, fmt.Errorf("network target must use host:port format: %w", err)
	}

	timeout := time.Duration(request.TimeoutMs) * time.Millisecond
	if timeout < 100*time.Millisecond {
		timeout = networkDefaultTimeout
	}
	if timeout > networkMaxTimeout {
		timeout = networkMaxTimeout
	}

	deadline := time.Now().Add(timeout)
	payload := []byte(request.Payload)
	var err error
	if request.PayloadBase64 != nil {
		payload, err = base64.StdEncoding.DecodeString(*request.PayloadBase64)
		if err != nil {
			return nil, fmt.Errorf("network payload has invalid base64 data: %w", err)
		}
	}

	readMode := strings.ToLower(strings.TrimSpace(request.ReadMode))
	if readMode == "" {
		readMode = "idle"
	}
	if protocol == "udp" {
		readMode = "datagram"
		request.KeepConnection = false
	}
	if protocol == "tcp" {
		switch readMode {
		case "idle", "close", "exact", "delimiter", "length-prefix":
		default:
			return nil, fmt.Errorf("unsupported tcp read mode %q", readMode)
		}
	}

	var conn net.Conn
	var session *targetTCPConnection
	reusedConnection := false
	connectionID := strings.TrimSpace(request.ConnectionID)

	if protocol == "tcp" && !request.KeepConnection && connectionID != "" {
		previousSession := targetTCPConnections.pop(connectionID)
		if previousSession != nil {
			_ = previousSession.conn.Close()
		}
	}

	if protocol == "tcp" && request.KeepConnection {
		if connectionID == "" {
			connectionID = request.RequestID
		}
		session = targetTCPConnections.get(connectionID)
		if session != nil && session.target != target {
			targetTCPConnections.pop(connectionID)
			_ = session.conn.Close()
			session = nil
		}
		if session == nil {
			conn, err = net.DialTimeout(protocol, target, timeout)
			if err != nil {
				return nil, fmt.Errorf("%s connect failed: %w", protocol, err)
			}
			session = &targetTCPConnection{
				id:       connectionID,
				target:   target,
				conn:     conn,
				openedAt: time.Now(),
			}
			targetTCPConnections.replace(session)
		} else {
			conn = session.conn
			reusedConnection = true
		}
		session.ioMu.Lock()
		defer session.ioMu.Unlock()
	} else {
		conn, err = net.DialTimeout(protocol, target, timeout)
		if err != nil {
			return nil, fmt.Errorf("%s connect failed: %w", protocol, err)
		}
		defer conn.Close()
	}

	if err := conn.SetWriteDeadline(deadline); err != nil {
		return nil, fmt.Errorf("%s write deadline failed: %w", protocol, err)
	}
	sentBytes, err := writeNetworkPayload(conn, payload)
	if err != nil {
		if session != nil {
			targetTCPConnections.remove(session.id, session)
			_ = session.conn.Close()
		}
		return nil, fmt.Errorf("%s write failed: %w", protocol, err)
	}
	_ = conn.SetWriteDeadline(time.Time{})

	if protocol == "tcp" && !request.KeepConnection {
		if tcpConnection, ok := conn.(*net.TCPConn); ok {
			_ = tcpConnection.CloseWrite()
		}
	}

	activeRead := activeNetworkReads.add(request.RequestID, conn)
	readResult, err := readNetworkResponse(conn, protocol, request, readMode, deadline, activeRead)
	activeNetworkReads.remove(request.RequestID, activeRead)
	_ = conn.SetReadDeadline(time.Time{})
	if err != nil {
		if session != nil {
			targetTCPConnections.remove(session.id, session)
			_ = session.conn.Close()
		}
		return nil, err
	}

	sessionOpen := session != nil &&
		!readResult.connectionClosed &&
		targetTCPConnections.get(session.id) == session
	if session != nil && !sessionOpen {
		targetTCPConnections.remove(session.id, session)
		_ = session.conn.Close()
	}

	body, encoding := encodeNetworkResponse(readResult.data)

	return map[string]any{
		"status":           "OK",
		"statusText":       strings.ToUpper(protocol) + " response",
		"protocol":         protocol,
		"remoteAddress":    conn.RemoteAddr().String(),
		"sentBytes":        sentBytes,
		"receivedBytes":    len(readResult.data),
		"encoding":         encoding,
		"body":             body,
		"dataBase64":       base64.StdEncoding.EncodeToString(readResult.data),
		"readMode":         readMode,
		"readReason":       readResult.reason,
		"readComplete":     readResult.complete,
		"readStopped":      readResult.stopped,
		"frameLength":      readResult.frameLength,
		"connectionId":     connectionID,
		"connectionOpen":   sessionOpen,
		"reusedConnection": reusedConnection,
	}, nil
}

func writeNetworkPayload(conn net.Conn, payload []byte) (int, error) {
	written := 0
	for written < len(payload) {
		count, err := conn.Write(payload[written:])
		written += count
		if err != nil {
			return written, err
		}
		if count == 0 {
			return written, io.ErrUnexpectedEOF
		}
	}
	return written, nil
}

func readNetworkResponse(
	conn net.Conn,
	protocol string,
	request networkRequest,
	readMode string,
	deadline time.Time,
	activeRead *activeNetworkRead,
) (networkReadResult, error) {
	if protocol == "udp" {
		buffer := make([]byte, maxBodyBytes+1)
		_ = conn.SetReadDeadline(deadline)
		readBytes, err := conn.Read(buffer)
		if err != nil {
			if networkError, ok := err.(net.Error); ok && networkError.Timeout() && activeRead.wasStopped() {
				return stoppedNetworkReadResult(nil, activeRead), nil
			}
			return networkReadResult{}, fmt.Errorf("udp read failed: %w", err)
		}
		if readBytes > maxBodyBytes {
			return networkReadResult{}, fmt.Errorf("udp response exceeds the %d byte limit", maxBodyBytes)
		}
		return networkReadResult{
			data:         buffer[:readBytes],
			reason:       "datagram",
			complete:     true,
			frameLength:  readBytes,
		}, nil
	}

	switch readMode {
	case "exact":
		if request.ExactBytes <= 0 || request.ExactBytes > maxBodyBytes {
			return networkReadResult{}, fmt.Errorf("exact byte count must be between 1 and %d", maxBodyBytes)
		}
		result, err := readTCPExact(conn, request.ExactBytes, deadline, activeRead)
		result.frameLength = request.ExactBytes
		return result, err
	case "delimiter":
		delimiter, err := base64.StdEncoding.DecodeString(request.DelimiterBase64)
		if err != nil {
			return networkReadResult{}, fmt.Errorf("tcp delimiter has invalid base64 data: %w", err)
		}
		if len(delimiter) == 0 {
			return networkReadResult{}, errors.New("tcp delimiter cannot be empty")
		}
		return readTCPUntilDelimiter(conn, delimiter, deadline, activeRead)
	case "length-prefix":
		return readTCPLengthPrefixed(conn, request, deadline, activeRead)
	default:
		return readTCPStream(conn, readMode == "idle", deadline, activeRead)
	}
}

func stoppedNetworkReadResult(data []byte, activeRead *activeNetworkRead) networkReadResult {
	return networkReadResult{
		data:             data,
		reason:           "manual-stop",
		connectionClosed: activeRead.wasClosed(),
		stopped:          true,
	}
}

func readTCPStream(conn net.Conn, idleMode bool, deadline time.Time, activeRead *activeNetworkRead) (networkReadResult, error) {
	response := make([]byte, 0, 4096)
	buffer := make([]byte, 32*1024)
	for {
		readDeadline := deadline
		if idleMode && len(response) > 0 {
			idleDeadline := time.Now().Add(networkTCPIdleReadTimeout)
			if idleDeadline.Before(readDeadline) {
				readDeadline = idleDeadline
			}
		}
		_ = conn.SetReadDeadline(readDeadline)
		readBytes, err := conn.Read(buffer)
		if readBytes > 0 {
			response = append(response, buffer[:readBytes]...)
			if len(response) > maxBodyBytes {
				return networkReadResult{}, fmt.Errorf("tcp response exceeds the %d byte limit", maxBodyBytes)
			}
		}
		if err == nil {
			continue
		}
		if errors.Is(err, io.EOF) {
			return networkReadResult{
				data:             response,
				reason:           "connection-close",
				complete:         true,
				connectionClosed: true,
			}, nil
		}
		if networkError, ok := err.(net.Error); ok && networkError.Timeout() {
			if activeRead.wasStopped() {
				return stoppedNetworkReadResult(response, activeRead), nil
			}
			if idleMode && len(response) > 0 {
				return networkReadResult{data: response, reason: "idle-timeout", complete: true}, nil
			}
			return networkReadResult{data: response, reason: "timeout"}, nil
		}
		if activeRead.wasStopped() {
			return stoppedNetworkReadResult(response, activeRead), nil
		}
		return networkReadResult{}, fmt.Errorf("tcp read failed: %w", err)
	}
}

func readTCPExact(conn net.Conn, count int, deadline time.Time, activeRead *activeNetworkRead) (networkReadResult, error) {
	response := make([]byte, 0, count)
	for len(response) < count {
		_ = conn.SetReadDeadline(deadline)
		buffer := make([]byte, minInt(32*1024, count-len(response)))
		readBytes, err := conn.Read(buffer)
		if readBytes > 0 {
			response = append(response, buffer[:readBytes]...)
		}
		if len(response) == count {
			return networkReadResult{data: response, reason: "exact-bytes", complete: true}, nil
		}
		if err == nil {
			continue
		}
		if errors.Is(err, io.EOF) {
			return networkReadResult{
				data:             response,
				reason:           "connection-close",
				connectionClosed: true,
			}, nil
		}
		if networkError, ok := err.(net.Error); ok && networkError.Timeout() {
			if activeRead.wasStopped() {
				return stoppedNetworkReadResult(response, activeRead), nil
			}
			return networkReadResult{data: response, reason: "timeout"}, nil
		}
		if activeRead.wasStopped() {
			return stoppedNetworkReadResult(response, activeRead), nil
		}
		return networkReadResult{}, fmt.Errorf("tcp read failed: %w", err)
	}
	return networkReadResult{data: response, reason: "exact-bytes", complete: true}, nil
}

func readTCPUntilDelimiter(conn net.Conn, delimiter []byte, deadline time.Time, activeRead *activeNetworkRead) (networkReadResult, error) {
	response := make([]byte, 0, 4096)
	buffer := make([]byte, 1)
	for {
		_ = conn.SetReadDeadline(deadline)
		readBytes, err := conn.Read(buffer)
		if readBytes > 0 {
			response = append(response, buffer[:readBytes]...)
			if len(response) > maxBodyBytes {
				return networkReadResult{}, fmt.Errorf("tcp response exceeds the %d byte limit", maxBodyBytes)
			}
			if bytes.HasSuffix(response, delimiter) {
				return networkReadResult{
					data:        response,
					reason:      "delimiter",
					complete:    true,
					frameLength: len(response),
				}, nil
			}
		}
		if err == nil {
			continue
		}
		if errors.Is(err, io.EOF) {
			return networkReadResult{
				data:             response,
				reason:           "connection-close",
				connectionClosed: true,
			}, nil
		}
		if networkError, ok := err.(net.Error); ok && networkError.Timeout() {
			if activeRead.wasStopped() {
				return stoppedNetworkReadResult(response, activeRead), nil
			}
			return networkReadResult{data: response, reason: "timeout"}, nil
		}
		if activeRead.wasStopped() {
			return stoppedNetworkReadResult(response, activeRead), nil
		}
		return networkReadResult{}, fmt.Errorf("tcp read failed: %w", err)
	}
}

func readTCPLengthPrefixed(
	conn net.Conn,
	request networkRequest,
	deadline time.Time,
	activeRead *activeNetworkRead,
) (networkReadResult, error) {
	prefixBytes := request.LengthPrefixBytes
	if prefixBytes != 1 && prefixBytes != 2 && prefixBytes != 4 && prefixBytes != 8 {
		return networkReadResult{}, errors.New("length prefix must use 1, 2, 4, or 8 bytes")
	}

	prefixResult, err := readTCPExact(conn, prefixBytes, deadline, activeRead)
	if err != nil || !prefixResult.complete {
		prefixResult.reason = firstNonEmpty(prefixResult.reason, "length-prefix")
		return prefixResult, err
	}

	var frameLength uint64
	endian := strings.ToLower(strings.TrimSpace(request.LengthPrefixEndian))
	if endian != "big" && endian != "little" {
		return networkReadResult{}, errors.New("length prefix endian must be big or little")
	}
	if prefixBytes == 1 {
		frameLength = uint64(prefixResult.data[0])
	} else if endian == "little" {
		switch prefixBytes {
		case 2:
			frameLength = uint64(binary.LittleEndian.Uint16(prefixResult.data))
		case 4:
			frameLength = uint64(binary.LittleEndian.Uint32(prefixResult.data))
		case 8:
			frameLength = binary.LittleEndian.Uint64(prefixResult.data)
		}
	} else {
		switch prefixBytes {
		case 2:
			frameLength = uint64(binary.BigEndian.Uint16(prefixResult.data))
		case 4:
			frameLength = uint64(binary.BigEndian.Uint32(prefixResult.data))
		case 8:
			frameLength = binary.BigEndian.Uint64(prefixResult.data)
		}
	}
	maxFrameLength := uint64(maxBodyBytes - prefixBytes)
	if frameLength > maxFrameLength {
		return networkReadResult{}, fmt.Errorf("length-prefixed frame exceeds the %d byte limit", maxBodyBytes)
	}

	bodyResult, err := readTCPExact(conn, int(frameLength), deadline, activeRead)
	bodyResult.data = append(prefixResult.data, bodyResult.data...)
	bodyResult.frameLength = int(frameLength)
	if bodyResult.complete {
		bodyResult.reason = "length-prefix"
	}
	return bodyResult, err
}

func minInt(left int, right int) int {
	if left < right {
		return left
	}
	return right
}

func encodeNetworkResponse(data []byte) (string, string) {
	if utf8.Valid(data) {
		return string(data), "utf-8"
	}
	return base64.StdEncoding.EncodeToString(data), "base64"
}
