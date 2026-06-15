package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"path"
	"sort"
	"strings"
	"time"

	"github.com/fullstorydev/grpcurl"
	"github.com/golang/protobuf/proto"
	"github.com/jhump/protoreflect/desc"
	"github.com/jhump/protoreflect/desc/protoparse"
	"github.com/jhump/protoreflect/grpcreflect"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/descriptorpb"
)

func (client *extensionClient) handleGRPCEvent(event string, raw json.RawMessage) {
	switch {
	case eventMatches(event, eventGRPCDescribe):
		client.handleGRPCDescribe(raw)
	default:
		client.handleGRPC(raw)
	}
}

func (client *extensionClient) handleGRPC(raw json.RawMessage) {
	request := grpcRequest{
		RequestID: newRequestID(),
	}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &request)
	}

	if client.ackRequestOrReplay(
		request.RequestID,
		eventGRPCRequestAck,
		requestAckPayload(request.RequestID),
		"grpc replay requestId=%s done=%t",
		request.RequestID,
	) {
		return
	}
	logExtension(
		"grpc start requestId=%s target=%s method=%s/%s schemaMode=%s",
		request.RequestID,
		singleLine(request.Target),
		singleLine(request.Service),
		singleLine(request.Method),
		singleLine(request.SchemaMode),
	)

	start := time.Now()
	payload, err := invokeGRPC(context.Background(), request)
	if err != nil {
		errorPayload := requestErrorPayload(request.RequestID, err.Error(), nil)
		client.finishRequest(request.RequestID, eventGRPCRequestError, errorPayload)
		logExtension("grpc error requestId=%s elapsedMs=%d error=%s", request.RequestID, time.Since(start).Milliseconds(), singleLine(err.Error()))
		return
	}

	payload["requestId"] = request.RequestID
	payload["elapsedMs"] = time.Since(start).Milliseconds()
	client.finishRequest(request.RequestID, eventGRPCRequestResult, payload)
	logExtension("grpc result requestId=%s status=%v elapsedMs=%d", request.RequestID, payload["status"], payload["elapsedMs"])
}

func (client *extensionClient) handleGRPCDescribe(raw json.RawMessage) {
	request := grpcRequest{
		RequestID: newRequestID(),
	}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &request)
	}

	if client.ackRequestOrReplay(
		request.RequestID,
		eventGRPCDescribeAck,
		requestAckPayload(request.RequestID),
		"grpc describe replay requestId=%s done=%t",
		request.RequestID,
	) {
		return
	}
	logExtension(
		"grpc describe start requestId=%s target=%s schemaMode=%s",
		request.RequestID,
		singleLine(request.Target),
		singleLine(request.SchemaMode),
	)

	start := time.Now()
	payload, err := describeGRPC(context.Background(), request)
	if err != nil {
		errorPayload := requestErrorPayload(request.RequestID, err.Error(), nil)
		client.finishRequest(request.RequestID, eventGRPCDescribeError, errorPayload)
		logExtension("grpc describe error requestId=%s elapsedMs=%d error=%s", request.RequestID, time.Since(start).Milliseconds(), singleLine(err.Error()))
		return
	}

	payload["requestId"] = request.RequestID
	payload["elapsedMs"] = time.Since(start).Milliseconds()
	client.finishRequest(request.RequestID, eventGRPCDescribeResult, payload)
	logExtension("grpc describe result requestId=%s services=%d elapsedMs=%d", request.RequestID, len(payload["services"].([]grpcServiceDescription)), payload["elapsedMs"])
}

