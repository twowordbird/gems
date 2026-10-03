/* Gems: the relay. Every phone at a table connects to free public MQTT
   brokers over secure WebSockets and shares one retained "table" message:
   the newest (epoch, seq, nonce) wins, so phones that reconnect catch up on
   their own. Two brokers run side by side; if one is down, the other carries
   the game. Add ?broker=ws://host:port to use your own. */
(function () {
  'use strict';
  const PREFIX = 'twowordbird-gems/v1/';
  const DEFAULT_BROKERS = [
    'wss://broker.emqx.io:8084/mqtt',
    'wss://broker.hivemq.com:8884/mqtt',
  ];

  function brokerList() {
    try {
      const q = new URLSearchParams(location.search).get('broker');
      if (q) return q.split(',').filter(Boolean);
    } catch (e) { /* fall through */ }
    return DEFAULT_BROKERS;
  }

  function newer(a, b) {
    if (!b) return true;
    if (!a) return false;
    if (a.epoch !== b.epoch) return a.epoch > b.epoch;
    if (a.seq !== b.seq) return a.seq > b.seq;
    return a.nonce > b.nonce;
  }

  class Relay {
    // on: { table(msg, link), join(msg), hello(msg, link), status(up, total), linkUp(link) }
    constructor(room, on) {
      this.base = PREFIX + room + '/';
      this.on = on;
      this.links = [];
      this.closed = false;
      if (!window.mqtt) { setTimeout(() => on.status && on.status(0, 0), 0); return; }
      for (const url of brokerList()) this.open(url);
    }
    open(url) {
      let client;
      try {
        client = window.mqtt.connect(url, {
          clientId: 'gems_' + Math.random().toString(36).slice(2, 12),
          clean: true, keepalive: 25, reconnectPeriod: 2500, connectTimeout: 9000,
          protocolVersion: 4, resubscribe: true,
        });
      } catch (e) { return; }
      const link = { url, client, up: false, seen: null, lastHeal: 0 };
      client.on('connect', () => {
        link.up = true;
        link.seen = null;
        client.subscribe([this.base + 'table', this.base + 'join', this.base + 'hello'], { qos: 1 });
        this.status();
        if (this.on.linkUp) this.on.linkUp(link);
      });
      const down = () => { if (link.up) { link.up = false; this.status(); } };
      client.on('close', down);
      client.on('offline', down);
      client.on('error', () => {});
      client.on('message', (topic, buf) => {
        if (this.closed || !buf || buf.length > 65536) return;
        let msg;
        try { msg = JSON.parse(new TextDecoder().decode(buf)); } catch (e) { return; }
        if (!msg || typeof msg !== 'object') return;
        const kind = topic.slice(this.base.length);
        if (kind === 'table') {
          if (newer(msg, link.seen)) link.seen = msg;
          this.on.table && this.on.table(msg, link);
        } else if (kind === 'join') this.on.join && this.on.join(msg);
        else if (kind === 'hello') this.on.hello && this.on.hello(msg, link);
      });
      this.links.push(link);
    }
    get up() { return this.links.filter(l => l.up).length; }
    status() { this.on.status && this.on.status(this.up, this.links.length); }
    publishTable(t, onlyLink) {
      const s = JSON.stringify(t);
      for (const l of this.links) {
        if (onlyLink && l !== onlyLink) continue;
        if (l.up) l.client.publish(this.base + 'table', s, { qos: 1, retain: true });
      }
    }
    // Bring one broker's retained copy up to date, at most every 2 s.
    heal(link, t) {
      const now = Date.now();
      if (!link || !link.up || now - link.lastHeal < 2000) return;
      link.lastHeal = now;
      this.publishTable(t, link);
    }
    send(kind, msg) {
      const s = JSON.stringify(msg);
      for (const l of this.links) if (l.up) l.client.publish(this.base + kind, s, { qos: 0 });
    }
    reconnect() {
      for (const l of this.links) if (!l.up && !l.client.disconnecting) { try { l.client.reconnect(); } catch (e) { /* retry later */ } }
    }
    close() {
      this.closed = true;
      for (const l of this.links) { try { l.client.end(true); } catch (e) { /* ignore */ } }
      this.links = [];
    }
  }

  window.GemsNet = { Relay, newer, PREFIX };
})();
