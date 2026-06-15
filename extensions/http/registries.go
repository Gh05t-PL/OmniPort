package main

import (
	"fmt"
	"net"
	"time"
)

func (registry *activeClientRegistry) set(client *extensionClient) {
	registry.mu.Lock()
	defer registry.mu.Unlock()
	registry.client = client
	logExtension("active websocket registered")
}

func (registry *activeClientRegistry) clear(client *extensionClient) {
	registry.mu.Lock()
	defer registry.mu.Unlock()
	if registry.client == client {
		registry.client = nil
		logExtension("active websocket cleared")
	}
}

func (registry *activeClientRegistry) current() *extensionClient {
	registry.mu.Lock()
	defer registry.mu.Unlock()
	return registry.client
}

func (registry *activeClientRegistry) broadcast(event string, data any, queueOnFailure bool) bool {
	client := registry.current()
	if client == nil {
		if queueOnFailure {
			pendingEvents.enqueue(event, data)
		}
		return false
	}

	if err := client.broadcast(event, data); err != nil {
		logExtension("websocket broadcast failed event=%s error=%v", event, err)
		if queueOnFailure {
			pendingEvents.enqueue(event, data)
		}
		client.reportConnectionError(fmt.Errorf("websocket broadcast failed: %w", err))
		return false
	}
	return true
}

func (queue *pendingEventQueue) enqueue(event string, data any) {
	queue.mu.Lock()
	defer queue.mu.Unlock()
	queue.events = append(queue.events, outboundEvent{event: event, data: data})
	if len(queue.events) > 100 {
		queue.events = queue.events[len(queue.events)-100:]
	}
	logExtension("pending event queued event=%s size=%d", event, len(queue.events))
}

func (queue *pendingEventQueue) flush(client *extensionClient) error {
	queue.mu.Lock()
	events := append([]outboundEvent(nil), queue.events...)
	queue.mu.Unlock()
	if len(events) > 0 {
		logExtension("flushing pending events count=%d", len(events))
	}

	for _, event := range events {
		if err := client.broadcast(event.event, event.data); err != nil {
			return err
		}

		queue.mu.Lock()
		if len(queue.events) > 0 {
			queue.events = queue.events[1:]
		}
		queue.mu.Unlock()
	}
	return nil
}

func (store *requestReplayStore) claim(requestID string) (replayedRequest, bool) {
	if requestID == "" {
		return replayedRequest{}, false
	}

	now := time.Now()
	store.mu.Lock()
	defer store.mu.Unlock()

	if store.entries == nil {
		store.entries = make(map[string]replayedRequest)
	}
	store.pruneLocked(now)

	replay, ok := store.entries[requestID]
	if ok {
		return replay, true
	}

	store.entries[requestID] = replayedRequest{createdAt: now}
	return replayedRequest{}, false
}

func (store *requestReplayStore) finish(requestID string, event string, data any) {
	if requestID == "" {
		return
	}

	now := time.Now()
	store.mu.Lock()
	defer store.mu.Unlock()

	if store.entries == nil {
		store.entries = make(map[string]replayedRequest)
	}
	store.entries[requestID] = replayedRequest{
		createdAt: now,
		done:      true,
		event:     event,
		data:      data,
	}
	store.pruneLocked(now)
}

func (store *requestReplayStore) pruneLocked(now time.Time) {
	for requestID, replay := range store.entries {
		if now.Sub(replay.createdAt) > requestReplayTTL {
			delete(store.entries, requestID)
		}
	}

	for len(store.entries) > requestReplayMaxEntries {
		var oldestID string
		var oldestAt time.Time
		for requestID, replay := range store.entries {
			if oldestID == "" || replay.createdAt.Before(oldestAt) {
				oldestID = requestID
				oldestAt = replay.createdAt
			}
		}
		if oldestID == "" {
			return
		}
		delete(store.entries, oldestID)
	}
}

func (registry *targetWebsocketRegistry) replace(connection *targetWebsocketConnection) {
	var previous *targetWebsocketConnection

	registry.mu.Lock()
	if registry.entries == nil {
		registry.entries = make(map[string]*targetWebsocketConnection)
	}
	previous = registry.entries[connection.id]
	registry.entries[connection.id] = connection
	registry.mu.Unlock()

	if previous != nil {
		previous.close("connection replaced")
	}
}

func (registry *targetWebsocketRegistry) get(connectionID string) *targetWebsocketConnection {
	registry.mu.Lock()
	defer registry.mu.Unlock()
	return registry.entries[connectionID]
}

