const http = require("node:http");
const crypto = require("node:crypto");
const { Buffer } = require("node:buffer");

const port = 8080;
const host = "localhost";
const MAGIC_STRING = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

const server = http.createServer();

server.on("upgrade", (req, socket, head) => {
  const secWebsocketKey = req.headers["sec-websocket-key"];
  const handshakeResponse = prepareHeaders(secWebsocketKey);

  socket.write(handshakeResponse);

  // Start getting data from client
  let BUFFER = Buffer.alloc(0);

  socket.on("data", (data) => {
    BUFFER = Buffer.concat([BUFFER, data]);
    let payloadSize = 0;
    let offset = 0;

    if (BUFFER.length > 1) {
      const secondByte = BUFFER[1];
      const payloadLen = secondByte & 0b01111111;

      if (payloadLen <= 125) {
        payloadSize = payloadLen;
        offset = 2;
      } else if (payloadLen === 126) {
        if (BUFFER.length >= 4) {
          payloadSize = BUFFER.readUInt16BE(2);
          offset = 4;
        }
      } else if (payloadLen === 127) {
        if (BUFFER.length >= 10) {
          payloadSize = Number(BUFFER.readBigUInt64BE(2));
          offset = 10;
        }
      }
    }

    const totalFrameSize = offset + 4 + payloadSize;

    // Only unmask and process data if we have received the full frame
    if (BUFFER.length >= totalFrameSize) {
      const mask = BUFFER.slice(offset, offset + 4); // Masking key
      const maskedData = BUFFER.slice(offset + 4, totalFrameSize); // Masked payload data

      const unmaskedData = unmaskData(maskedData, mask);

      console.log("Unmasked Data:", unmaskedData.toString('utf8'));

      // Remove processed data from buffer
      BUFFER = BUFFER.slice(totalFrameSize);
    }
  });
});

const unmaskData = (data, mask) => {
  const unmaskedData = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) {
    unmaskedData[i] = data[i] ^ mask[i % 4];
  }
  return unmaskedData;
};

const prepareHeaders = (key) => {
  const secWebSocketAccept = getSecWebsocketAccept(key);
  const handshakeResponse = [
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${secWebSocketAccept}`,
    "\r\n",
  ].join("\r\n");

  return handshakeResponse;
};

const getSecWebsocketAccept = (key) => {
  return crypto
    .createHash("sha1")
    .update(key + MAGIC_STRING)
    .digest("base64");
};

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error("Address in use, retrying...");
    setTimeout(() => {
      server.close();
      server.listen(port, host);
    }, 1000);
  } else {
    console.error("An error has occurred: ", err);
  }
});

["unhandledRejection", "uncaughtException"].forEach((event) => {
  process.on(event, (err) =>
    console.error(`Error has occurred: ${event}`, err)
  );
});

server.listen(
  {
    host: host,
    port: port,
  },
  () => {
    console.log("Server listening on port:", port);
  }
);
