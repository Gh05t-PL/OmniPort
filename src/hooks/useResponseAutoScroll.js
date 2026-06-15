import { useEffect, useRef } from 'react';
import { isWebsocketResponse } from '../domain/websocket.js';

export default function useResponseAutoScroll({ response, activeResTab, enabled }) {
  const responseScrollRef = useRef(null);
  const websocketFrameCount = isWebsocketResponse(response) && Array.isArray(response.data)
    ? response.data.length
    : 0;

  useEffect(() => {
    if (!enabled || activeResTab !== 'body' || !isWebsocketResponse(response)) return;
    const scrollContainer = responseScrollRef.current;
    if (!scrollContainer) return;

    const animationFrameId = window.requestAnimationFrame(() => {
      scrollContainer.scrollTo({
        top: scrollContainer.scrollHeight,
        behavior: 'smooth'
      });
    });

    return () => window.cancelAnimationFrame(animationFrameId);
  }, [activeResTab, enabled, response, websocketFrameCount]);

  return responseScrollRef;
}
