// Tiny stack VM for make.fun tiny-stack-vm-01-run-20261122.
// Node 22: `node main.ts`. Answers i001..i040 in one run.
import * as fs from "node:fs";
import * as path from "node:path";
const IN_DIR = process.env.MAKEFUN_INPUT_DIR || "/input";
const OUT_DIR = process.env.MAKEFUN_OUTPUT_DIR || "/output";
// Run one program; returns [output bytes, exit code 0..255].
function run(p: Buffer, inp: Buffer): [Buffer, number] {
  const mem = new Int32Array(256);
  const s = new Int32Array(256);
  let sp = 0;
  const cs = new Int32Array(64);
  let cp = 0;
  const o = new Uint8Array(65536);
  let ol = 0, pc = 0, steps = 0, ip = 0;
  const n = p.length;
  const done = (c: number): [Buffer, number] => [Buffer.from(o.subarray(0, ol)), c];
  for (;;) {
    if (steps >= 1000000) return done(10);
    if (pc < 0 || pc >= n) return done(9);
    const op = p[pc];
    let il = 0;
    if (op === 1) il = 1;
    else if (op === 2) il = 4;
    else if (op >= 48 && op <= 51) il = 2;
    else if (op > 83 || (op >= 8 && op <= 15) || (op >= 35 && op <= 47) || (op >= 53 && op <= 63) || (op >= 66 && op <= 79)) return done(5);
    if (pc + 1 + il > n) return done(9);
    steps++;
    let nx = pc + 1 + il;
    switch (op) {
      case 0: return done(0); // HALT
      case 1: // PUSH8, sign-extended
        if (sp >= 256) return done(3);
        { const b = p[pc + 1]; s[sp++] = b < 128 ? b : b - 256; }
        break;
      case 2: // PUSH32
        if (sp >= 256) return done(3);
        s[sp++] = p.readInt32LE(pc + 1);
        break;
      case 3: // POP
        if (sp < 1) return done(2);
        sp--;
        break;
      case 4: // DUP
        if (sp < 1) return done(2);
        if (sp >= 256) return done(3);
        s[sp] = s[sp - 1]; sp++;
        break;
      case 5: // SWAP
        if (sp < 2) return done(2);
        { const t = s[sp - 1]; s[sp - 1] = s[sp - 2]; s[sp - 2] = t; }
        break;
      case 6: // OVER
        if (sp < 2) return done(2);
        if (sp >= 256) return done(3);
        s[sp] = s[sp - 2]; sp++;
        break;
      case 7: // ROT (a b c -- b c a)
        if (sp < 3) return done(2);
        { const t = s[sp - 3]; s[sp - 3] = s[sp - 2]; s[sp - 2] = s[sp - 1]; s[sp - 1] = t; }
        break;
      case 16: case 17: case 18: case 19: case 20: case 21: case 22:
      case 24: case 25: case 26: case 28: case 29: case 30: case 32: case 33: case 34:
        if (sp < 2) return done(2);
        {
          const a = s[sp - 2], b = s[sp - 1];
          let r = 0;
          if (op === 16) r = (a + b) | 0;
          else if (op === 17) r = (a - b) | 0;
          else if (op === 18) r = Math.imul(a, b);
          else if (op === 19) { if (b === 0) return done(4); r = Math.trunc(a / b) | 0; }
          else if (op === 20) { if (b === 0) return done(4); r = a % b; }
          else if (op === 21) { const u = b >>> 0; if (!u) return done(4); r = Math.floor((a >>> 0) / u) | 0; }
          else if (op === 22) { const u = b >>> 0; if (!u) return done(4); r = ((a >>> 0) % u) | 0; }
          else if (op === 24) r = a & b;
          else if (op === 25) r = a | b;
          else if (op === 26) r = a ^ b;
          else if (op === 28) r = a << (b & 31);
          else if (op === 29) r = a >> (b & 31);
          else if (op === 30) r = (a >>> (b & 31)) | 0;
          else if (op === 32) r = a === b ? 1 : 0;
          else if (op === 33) r = a < b ? 1 : 0;
          else r = (a >>> 0) < (b >>> 0) ? 1 : 0;
          s[sp - 2] = r; sp--;
        }
        break;
      case 23: // NEG
        if (sp < 1) return done(2);
        s[sp - 1] = (-s[sp - 1]) | 0;
        break;
      case 27: // NOT
        if (sp < 1) return done(2);
        s[sp - 1] = ~s[sp - 1];
        break;
      case 48: // JMP
        nx += p.readInt16LE(pc + 1);
        break;
      case 49: // JZ
        if (sp < 1) return done(2);
        if (s[--sp] === 0) nx += p.readInt16LE(pc + 1);
        break;
      case 50: // JNZ
        if (sp < 1) return done(2);
        if (s[--sp] !== 0) nx += p.readInt16LE(pc + 1);
        break;
      case 51: // CALL
        if (cp >= 64) return done(7);
        cs[cp++] = nx; nx = p.readUInt16LE(pc + 1);
        break;
      case 52: // RET
        if (cp === 0) return done(8);
        nx = cs[--cp];
        break;
      case 64: // LOAD
        if (sp < 1) return done(2);
        { const a = s[sp - 1]; if (a < 0 || a > 255) return done(6); s[sp - 1] = mem[a]; }
        break;
      case 65: // STORE (v addr --)
        if (sp < 2) return done(2);
        { const a = s[sp - 1]; if (a < 0 || a > 255) return done(6); mem[a] = s[sp - 2]; sp -= 2; }
        break;
      case 80: // PRINT
        if (sp < 1) return done(2);
        { const t = String(s[--sp]); if (ol + t.length > 65536) return done(11); for (let i = 0; i < t.length; i++) o[ol++] = t.charCodeAt(i); }
        break;
      case 81: // PUTC
        if (sp < 1) return done(2);
        if (ol >= 65536) return done(11);
        o[ol++] = s[--sp] & 255;
        break;
      case 82: // IN (-1 at end of input)
        if (sp >= 256) return done(3);
        s[sp++] = ip < inp.length ? inp[ip++] : -1;
        break;
      case 83: // EXIT (low byte)
        if (sp < 1) return done(2);
        return done(s[--sp] & 255);
    }
    pc = nx;
  }
}
function read(f: string): Buffer {
  try { return fs.readFileSync(f); } catch { return Buffer.alloc(0); }
}
for (let i = 1; i <= 40; i++) {
  const id = "i" + String(i).padStart(3, "0");
  const d = path.join(IN_DIR, id);
  const [out, code] = run(read(path.join(d, "program.bin")), read(path.join(d, "input.bin")));
  const od = path.join(OUT_DIR, id);
  fs.mkdirSync(od, { recursive: true });
  fs.writeFileSync(path.join(od, "stdout.bin"), out);
  fs.writeFileSync(path.join(od, "exit.txt"), code + "\n");
}
