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
