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
 * Builds a screenshot file name with a `YYYY-MM-DD_HH-MM-SS` timestamp.
 *
 * @param {string} extension - File extension (without the leading dot).
 * @param {string} [prefix='screenshot'] - File name prefix.
 * @returns {string}
 */
export const generateScreenshotFilename = (extension, prefix = 'screenshot') => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const timestamp = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;

  return `${prefix}_${timestamp}.${extension}`;
};

/**
 * Maps a screenshot MIME type to a file extension.
 *
 * @param {string} mimeType - Screenshot MIME type (e.g. `image/png`).
 * @returns {string}
 */
export const getFileExtension = (mimeType) => {
  let extension = 'bin'; // default extension

  switch (mimeType) {
    case 'image/png':
      extension = 'png';
      break;
    case 'image/jpeg':
      extension = 'jpg';
      break;
    case 'image/webp':
      extension = 'webp';
      break;
    default: {
      // Fall back to the MIME subtype for unknown types.
      const parts = mimeType.split('/');
      if (parts.length > 1) {
        extension = parts[1].split(';')[0]; // drop parameters (e.g. ';base64')
      }
      if (!extension) {
        extension = 'bin';
        console.warn(
          `SCREENSHOT: Unknown screenshot type '${mimeType}', defaulting to '.bin' extension.`
        );
      }
      break;
    }
  }

  return extension;
};
