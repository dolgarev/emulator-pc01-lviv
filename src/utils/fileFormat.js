/**
 * Smallest image each restore path can work with (CODE_REVIEW.md P2.21). A short file used
 * to surface as an opaque "Offset is outside the bounds of the DataView" from deep inside
 * the restore, often after part of the machine had already been overwritten.
 *
 * `BLOAD_HEADER_SIZE` is the .lvt code-file header (type, name, CODFL_ORG/END/RUN) and
 * `CLOAD_HEADER_SIZE` the BASIC one (type, name). The snapshot sizes are the fixed image
 * layouts: a 17-byte header + 48 KiB RAM + 16 KiB ROM + 16 KiB VRAM + 256 port bytes +
 * 12 CPU bytes for LVOV/DUMP, and the 0x240-byte Emulator 3000 header with its 0x29-byte
 * gap before the VRAM block, up to the last PPI2 byte.
 */
export const BLOAD_HEADER_SIZE = 0x16;
export const CLOAD_HEADER_SIZE = 0x11;
export const SNAPSHOT_SIZE = 0x11 + 0xc000 + 0x4000 + 0x4000 + 0x100 + 12;
export const E3_SNAPSHOT_SIZE = 0x240 + 0xc000 + 0x4000 + 0x29 + 0x4000 + 0x4c + 1;

/**
 * Checks that `data` starts with the expected ASCII magic string.
 *
 * The magic strings of the LVOV/DUMP and "Emulator 3000" snapshot formats are
 * compared as-is (16 and 13 bytes); no trailing NUL is required.
 *
 * @param {ArrayBuffer} data - File contents.
 * @param {string} magicString - Expected magic string.
 * @returns {boolean}
 */
export const validateFileHeader = (data, magicString) => {
  if (data.byteLength < magicString.length) {
    return false;
  }

  return (
    new TextDecoder('utf-8').decode(new Uint8Array(data, 0, magicString.length)) === magicString
  );
};
