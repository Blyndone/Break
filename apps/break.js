import { BreakOverlay } from './overlay.js'
import { headlineFor, rosterFor } from './roster.js'

/**
 * Full screen buzzer prompt shown on a responding client.
 *
 * The clock starts when the overlay has actually painted, not when render()
 * resolves, so the reported time is the player's reaction and not this
 * client's render cost. Ordering is therefore client measured: each client
 * reports its own elapsed time and the GM sorts on that.
 */
export class Break extends BreakOverlay {
  constructor(options = {}) {
    super(options)

    this.socket = options.socket

    this.prompt = null
    this.buzzed = false
    this.elapsed = null
    this.expired = false
    /** @type {Array<{userId: string, rank: number, elapsed: number, cut: boolean}>} */
    this.statuses = []
  }

  /** @type {number|null} Handle for the countdown deadline. */
  #timer = null

  /** Arrow function so the listener stays bound and removable. */
  #onKeyDown = (event) => {
    if (event.code !== 'Space' || event.repeat) return
    event.preventDefault()
    this.buzz()
  }

  static DEFAULT_OPTIONS = {
    id: 'break',
    actions: {
      buzz: Break.onBuzz,
    },
  }

  static PARTS = {
    prompt: {
      template: 'modules/break/templates/prompt.hbs',
      id: 'prompt',
      // Loaded and registered as a partial ahead of every render.
      templates: ['modules/break/templates/roster-card.hbs'],
    },
  }

  async _prepareContext(options) {
    // Roster order, so a tile never moves under the player reaching for it.
    const participants = rosterFor({
      participants: this.prompt?.participants ?? [],
      statuses: this.statuses,
      limit: this.prompt?.limit ?? null,
      expired: this.expired,
      selfId: game.user.id,
      self: { buzzed: this.buzzed, elapsed: this.elapsed },
    })

    return {
      prompt: this.prompt,
      limit: this.prompt?.limit ?? null,
      headline: headlineFor(this.prompt),
      participants,
      duration: this.clock.duration,
      countdownDelay: this.clock.delay,
      // Seeded so the first paint already shows the right number; the frame
      // loop takes over from there.
      clock: this.clock.reading,
      expired: this.expired,
    }
  }

  /**
   * Display a prompt and start this client's clock.
   * @param {object} prompt
   * @param {string} prompt.id             Identifies this round of buzzing.
   * @param {string} prompt.text           Message shown above the roster.
   * @param {string} prompt.gmId           GM to report back to.
   * @param {number|null} prompt.limit     Cap on accepted responses, if any.
   * @param {number} prompt.duration       Seconds to respond; 0 for no limit.
   * @param {string[]} prompt.participants Everyone prompted, in roster order.
   */
  async show(prompt) {
    this.#clearTimer()

    this.prompt = prompt
    this.buzzed = false
    this.elapsed = null
    this.expired = false
    this.statuses = []
    this.clock.arm(prompt.duration)

    await this.render({ force: true })

    // Two frames: the first schedules the paint, the second runs after it.
    await new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    })

    // The clock and the countdown bar start together.
    this.clock.begin()

    if (prompt.duration > 0) {
      this.#timer = setTimeout(() => this.#expire(), prompt.duration * 1000)
    }
  }

  /** Time is up: stop accepting a buzz and show it on the roster. */
  async #expire() {
    this.#timer = null
    if (this.expired || this.buzzed) return

    this.expired = true
    if (this.rendered) await this.render({ parts: ['prompt'] })
  }

  #clearTimer() {
    if (this.#timer == null) return
    clearTimeout(this.#timer)
    this.#timer = null
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

    this.#clearTimer()

    this.prompt = null
    this.buzzed = false
    this.elapsed = null
    this.expired = false
    this.statuses = []
    this.clock.reset()

    await this.closeOverlay()
  }

  /** @this {Break} */
  static async onBuzz(event, target) {
    await this.buzz()
  }

  async buzz() {
    // The clock has not started between render and paint; a buzz that fast is
    // a stray event, not a reaction.
    if (this.buzzed || this.expired || this.clock.elapsed == null) return

    this.buzzed = true
    this.elapsed = this.clock.elapsed
    this.#clearTimer()

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
