package main

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/fullstorydev/grpcurl"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"nhooyr.io/websocket"
)

const (
	defaultEndpoint            = "https://jsonplaceholder.typicode.com/posts"
	maxBodyBytes               = 1024 * 1024
	maxMultipartFileBytes      = 8 * 1024 * 1024
	maxMultipartTotalBytes     = 16 * 1024 * 1024
	neutralinoIPCReadLimit     = 32 * 1024 * 1024
	httpRequestTimeout         = 15 * time.Second
	grpcRequestTimeout         = 30 * time.Second
	grpcProtoFileMaxBytes      = 2 * 1024 * 1024
	grpcSchemaMaxBytes         = 8 * 1024 * 1024
	grpcProtoFileMaxCount      = 128
	networkDefaultTimeout      = 5 * time.Second
	networkMaxTimeout          = 60 * time.Second
	networkTCPIdleReadTimeout  = 200 * time.Millisecond
	targetWebsocketDialTimeout = 15 * time.Second
	websocketDialTimeout       = 5 * time.Second
	websocketPingInterval      = 3 * time.Second
	websocketPingTimeout       = 2 * time.Second
	websocketReconnectDelay    = 2 * time.Second
	websocketReconnectMaxDelay = 30 * time.Second
	websocketStatusGoingAway   = 1001
	websocketWriteTimeout      = 5 * time.Second
	requestReplayTTL           = 5 * time.Minute
	requestReplayMaxEntries    = 200
	logAppName                 = "omniport"
	logEnv                     = "OMNIPORT_LOG"
	logDirEnv                  = "OMNIPORT_LOG_DIR"
	logMaxBytesEnv             = "OMNIPORT_LOG_MAX_BYTES"
	defaultLogMaxBytes         = 2 * 1024 * 1024
)

var errNeutralinoClosed = errors.New("neutralino host closed")

var sharedHTTPTransport = http.DefaultTransport.(*http.Transport).Clone()
var sharedHTTPClient = &http.Client{
	Transport: sharedHTTPTransport,
	Timeout:   httpRequestTimeout,
}
var activeConnection activeClientRegistry
var pendingEvents pendingEventQueue
var requestReplays requestReplayStore
var targetWebsockets targetWebsocketRegistry
var targetTCPConnections targetTCPConnectionRegistry
var activeNetworkReads activeNetworkReadRegistry
var extensionLogger = newFileLogger("extension")

type neutralinoMessage struct {
	Event string          `json:"event"`
	Data  json.RawMessage `json:"data"`
}

type fetchRequest struct {
	RequestID    string            `json:"requestId"`
	URL          string            `json:"url"`
	Method       string            `json:"method"`
	Headers      map[string]string `json:"headers"`
	Body         string            `json:"body"`
	BodyType     string            `json:"bodyType"`
	Multipart    []multipartPart   `json:"multipart"`
	DisableReuse bool              `json:"disableReuse"`
}

type multipartPart struct {
	Name        string `json:"name"`
	Type        string `json:"type"`
	Value       string `json:"value"`
	FileName    string `json:"fileName"`
	ContentType string `json:"contentType"`
	DataBase64  string `json:"dataBase64"`
}

type grpcRequest struct {
	RequestID      string            `json:"requestId"`
	Target         string            `json:"target"`
	Service        string            `json:"service"`
	Method         string            `json:"method"`
	Metadata       map[string]string `json:"metadata"`
	Body           string            `json:"body"`
	SchemaMode     string            `json:"schemaMode"`
	ProtoFiles     []grpcProtoFile   `json:"protoFiles"`
	ProtosetBase64 string            `json:"protosetBase64"`
}

type grpcProtoFile struct {
	Name    string `json:"name"`
	Content string `json:"content"`
}

type grpcServiceDescription struct {
	Name    string                  `json:"name"`
	Methods []grpcMethodDescription `json:"methods"`
}

type grpcMethodDescription struct {
	Name            string           `json:"name"`
	FullName        string           `json:"fullName"`
	InputType       string           `json:"inputType"`
	OutputType      string           `json:"outputType"`
	ClientStreaming bool             `json:"clientStreaming"`
	ServerStreaming bool             `json:"serverStreaming"`
	RequestTemplate any              `json:"requestTemplate"`
	RequestSchema   *grpcValueSchema `json:"requestSchema"`
}

type grpcValueSchema struct {
	Kind       string            `json:"kind"`
	TypeName   string            `json:"typeName,omitempty"`
	Fields     []grpcFieldSchema `json:"fields,omitempty"`
	EnumValues []string          `json:"enumValues,omitempty"`
	Truncated  bool              `json:"truncated,omitempty"`
	AllowAny   bool              `json:"allowAny,omitempty"`
}

