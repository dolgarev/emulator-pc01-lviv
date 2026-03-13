// Intel 8080 (KR580VM80A) microprocessor core model in JavaScript
//
// Copyright (C) 2014 Oleg Dolgarev <o.dolgarev@gmail.com>
// Copyright (C) 2012 Alexander Demin <alexander@demin.ws>
//
// Credits
//
// Viacheslav Slavinsky, Vector-06C FPGA Replica
// http://code.google.com/p/vector06cc/
//
// Dmitry Tselikov, Bashrikia-2M and Radio-86RK on Altera DE1
// http://bashkiria-2m.narod.ru/fpga.html
//
// Ian Bartholomew, 8080/8085 CPU Exerciser
// http://www.idb.me.uk/sunhillow/8080.html
//
// Frank Cringle, The original exerciser for the Z80.
//
// Thanks to zx.pk.ru and nedopc.org/forum communities.
//
// This program is free software; you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 2, or (at your option)
// any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program; if not, write to the Free Software
// Foundation, Inc., 59 Temple Place - Suite 330, Boston, MA 02111-1307, USA.

import { Config } from './config.js';
import { Memory } from './memory.js';
import { IO } from './io.js';
import { Watcher } from './watcher.js';

export function I8080(config, memory, io) {
  if (!(config instanceof Config)) {
    throw new Error('CPU: Invalid CONFIG object');
  }
  this.config = config;

  if (!(memory instanceof Memory)) {
    throw new Error('CPU: Invalid MEMORY object');
  }
  this.memory = memory;

  if (!(io instanceof IO)) {
    throw new Error('CPU: Invalid IO object');
  }
  this.io = io;

  // Registers: b, c, d, e, h, l, m, a
  //            0  1  2  3  4  5  6  7
  this.regs = new Uint8Array(8);

  this.traps = {};
  this.init();

  this.reg = function (r) {
    return r !== 6 ? this.regs[r] : this.memory_read_byte(this.hl());
  };

  this.set_reg = function (r, w8) {
    if (r !== 6) {
      this.regs[r] = w8;
    } else {
      this.memory_write_byte(this.hl(), w8);
    }
  };

  // r - 000 (bc), 010 (de), 100 (hl), 110 (sp)
  this.rp = function (r) {
    return r !== 6 ? (this.regs[r] << 8) | this.regs[r + 1] : this.sp;
  };

  this.set_rp = function (r, w16) {
    if (r !== 6) {
      this.set_reg(r++, w16 >> 8);
      this.set_reg(r, w16);
    } else {
      this.sp = w16;
    }
  };

  this.parity_table = new Uint8Array([
    1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0,
    0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1,
    0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1,
    1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0,
    0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1,
    1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0,
    1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0,
    0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1,
  ]);

  this.half_carry_table = new Uint8Array([0, 0, 1, 0, 1, 0, 1, 1]);
  this.sub_half_carry_table = new Uint8Array([0, 1, 1, 1, 0, 0, 0, 1]);

  const F_CARRY = 0x01,
    F_UN1 = 0x02,
    F_PARITY = 0x04,
    F_UN3 = 0x08,
    F_HCARRY = 0x10,
    F_UN5 = 0x20,
    F_ZERO = 0x40,
    F_NEG = 0x80;

  this.store_flags = function () {
    let f = 0;
    if (this.sf) f |= F_NEG;
    else f &= ~F_NEG;
    if (this.zf) f |= F_ZERO;
    else f &= ~F_ZERO;
    if (this.hf) f |= F_HCARRY;
    else f &= ~F_HCARRY;
    if (this.pf) f |= F_PARITY;
    else f &= ~F_PARITY;
    if (this.cf) f |= F_CARRY;
    else f &= ~F_CARRY;

    f |= F_UN1; // UN1_FLAG is always 1.
    f &= ~F_UN3; // UN3_FLAG is always 0.
    f &= ~F_UN5; // UN5_FLAG is always 0.
    return f;
  };

  this.retrieve_flags = function (f) {
    this.sf = f & F_NEG ? 1 : 0;
    this.zf = f & F_ZERO ? 1 : 0;
    this.hf = f & F_HCARRY ? 1 : 0;
    this.pf = f & F_PARITY ? 1 : 0;
    this.cf = f & F_CARRY ? 1 : 0;
  };

  this.bc = function () {
    return this.rp(0);
  };
  this.de = function () {
    return this.rp(2);
  };
  this.hl = function () {
    return this.rp(4);
  };
  this.get_af = function () {
    return (this.a() << 8) + this.store_flags();
  };
  this.get_sp = function () {
    return this.rp(6);
  };
  this.get_pc = function () {
    return this.pc;
  };

  this.b = function () {
    return this.reg(0);
  };
  this.c = function () {
    return this.reg(1);
  };
  this.d = function () {
    return this.reg(2);
  };
  this.e = function () {
    return this.reg(3);
  };
  this.h = function () {
    return this.reg(4);
  };
  this.l = function () {
    return this.reg(5);
  };
  this.a = function () {
    return this.reg(7);
  };

  this.set_b = function (v) {
    this.set_reg(0, v);
  };
  this.set_c = function (v) {
    this.set_reg(1, v);
  };
  this.set_d = function (v) {
    this.set_reg(2, v);
  };
  this.set_e = function (v) {
    this.set_reg(3, v);
  };
  this.set_h = function (v) {
    this.set_reg(4, v);
  };
  this.set_l = function (v) {
    this.set_reg(5, v);
  };
  this.set_a = function (v) {
    this.set_reg(7, v);
  };

  this.get_optcode = function () {
    let v;
    for (
      v = this.traps[this.pc] ? this.traps[this.pc]() : I8080.UNDEF_OPTCODE;
      v === I8080.UNDEF_OPTCODE;
      v = this.memory_read_byte(this.pc)
    );
    this.pc = ++this.pc & 0xffff;
    return v;
  };

  this.next_pc_byte = function () {
    const v = this.memory_read_byte(this.pc);
    this.pc = ++this.pc & 0xffff;
    return v;
  };

  this.next_pc_word = function () {
    return this.next_pc_byte() | (this.next_pc_byte() << 8);
  };

  this.inr = function (r) {
    const v = (this.reg(r) + 1) & 0xff;
    this.set_reg(r, v);
    this.sf = (v & 0x80) !== 0;
    this.zf = v === 0;
    this.hf = (v & 0x0f) === 0;
    this.pf = this.parity_table[v];
  };

  this.dcr = function (r) {
    const v = (this.reg(r) - 1) & 0xff;
    this.set_reg(r, v);
    this.sf = (v & 0x80) !== 0;
    this.zf = v === 0;
    this.hf = (v & 0x0f) !== 0x0f;
    this.pf = this.parity_table[v];
  };

  this.add_im8 = function (v, carry) {
    let a = this.a();
    const w16 = a + v + carry,
      index = ((a & 0x88) >> 1) | ((v & 0x88) >> 2) | ((w16 & 0x88) >> 3);

    a = w16 & 0xff;
    this.sf = (a & 0x80) !== 0;
    this.zf = a === 0;
    this.hf = this.half_carry_table[index & 0x7];
    this.pf = this.parity_table[a];
    this.cf = (w16 & 0x0100) !== 0;
    this.set_a(a);
  };

  this.add = function (r, carry) {
    this.add_im8(this.reg(r), carry);
  };

  this.sub_im8 = function (v, carry) {
    let a = this.a();
    const w16 = (a - v - carry) & 0xffff,
      index = ((a & 0x88) >> 1) | ((v & 0x88) >> 2) | ((w16 & 0x88) >> 3);

    a = w16 & 0xff;
    this.sf = (a & 0x80) !== 0;
    this.zf = a === 0;
    this.hf = !this.sub_half_carry_table[index & 0x7];
    this.pf = this.parity_table[a];
    this.cf = (w16 & 0x0100) !== 0;
    this.set_a(a);
  };

  this.sub = function (r, carry) {
    this.sub_im8(this.reg(r), carry);
  };

  this.cmp_im8 = function (v) {
    const a = this.a(); // Store the accumulator before substraction.
    this.sub_im8(v, 0);
    this.set_a(a); // Ignore the accumulator value after substraction.
  };

  this.cmp = function (r) {
    this.cmp_im8(this.reg(r));
  };

  this.ana_im8 = function (v) {
    let a = this.a();
    this.hf = ((a | v) & 0x08) !== 0;
    a &= v;
    this.sf = (a & 0x80) !== 0;
    this.zf = a === 0;
    this.pf = this.parity_table[a];
    this.cf = 0;
    this.set_a(a);
  };

  this.ana = function (r) {
    this.ana_im8(this.reg(r));
  };

  this.xra_im8 = function (v) {
    const a = this.a() ^ v;
    this.sf = (a & 0x80) !== 0;
    this.zf = a === 0;
    this.hf = this.cf = 0;
    this.pf = this.parity_table[a];
    this.set_a(a);
  };

  this.xra = function (r) {
    this.xra_im8(this.reg(r));
  };

  this.ora_im8 = function (v) {
    const a = this.a() | v;
    this.sf = (a & 0x80) !== 0;
    this.zf = a === 0;
    this.hf = this.cf = 0;
    this.pf = this.parity_table[a];
    this.set_a(a);
  };

  this.ora = function (r) {
    this.ora_im8(this.reg(r));
  };

  // r - 0 (bc), 2 (de), 4 (hl), 6 (sp)
  this.dad = function (r) {
    const hl = this.hl() + this.rp(r);
    this.cf = (hl & 0x10000) !== 0;
    this.set_h(hl >> 8);
    this.set_l(hl & 0xff);
  };

  this.call = function (w16) {
    this.push(this.pc);
    this.pc = w16;
  };

  this.ret = function () {
    this.pc = this.pop();
  };

  this.pop = function () {
    const v = this.memory_read_word(this.sp);
    this.sp = (this.sp + 2) & 0xffff;
    return v;
  };

  this.push = function (v) {
    this.sp = (this.sp - 2) & 0xffff;
    this.memory_write_word(this.sp, v);
  };

  this.rst = function (addr) {
    this.push(this.pc);
    this.pc = addr;
  };

  this.execute = function (opcode) {
    let a, r, w8, w16, f_val, src, dst, cpu_cycles;

    switch (opcode) {
      default:
        throw new Error(`I8080: Oops! Unhandled opcode ${opcode.toString(16)}`);

      // nop, 0x00, 00rrr000
      // r - 000(0) to 111(7)
      case 0x00: /* nop */
      // Undocumented NOP.
      case 0x08: /* nop */
      case 0x10: /* nop */
      case 0x18: /* nop */
      case 0x20: /* nop */
      case 0x28: /* nop */
      case 0x30: /* nop */
      case 0x38 /* nop */:
        cpu_cycles = 4;
        break;

      // lxi, 0x01, 00rr0001
      // rr - 00 (bc), 01 (de), 10 (hl), 11 (sp)
      case 0x01: /* lxi b, data16 */
      case 0x11: /* lxi d, data16 */
      case 0x21: /* lxi h, data16 */
      case 0x31 /* lxi sp, data16 */:
        cpu_cycles = 10;
        this.set_rp(opcode >> 3, this.next_pc_word());
        break;

      // stax, 0x02, 000r0010
      // r - 0 (bc), 1 (de)
      case 0x02: /* stax b */
      case 0x12 /* stax d */:
        cpu_cycles = 7;
        this.memory_write_byte(this.rp(opcode >> 3), this.a());
        break;

      // inx, 0x03, 00rr0011
      // rr - 00 (bc), 01 (de), 10 (hl), 11 (sp)
      case 0x03: /* inx b */
      case 0x13: /* inx d */
      case 0x23: /* inx h */
      case 0x33 /* inx sp */:
        cpu_cycles = 5;
        r = opcode >> 3;
        this.set_rp(r, (this.rp(r) + 1) & 0xffff);
        break;

      // inr, 0x04, 00rrr100
      // rrr - b, c, d, e, h, l, m, a
      case 0x04: /* inr b */
      case 0x0c: /* inr c */
      case 0x14: /* inr d */
      case 0x1c: /* inr e */
      case 0x24: /* inr h */
      case 0x2c: /* inr l */
      case 0x34: /* inr m */
      case 0x3c /* inr a */:
        cpu_cycles = opcode !== 0x34 ? 5 : 10;
        this.inr(opcode >> 3);
        break;

      // dcr, 0x05, 00rrr100
      // rrr - b, c, d, e, h, l, m, a
      case 0x05: /* dcr b */
      case 0x0d: /* dcr c */
      case 0x15: /* dcr d */
      case 0x1d: /* dcr e */
      case 0x25: /* dcr h */
      case 0x2d: /* dcr l */
      case 0x35: /* dcr m */
      case 0x3d /* dcr a */:
        cpu_cycles = opcode !== 0x35 ? 5 : 10;
        this.dcr(opcode >> 3);
        break;

      // mvi, 0x06, 00rrr110
      // rrr - b, c, d, e, h, l, m, a
      case 0x06: /* mvi b, data8 */
      case 0x0e: /* mvi c, data8 */
      case 0x16: /* mvi d, data8 */
      case 0x1e: /* mvi e, data8 */
      case 0x26: /* mvi h, data8 */
      case 0x2e: /* mvi l, data8 */
      case 0x36: /* mvi m, data8 */
      case 0x3e /* mvi a, data8 */:
        cpu_cycles = opcode !== 0x36 ? 7 : 10;
        this.set_reg(opcode >> 3, this.next_pc_byte());
        break;

      case 0x07 /* rlc */:
        cpu_cycles = 4;
        a = this.a();
        this.cf = (a & 0x80) !== 0;
        this.set_a(((a << 1) & 0xff) | this.cf);
        break;

      // dad, 0x09, 00rr1001
      // rr - 00 (bc), 01 (de), 10 (hl), 11 (sp)
      case 0x09: /* dad b */
      case 0x19: /* dad d */
      case 0x29: /* dad hl */
      case 0x39 /* dad sp */:
        cpu_cycles = 10;
        this.dad((opcode & 0x30) >> 3);
        break;

      // ldax, 0x0A, 000r1010
      // r - 0 (bc), 1 (de)
      case 0x0a: /* ldax b */
      case 0x1a /* ldax d */:
        cpu_cycles = 7;
        r = (opcode & 0x10) >> 3;
        this.set_a(this.memory_read_byte(this.rp(r)));
        break;

      // dcx, 0x0B, 00rr1011
      // rr - 00 (bc), 01 (de), 10 (hl), 11 (sp)
      case 0x0b: /* dcx b */
      case 0x1b: /* dcx d */
      case 0x2b: /* dcx h */
      case 0x3b /* dcx sp */:
        cpu_cycles = 5;
        r = (opcode & 0x30) >> 3;
        this.set_rp(r, (this.rp(r) - 1) & 0xffff);
        break;

      case 0x0f /* rrc */:
        cpu_cycles = 4;
        a = this.a();
        this.cf = a & 0x01;
        this.set_a((a >> 1) | (this.cf << 7));
        break;

      case 0x17 /* ral */:
        cpu_cycles = 4;
        w8 = this.cf;
        a = this.a();
        this.cf = (a & 0x80) !== 0;
        this.set_a((a << 1) | w8);
        break;

      case 0x1f /* rar */:
        cpu_cycles = 4;
        w8 = this.cf;
        a = this.a();
        this.cf = a & 0x01;
        this.set_a((a >> 1) | (w8 << 7));
        break;

      case 0x22 /* shld addr */:
        cpu_cycles = 16;
        w16 = this.next_pc_word();
        this.memory_read_word(w16); // Trigger read for completeness if needed? No, shld writes.
        this.memory_write_byte(w16, this.l());
        this.memory_write_byte(w16 + 1, this.h());
        break;

      case 0x27 /* daa */: {
        cpu_cycles = 4;
        let carry = this.cf;
        let add = 0;

        a = this.a();
        if (this.hf || (a & 0x0f) > 9) {
          add = 0x06;
        }
        if (this.cf || a >> 4 > 9 || (a >> 4 >= 9 && (a & 0xf) > 9)) {
          add |= 0x60;
          carry = 1;
        }
        this.add_im8(add, 0);
        this.pf = this.parity_table[this.a()];
        this.cf = carry;
        break;
      }

      case 0x2a /* ldhl addr */:
        cpu_cycles = 16;
        w16 = this.next_pc_word();
        this.regs[5] = this.memory_read_byte(w16);
        this.regs[4] = this.memory_read_byte(w16 + 1);
        break;

      case 0x2f /* cma */:
        cpu_cycles = 4;
        this.set_a(this.a() ^ 0xff);
        break;

      case 0x32 /* sta addr */:
        cpu_cycles = 13;
        this.memory_write_byte(this.next_pc_word(), this.a());
        break;

      case 0x37 /* stc */:
        cpu_cycles = 4;
        this.cf = 1;
        break;

      case 0x3a /* lda addr */:
        cpu_cycles = 13;
        this.set_a(this.memory_read_byte(this.next_pc_word()));
        break;

      case 0x3f /* cmc */:
        cpu_cycles = 4;
        this.cf = !this.cf;
        break;

      // mov, 0x40, 01dddsss
      // ddd, sss - b, c, d, e, h, l, m, a
      //            0  1  2  3  4  5  6  7
      case 0x40: /* mov b, b */
      case 0x41: /* mov b, c */
      case 0x42: /* mov b, d */
      case 0x43: /* mov b, e */
      case 0x44: /* mov b, h */
      case 0x45: /* mov b, l */
      case 0x46: /* mov b, m */
      case 0x47: /* mov b, a */

      case 0x48: /* mov c, b */
      case 0x49: /* mov c, c */
      case 0x4a: /* mov c, d */
      case 0x4b: /* mov c, e */
      case 0x4c: /* mov c, h */
      case 0x4d: /* mov c, l */
      case 0x4e: /* mov c, m */
      case 0x4f: /* mov c, a */

      case 0x50: /* mov d, b */
      case 0x51: /* mov d, c */
      case 0x52: /* mov d, d */
      case 0x53: /* mov d, e */
      case 0x54: /* mov d, h */
      case 0x55: /* mov d, l */
      case 0x56: /* mov d, m */
      case 0x57: /* mov d, a */

      case 0x58: /* mov e, b */
      case 0x59: /* mov e, c */
      case 0x5a: /* mov e, d */
      case 0x5b: /* mov e, e */
      case 0x5c: /* mov e, h */
      case 0x5d: /* mov e, l */
      case 0x5e: /* mov e, m */
      case 0x5f: /* mov e, a */

      case 0x60: /* mov h, b */
      case 0x61: /* mov h, c */
      case 0x62: /* mov h, d */
      case 0x63: /* mov h, e */
      case 0x64: /* mov h, h */
      case 0x65: /* mov h, l */
      case 0x66: /* mov h, m */
      case 0x67: /* mov h, a */

      case 0x68: /* mov l, b */
      case 0x69: /* mov l, c */
      case 0x6a: /* mov l, d */
      case 0x6b: /* mov l, e */
      case 0x6c: /* mov l, h */
      case 0x6d: /* mov l, l */
      case 0x6e: /* mov l, m */
      case 0x6f: /* mov l, a */

      case 0x70: /* mov m, b */
      case 0x71: /* mov m, c */
      case 0x72: /* mov m, d */
      case 0x73: /* mov m, e */
      case 0x74: /* mov m, h */
      case 0x75: /* mov m, l */
      case 0x77: /* mov m, a */

      case 0x78: /* mov a, b */
      case 0x79: /* mov a, c */
      case 0x7a: /* mov a, d */
      case 0x7b: /* mov a, e */
      case 0x7c: /* mov a, h */
      case 0x7d: /* mov a, l */
      case 0x7e: /* mov a, m */
      case 0x7f /* mov a, a */:
        src = opcode & 7;
        dst = (opcode >> 3) & 7;
        cpu_cycles = src === 6 || dst === 6 ? 7 : 5;
        this.set_reg(dst, this.reg(src));
        break;

      case 0x76 /* hlt */:
        cpu_cycles = 4;
        this.pc = --this.pc & 0xffff;
        this.halt(true);
        break;

      // add, 0x80, 10000rrr
      // rrr - b, c, d, e, h, l, m, a
      case 0x80: /* add b */
      case 0x81: /* add c */
      case 0x82: /* add d */
      case 0x83: /* add e */
      case 0x84: /* add h */
      case 0x85: /* add l */
      case 0x86: /* add m */
      case 0x87: /* add a */

      // adc, 0x80, 10001rrr
      // rrr - b, c, d, e, h, l, m, a
      case 0x88: /* adc b */
      case 0x89: /* adc c */
      case 0x8a: /* adc d */
      case 0x8b: /* adc e */
      case 0x8c: /* adc h */
      case 0x8d: /* adc l */
      case 0x8e: /* adc m */
      case 0x8f /* adc a */:
        r = opcode & 0x07;
        cpu_cycles = r !== 6 ? 4 : 7;
        this.add(r, opcode & 0x08 ? this.cf : 0);
        break;

      // sub, 0x90, 10010rrr
      // rrr - b, c, d, e, h, l, m, a
      case 0x90: /* sub b */
      case 0x91: /* sub c */
      case 0x92: /* sub d */
      case 0x93: /* sub e */
      case 0x94: /* sub h */
      case 0x95: /* sub l */
      case 0x96: /* sub m */
      case 0x97: /* sub a */

      // sbb, 0x98, 10010rrr
      // rrr - b, c, d, e, h, l, m, a
      case 0x98: /* sbb b */
      case 0x99: /* sbb c */
      case 0x9a: /* sbb d */
      case 0x9b: /* sbb e */
      case 0x9c: /* sbb h */
      case 0x9d: /* sbb l */
      case 0x9e: /* sbb m */
      case 0x9f /* sbb a */:
        r = opcode & 0x07;
        cpu_cycles = r !== 6 ? 4 : 7;
        this.sub(r, opcode & 0x08 ? this.cf : 0);
        break;

      case 0xa0: /* ana b */
      case 0xa1: /* ana c */
      case 0xa2: /* ana d */
      case 0xa3: /* ana e */
      case 0xa4: /* ana h */
      case 0xa5: /* ana l */
      case 0xa6: /* ana m */
      case 0xa7 /* ana a */:
        r = opcode & 0x07;
        cpu_cycles = r !== 6 ? 4 : 7;
        this.ana(r);
        break;

      case 0xa8: /* xra b */
      case 0xa9: /* xra c */
      case 0xaa: /* xra d */
      case 0xab: /* xra e */
      case 0xac: /* xra h */
      case 0xad: /* xra l */
      case 0xae: /* xra m */
      case 0xaf /* xra a */:
        r = opcode & 0x07;
        cpu_cycles = r !== 6 ? 4 : 7;
        this.xra(r);
        break;

      case 0xb0: /* ora b */
      case 0xb1: /* ora c */
      case 0xb2: /* ora d */
      case 0xb3: /* ora e */
      case 0xb4: /* ora h */
      case 0xb5: /* ora l */
      case 0xb6: /* ora m */
      case 0xb7 /* ora a */:
        r = opcode & 0x07;
        cpu_cycles = r !== 6 ? 4 : 7;
        this.ora(r);
        break;

      case 0xb8: /* cmp b */
      case 0xb9: /* cmp c */
      case 0xba: /* cmp d */
      case 0xbb: /* cmp e */
      case 0xbc: /* cmp h */
      case 0xbd: /* cmp l */
      case 0xbe: /* cmp m */
      case 0xbf /* cmp a */:
        r = opcode & 0x07;
        cpu_cycles = r !== 6 ? 4 : 7;
        this.cmp(r);
        break;

      // rnz, rz, rnc, rc, rpo, rpe, rp, rm
      // 0xC0, 11ccd000
      // cc - 00 (zf), 01 (cf), 10 (pf), 11 (sf)
      // d - 0 (negate) or 1.
      case 0xc0: /* rnz */
      case 0xc8: /* rz */
      case 0xd0: /* rnc */
      case 0xd8: /* rc */
      case 0xe0: /* rpo */
      case 0xe8: /* rpe */
      case 0xf0: /* rp */
      case 0xf8 /* rm */:
        r = (opcode >> 4) & 0x03;

        if (r === 0) {
          f_val = this.zf;
        } else if (r === 1) {
          f_val = this.cf;
        } else if (r === 2) {
          f_val = this.pf;
        } else {
          f_val = this.sf;
        }

        if (!!f_val === !!(opcode & 0x08)) {
          cpu_cycles = 11;
          this.ret();
        } else {
          cpu_cycles = 5;
        }
        break;

      // pop, 0xC1, 11rr0001
      // rr - 00 (bc), 01 (de), 10 (hl), 11 (psw)
      case 0xc1: /* pop b */
      case 0xd1: /* pop d */
      case 0xe1: /* pop h */
      case 0xf1 /* pop psw */:
        r = (opcode & 0x30) >> 3;
        cpu_cycles = 11;
        w16 = this.pop();
        if (r !== 6) {
          this.set_rp(r, w16);
        } else {
          this.set_a(w16 >> 8);
          this.retrieve_flags(w16 & 0xff);
        }
        break;

      // jnz, jz, jnc, jc, jpo, jpe, jp, jm
      // 0xC2, 11ccd010
      // cc - 00 (zf), 01 (cf), 10 (pf), 11 (sf)
      // d - 0 (negate) or 1.
      case 0xc2: /* jnz addr */
      case 0xca: /* jz addr */
      case 0xd2: /* jnc addr */
      case 0xda: /* jc addr */
      case 0xe2: /* jpo addr */
      case 0xea: /* jpe addr */
      case 0xf2: /* jp addr */
      case 0xfa /* jm addr */:
        cpu_cycles = 10;
        w16 = this.next_pc_word();
        r = (opcode >> 4) & 0x03;

        if (r === 0) {
          f_val = this.zf;
        } else if (r === 1) {
          f_val = this.cf;
        } else if (r === 2) {
          f_val = this.pf;
        } else {
          f_val = this.sf;
        }

        this.pc = !!f_val === !!(opcode & 0x08) ? w16 : this.pc;
        break;

      // jmp, 0xc3, 1100r011
      case 0xc3: /* jmp addr */
      case 0xcb /* jmp addr, undocumented */:
        cpu_cycles = 10;
        this.pc = this.next_pc_word();
        break;

      // cnz, cz, cnc, cc, cpo, cpe, cp, cm
      // 0xC4, 11ccd100
      // cc - 00 (zf), 01 (cf), 10 (pf), 11 (sf)
      // d - 0 (negate) or 1.
      case 0xc4: /* cnz addr */
      case 0xcc: /* cz addr */
      case 0xd4: /* cnc addr */
      case 0xdc: /* cc addr */
      case 0xe4: /* cpo addr */
      case 0xec: /* cpe addr */
      case 0xf4: /* cp addr */
      case 0xfc /* cm addr */:
        w16 = this.next_pc_word();
        r = (opcode >> 4) & 0x03;

        if (r === 0) {
          f_val = this.zf;
        } else if (r === 1) {
          f_val = this.cf;
        } else if (r === 2) {
          f_val = this.pf;
        } else {
          f_val = this.sf;
        }

        if (!!f_val === !!(opcode & 0x08)) {
          cpu_cycles = 17;
          this.call(w16);
        } else {
          cpu_cycles = 11;
        }
        break;

      // push, 0xC5, 11rr0101
      // rr - 00 (bc), 01 (de), 10 (hl), 11 (psw)
      case 0xc5: /* push b */
      case 0xd5: /* push d */
      case 0xe5: /* push h */
      case 0xf5 /* push psw */:
        r = (opcode & 0x30) >> 3;
        cpu_cycles = 11;
        w16 = r !== 6 ? this.rp(r) : (this.a() << 8) | this.store_flags();
        this.push(w16);
        break;

      case 0xc6 /* adi data8 */:
        cpu_cycles = 7;
        this.add_im8(this.next_pc_byte(), 0);
        break;

      // rst, 0xC7, 11aaa111
      // aaa - 000(0)-111(7), address = aaa*8 (0 to 0x38).
      case 0xc7: /* rst 0 */
      case 0xcf: /* rst 1 */
      case 0xd7: /* rst 2 */
      case 0xdf: /* rst 3 */
      case 0xe7: /* rst 4 */
      case 0xef: /* rst 5 */
      case 0xf7: /* rst 6 */
      case 0xff /* rst 7 */:
        cpu_cycles = 11;
        this.rst(opcode & 0x38);
        break;

      // ret, 0xc9, 110r1001
      case 0xc9: /* ret */
      case 0xd9 /* ret, undocumented */:
        cpu_cycles = 10;
        this.ret();
        break;

      // call, 0xcd, 11rr1101
      case 0xcd: /* call addr */
      case 0xdd: /* call, undocumented */
      case 0xed: /* call, undocumented */
      case 0xfd /* call, undocumented */:
        cpu_cycles = 17;
        this.call(this.next_pc_word());
        break;

      case 0xce /* aci data8 */:
        cpu_cycles = 7;
        this.add_im8(this.next_pc_byte(), this.cf);
        break;

      case 0xd3 /* out port8 */:
        cpu_cycles = 10;
        this.io.output(this.next_pc_byte(), this.a());
        break;

      case 0xd6 /* sui data8 */:
        cpu_cycles = 7;
        this.sub_im8(this.next_pc_byte(), 0);
        break;

      case 0xdb /* in port8 */:
        cpu_cycles = 10;
        this.set_a(this.io.input(this.next_pc_byte()));
        break;

      case 0xde /* sbi data8 */:
        cpu_cycles = 7;
        this.sub_im8(this.next_pc_byte(), this.cf);
        break;

      case 0xe3 /* xthl */:
        cpu_cycles = 18;
        w16 = this.memory_read_word(this.sp);
        this.memory_write_word(this.sp, this.hl());
        this.set_l(w16 & 0xff);
        this.set_h(w16 >> 8);
        break;

      case 0xe6 /* ani data8 */:
        cpu_cycles = 7;
        this.ana_im8(this.next_pc_byte());
        break;

      case 0xe9 /* pchl */:
        cpu_cycles = 5;
        this.pc = this.hl();
        break;

      case 0xeb /* xchg */:
        cpu_cycles = 4;
        w8 = this.l();
        this.set_l(this.e());
        this.set_e(w8);
        w8 = this.h();
        this.set_h(this.d());
        this.set_d(w8);
        break;

      case 0xee /* xri data8 */:
        cpu_cycles = 7;
        this.xra_im8(this.next_pc_byte());
        break;

      // di/ei, 1111c011
      // c - 0 (di), 1 (ei)
      case 0xf3: /* di */
      case 0xfb /* ei */:
        cpu_cycles = 4;
        this.iff = (opcode & 0x08) !== 0;
        this.io.interrupt(this.iff);
        break;

      case 0xf6 /* ori data8 */:
        cpu_cycles = 7;
        this.ora_im8(this.next_pc_byte());
        break;

      case 0xf9 /* sphl */:
        cpu_cycles = 5;
        this.sp = this.hl();
        break;

      case 0xfe /* cpi data8 */:
        cpu_cycles = 7;
        this.cmp_im8(this.next_pc_byte());
        break;
    }

    I8080.total_cpu_cycles += cpu_cycles;
    return cpu_cycles;
  };
}

