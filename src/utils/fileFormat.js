/*
 * Copyright (C) 2014 Oleg Dolgarev <o.dolgarev@gmail.com>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

/**
 * Checks that `data` starts with the expected ASCII magic string.
 *
 * The trailing NUL byte of the magic is not part of the comparison, matching
 * the headers used by the LVOV/DUMP and "Emulator 3000" snapshot formats.
 *
 * @param {ArrayBuffer} data - File contents.
 * @param {string} magicString - Expected magic string, including the trailing NUL.
 * @returns {boolean}
 */
export const validateFileHeader = (data, magicString) => {
  return (
    new TextDecoder('utf-8').decode(new Uint8Array(data, 0, magicString.length - 1)) === magicString
  );
};