func describeGRPC(ctx context.Context, request grpcRequest) (map[string]any, error) {
	ctx, cancel := context.WithTimeout(ctx, grpcRequestTimeout)
	defer cancel()

	schemaMode := strings.ToLower(strings.TrimSpace(request.SchemaMode))
	if schemaMode == "" {
		schemaMode = "reflection"
	}

	var conn *grpc.ClientConn
	if schemaMode == "reflection" {
		if strings.TrimSpace(request.Target) == "" {
			return nil, errors.New("gRPC target is required for reflection")
		}
		var err error
		conn, err = grpcurl.BlockingDial(
			ctx,
			"tcp",
			strings.TrimSpace(request.Target),
			insecure.NewCredentials(),
		)
		if err != nil {
			return nil, fmt.Errorf("grpc describe dial failed: %w", err)
		}
		defer conn.Close()
	}

	descriptorSource, releaseDescriptorSource, schemaMode, err := grpcDescriptorSource(ctx, conn, request)
	if err != nil {
		return nil, err
	}
	defer releaseDescriptorSource()

	serviceNames, err := descriptorSource.ListServices()
	if err != nil {
		return nil, grpcDescriptorError(schemaMode, fmt.Errorf("grpc service discovery failed: %w", err))
	}
	sort.Strings(serviceNames)

	services := make([]grpcServiceDescription, 0, len(serviceNames))
	for _, serviceName := range serviceNames {
		if strings.HasPrefix(serviceName, "grpc.reflection.") {
			continue
		}
		symbol, err := descriptorSource.FindSymbol(serviceName)
		if err != nil {
			return nil, grpcDescriptorError(
				schemaMode,
				fmt.Errorf("grpc service %q descriptor failed: %w", serviceName, err),
			)
		}
		service, ok := symbol.(*desc.ServiceDescriptor)
		if !ok {
			continue
		}

		methods := make([]grpcMethodDescription, 0, len(service.GetMethods()))
		for _, method := range service.GetMethods() {
			requestSchema := grpcSchemaForMessage(method.GetInputType(), 0, map[string]bool{})
			methods = append(methods, grpcMethodDescription{
				Name:            method.GetName(),
				FullName:        method.GetFullyQualifiedName(),
				InputType:       method.GetInputType().GetFullyQualifiedName(),
				OutputType:      method.GetOutputType().GetFullyQualifiedName(),
				ClientStreaming: method.IsClientStreaming(),
				ServerStreaming: method.IsServerStreaming(),
				RequestTemplate: grpcTemplateForSchema(requestSchema),
				RequestSchema:   requestSchema,
			})
		}
		sort.Slice(methods, func(left int, right int) bool {
			return methods[left].Name < methods[right].Name
		})
		services = append(services, grpcServiceDescription{
			Name:    service.GetFullyQualifiedName(),
			Methods: methods,
		})
	}

	return map[string]any{
		"schemaMode": schemaMode,
		"services":   services,
	}, nil
}

func grpcSchemaForMessage(
	message *desc.MessageDescriptor,
	depth int,
	stack map[string]bool,
) *grpcValueSchema {
	if message == nil {
		return &grpcValueSchema{Kind: "any", AllowAny: true}
	}
	typeName := message.GetFullyQualifiedName()
	if wellKnownSchema := grpcWellKnownSchema(typeName); wellKnownSchema != nil {
		return wellKnownSchema
	}
	if depth >= 8 || stack[typeName] {
		return &grpcValueSchema{
			Kind:      "message",
			TypeName:  typeName,
			Truncated: true,
		}
	}

	stack[typeName] = true
	defer delete(stack, typeName)

	fields := make([]grpcFieldSchema, 0, len(message.GetFields()))
	for _, field := range message.GetFields() {
		fieldSchema := grpcFieldSchema{
			Name:      field.GetJSONName(),
			ProtoName: field.GetName(),
			Required:  field.IsRequired(),
			Repeated:  field.IsRepeated(),
		}
		if oneof := field.GetOneOf(); oneof != nil && !oneof.IsSynthetic() {
			fieldSchema.Oneof = oneof.GetName()
		}
		if field.IsMap() {
			fieldSchema.Map = true
			fieldSchema.Repeated = false
			if field.GetMapKeyType() != nil {
				fieldSchema.MapKey = grpcSchemaForField(field.GetMapKeyType(), depth+1, stack)
			}
			if field.GetMapValueType() != nil {
				fieldSchema.Value = grpcSchemaForField(field.GetMapValueType(), depth+1, stack)
			}
		} else {
			fieldSchema.Value = grpcSchemaForField(field, depth+1, stack)
		}
		if fieldSchema.Value == nil {
			fieldSchema.Value = &grpcValueSchema{Kind: "any", AllowAny: true}
		}
		fields = append(fields, fieldSchema)
	}

	return &grpcValueSchema{
		Kind:     "message",
		TypeName: typeName,
		Fields:   fields,
	}
}

