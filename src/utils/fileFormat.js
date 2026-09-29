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