I8080.prototype.init = function () {
  this.restart();
};

I8080.prototype.restart = function () {
  this.sp = 0;
  this.pc = 0;
  this.iff = 0;

  this.sf = 0;
  this.pf = 0;
  this.hf = 0;
  this.zf = 0;
  this.cf = 0;

  this.regs.fill(0);

  this.halt(false);
  this.idle(false);

  I8080.start_frame = I8080.total_cpu_cycles = 0;
};

I8080.prototype.get_state = function () {
  return {
    BC: this.bc(),
    DE: this.de(),
    HL: this.hl(),
    AF: this.get_af(),
    PC: this.get_pc(),
    SP: this.get_sp(),
    IFF: this.iff,
  };
};

I8080.prototype.set_state = function (regs) {
  if ('B' in regs) {
    this.set_b(regs.B);
  }

  if ('C' in regs) {
    this.set_c(regs.C);
  }

  if ('D' in regs) {
    this.set_d(regs.D);
  }

  if ('E' in regs) {
    this.set_e(regs.E);
  }

  if ('H' in regs) {
    this.set_h(regs.H);
  }

  if ('L' in regs) {
    this.set_l(regs.L);
  }

  if ('A' in regs) {
    this.set_a(regs.A);
  }

  if ('F' in regs) {
    this.retrieve_flags(regs.F);
  }

  if ('PC' in regs) {
    this.pc = regs.PC & 0xffff;
  }

  if ('SP' in regs) {
    this.sp = regs.SP & 0xffff;
  }

  if ('IFF' in regs) {
    this.iff = regs.IFF & 0xff;
  }
};