func grpcSchemaForField(
	field *desc.FieldDescriptor,
	depth int,
	stack map[string]bool,
) *grpcValueSchema {
	switch field.AsFieldDescriptorProto().GetType() {
	case descriptorpb.FieldDescriptorProto_TYPE_DOUBLE:
		return &grpcValueSchema{Kind: "double"}
	case descriptorpb.FieldDescriptorProto_TYPE_FLOAT:
		return &grpcValueSchema{Kind: "float"}
	case descriptorpb.FieldDescriptorProto_TYPE_INT64,
		descriptorpb.FieldDescriptorProto_TYPE_SINT64,
		descriptorpb.FieldDescriptorProto_TYPE_SFIXED64:
		return &grpcValueSchema{Kind: "int64"}
	case descriptorpb.FieldDescriptorProto_TYPE_UINT64,
		descriptorpb.FieldDescriptorProto_TYPE_FIXED64:
		return &grpcValueSchema{Kind: "uint64"}
	case descriptorpb.FieldDescriptorProto_TYPE_INT32,
		descriptorpb.FieldDescriptorProto_TYPE_SINT32,
		descriptorpb.FieldDescriptorProto_TYPE_SFIXED32:
		return &grpcValueSchema{Kind: "int32"}
	case descriptorpb.FieldDescriptorProto_TYPE_UINT32,
		descriptorpb.FieldDescriptorProto_TYPE_FIXED32:
		return &grpcValueSchema{Kind: "uint32"}
	case descriptorpb.FieldDescriptorProto_TYPE_BOOL:
		return &grpcValueSchema{Kind: "bool"}
	case descriptorpb.FieldDescriptorProto_TYPE_STRING:
		return &grpcValueSchema{Kind: "string"}
	case descriptorpb.FieldDescriptorProto_TYPE_BYTES:
		return &grpcValueSchema{Kind: "bytes"}
	case descriptorpb.FieldDescriptorProto_TYPE_ENUM:
		values := []string{}
		if field.GetEnumType() != nil {
			values = make([]string, 0, len(field.GetEnumType().GetValues()))
			for _, value := range field.GetEnumType().GetValues() {
				values = append(values, value.GetName())
			}
		}
		return &grpcValueSchema{
			Kind:       "enum",
			TypeName:   field.AsFieldDescriptorProto().GetTypeName(),
			EnumValues: values,
		}
	case descriptorpb.FieldDescriptorProto_TYPE_MESSAGE,
		descriptorpb.FieldDescriptorProto_TYPE_GROUP:
		if field.GetMessageType() != nil {
			return grpcSchemaForMessage(field.GetMessageType(), depth, stack)
		}
		return &grpcValueSchema{Kind: "message", Truncated: true}
	default:
		return &grpcValueSchema{Kind: "any", AllowAny: true}
	}
}

func grpcWellKnownSchema(typeName string) *grpcValueSchema {
	switch typeName {
	case "google.protobuf.DoubleValue":
		return &grpcValueSchema{Kind: "double", TypeName: typeName}
	case "google.protobuf.FloatValue":
		return &grpcValueSchema{Kind: "float", TypeName: typeName}
	case "google.protobuf.Int64Value":
		return &grpcValueSchema{Kind: "int64", TypeName: typeName}
	case "google.protobuf.UInt64Value":
		return &grpcValueSchema{Kind: "uint64", TypeName: typeName}
	case "google.protobuf.Int32Value":
		return &grpcValueSchema{Kind: "int32", TypeName: typeName}
	case "google.protobuf.UInt32Value":
		return &grpcValueSchema{Kind: "uint32", TypeName: typeName}
	case "google.protobuf.BoolValue":
		return &grpcValueSchema{Kind: "bool", TypeName: typeName}
	case "google.protobuf.StringValue",
		"google.protobuf.Timestamp",
		"google.protobuf.Duration",
		"google.protobuf.FieldMask":
		return &grpcValueSchema{Kind: "string", TypeName: typeName}
	case "google.protobuf.BytesValue":
		return &grpcValueSchema{Kind: "bytes", TypeName: typeName}
	case "google.protobuf.Struct", "google.protobuf.Any":
		return &grpcValueSchema{Kind: "object", TypeName: typeName, AllowAny: true}
	case "google.protobuf.ListValue":
		return &grpcValueSchema{Kind: "array", TypeName: typeName, AllowAny: true}
	case "google.protobuf.Value":
		return &grpcValueSchema{Kind: "any", TypeName: typeName, AllowAny: true}
	}
	return nil
}

