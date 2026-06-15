package main

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptrace"
	"net/textproto"
	"net/url"
	"strings"
	"time"
)

func (client *extensionClient) handleFetch(_ context.Context, raw json.RawMessage) {
	request := fetchRequest{
		RequestID: newRequestID(),
		URL:       defaultEndpoint,
		Method:    http.MethodGet,
	}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &request)
	}
	if request.URL == "" {
		request.URL = defaultEndpoint
	}
	if request.Method == "" {
		request.Method = http.MethodGet
	}

	if client.ackRequestOrReplay(
		request.RequestID,
		eventHTTPRequestAck,
		requestAckPayload(request.RequestID),
		"http replay requestId=%s done=%t",
		request.RequestID,
	) {
		return
	}
	logExtension("http start requestId=%s method=%s host=%s disableReuse=%t", request.RequestID, request.Method, requestHost(request.URL), request.DisableReuse)

	start := time.Now()
	requestCtx, cancel := context.WithTimeout(context.Background(), httpRequestTimeout)
	defer cancel()
	payload, err := fetchURL(requestCtx, request, request.DisableReuse)
	if err != nil {
		errorPayload := requestErrorPayload(request.RequestID, err.Error(), nil)
		client.finishRequest(request.RequestID, eventHTTPFetchError, errorPayload)
		logExtension("http error requestId=%s elapsedMs=%d error=%s", request.RequestID, time.Since(start).Milliseconds(), singleLine(err.Error()))
		return
	}

	payload["requestId"] = request.RequestID
	payload["elapsedMs"] = time.Since(start).Milliseconds()
	client.finishRequest(request.RequestID, eventHTTPFetchResult, payload)
	logExtension("http result requestId=%s status=%v elapsedMs=%d", request.RequestID, payload["status"], payload["elapsedMs"])
}

func fetchURL(ctx context.Context, fetchRequest fetchRequest, disableReuse bool) (map[string]any, error) {
	parsed, err := url.Parse(fetchRequest.URL)
	if err != nil {
		return nil, fmt.Errorf("invalid url: %w", err)
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return nil, errors.New("only http and https urls are allowed")
	}

	requestStart := time.Now()
	trace := newTraceRecorder(requestStart)
	bodyReader, generatedContentType, err := buildFetchRequestBody(fetchRequest)
	if err != nil {
		return nil, err
	}
	request, err := http.NewRequestWithContext(
		httptrace.WithClientTrace(ctx, trace.clientTrace()),
		strings.ToUpper(fetchRequest.Method),
		fetchRequest.URL,
		bodyReader,
	)
	if err != nil {
		return nil, fmt.Errorf("request create failed: %w", err)
	}
	for key, value := range fetchRequest.Headers {
		if strings.TrimSpace(key) != "" {
			if generatedContentType != "" && strings.EqualFold(strings.TrimSpace(key), "Content-Type") {
				continue
			}
			request.Header.Set(strings.TrimSpace(key), value)
		}
	}
	if generatedContentType != "" {
		request.Header.Set("Content-Type", generatedContentType)
	}

	httpClient := sharedHTTPClient
	if disableReuse {
		transport := sharedHTTPTransport.Clone()
		transport.DisableKeepAlives = true
		httpClient = &http.Client{
			Transport: transport,
			Timeout:   httpRequestTimeout,
		}
		defer transport.CloseIdleConnections()
	}
	response, err := httpClient.Do(request)
	if err != nil {
		return nil, fmt.Errorf("http request failed: %w", err)
	}
	defer response.Body.Close()

	bodyReadStart := time.Now()
	body, err := io.ReadAll(io.LimitReader(response.Body, maxBodyBytes+1))
	if err != nil {
		return nil, fmt.Errorf("response read failed: %w", err)
	}
	bodyReadMs := time.Since(bodyReadStart).Milliseconds()

	truncated := len(body) > maxBodyBytes
	if truncated {
		body = body[:maxBodyBytes]
	}

	headers := make(map[string]string, len(response.Header))
	for key, values := range response.Header {
		headers[strings.ToLower(key)] = strings.Join(values, ", ")
	}

	return map[string]any{
		"url":            fetchRequest.URL,
		"method":         strings.ToUpper(fetchRequest.Method),
		"status":         response.StatusCode,
		"statusText":     statusText(response),
		"httpVersion":    response.Proto,
		"httpProtoMajor": response.ProtoMajor,
		"httpProtoMinor": response.ProtoMinor,
		"headers":        headers,
		"body":           string(body),
		"truncated":      truncated,
		"timings":        trace.timings(bodyReadMs, time.Since(requestStart).Milliseconds(), disableReuse),
	}, nil
}