I8080.prototype.memory_read_byte = function (addr) {
  return this.memory.read(addr);
};

I8080.prototype.memory_write_byte = function (addr, w8) {
  this.memory.write(addr, w8);
};

I8080.prototype.memory_read_word = function (addr) {
  return this.memory_read_byte(addr) | (this.memory_read_byte(addr + 1) << 8);
};

I8080.prototype.memory_write_word = function (addr, w16) {
  this.memory_write_byte(addr, w16);
  this.memory_write_byte(addr + 1, w16 >> 8);
};

I8080.prototype.instruction = function () {
  return this.execute(this.is_idle || this.is_halted ? 0x00 : this.get_optcode());
};

I8080.prototype.jump = function (addr) {
  this.pc = addr & 0xffff;
};

I8080.prototype.run = function (frame_cycles) {
  I8080.start_frame = I8080.total_cpu_cycles;

  let cycles = 0;
  for (; cycles < frame_cycles; cycles += this.instruction());

  return cycles;
};

I8080.prototype.gosub = function (addr) {
  let cycles = 0;
  const ret_pc = this.pc;

  this.call(addr & 0xffff);

  do {
    cycles += this.execute(this.get_optcode());
  } while (this.pc !== ret_pc);

  return cycles;
};

I8080.prototype.halt = function (state = !this.is_halted) {
  this.is_halted = state;
};

I8080.prototype.idle = function (state = !this.is_idle) {
  this.is_idle = state;
};

I8080.prototype.set_traps = function (watcher) {
  if (!(watcher instanceof Watcher)) {
    throw new Error('MEMORY: Invalid WATCHER object');
  }

  for (const addr in watcher) {
    if (Object.prototype.hasOwnProperty.call(watcher, addr)) {
      this.traps[addr] = watcher[addr];
    }
  }
};

I8080.NOPE_OPTCODE = 0x00;
I8080.UNDEF_OPTCODE = 0x100;
I8080.start_frame = 0;
I8080.total_cpu_cycles = 0;
