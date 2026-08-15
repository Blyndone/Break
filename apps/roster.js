/**
 * Shared helpers for describing a prompt and the users in it, so the overlay,
 * the results window and the chat card all read the same way.
 */

/**
 * The call itself, with its cap: "BREAK" or "BREAK 3".
 * @param {number|null} [limit]
 * @returns {string}
 */
export function callFor(limit = null) {
  return `BREAK${limit ? ` ${limit}` : ''}`
}

/**
 * The line that announces a prompt: the GM's message if they gave one, or the
 * call itself.
 * @param {object|null} prompt
 * @returns {string}
 */
export function headlineFor(prompt) {
  return prompt?.text?.trim() || callFor(prompt?.limit ?? null)
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

/**
 * One card per prompted user, ready for the roster template. Both sides of the
 * round build their view through here: the players' overlay and the GM's
 * window then differ only in ordering and in how much of it they draw.
 *
 * @param {object} options
 * @param {string[]} options.participants Everyone prompted, in roster order.
 * @param {Array} [options.statuses]      Standings so far, from the GM.
 * @param {number|null} [options.limit]   Cap on accepted responses, if any.
 * @param {boolean} [options.expired]     Time is up; non-responders have missed.
 * @param {string|null} [options.selfId]  The viewer, if they are in the round.
 * @param {object|null} [options.self]    Local view of the viewer's own buzz,
 *                                        known before the GM broadcasts it.
 * @param {'prompt'|'rank'} [options.order] Roster order, or fastest first.
 * @returns {Array}
 */
export function rosterFor({
  participants = [],
  statuses = [],
  limit = null,
  expired = false,
  selfId = null,
  self = null,
  order = 'prompt',
} = {}) {
  const byUser = new Map(statuses.map((status) => [status.userId, status]))
  // The gap column measures everyone against the winner's time.
  const fastest = statuses.reduce((best, status) => Math.min(best, status.elapsed), Infinity)

  const cards = participants.map((userId) => {
    const status = byUser.get(userId)
    const isSelf = selfId != null && userId === selfId

    // Trust local state for the viewer's own card so they see their time
    // immediately, before the GM's broadcast comes back.
    const own = isSelf ? self : null
    const buzzed = own?.buzzed || status != null
    const elapsed = own?.elapsed != null ? Math.round(own.elapsed) : (status?.elapsed ?? null)

    return {
      userId,
      ...participantFor(userId),
      isSelf,
      buzzed,
      rank: status?.rank ?? null,
      elapsed,
      // Only meaningful once the GM has ranked the buzz against the others.
      gap: status && status.elapsed > fastest ? Math.round(status.elapsed - fastest) : null,
      cut: status?.cut ?? false,
      missed: !buzzed && expired,
      // Only the viewer's own card carries a button, and only while the round
      // is still open to them.
      buzzer: isSelf && !buzzed && !expired,
      call: callFor(limit),
    }
  })

  // Fastest first for a leaderboard; those still waiting keep roster order
  // behind them, since a stable sort leaves equal keys alone.
  if (order === 'rank') cards.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity))

  return cards
}
