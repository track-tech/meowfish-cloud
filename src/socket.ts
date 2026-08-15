import { connect } from 'cloudflare:sockets';
import type { SshTcpFactory } from './ssh.js';

/** Cloudflare Worker 的 SSH TCP 传输（cloudflare:sockets 直连） */
export const cloudflareTcp: SshTcpFactory = (host, port) => {
  const sock = connect({ hostname: host, port }, { secureTransport: 'off' });
  return {
    readable: sock.readable,
    writable: sock.writable,
    close: () => {
      void sock.close().catch(() => {
        /* ignore */
      });
    },
  };
};
