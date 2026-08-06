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

  async _prepareContext(options) {
    const order = [...this.responses.entries()]
      .sort(([, a], [, b]) => a - b)
      .map(([userId, elapsed], index) => ({
        rank: index + 1,
        name: game.users.get(userId)?.name ?? userId,
        elapsed: Math.round(elapsed),
      }))

    const pending = this.expected
      .filter((userId) => !this.responses.has(userId))
      .map((userId) => game.users.get(userId)?.name ?? userId)

    return {
      prompt: this.prompt,
      order,
      pending,
      active: this.prompt != null,
    }
  }

  /**
   * Broadcast a prompt to every other connected user and open the results.
   * @param {object} options
   * @param {string} [options.text]  Message shown to players.
   */
  async start({ text = 'Buzz in!' } = {}) {
    const recipients = game.users.filter((user) => user.active && user.id !== game.user.id)

    // Carry our own id so buzzes come back to this GM specifically, not to
    // whichever GM socketlib would pick for executeAsGM.
    this.prompt = { id: foundry.utils.randomID(), text, gmId: game.user.id }
    this.responses = new Map()
    this.expected = recipients.map((user) => user.id)

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
