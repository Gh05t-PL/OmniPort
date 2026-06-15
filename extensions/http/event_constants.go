package main

const (
	eventClientLog = "clientLog"

	eventExtensionHealthCheck = "extensionHealthCheck"
	eventExtensionHealthPong  = "extensionHealthPong"

	eventHTTPRequest   = "httpRequest"
	eventFetchPosts    = "fetchPosts"
	eventHTTPRequestAck = "httpRequestAck"
	eventHTTPFetchResult = "httpFetchResult"
	eventHTTPFetchError  = "httpFetchError"

	eventGRPCRequest        = "grpcRequest"
	eventGRPCRequestAck     = "grpcRequestAck"
	eventGRPCRequestResult  = "grpcRequestResult"
	eventGRPCRequestError   = "grpcRequestError"
	eventGRPCDescribe       = "grpcDescribe"
	eventGRPCDescribeAck    = "grpcDescribeAck"
	eventGRPCDescribeResult = "grpcDescribeResult"
	eventGRPCDescribeError  = "grpcDescribeError"

	eventNetworkRequest        = "networkRequest"
	eventNetworkRequestAck     = "networkRequestAck"
	eventNetworkRequestResult  = "networkRequestResult"
	eventNetworkRequestError   = "networkRequestError"
	eventNetworkStopRead       = "networkStopRead"
	eventNetworkStopReadAck    = "networkStopReadAck"
	eventNetworkStopReadResult = "networkStopReadResult"
	eventNetworkClose          = "networkClose"
	eventNetworkCloseAck       = "networkCloseAck"
	eventNetworkCloseResult    = "networkCloseResult"

	eventWSConnect       = "wsConnect"
	eventWSConnectAck    = "wsConnectAck"
	eventWSConnectResult = "wsConnectResult"
	eventWSConnectError  = "wsConnectError"
	eventWSSend          = "wsSend"
	eventWSSendAck       = "wsSendAck"
	eventWSSendResult    = "wsSendResult"
	eventWSSendError     = "wsSendError"
	eventWSClose         = "wsClose"
	eventWSCloseAck      = "wsCloseAck"
	eventWSCloseResult   = "wsCloseResult"
	eventWSClosed        = "wsClosed"
	eventWSError         = "wsError"
	eventWSMessage       = "wsMessage"
)
