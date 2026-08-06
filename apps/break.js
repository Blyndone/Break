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
    return {
      prompt: this.prompt,
      buzzed: this.buzzed,
      elapsed: this.elapsed == null ? null : Math.round(this.elapsed),
    }
  }

  /**
   * Display a prompt and start this client's clock.
   * @param {object} prompt
   * @param {string} prompt.id    Identifies this round of buzzing.
   * @param {string} prompt.text  Message shown to the player.
   */
  async show(prompt) {
    this.prompt = prompt
    this.buzzed = false
    this.elapsed = null
    this.shownAt = null

    await this.render({ force: true })

    // Two frames: the first schedules the paint, the second runs after it.
    await new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    })

    this.shownAt = performance.now()
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

    if (this.rendered) await this.close()
  }

  /**
   * Record this client's reaction time and report it to the GM.
   * @this {Break}
   */
  static async onBuzz(event, target) {
    await this.buzz()
  }

  async buzz() {
    // shownAt is null between render and paint; a buzz that fast is a stray
    // event, not a reaction.
    if (this.buzzed || this.shownAt == null) return

    this.buzzed = true
    this.elapsed = performance.now() - this.shownAt

    // Report to the GM that opened this prompt. Render regardless so the
    // player still sees their own time if that GM has dropped.
    try {
      await this.socket.executeAsUser('buzz', this.prompt.gmId, {
        promptId: this.prompt.id,
        userId: game.user.id,
        elapsed: this.elapsed,
      })
    } catch (error) {
      console.error('Break | Failed to report buzz:', error)
    }

    await this.render({ parts: ['prompt'] })
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
