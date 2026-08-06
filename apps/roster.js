/**
 * Shared helpers for describing a prompt and the users in it, so the overlay,
 * the results window and the chat card all read the same way.
 */

/**
 * The line that announces a prompt: the GM's message if they gave one, or the
 * call itself with its cap.
 * @param {object|null} prompt
 * @returns {string}
 */
export function headlineFor(prompt) {
  const limit = prompt?.limit ?? null
  return prompt?.text?.trim() || `BREAK${limit ? ` ${limit}` : ''}`
}

/**
 * A user's portrait: their assigned character's art, else their avatar.
 * @param {User} user
 * @returns {string}
 */
export function portraitFor(user) {
  return user?.character?.img ?? user?.avatar ?? 'icons/svg/mystery-man.svg'
}

/**
 * Display name and portrait for a user id that may no longer resolve.
 * @param {string} userId
 * @returns {{name: string, img: string}}
 */
export function participantFor(userId) {
  const user = game.users.get(userId)
  return { name: user?.name ?? userId, img: portraitFor(user) }
}
