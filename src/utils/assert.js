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
 * Throws unless `value` is an instance of `Type`.
 *
 * Replaces the repeated `if (!(x instanceof Y)) throw new Error(...)` pattern
 * used by the component constructors.
 *
 * @param {unknown} value - Value to check.
 * @param {Function} Type - Expected constructor.
 * @param {string} message - Error message thrown on failure.
 */
export function assertInstance(value, Type, message) {
  if (!(value instanceof Type)) {
    throw new Error(message);
  }
}
