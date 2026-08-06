import { headlineFor, participantFor } from './roster.js'

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
      const isSelf = userId === game.user.id
      const status = statuses.get(userId)

      // Trust local state for our own tile so the player sees their time
      // immediately, before the GM's broadcast comes back.
      const buzzed = isSelf ? this.buzzed : status != null
      const elapsed =
        isSelf && this.elapsed != null ? Math.round(this.elapsed) : (status?.elapsed ?? null)

      return {
        ...participantFor(userId),
        isSelf,
        buzzed,
        elapsed,
        rank: status?.rank ?? null,
        cut: status?.cut ?? false,
      }
    })

    const limit = this.prompt?.limit ?? null
    const duration = this.prompt?.duration ?? 0

    // The countdown is a CSS animation, but every sync re-renders this part and
    // would restart it from full. A negative delay equal to the time already
    // spent resumes it where it left off instead.
    const spent = this.shownAt == null ? 0 : (performance.now() - this.shownAt) / 1000

    return {
      prompt: this.prompt,
      limit,
      headline: headlineFor(this.prompt),
      participants,
      duration,
      countdownDelay: (-Math.min(spent, duration)).toFixed(3),
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
    this.shownAt = null
    this.expired = false
    this.statuses = []

    await this.render({ force: true })

    // Two frames: the first schedules the paint, the second runs after it.
    await new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    })

    // The clock and the countdown bar start together.
    this.shownAt = performance.now()

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
    this.shownAt = null
    this.buzzed = false
    this.elapsed = null
    this.expired = false
    this.statuses = []

    if (!this.rendered) return

    await this.#fadeOut()

    // animate: false matters. ApplicationV2's close animation stamps the
    // measured width/height and the window position onto the element as inline
    // styles, then collapses it with max-height: 0. On a frameless full screen
    // overlay that overrides our inset and drops the band at the top of the
    // screen for the length of the transition.
    await this.close({ animate: false })
  }

  /** Fade the overlay out before it is torn down. */
  async #fadeOut() {
    const element = this.element
    if (!element) return

    element.classList.add('break-closing')

    await new Promise((resolve) => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        element.removeEventListener('transitionend', onEnd)
        resolve()
      }
      const onEnd = (event) => {
        // Children transition too; only our own opacity ends the fade.
        if (event.target === element && event.propertyName === 'opacity') finish()
      }

      element.addEventListener('transitionend', onEnd)
      // Fallback: transitionend never fires if the element is hidden or the
      // user has reduced motion turned on.
      setTimeout(finish, 400)
    })
  }

  /** @this {Break} */
  static async onBuzz(event, target) {
    await this.buzz()
  }

  async buzz() {
    // shownAt is null between render and paint; a buzz that fast is a stray
    // event, not a reaction.
    if (this.buzzed || this.expired || this.shownAt == null) return

    this.buzzed = true
    this.elapsed = performance.now() - this.shownAt
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
    // A re-render during a fade would otherwise stay invisible.
    this.element?.classList.remove('break-closing')
    document.addEventListener('keydown', this.#onKeyDown)
  }

  _onClose(options) {
    super._onClose(options)
    document.removeEventListener('keydown', this.#onKeyDown)
  }
}
