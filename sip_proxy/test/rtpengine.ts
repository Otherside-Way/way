await Bun.udpSocket({
  port: 22222,
  socket: {
    data(socket, buf, port, address) {
      const text = Buffer.from(buf).toString();
      const cookie = text.slice(0, text.indexOf(" "));
      const match = /7:command(\d+):/.exec(text);
      const command = match ? text.slice(match.index + match[0].length, match.index + match[0].length + Number(match[1])) : "unknown";
      console.log(`ng ${command} from ${address}`);
      socket.send(`${cookie} ${command === "ping" ? "d6:result4:ponge" : "d6:result2:oke"}`, port, address);
    },
  },
});
