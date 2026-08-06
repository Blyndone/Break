const { ApplicationV2 } = foundry.applications.api
const { api } = foundry.applications

/**
 * Full screen buzzer prompt.
 *
 * The GM broadcasts a prompt, every client renders this overlay, and the
 * elapsed time between render and the player's buzz is reported back so the
 * GM can order responses.
 */
export class Break extends api.HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options)

    this.socket = options.socket

    // Set when the overlay becomes visible, used as the zero point for the
    // player's reaction time.
    this.shownAt = null
    this.prompt = null
    this.buzzed = false
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
    }
  }

  /**
   * Display the prompt and start the clock.
   * @param {object} prompt
   * @param {string} prompt.id      Identifies this round of buzzing.
   * @param {string} prompt.text    Message shown to the player.
   */
  async show(prompt) {
    this.prompt = prompt
    this.buzzed = false

    await this.render({ force: true })
    this.shownAt = performance.now()
  }

  /** Hide the prompt without recording a response. */
  async dismiss() {
    this.prompt = null
    this.shownAt = null
    await this.close()
  }

  /**
   * Record this client's reaction time and report it to the GM.
   * @this {Break}
   */
  static async onBuzz(event, target) {
    if (this.buzzed || this.shownAt == null) return

    this.buzzed = true
    const elapsed = performance.now() - this.shownAt

    // TODO: report to the GM and let them resolve the ordering.
    // this.socket.executeAsGM('buzz', {
    //   promptId: this.prompt.id,
    //   userId: game.user.id,
    //   elapsed,
    // })

    await this.render({ parts: ['prompt'] })
  }
}
