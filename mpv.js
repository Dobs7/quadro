// Cliente do motor de vídeo: inicia o mpv como processo separado e conversa por IPC (JSON por linha).
const { spawn } = require('child_process');
const net = require('net');
const { EventEmitter } = require('events');

class Mpv extends EventEmitter {
  constructor({ bin, wid, pipe, extraArgs = [] }) {
    super();
    this.bin = bin; this.wid = wid; this.pipe = pipe; this.extraArgs = extraArgs;
    this.proc = null; this.sock = null; this.nextId = 1; this.pending = new Map();
    this.stopping = false; this.ready = false; this.observed = [];
  }

  async start(observe = []) {
    this.observed = observe;
    const args = [
      '--idle=yes', '--force-window=yes', '--no-config', '--no-terminal',
      '--osc=no', '--input-default-bindings=no', '--input-vo-keyboard=no', '--input-cursor=no',
      `--wid=${this.wid}`, `--input-ipc-server=${this.pipe}`, ...this.extraArgs,
    ];
    this.proc = spawn(this.bin, args, { stdio: 'ignore', windowsHide: true });
    this.proc.on('error', (e) => this._dead(e.message));
    this.proc.on('exit', (code) => this._dead(`saiu com código ${code}`));
    await this._connect();
    this.ready = true;
    let i = 1;
    for (const name of observe) this.send(['observe_property', i++, name]).catch(() => {});
  }

  _connect() {
    return new Promise((resolve, reject) => {
      const t0 = Date.now();
      const attempt = () => {
        if (this.stopping || !this.proc) return reject(new Error('motor encerrado'));
        const s = net.connect(this.pipe);
        s.once('connect', () => { this.sock = s; this._wire(s); resolve(); });
        s.once('error', () => {
          s.destroy();
          if (Date.now() - t0 > 15000) return reject(new Error('o motor não respondeu'));
          setTimeout(attempt, 80);
        });
      };
      attempt();
    });
  }

  _wire(s) {
    let buf = '';
    s.setEncoding('utf8');
    s.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        if (!line.trim()) continue;
        let m; try { m = JSON.parse(line); } catch { continue; }
        if (m.request_id !== undefined && this.pending.has(m.request_id)) {
          const p = this.pending.get(m.request_id); this.pending.delete(m.request_id);
          clearTimeout(p.timer);
          if (m.error === 'success') p.resolve(m.data); else p.reject(new Error(m.error || 'erro'));
        } else if (m.event === 'property-change') this.emit('prop', m.name, m.data);
        else if (m.event) this.emit('event', m);
      }
    });
    s.on('error', () => {});
    s.on('close', () => { if (this.sock === s) this.sock = null; });
  }

  send(command, timeout = 8000) {
    return new Promise((resolve, reject) => {
      if (!this.sock) return reject(new Error('motor indisponível'));
      const id = this.nextId++;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('timeout')); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.sock.write(JSON.stringify({ command, request_id: id }) + '\n');
    });
  }
  set(name, value) { return this.send(['set_property', name, value]); }
  get(name) { return this.send(['get_property', name]); }

  _dead(reason) {
    if (!this.proc) return;
    this.proc = null; this.ready = false;
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('motor encerrado')); }
    this.pending.clear();
    if (this.sock) { this.sock.destroy(); this.sock = null; }
    if (!this.stopping) this.emit('crashed', reason);
  }

  kill() { const p = this.proc; if (p) { try { p.kill(); } catch {} } }

  async stop() {
    this.stopping = true;
    const p = this.proc;
    if (!p) return;
    try { await this.send(['quit'], 600); } catch {}
    setTimeout(() => { try { p.kill(); } catch {} }, 400);
  }
}
module.exports = { Mpv };
