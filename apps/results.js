const { ApplicationV2 } = foundry.applications.api
const { api } = foundry.applications

/**
 * GM side collector and display for a round of buzzing.
 *
 * Holds the authoritative record of who was prompted and who has responded.
 * Responses carry a client measured elapsed time; this class only validates
 * and sorts them.
 */
export class BreakResults extends api.HandlebarsApplicationMixin(ApplicationV2) {
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

  static DEFAULT_OPTIONS = {
    id: 'break-results',
    tag: 'div',
    window: {
      title: 'Break',
      icon: 'fa-solid fa-bell',
      resizable: true,
    },
    position: {
      width: 400,
      height: 'auto',
    },
    actions: {
      dismiss: BreakResults.onDismiss,
    },
  }

  static PARTS = {
    results: {
      template: 'modules/break/templates/results.hbs',
      id: 'results',
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
    const order = this.#standings().map((entry) => ({
      ...entry,
      name: game.users.get(entry.userId)?.name ?? entry.userId,
    }))

    const pending = this.expected
      .filter((userId) => !this.responses.has(userId))
      .map((userId) => game.users.get(userId)?.name ?? userId)

    return {
      prompt: this.prompt,
      order,
      pending,
      limit: this.limit,
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
    const recipients = game.users.filter((user) => user.active && user.id !== game.user.id)

    this.responses = new Map()
    this.expected = recipients.map((user) => user.id)
    this.limit = limit

    // Carry our own id so buzzes come back to this GM specifically, not to
    // whichever GM socketlib would pick for executeAsGM. The limit rides along
    // so the button can read "BREAK 3", and participants so every client can
    // draw the same roster. Ids only: each client resolves its own portraits.
    this.prompt = {
      id: foundry.utils.randomID(),
      text,
      limit,
      gmId: game.user.id,
      participants: this.expected,
    }

    await this.render({ force: true })
    await this.socket.executeForOthers('showPrompt', this.prompt)
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

  /** Close every client's overlay and end the round. */
  async dismiss() {
    const promptId = this.prompt?.id
    if (!promptId) return

    this.prompt = null
    await this.socket.executeForOthers('dismissPrompt', promptId)
    await this.render({ parts: ['results'] })
  }

  /** @this {BreakResults} */
  static async onDismiss(event, target) {
    await this.dismiss()
  }
}
