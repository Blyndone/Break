import { BreakOverlay } from './overlay.js'
import { headlineFor, participantFor, rosterFor } from './roster.js'

const MODULE_ID = 'break'

/**
 * Seconds to wait past the players' deadline before ending the round, so a buzz
 * sent just under the wire on a slow connection still arrives in time to count.
 */
const GRACE_SECONDS = 1

/**
 * GM side collector and display for a round of buzzing.
 *
 * Holds the authoritative record of who was prompted and who has responded.
 * Responses carry a client measured elapsed time; this class only validates
 * and sorts them.
 *
 * The GM sees the same full screen overlay the players do, ranked fastest
 * first and carrying the detail the table does not need: the gap behind the
 * leader, who is still out, and the controls to end the round.
 */
export class BreakResults extends BreakOverlay {
  constructor(options = {}) {
    super(options)

    this.socket = options.socket

    this.prompt = null
    /** @type {Map<string, number>} userId -> elapsed ms */
    this.responses = new Map()
    /** @type {string[]} userIds that were sent the prompt */
    this.expected = []
    /** @type {number|null} Keep only the fastest this many responses. */
    this.limit = null
  }

  /** @type {number|null} Handle for the auto-end deadline. */
  #timer = null

  static DEFAULT_OPTIONS = {
    id: 'break-results',
    actions: {
      dismiss: BreakResults.onDismiss,
      cancel: BreakResults.onCancel,
    },
  }

  static PARTS = {
    results: {
      template: 'modules/break/templates/results.hbs',
      id: 'results',
      // The same card the players see, loaded as a partial before each render.
      templates: ['modules/break/templates/roster-card.hbs'],
    },
  }

  /**
   * Current standings. Ranked on the reported time, not on arrival order, so a
   * slow connection does not cost a player their place. The cap is applied
   * after sorting for the same reason: a fast reaction that reaches us late
   * still displaces a slower one that arrived first.
   */
  #standings() {
    return [...this.responses.entries()]
      .sort(([, a], [, b]) => a - b)
      .map(([userId, elapsed], index) => ({
        userId,
        rank: index + 1,
        elapsed: Math.round(elapsed),
        cut: this.limit != null && index >= this.limit,
      }))
  }

  async _prepareContext(options) {
    // Re-sorted on every buzz, so the window reads as a live leaderboard while
    // everyone still waiting keeps their place at the back of it.
    const participants = rosterFor({
      participants: this.expected,
      statuses: this.#standings(),
      limit: this.limit,
      expired: this.clock.spentOut,
      order: 'rank',
    })

    return {
      prompt: this.prompt,
      headline: headlineFor(this.prompt),
      participants,
      answered: this.responses.size,
      total: this.expected.length,
      limit: this.limit,
      duration: this.clock.duration,
      countdownDelay: this.clock.delay,
      clock: this.clock.reading,
      expired: this.clock.spentOut,
      active: this.prompt != null,
    }
  }

  /**
   * Broadcast a prompt to every other connected user and open the results.
   * @param {object} options
   * @param {string} [options.text]    Message shown above the button.
   * @param {number} [options.limit]   Keep only the fastest this many responses.
   */
  async start({ text = '', limit = null } = {}) {
    this.#clearTimer()

    const recipients = game.users.filter((user) => user.active && user.id !== game.user.id)
    const duration = game.settings.get(MODULE_ID, 'duration')

    this.responses = new Map()
    this.expected = recipients.map((user) => user.id)
    this.limit = limit
    this.clock.arm(duration)

    // Carry our own id so buzzes come back to this GM specifically, not to
    // whichever GM socketlib would pick for executeAsGM. The limit rides along
    // so the button can read "BREAK 3", and participants so every client can
    // draw the same roster. Ids only: each client resolves its own portraits.
    this.prompt = {
      id: foundry.utils.randomID(),
      text,
      limit,
      duration,
      gmId: game.user.id,
      participants: this.expected,
    }

    await this.render({ force: true })
    await this.socket.executeForOthers('showPrompt', this.prompt)

    // Started once the prompt is on its way out, so this readout tracks the
    // players' own clocks rather than the time spent opening this window.
    this.clock.begin()

    if (duration > 0) {
      this.#timer = setTimeout(() => this.#expire(), duration * 1000)
    }
  }

  /**
   * Time is up. Clients have stopped accepting a buzz, so the roster settles
   * into its final shape; the round itself ends a moment later, so anything
   * already in flight still lands.
   */
  async #expire() {
    this.#timer = setTimeout(() => this.dismiss(), GRACE_SECONDS * 1000)
    if (this.rendered) await this.render({ parts: ['results'] })
  }

  #clearTimer() {
    if (this.#timer == null) return
    clearTimeout(this.#timer)
    this.#timer = null
  }

  /**
   * Record a client's reported reaction time.
   * @param {object} response
   * @param {string} response.promptId
   * @param {string} response.userId
   * @param {number} response.elapsed  Milliseconds, measured on that client.
   */
  async record({ promptId, userId, elapsed }) {
    // Reject buzzes for a prompt that is over, and keep only the first buzz
    // from any given user.
    if (promptId !== this.prompt?.id) return
    if (this.responses.has(userId)) return
    if (!Number.isFinite(elapsed) || elapsed < 0) return

    this.responses.set(userId, elapsed)
    await this.render({ parts: ['results'] })

    // Push the new standings so every roster updates, not just this GM's.
    await this.socket.executeForOthers('syncStatus', {
      promptId,
      statuses: this.#standings(),
    })
  }

  /**
   * End the round: drop every client's overlay, post the results to chat, then
   * fade this overlay out.
   * @param {object} [options]
   * @param {boolean} [options.post]  Post the standings to chat. Cancelling a
   *                                  round ends it without a record.
   */
  async dismiss({ post = true } = {}) {
    const prompt = this.prompt
    if (!prompt) return

    this.#clearTimer()
    this.clock.stop()

    // Clear first so a buzz that lands mid teardown is rejected, and so the
    // close below does not come back through here.
    this.prompt = null

    await this.socket.executeForOthers('dismissPrompt', prompt.id)
    if (post) await this.#postResults(prompt)
    await this.closeOverlay()
  }

  /**
   * Post the final order to chat, visible to everyone.
   * @param {object} prompt  The round that just ended.
   */
  async #postResults(prompt) {
    const order = this.#standings().map((entry) => ({
      ...entry,
      ...participantFor(entry.userId),
    }))

    const pending = this.expected
      .filter((userId) => !this.responses.has(userId))
      .map((userId) => participantFor(userId).name)

    const content = await foundry.applications.handlebars.renderTemplate(
      'modules/break/templates/chat-results.hbs',
      { headline: headlineFor(prompt), limit: this.limit, order, pending },
    )

    // A plain alias rather than getSpeaker(): that helper ignores a user and
    // falls back to whatever token the GM happens to have selected, which
    // would attribute the results to a random actor.
    await ChatMessage.implementation.create({
      content,
      speaker: { alias: 'Break' },
      flags: { break: { promptId: prompt.id } },
    })
  }

  _onClose(options) {
    super._onClose(options)
    this.clock.reset()

    // Closed with a round still running, by Escape or by anything else that
    // reaches past the buttons. End it properly rather than leaving every
    // player staring at an overlay nobody can clear.
    if (this.prompt) this.dismiss()
  }

  /** @this {BreakResults} */
  static async onDismiss(event, target) {
    await this.dismiss()
  }

  /** @this {BreakResults} */
  static async onCancel(event, target) {
    await this.dismiss({ post: false })
  }
}
