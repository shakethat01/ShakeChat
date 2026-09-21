import { io, Socket } from 'socket.io-client';
import { auth, API_ORIGIN } from './api';

let socket: Socket | null = null;
let socketToken: string | null = null;

export function chatSocket() {
  const token = auth.token();
  if (!socket || socketToken !== token) {
    socket?.disconnect();
    socketToken = token;
    socket = io(`${API_ORIGIN}/chat`, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      auth: { token },
    });
  }
  return socket;
}

export function closeChatSocket() {
  socket?.disconnect();
  socket = null;
  socketToken = null;
}
