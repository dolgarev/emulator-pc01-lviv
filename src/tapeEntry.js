/**
 * BLOAD/CLOAD trap entry state.
 *
 * The emulator loads a .lvt tape file through the ROM's BLOAD/CLOAD traps
 * (src/traps.js). To fire a trap the machine must be running BASIC with the
 * command already issued — the state the former dump-bload.bin / dump-cload.bin
 * snapshots encoded. Instead of shipping those two ~80 KiB blobs, we boot BASIC
 * once (see ComputerProfile.boot_basic) and lay down the small entry delta below
 * on top of the booted state. Boot-to-prompt RAM differs from the old snapshots
 * only by the ~75 bytes of command buffer / stack / entry flags reproduced here.
 */

// How many emulated cycles the ROM cold-start needs to reach the BASIC prompt.
// The cold-start is heavily RAM-bound, so the RAM wait states (enabled by
// default) roughly double the cycle count: ~24M cycles are required with the
// contention on versus ~8-12M without. Leave a healthy margin.
export const BOOT_CYCLES = 32_000_000;

export const TAPE_ENTRY = {
  bload: {
    pc: 0xdd94,
    sp: 0xafbb,
    regs: { B: 0x00, C: 0xf5, D: 0x00, E: 0x00, H: 0x01, L: 0x0d, A: 0x00, F: 0x56 },
    // Return path on the stack: [sp]=0xDD20 (the autostart tail) and
    // [sp+4]=0x0589 (the BASIC command loop); [sp+2] is discarded by the
    // DD2F POP H on the way out.
    stack: [
      [0xafbb, 0xdd20],
      [0xafbd, 0x010d],
      [0xafbf, 0x0589],
    ],
    autostart: 0x52, // 'R'
  },
  cload: {
    pc: 0xe50b,
    sp: 0xafc9,
    regs: { B: 0xe5, C: 0x64, D: 0x17, E: 0x22, H: 0x17, L: 0x22, A: 0x00, F: 0x46 },
    // The CLOAD tail ends with JMP (0xE567: CALL DCB8; JMP 1054), so only
    // [sp]=0xE567 matters; the stack below is never read.
    stack: [[0xafc9, 0xe567]],
  },
};

/**
 * Lays down the entry state for a tape trap on top of a freshly restored booted
 * BASIC state: the return path on the stack, AUTOSTART (BLOAD only) and the CPU
 * registers (SP/PC point at the trap entry). Pure and side-effect free apart from
 * the CPU writes, so it can be exercised headlessly.
 */
export function applyTapeEntry(cpu, kind) {
  const entry = TAPE_ENTRY[kind];
  if (!entry) {
    throw new Error(`TAPE_ENTRY: Unknown kind "${kind}"`);
  }

  for (const [addr, value] of entry.stack) {
    cpu.memory_write_word(addr, value);
  }

  if (entry.autostart !== undefined) {
    cpu.memory_write_byte(0xbea3, entry.autostart);
  }

  cpu.set_state({ ...entry.regs, SP: entry.sp, PC: entry.pc });
}