func buildFetchRequestBody(request fetchRequest) (io.Reader, string, error) {
	if request.BodyType != "multipart" {
		if request.Body == "" {
			return nil, "", nil
		}
		return strings.NewReader(request.Body), "", nil
	}

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	var totalFileBytes int
	for _, part := range request.Multipart {
		name := strings.TrimSpace(part.Name)
		if name == "" {
			continue
		}

		if part.Type != "file" {
			if err := writer.WriteField(name, part.Value); err != nil {
				return nil, "", fmt.Errorf("multipart text field %q failed: %w", name, err)
			}
			continue
		}

		fileName := strings.TrimSpace(part.FileName)
		if fileName == "" {
			return nil, "", fmt.Errorf("multipart file name is required for field %q", name)
		}
		fileData, err := base64.StdEncoding.DecodeString(part.DataBase64)
		if err != nil {
			return nil, "", fmt.Errorf("multipart file %q has invalid base64 data: %w", fileName, err)
		}
		if len(fileData) > maxMultipartFileBytes {
			return nil, "", fmt.Errorf(
				"multipart file %q exceeds the %d MB limit",
				fileName,
				maxMultipartFileBytes/(1024*1024),
			)
		}
		totalFileBytes += len(fileData)
		if totalFileBytes > maxMultipartTotalBytes {
			return nil, "", fmt.Errorf(
				"multipart files exceed the %d MB total limit",
				maxMultipartTotalBytes/(1024*1024),
			)
		}

		contentType := singleLine(part.ContentType)
		if contentType == "" {
			contentType = "application/octet-stream"
		}
		headers := make(textproto.MIMEHeader)
		headers.Set(
			"Content-Disposition",
			fmt.Sprintf(
				`form-data; name="%s"; filename="%s"`,
				escapeMultipartHeaderValue(name),
				escapeMultipartHeaderValue(fileName),
			),
		)
		headers.Set("Content-Type", contentType)
		filePart, err := writer.CreatePart(headers)
		if err != nil {
			return nil, "", fmt.Errorf("multipart file part %q failed: %w", fileName, err)
		}
		if _, err := filePart.Write(fileData); err != nil {
			return nil, "", fmt.Errorf("multipart file write %q failed: %w", fileName, err)
		}
	}

	if err := writer.Close(); err != nil {
		return nil, "", fmt.Errorf("multipart body close failed: %w", err)
	}
	return bytes.NewReader(body.Bytes()), writer.FormDataContentType(), nil
}

func escapeMultipartHeaderValue(value string) string {
	value = strings.ReplaceAll(value, "\r", "")
	value = strings.ReplaceAll(value, "\n", "")
	value = strings.ReplaceAll(value, `\`, `\\`)
	return strings.ReplaceAll(value, `"`, `\"`)
}

func statusText(response *http.Response) string {
	prefix := fmt.Sprintf("%d", response.StatusCode)
	return strings.TrimSpace(strings.TrimPrefix(response.Status, prefix))
}

func newTraceRecorder(start time.Time) *traceRecorder {
	return &traceRecorder{start: start}
}

func (trace *traceRecorder) clientTrace() *httptrace.ClientTrace {
	return &httptrace.ClientTrace{
		DNSStart: func(httptrace.DNSStartInfo) {
			trace.dnsStart = time.Now()
		},
		DNSDone: func(httptrace.DNSDoneInfo) {
			trace.dnsMs = elapsedSince(trace.dnsStart)
		},
		ConnectStart: func(_, _ string) {
			trace.connectStart = time.Now()
		},
		ConnectDone: func(_, _ string, _ error) {
			trace.connectMs = elapsedSince(trace.connectStart)
		},
		TLSHandshakeStart: func() {
			trace.tlsStart = time.Now()
		},
		TLSHandshakeDone: func(_ tls.ConnectionState, _ error) {
			trace.tlsHandshakeMs = elapsedSince(trace.tlsStart)
		},
		GotConn: func(info httptrace.GotConnInfo) {
			trace.gotConnectionMs = time.Since(trace.start).Milliseconds()
			trace.reusedConnection = info.Reused
			trace.connectionWasIdle = info.WasIdle
			if info.WasIdle {
				trace.connectionIdleTimeMs = info.IdleTime.Milliseconds()
			}
		},
		GotFirstResponseByte: func() {
			trace.timeToFirstByteMs = time.Since(trace.start).Milliseconds()
		},
	}
}

func (trace *traceRecorder) timings(bodyReadMs int64, totalMs int64, disableReuse bool) map[string]any {
	return map[string]any{
		"totalMs":              totalMs,
		"dnsMs":                trace.dnsMs,
		"connectMs":            trace.connectMs,
		"tlsHandshakeMs":       trace.tlsHandshakeMs,
		"gotConnectionMs":      trace.gotConnectionMs,
		"timeToFirstByteMs":    trace.timeToFirstByteMs,
		"bodyReadMs":           bodyReadMs,
		"reusedConnection":     trace.reusedConnection,
		"disableReuse":         disableReuse,
		"connectionWasIdle":    trace.connectionWasIdle,
		"connectionIdleTimeMs": trace.connectionIdleTimeMs,
	}
}

func elapsedSince(start time.Time) int64 {
	if start.IsZero() {
		return 0
	}
	return time.Since(start).Milliseconds()
}
