const { ApplicationV2 } = foundry.applications.api
const { api } = foundry.applications

/**
 * Full screen buzzer prompt shown on a responding client.
 *
 * The clock starts when the overlay has actually painted, not when render()
 * resolves, so the reported time is the player's reaction and not this
 * client's render cost. Ordering is therefore client measured: each client
 * reports its own elapsed time and the GM sorts on that.
 */
export class Break extends api.HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options)

    this.socket = options.socket

    this.prompt = null
    this.shownAt = null
    this.buzzed = false
    this.elapsed = null
    /** @type {Array<{userId: string, rank: number, elapsed: number, cut: boolean}>} */
    this.statuses = []
  }

  /** Arrow function so the listener stays bound and removable. */
  #onKeyDown = (event) => {
    if (event.code !== 'Space' || event.repeat) return
    event.preventDefault()
    this.buzz()
  }

  static DEFAULT_OPTIONS = {
    id: 'break',
    tag: 'div',
    window: {
      frame: false,
      positioned: false,
    },
    actions: {
      buzz: Break.onBuzz,
    },
  }

  static PARTS = {
    prompt: {
      template: 'modules/break/templates/prompt.hbs',
      id: 'prompt',
    },
  }

  async _prepareContext(options) {
    const statuses = new Map(this.statuses.map((status) => [status.userId, status]))

    const participants = (this.prompt?.participants ?? []).map((userId) => {
      const user = game.users.get(userId)
      const isSelf = userId === game.user.id
      const status = statuses.get(userId)

      // Trust local state for our own tile so the player sees their time
      // immediately, before the GM's broadcast comes back.
      const buzzed = isSelf ? this.buzzed : status != null
      const elapsed =
        isSelf && this.elapsed != null ? Math.round(this.elapsed) : (status?.elapsed ?? null)

      return {
        isSelf,
        name: user?.name ?? userId,
        img: user?.character?.img ?? user?.avatar ?? 'icons/svg/mystery-man.svg',
        buzzed,
        elapsed,
        rank: status?.rank ?? null,
        cut: status?.cut ?? false,
      }
    })

    return {
      prompt: this.prompt,
      limit: this.prompt?.limit ?? null,
      participants,
    }
  }

  /**
   * Display a prompt and start this client's clock.
   * @param {object} prompt
   * @param {string} prompt.id             Identifies this round of buzzing.
   * @param {string} prompt.text           Message shown above the roster.
   * @param {string} prompt.gmId           GM to report back to.
   * @param {number|null} prompt.limit     Cap on accepted responses, if any.
   * @param {string[]} prompt.participants Everyone prompted, in roster order.
   */
  async show(prompt) {
    this.prompt = prompt
    this.buzzed = false
    this.elapsed = null
    this.shownAt = null
    this.statuses = []

    await this.render({ force: true })

    // Two frames: the first schedules the paint, the second runs after it.
    await new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    })

    this.shownAt = performance.now()
  }

  /**
   * Apply the GM's view of who has buzzed so far.
   * @param {object} update
   * @param {string} update.promptId
   * @param {Array} update.statuses
   */
  async sync({ promptId, statuses }) {
    if (this.prompt?.id !== promptId) return

    this.statuses = statuses
    await this.render({ parts: ['prompt'] })
  }

  /**
   * Close the prompt. Any buzz already sent has been reported, so this only
   * clears local state.
   * @param {string} [promptId]  Ignore the request if a newer prompt is up.
   */
  async dismiss(promptId) {
    if (promptId && this.prompt?.id !== promptId) return

    this.prompt = null
    this.shownAt = null
    this.buzzed = false
    this.elapsed = null
    this.statuses = []

    if (this.rendered) await this.close()
  }

  /** @this {Break} */
  static async onBuzz(event, target) {
    await this.buzz()
  }

  async buzz() {
    // shownAt is null between render and paint; a buzz that fast is a stray
    // event, not a reaction.
    if (this.buzzed || this.shownAt == null) return

    this.buzzed = true
    this.elapsed = performance.now() - this.shownAt

    await this.render({ parts: ['prompt'] })

    // Report to the GM that opened this prompt. The render above already ran,
    // so the player sees their own time even if that GM has dropped.
    try {
      await this.socket.executeAsUser('buzz', this.prompt.gmId, {
        promptId: this.prompt.id,
        userId: game.user.id,
        elapsed: this.elapsed,
      })
    } catch (error) {
      console.error('Break | Failed to report buzz:', error)
    }
  }

  _onRender(context, options) {
    super._onRender(context, options)
    document.addEventListener('keydown', this.#onKeyDown)
  }

  _onClose(options) {
    super._onClose(options)
    document.removeEventListener('keydown', this.#onKeyDown)
  }
}