func grpcTemplateForSchema(schema *grpcValueSchema) any {
	if schema == nil {
		return map[string]any{}
	}
	switch schema.Kind {
	case "message":
		template := make(map[string]any, len(schema.Fields))
		selectedOneofs := make(map[string]bool)
		for _, field := range schema.Fields {
			if field.Oneof != "" {
				if selectedOneofs[field.Oneof] {
					continue
				}
				selectedOneofs[field.Oneof] = true
			}
			switch {
			case field.Repeated:
				template[field.Name] = []any{grpcTemplateForSchema(field.Value)}
			case field.Map:
				template[field.Name] = map[string]any{
					grpcTemplateMapKey(field.MapKey): grpcTemplateForSchema(field.Value),
				}
			default:
				template[field.Name] = grpcTemplateForSchema(field.Value)
			}
		}
		return template
	case "object":
		return map[string]any{}
	case "array":
		return []any{}
	case "bool":
		return false
	case "int64", "uint64":
		return "0"
	case "int32", "uint32", "float", "double":
		return 0
	case "enum":
		if len(schema.EnumValues) > 0 {
			return schema.EnumValues[0]
		}
		return ""
	case "any":
		return nil
	default:
		switch schema.TypeName {
		case "google.protobuf.Timestamp":
			return "1970-01-01T00:00:00Z"
		case "google.protobuf.Duration":
			return "0s"
		}
		return ""
	}
}

func grpcTemplateMapKey(schema *grpcValueSchema) string {
	if schema == nil {
		return "key"
	}
	switch schema.Kind {
	case "bool":
		return "false"
	case "int32", "uint32", "int64", "uint64":
		return "0"
	default:
		return "key"
	}
}

func invokeGRPC(ctx context.Context, request grpcRequest) (map[string]any, error) {
	if strings.TrimSpace(request.Target) == "" {
		return nil, errors.New("gRPC target is required")
	}
	if strings.TrimSpace(request.Service) == "" || strings.TrimSpace(request.Method) == "" {
		return nil, errors.New("gRPC service and method are required")
	}

	start := time.Now()
	ctx, cancel := context.WithTimeout(ctx, grpcRequestTimeout)
	defer cancel()

	dialStart := time.Now()
	conn, err := grpcurl.BlockingDial(ctx, "tcp", strings.TrimSpace(request.Target), insecure.NewCredentials())
	if err != nil {
		return nil, fmt.Errorf("grpc dial failed: %w", err)
	}
	dialMs := time.Since(dialStart).Milliseconds()
	defer conn.Close()

	descriptorSource, releaseDescriptorSource, schemaMode, err := grpcDescriptorSource(ctx, conn, request)
	if err != nil {
		return nil, err
	}
	defer releaseDescriptorSource()

	serviceName := strings.Trim(request.Service, "/")
	if _, err := descriptorSource.FindSymbol(serviceName); err != nil {
		return nil, grpcDescriptorError(schemaMode, fmt.Errorf("grpc service descriptor failed: %w", err))
	}
	body := strings.TrimSpace(request.Body)
	if body == "" {
		body = "{}"
	}

	parser, formatter, err := grpcurl.RequestParserAndFormatter(
		grpcurl.Format("json"),
		descriptorSource,
		strings.NewReader(body),
		grpcurl.FormatOptions{
			EmitJSONDefaultFields: true,
			AllowUnknownFields:    true,
		},
	)
	if err != nil {
		return nil, grpcDescriptorError(schemaMode, fmt.Errorf("grpc request parser failed: %w", err))
	}

	handler := &grpcEventHandler{formatter: formatter}
	headers := grpcHeaders(request.Metadata)
	methodName := fmt.Sprintf("%s/%s", serviceName, strings.Trim(request.Method, "/"))
	invokeStart := time.Now()
	if err := grpcurl.InvokeRPC(ctx, descriptorSource, conn, methodName, headers, handler, parser.Next); err != nil {
		return nil, grpcDescriptorError(schemaMode, fmt.Errorf("grpc invoke failed: %w", err))
	}
	invokeMs := time.Since(invokeStart).Milliseconds()

	statusCode := "OK"
	statusText := ""
	if handler.status != nil {
		statusCode = handler.status.Code().String()
		statusText = handler.status.Message()
	}

	return map[string]any{
		"target":         request.Target,
		"method":         methodName,
		"schemaMode":     schemaMode,
		"status":         statusCode,
		"statusText":     statusText,
		"httpVersion":    "HTTP/2",
		"httpProtoMajor": 2,
		"httpProtoMinor": 0,
		"headers":        metadataToMap(handler.headers),
		"trailers":       metadataToMap(handler.trailers),
		"body":           grpcResponseBody(handler.responses),
		"timings": map[string]any{
			"totalMs":  time.Since(start).Milliseconds(),
			"dialMs":   dialMs,
			"invokeMs": invokeMs,
		},
	}, nil
}

