// Minimal WebSocket server (no npm packages needed).
// Implements just what the game uses: text messages, ping/pong and close.
const crypto = require("crypto");
const EventEmitter = require("events");
const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const MAX_MESSAGE = 65536;

class Connection extends EventEmitter {
    constructor(sock) {
        super();
        this.sock = sock;
        this.readyState = 1;
        this.buf = Buffer.alloc(0);
        sock.setNoDelay(true);
        sock.on("data", d => {
            this.buf = Buffer.concat([this.buf, d]);
            this.parse();
        });
        sock.on("close", () => this.finish());
        sock.on("error", () => this.finish());
    }

    finish() {
        if (this.readyState === 3) return;
        this.readyState = 3;
        this.emit("close");
    }

    frame(op, payload) {
        const n = payload.length;
        let h;
        if (n < 126) h = Buffer.from([0x80 | op, n]);
        else if (n < 65536) { h = Buffer.alloc(4); h[0] = 0x80 | op; h[1] = 126; h.writeUInt16BE(n, 2); }
        else { h = Buffer.alloc(10); h[0] = 0x80 | op; h[1] = 127; h.writeBigUInt64BE(BigInt(n), 2); }
        return Buffer.concat([h, payload]);
    }

    send(data) {
        if (this.readyState !== 1 || this.sock.writableLength > 1e6) return;  // skip if client is far behind
        this.sock.write(this.frame(1, Buffer.from(String(data))));
    }

    close() {
        if (this.readyState === 1) this.sock.write(this.frame(8, Buffer.alloc(0)));
        this.sock.end();
        this.finish();
    }

    parse() {
        for (;;) {
            const b = this.buf;
            if (b.length < 2) return;
            const op = b[0] & 15, masked = b[1] & 128;
            let len = b[1] & 127, off = 2;
            if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
            else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
            if (len > MAX_MESSAGE) return this.close();

            const start = off + (masked ? 4 : 0), total = start + len;
            if (b.length < total) return;

            let payload = Buffer.from(b.subarray(start, total));
            if (masked) {
                const m = b.subarray(off, off + 4);
                for (let i = 0; i < payload.length; i++) payload[i] ^= m[i & 3];
            }
            this.buf = b.subarray(total);

            if (op === 1) this.emit("message", payload);
            else if (op === 9) this.sock.write(this.frame(10, payload));   // ping -> pong
            else if (op === 8) return this.close();
        }
    }
}

class WebSocketServer extends EventEmitter {
    constructor({ server }) {
        super();
        server.on("upgrade", (req, sock) => {
            const key = req.headers["sec-websocket-key"];
            if (!key) { sock.destroy(); return; }
            const accept = crypto.createHash("sha1").update(key + GUID).digest("base64");
            sock.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n" +
                       "Connection: Upgrade\r\nSec-WebSocket-Accept: " + accept + "\r\n\r\n");
            this.emit("connection", new Connection(sock));
        });
    }
}

module.exports = { WebSocketServer };