func (registry *targetWebsocketRegistry) pop(connectionID string) *targetWebsocketConnection {
	registry.mu.Lock()
	defer registry.mu.Unlock()
	connection := registry.entries[connectionID]
	delete(registry.entries, connectionID)
	return connection
}

func (registry *targetWebsocketRegistry) remove(connectionID string, connection *targetWebsocketConnection) bool {
	registry.mu.Lock()
	defer registry.mu.Unlock()
	if registry.entries[connectionID] != connection {
		return false
	}
	delete(registry.entries, connectionID)
	return true
}

func (registry *targetWebsocketRegistry) closeAll(reason string) {
	registry.mu.Lock()
	connections := make([]*targetWebsocketConnection, 0, len(registry.entries))
	for _, connection := range registry.entries {
		connections = append(connections, connection)
	}
	registry.entries = nil
	registry.mu.Unlock()

	for _, connection := range connections {
		connection.close(reason)
	}
}

func (registry *targetTCPConnectionRegistry) get(connectionID string) *targetTCPConnection {
	registry.mu.Lock()
	defer registry.mu.Unlock()
	return registry.entries[connectionID]
}

func (registry *targetTCPConnectionRegistry) replace(connection *targetTCPConnection) {
	var previous *targetTCPConnection

	registry.mu.Lock()
	if registry.entries == nil {
		registry.entries = make(map[string]*targetTCPConnection)
	}
	previous = registry.entries[connection.id]
	registry.entries[connection.id] = connection
	registry.mu.Unlock()

	if previous != nil && previous != connection {
		_ = previous.conn.Close()
	}
}

func (registry *targetTCPConnectionRegistry) pop(connectionID string) *targetTCPConnection {
	registry.mu.Lock()
	defer registry.mu.Unlock()
	connection := registry.entries[connectionID]
	delete(registry.entries, connectionID)
	return connection
}

func (registry *targetTCPConnectionRegistry) remove(connectionID string, connection *targetTCPConnection) bool {
	registry.mu.Lock()
	defer registry.mu.Unlock()
	if registry.entries[connectionID] != connection {
		return false
	}
	delete(registry.entries, connectionID)
	return true
}

func (registry *targetTCPConnectionRegistry) closeAll() {
	registry.mu.Lock()
	connections := make([]*targetTCPConnection, 0, len(registry.entries))
	for _, connection := range registry.entries {
		connections = append(connections, connection)
	}
	registry.entries = nil
	registry.mu.Unlock()

	for _, connection := range connections {
		_ = connection.conn.Close()
	}
}

func closeAllNetworkConnections() {
	activeNetworkReads.closeAll()
	targetTCPConnections.closeAll()
}

func (registry *activeNetworkReadRegistry) add(requestID string, conn net.Conn) *activeNetworkRead {
	read := &activeNetworkRead{conn: conn}
	registry.mu.Lock()
	if registry.entries == nil {
		registry.entries = make(map[string]*activeNetworkRead)
	}
	registry.entries[requestID] = read
	registry.mu.Unlock()
	return read
}

func (registry *activeNetworkReadRegistry) remove(requestID string, read *activeNetworkRead) {
	registry.mu.Lock()
	if registry.entries[requestID] == read {
		delete(registry.entries, requestID)
	}
	registry.mu.Unlock()
}

func (registry *activeNetworkReadRegistry) stop(requestID string) bool {
	registry.mu.Lock()
	read := registry.entries[requestID]
	registry.mu.Unlock()
	if read == nil {
		return false
	}

	read.stop()
	return true
}

func (registry *activeNetworkReadRegistry) closeAll() {
	registry.mu.Lock()
	reads := make([]*activeNetworkRead, 0, len(registry.entries))
	for _, read := range registry.entries {
		reads = append(reads, read)
	}
	registry.entries = nil
	registry.mu.Unlock()

	for _, read := range reads {
		read.close()
	}
}

func (read *activeNetworkRead) stop() {
	read.mu.Lock()
	read.stopped = true
	read.mu.Unlock()
	_ = read.conn.SetReadDeadline(time.Now())
}

func (read *activeNetworkRead) close() {
	read.mu.Lock()
	read.stopped = true
	read.closed = true
	read.mu.Unlock()
	_ = read.conn.SetReadDeadline(time.Now())
	_ = read.conn.Close()
}

func (read *activeNetworkRead) wasStopped() bool {
	read.mu.Lock()
	defer read.mu.Unlock()
	return read.stopped
}

func (read *activeNetworkRead) wasClosed() bool {
	read.mu.Lock()
	defer read.mu.Unlock()
	return read.closed
}