func grpcDescriptorSource(
	ctx context.Context,
	conn grpc.ClientConnInterface,
	request grpcRequest,
) (grpcurl.DescriptorSource, func(), string, error) {
	schemaMode := strings.ToLower(strings.TrimSpace(request.SchemaMode))
	if schemaMode == "" {
		schemaMode = "reflection"
	}

	switch schemaMode {
	case "reflection":
		reflectionClient := grpcreflect.NewClientAuto(ctx, conn)
		return grpcurl.DescriptorSourceFromServer(ctx, reflectionClient), reflectionClient.Reset, schemaMode, nil
	case "proto":
		if len(request.ProtoFiles) == 0 {
			return nil, func() {}, schemaMode, errors.New("gRPC proto schema requires at least one .proto file")
		}
		if len(request.ProtoFiles) > grpcProtoFileMaxCount {
			return nil, func() {}, schemaMode, fmt.Errorf("gRPC proto schema exceeds %d files", grpcProtoFileMaxCount)
		}

		fileContents := make(map[string]string, len(request.ProtoFiles))
		fileNames := make([]string, 0, len(request.ProtoFiles))
		totalBytes := 0
		for _, protoFile := range request.ProtoFiles {
			fileName, err := normalizeGRPCProtoFileName(protoFile.Name)
			if err != nil {
				return nil, func() {}, schemaMode, err
			}
			fileBytes := len(protoFile.Content)
			if fileBytes > grpcProtoFileMaxBytes {
				return nil, func() {}, schemaMode, fmt.Errorf(
					"gRPC proto file %q exceeds %d bytes",
					fileName,
					grpcProtoFileMaxBytes,
				)
			}
			totalBytes += fileBytes
			if totalBytes > grpcSchemaMaxBytes {
				return nil, func() {}, schemaMode, fmt.Errorf(
					"gRPC proto schema exceeds %d bytes",
					grpcSchemaMaxBytes,
				)
			}
			if _, exists := fileContents[fileName]; exists {
				return nil, func() {}, schemaMode, fmt.Errorf("duplicate gRPC proto file %q", fileName)
			}
			fileContents[fileName] = protoFile.Content
			fileNames = append(fileNames, fileName)
		}

		parser := protoparse.Parser{
			Accessor:              protoparse.FileContentsFromMap(fileContents),
			InferImportPaths:      true,
			IncludeSourceCodeInfo: true,
		}
		fileDescriptors, err := parser.ParseFiles(fileNames...)
		if err != nil {
			return nil, func() {}, schemaMode, fmt.Errorf("gRPC proto schema parse failed: %w", err)
		}
		descriptorSource, err := grpcurl.DescriptorSourceFromFileDescriptors(fileDescriptors...)
		if err != nil {
			return nil, func() {}, schemaMode, fmt.Errorf("gRPC proto descriptor source failed: %w", err)
		}
		return descriptorSource, func() {}, schemaMode, nil
	case "protoset":
		if strings.TrimSpace(request.ProtosetBase64) == "" {
			return nil, func() {}, schemaMode, errors.New("gRPC protoset schema is empty")
		}
		decoded, err := base64.StdEncoding.DecodeString(request.ProtosetBase64)
		if err != nil {
			return nil, func() {}, schemaMode, fmt.Errorf("gRPC protoset base64 decode failed: %w", err)
		}
		if len(decoded) > grpcSchemaMaxBytes {
			return nil, func() {}, schemaMode, fmt.Errorf(
				"gRPC protoset exceeds %d bytes",
				grpcSchemaMaxBytes,
			)
		}

		fileDescriptorSet := &descriptorpb.FileDescriptorSet{}
		if err := proto.Unmarshal(decoded, fileDescriptorSet); err != nil {
			return nil, func() {}, schemaMode, fmt.Errorf("gRPC protoset parse failed: %w", err)
		}
		descriptorSource, err := grpcurl.DescriptorSourceFromFileDescriptorSet(fileDescriptorSet)
		if err != nil {
			return nil, func() {}, schemaMode, fmt.Errorf("gRPC protoset descriptor source failed: %w", err)
		}
		return descriptorSource, func() {}, schemaMode, nil
	default:
		return nil, func() {}, schemaMode, fmt.Errorf("unsupported gRPC schema mode %q", schemaMode)
	}
}

