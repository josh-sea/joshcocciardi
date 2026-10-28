/* The video call: camera and mic, one WebRTC connection per other person,
 * and the setup messages that pass through the room to open them.
 *
 * Only setup passes through Firebase (an offer, an answer and a handful of
 * network candidates per pair, a few KB). The video itself goes straight
 * between phones. There is no relay server, so a pair that can't reach
 * each other directly just shows "video unavailable"; the games don't
 * care either way.
 *
 * Who connects to whom is callplan.js. This file is the part that needs a
 * browser.
 */
import { onCall, isFull, offers, plan, forMe, newSid, VIDEO, AUDIO, MAX_BITRATE, ICE_SERVERS } from './callplan.js';
import { serverNow } from './net.js';

export class Call {
  constructor(room, { onChange }) {
    this.room = room;
    this.onChange = onChange || (() => {});
    this.stream = null;
    this.sid = null;
    this.media = {};
    this.peers = new Map(); // uid -> { pc, sid, stream, state, ice: [] }
    this.cam = true;
    this.mic = true;
    this.offs = [];
    this.error = '';
  }

  get on() { return !!this.stream; }

  async start() {
    this.error = '';
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.error = 'This browser cannot do video calls.';
      this.onChange();
      return false;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: VIDEO, audio: AUDIO });
    } catch (e) {
      this.error = e && e.name === 'NotAllowedError'
        ? 'Camera and mic are blocked. Allow them for this site in your settings, then try again.'
        : 'Could not start the camera or mic.';
      this.onChange();
      return false;
    }
    this.sid = newSid();
    this.cam = true;
    this.mic = true;
    this.offs.push(this.room.onSignal((m) => this.signal(m)));
    this.offs.push(this.room.onMedia((media) => { this.media = media; this.sync(); }));
    await this.room.setMedia({ on: true, cam: true, mic: true, since: serverNow(), sid: this.sid });
    this.onChange();
    return true;
  }

  async stop() {
    this.offs.splice(0).forEach((u) => u());
    for (const uid of [...this.peers.keys()]) this.hangUp(uid);
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.sid = null;
    this.media = {};
    await this.room.clearMedia().catch(() => {});
    this.onChange();
  }

  setCam(on) {
    this.cam = on;
    if (this.stream) this.stream.getVideoTracks().forEach((t) => { t.enabled = on; });
    this.room.updateMedia({ cam: on });
    this.onChange();
  }

  setMic(on) {
    this.mic = on;
    if (this.stream) this.stream.getAudioTracks().forEach((t) => { t.enabled = on; });
    this.room.updateMedia({ mic: on });
    this.onChange();
  }

  /* Who to show: everyone on the call, in order, with what we know. */
  tiles() {
    const me = this.room.uid;
    return onCall(this.media, this.room.players).map((uid) => {
      const m = this.media[uid] || {};
      if (uid === me) return { uid, me: true, stream: this.stream, cam: this.cam, mic: this.mic, state: 'live' };
      const p = this.peers.get(uid);
      return { uid, stream: p && p.stream, cam: m.cam !== false, mic: m.mic !== false, state: p ? p.state : 'connecting' };
    });
  }

  full() { return isFull(this.media, this.room.players, this.room.uid); }

  /* ── connections ── */

  sync() {
    if (!this.stream) return;
    const have = {};
    for (const [uid, p] of this.peers) have[uid] = p.sid;
    const { connect, drop } = plan(this.room.uid, this.media, this.room.players, have);
    drop.forEach((uid) => this.hangUp(uid));
    for (const uid of connect) {
      if (offers(this.room.uid, uid)) this.call(uid, this.media[uid].sid);
    }
    this.onChange();
  }

  peer(uid, sid) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const p = { pc, sid, stream: null, state: 'connecting', ice: [] };
    this.peers.set(uid, p);
    this.stream.getTracks().forEach((t) => pc.addTrack(t, this.stream));
    pc.onicecandidate = (e) => {
      if (e.candidate) this.send(uid, p, 'ice', JSON.stringify(e.candidate));
    };
    pc.ontrack = (e) => {
      p.stream = e.streams[0] || new MediaStream([e.track]);
      this.onChange();
    };
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      p.state = s === 'connected' ? 'live' : s === 'failed' ? 'failed' : s === 'disconnected' ? 'connecting' : p.state;
      if (s === 'connected') this.capBitrate(pc);
      this.onChange();
    };
    // Some browsers only report the ICE state, not the connection state.
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed' && p.state !== 'failed') { p.state = 'failed'; this.onChange(); }
    };
    return p;
  }

  send(uid, p, t, d) {
    return this.room.sendSignal(uid, { t, d, sid: this.sid, to: p.sid }).catch(() => {});
  }

  async call(uid, sid) {
    const p = this.peer(uid, sid);
    try {
      const offer = await p.pc.createOffer();
      await p.pc.setLocalDescription(offer);
      this.send(uid, p, 'offer', offer.sdp);
    } catch { p.state = 'failed'; this.onChange(); }
  }

  async signal(m) {
    if (!this.stream || !forMe(m, this.sid)) return;
    let p = this.peers.get(m.from);
    try {
      if (m.t === 'offer') {
        if (p && p.sid !== m.sid) { this.hangUp(m.from); p = null; }
        if (!p) p = this.peer(m.from, m.sid);
        await p.pc.setRemoteDescription({ type: 'offer', sdp: m.d });
        await this.flushIce(p);
        const answer = await p.pc.createAnswer();
        await p.pc.setLocalDescription(answer);
        this.send(m.from, p, 'answer', answer.sdp);
      } else if (m.t === 'answer') {
        if (!p || p.sid !== m.sid || p.pc.signalingState !== 'have-local-offer') return;
        await p.pc.setRemoteDescription({ type: 'answer', sdp: m.d });
        await this.flushIce(p);
      } else if (m.t === 'ice') {
        if (!p || p.sid !== m.sid) return;
        const c = JSON.parse(m.d);
        if (p.pc.remoteDescription) await p.pc.addIceCandidate(c);
        else p.ice.push(c);
      }
    } catch {
      if (p) { p.state = 'failed'; this.onChange(); }
    }
  }

  async flushIce(p) {
    for (const c of p.ice.splice(0)) await p.pc.addIceCandidate(c).catch(() => {});
  }

  capBitrate(pc) {
    for (const s of pc.getSenders()) {
      if (!s.track || s.track.kind !== 'video' || !s.getParameters) continue;
      const params = s.getParameters();
      if (!params.encodings || !params.encodings.length) params.encodings = [{}];
      params.encodings[0].maxBitrate = MAX_BITRATE;
      s.setParameters(params).catch(() => {});
    }
  }

  hangUp(uid) {
    const p = this.peers.get(uid);
    if (!p) return;
    try { p.pc.close(); } catch { /* already closed */ }
    this.peers.delete(uid);
  }
}