type grpcFieldSchema struct {
	Name      string           `json:"name"`
	ProtoName string           `json:"protoName"`
	Oneof     string           `json:"oneof,omitempty"`
	Required  bool             `json:"required,omitempty"`
	Repeated  bool             `json:"repeated,omitempty"`
	Map       bool             `json:"map,omitempty"`
	MapKey    *grpcValueSchema `json:"mapKey,omitempty"`
	Value     *grpcValueSchema `json:"value"`
}

type networkRequest struct {
	RequestID          string  `json:"requestId"`
	ConnectionID       string  `json:"connectionId"`
	Protocol           string  `json:"protocol"`
	Target             string  `json:"target"`
	Payload            string  `json:"payload"`
	PayloadBase64      *string `json:"payloadBase64"`
	TimeoutMs          int     `json:"timeoutMs"`
	ReadMode           string  `json:"readMode"`
	ExactBytes         int     `json:"exactBytes"`
	DelimiterBase64    string  `json:"delimiterBase64"`
	LengthPrefixBytes  int     `json:"lengthPrefixBytes"`
	LengthPrefixEndian string  `json:"lengthPrefixEndian"`
	KeepConnection     bool    `json:"keepConnection"`
}

type networkControlRequest struct {
	RequestID       string `json:"requestId"`
	ActiveRequestID string `json:"activeRequestId"`
	ConnectionID    string `json:"connectionId"`
}

type websocketConnectRequest struct {
	RequestID    string            `json:"requestId"`
	ConnectionID string            `json:"connectionId"`
	URL          string            `json:"url"`
	Headers      map[string]string `json:"headers"`
}

type websocketSendRequest struct {
	RequestID    string `json:"requestId"`
	ConnectionID string `json:"connectionId"`
	Message      string `json:"message"`
}

type websocketCloseRequest struct {
	RequestID    string `json:"requestId"`
	ConnectionID string `json:"connectionId"`
	Reason       string `json:"reason"`
}

type neutralinoAuthInfo struct {
	Port         string `json:"nlPort"`
	Token        string `json:"nlToken"`
	ConnectToken string `json:"nlConnectToken"`
	ExtensionID  string `json:"nlExtensionId"`
}

type extensionClient struct {
	conn             *websocket.Conn
	accessToken      string
	connectionErrors chan<- error
	mu               sync.Mutex
}

type outboundEvent struct {
	event string
	data  any
}

type pendingEventQueue struct {
	mu     sync.Mutex
	events []outboundEvent
}

type activeClientRegistry struct {
	mu     sync.Mutex
	client *extensionClient
}

type replayedRequest struct {
	createdAt time.Time
	done      bool
	event     string
	data      any
}

type requestReplayStore struct {
	mu      sync.Mutex
	entries map[string]replayedRequest
}

type targetWebsocketConnection struct {
	id       string
	url      string
	ctx      context.Context
	conn     *websocket.Conn
	cancel   context.CancelFunc
	openedAt time.Time
	mu       sync.Mutex
}

type targetWebsocketRegistry struct {
	mu      sync.Mutex
	entries map[string]*targetWebsocketConnection
}

type targetTCPConnection struct {
	id       string
	target   string
	conn     net.Conn
	openedAt time.Time
	ioMu     sync.Mutex
}

type targetTCPConnectionRegistry struct {
	mu      sync.Mutex
	entries map[string]*targetTCPConnection
}

type activeNetworkRead struct {
	conn    net.Conn
	mu      sync.Mutex
	stopped bool
	closed  bool
}

type activeNetworkReadRegistry struct {
	mu      sync.Mutex
	entries map[string]*activeNetworkRead
}

type fileLogger struct {
	component string
	enabled   bool
	dir       string
	maxBytes  int64
	mu        sync.Mutex
}

type traceRecorder struct {
	start                time.Time
	dnsStart             time.Time
	connectStart         time.Time
	tlsStart             time.Time
	gotConnectionMs      int64
	dnsMs                int64
	connectMs            int64
	tlsHandshakeMs       int64
	timeToFirstByteMs    int64
	reusedConnection     bool
	connectionWasIdle    bool
	connectionIdleTimeMs int64
}

type grpcEventHandler struct {
	formatter grpcurl.Formatter
	method    string
	headers   metadata.MD
	trailers  metadata.MD
	status    *status.Status
	responses []string
}