func normalizeGRPCProtoFileName(value string) (string, error) {
	fileName := path.Clean(strings.ReplaceAll(strings.TrimSpace(value), "\\", "/"))
	if fileName == "." || fileName == "" || strings.HasPrefix(fileName, "/") || strings.HasPrefix(fileName, "../") {
		return "", fmt.Errorf("invalid gRPC proto file path %q", value)
	}
	if !strings.HasSuffix(strings.ToLower(fileName), ".proto") {
		return "", fmt.Errorf("gRPC schema file %q must use the .proto extension", fileName)
	}
	return fileName, nil
}

func grpcDescriptorError(schemaMode string, err error) error {
	if schemaMode != "reflection" || err == nil {
		return err
	}
	message := strings.ToLower(err.Error())
	if errors.Is(err, grpcurl.ErrReflectionNotSupported) ||
		(strings.Contains(message, "reflection") &&
			(strings.Contains(message, "not supported") || strings.Contains(message, "unimplemented"))) {
		return errors.New("gRPC server does not support reflection; import .proto files or a protoset")
	}
	return err
}

func grpcHeaders(values map[string]string) []string {
	headers := make([]string, 0, len(values))
	for key, value := range values {
		key = strings.TrimSpace(key)
		if key != "" {
			headers = append(headers, fmt.Sprintf("%s: %s", key, strings.TrimSpace(value)))
		}
	}
	return headers
}

func metadataToMap(md metadata.MD) map[string]string {
	result := make(map[string]string, len(md))
	for key, values := range md {
		result[key] = strings.Join(values, ", ")
	}
	return result
}

func grpcResponseBody(responses []string) string {
	if len(responses) == 0 {
		return "{}"
	}
	if len(responses) == 1 {
		return responses[0]
	}
	return "[\n" + strings.Join(responses, ",\n") + "\n]"
}

func (handler *grpcEventHandler) OnResolveMethod(method *desc.MethodDescriptor) {
	handler.method = method.GetFullyQualifiedName()
}

func (handler *grpcEventHandler) OnSendHeaders(metadata.MD) {}

func (handler *grpcEventHandler) OnReceiveHeaders(headers metadata.MD) {
	handler.headers = headers
}

func (handler *grpcEventHandler) OnReceiveResponse(message proto.Message) {
	formatted, err := handler.formatter(message)
	if err != nil {
		formatted = fmt.Sprintf(`{"formatError":%q}`, err.Error())
	}
	handler.responses = append(handler.responses, formatted)
}

func (handler *grpcEventHandler) OnReceiveTrailers(status *status.Status, trailers metadata.MD) {
	handler.status = status
	handler.trailers = trailers
}
